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
  },
  adapter: PrismaAdapter(db) as Adapter,
  pages: {
    signIn: "/login",
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
