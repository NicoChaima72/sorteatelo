import { env } from "~/env";
import {
  crearCorreoService,
  type CorreoService,
} from "~/server/services/correo";

/**
 * Borde de cableado del correo Resend (F04): compone el `CorreoService` con la config leída de
 * `env` (única parte que toca `~/env` — el service y el dominio nunca lo hacen, I6). Lo usan el
 * wrapper del webhook (envío post-pago) y el router del panel (reenvío).
 *
 * El correo es de PLATAFORMA (una sola cuenta Resend, como el storage — no BYO por tenant). La env
 * var es opcional en `env.js` (la app arranca sin ella); la factory hace fail-fast al enviar si
 * falta (I6). La `RESEND_API_KEY` jamás se loguea.
 */
export function crearCorreoDeEnv(): CorreoService {
  return crearCorreoService({ apiKey: env.RESEND_API_KEY });
}

/**
 * URL base pública de la app para los enlaces de descarga del correo (D8/S5): `APP_URL` si está,
 * si no `NEXTAUTH_URL` (que ya apunta a la app). El endpoint `/api/descargas/<token>` es de
 * PLATAFORMA (token unique global), así que el enlace no lleva subdominio de tenant.
 */
export function baseUrlApp(): string {
  return env.APP_URL ?? env.NEXTAUTH_URL;
}
