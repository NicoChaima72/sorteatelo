import { PrismaAdapter } from "@auth/prisma-adapter";
import { type GetServerSidePropsContext } from "next";
import {
  getServerSession,
  type DefaultSession,
  type NextAuthOptions,
} from "next-auth";
import { type Adapter } from "next-auth/adapters";
import GoogleProvider from "next-auth/providers/google";

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
    // ningún procedure del panel devuelve ni muta nada (FORBIDDEN),
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
 * Guard imperativo de páginas admin (pages router). Cada `getServerSideProps`
 * de una página protegida lo llama y hace early-return del `redirect`, con lo que
 * TS estrecha `session` a no-null en la rama de props. Cablea `getServerAuthSession`
 * (nunca reimplementa `getServerSession`) con la decisión pura `resolverGuard`.
 */
export const requireSession = async (ctx: {
  req: GetServerSidePropsContext["req"];
  res: GetServerSidePropsContext["res"];
}) => {
  const session = await getServerAuthSession(ctx);
  return resolverGuard(session);
};
