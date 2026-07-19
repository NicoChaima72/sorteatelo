import {
  type NextApiHandler,
  type NextApiRequest,
  type NextApiResponse,
} from "next";
import NextAuth from "next-auth";

import {
  authOptions,
  fakeSessionActiva,
  resolverSesionFake,
} from "~/server/auth";

/**
 * Handler de NextAuth (Google OAuth) + interceptor de impersonación de dev (configSession, F09c).
 *
 * Cuando el fake está ACTIVO (dev-only), un `GET /api/auth/session` responde la sesión fake con el
 * shape EXACTO de NextAuth ANTES de delegar — así `useSession()` en el cliente ve al usuario sin
 * cookies (la contraparte cliente del wrapper server-side `getFinalSession`). Todo lo demás de
 * `/api/auth/*` (signin/callback/signout/csrf/providers) pasa intacto a NextAuth: login/logout/OAuth
 * siguen funcionando tal cual para cuando el fake esté apagado (o en producción, donde es inerte).
 */
// `NextAuth(...)` está tipado como `any` en el pages router; se acota a `NextApiHandler` para el gate.
const nextAuthHandler = NextAuth(authOptions) as NextApiHandler;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (fakeSessionActiva() && req.method === "GET") {
    const ruta = Array.isArray(req.query.nextauth)
      ? req.query.nextauth.join("/")
      : req.query.nextauth;
    if (ruta === "session") {
      const session = await resolverSesionFake();
      // Mismo contrato que NextAuth: sesión ⇒ `{ user, expires }`; sin sesión ⇒ `{}` (anónimo).
      res.status(200).json(session ?? {});
      return;
    }
  }
  return nextAuthHandler(req, res);
}
