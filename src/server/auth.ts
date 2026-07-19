import { PrismaAdapter } from "@auth/prisma-adapter";
import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
  type Session,
} from "next-auth";
import { type Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";

import { sessionFake, sesionFakeAplica } from "~/configSession";
import { env } from "~/env";
import { resolverGuard } from "~/server/authPolicy";
import { db } from "~/server/db";
import { validarCallbackUrl } from "~/server/sesion/callbackUrl";
import { resolverDominioCookieSesion } from "~/server/sesion/dominioCookie";
import { configPlataformaDesdeEnv } from "~/server/tenancy/configPlataforma";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: DefaultSession["user"] & {
      id: string;
      // ...other properties
      // role: UserRole;
    };
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Sesión al WILDCARD (F08/D11, ADR-0019). El apex se resuelve UNA vez al cargar el módulo (es
 * `NEXT_PUBLIC_*`, inlineado en build; en prod `configPlataformaDesdeEnv` hace fail-fast si falta).
 * El `Domain` de la cookie sale de acá; el `secure`/`__Secure-` solo en producción (https).
 */
const configPlataforma = configPlataformaDesdeEnv();
const dominioCookieSesion = resolverDominioCookieSesion(configPlataforma);
// `secure`/`__Secure-` con la MISMA heurística que el `useSecureCookies` interno de NextAuth (prod O
// `NEXTAUTH_URL` https) — así la cookie de sesión no queda desalineada con las cookies csrf/callback
// de NextAuth en el flujo de prueba real de Google vía túnel cloudflared (https con NODE_ENV=dev).
const cookieSegura =
  env.NODE_ENV === "production" ||
  (env.NEXTAUTH_URL?.startsWith("https://") ?? false);

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthOptions = {
  callbacks: {
    // Sin gate en el signIn (D2, ADR-0005): tras el pivote SaaS la AUTENTICACIÓN es
    // abierta — cualquier cuenta Google obtiene sesión (el adapter crea su `User`).
    // La AUTORIZACIÓN real es fail-closed en la capa de datos: sin `TenantMembership`
    // y sin rol Operador, ningún procedure del panel devuelve ni muta nada (FORBIDDEN),
    // y la UI muestra el empty state "tu cuenta no tiene una tienda asignada". Un `User`
    // huérfano es inocuo: la seguridad vive donde están los datos, no en la puerta.
    // Prepara F08 (self-service). No se reintroduce un gate de plataforma sin decidirlo.
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
      },
    }),
    // callbackUrl validado contra `*.<apex>` (F08/D11, ADR-0019): con la cookie al wildcard, un
    // redirect sin validar sería open-redirect. Reusa `parsearHost` (no una lista paralela).
    redirect: ({ url, baseUrl }) =>
      validarCallbackUrl({ url, baseUrl, config: configPlataforma }),
  },
  adapter: PrismaAdapter(db) as Adapter,
  pages: {
    signIn: "/login",
  },
  // Cookie de sesión al WILDCARD (F08/D11, ADR-0019). Mismo NOMBRE que el default de NextAuth (las
  // sesiones vigentes no se invalidan) + `Domain=.<apex>` para compartir entre subdominios. En
  // localhost dev `domain` es `undefined` (host-only, sin cambio); el wildcard dev usa `lvh.me` (R3).
  cookies: {
    sessionToken: {
      name: `${cookieSegura ? "__Secure-" : ""}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: cookieSegura,
        domain: dominioCookieSesion,
      },
    },
  },
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }),
  ],
};

/**
 * Wrapper for `getServerSession` so that you don't need to import the `authOptions` in every file.
 *
 * @see https://next-auth.js.org/configuration/nextjs
 */
export const getServerAuthSession = (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  return getServerSession(ctx.req, ctx.res, authOptions);
};

/**
 * ¿Está activa la impersonación de dev (configSession, F09c)? Delega en el guard PURO
 * `sesionFakeAplica`: SOLO `NODE_ENV=development` + `sessionFake.enabled`. En prod SIEMPRE `false`
 * (inerte) — la autenticación real manda. Es el interruptor que consultan `getFinalSession` (server)
 * y el interceptor de `/api/auth/session` (cliente).
 */
export const fakeSessionActiva = (): boolean =>
  sesionFakeAplica({ enabled: sessionFake.enabled, nodeEnv: env.NODE_ENV });

/**
 * Cache del `User` REAL resuelto por email (una sola query por proceso de dev). El fake falsea la
 * AUTENTICACIÓN, no la AUTORIZACIÓN: se usa el `id` real del User ⇒ `TenantMembership`/Operador siguen
 * decidiendo permisos de verdad (I1/I7). Solo se puebla cuando el fake está activo (dev).
 */
let fakeUserCache: Session["user"] | null = null;

/**
 * Construye la `Session` fake resolviendo el `User` real por `sessionFake.email` (cacheado). Si el
 * email no existe en la DB ⇒ `null` (anónimo) — no se inventa un id. Mismo shape que emite NextAuth,
 * así sirve idéntico para el contexto tRPC, los `getServerSideProps` y el interceptor del cliente.
 */
export const resolverSesionFake = async (): Promise<Session | null> => {
  if (!fakeUserCache) {
    const user = await db.user.findUnique({
      where: { email: sessionFake.email },
      select: { id: true, name: true, email: true, image: true },
    });
    if (!user) {
      console.warn(
        `[configSession] No hay User con email "${sessionFake.email}" en la DB — la sesión fake queda ` +
          `anónima. Iniciá sesión con Google una vez (o apagá sessionFake.enabled).`,
      );
      return null;
    }
    fakeUserCache = {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    };
  }
  return { user: fakeUserCache, expires: sessionFake.expires };
};

/**
 * Wrapper de sesión del servidor (configSession, F09c). Con la impersonación de dev ACTIVA resuelve la
 * sesión fake (User real por email, sin cookies); si no, delega en `getServerAuthSession` EXACTAMENTE
 * como antes. Es el borde que reemplaza a `getServerAuthSession` en los call-sites que quieren respetar
 * el switch de dev (contexto tRPC, `getPropsEditor`, `requireSession`). Producción ⇒ siempre el real.
 */
export const getFinalSession = async (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}): Promise<Session | null> => {
  if (fakeSessionActiva()) return resolverSesionFake();
  return getServerAuthSession(ctx);
};

/**
 * Guard imperativo de páginas admin (pages router). Cada `getServerSideProps`
 * de una página protegida lo llama y hace early-return del `redirect`, con lo que
 * TS estrecha `session` a no-null en la rama de props. Cablea `getServerAuthSession`
 * (nunca reimplementa `getServerSession`) con la decisión pura `resolverGuard`.
 */
export const requireSession = async (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  // `getFinalSession` (no `getServerAuthSession`): respeta la impersonación de dev (configSession) ⇒ el
  // panel también ve la sesión fake sin login. En prod es idéntico a antes (el fake es inerte).
  const session = await getFinalSession(ctx);
  return resolverGuard(session);
};
