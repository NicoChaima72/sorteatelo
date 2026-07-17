import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NEXTAUTH_URL: z.preprocess(
      // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
      // Since NextAuth.js automatically uses the VERCEL_URL if present.
      (str) => process.env.VERCEL_URL ?? str,
      // VERCEL_URL doesn't include `https` so it cant be validated as a URL
      process.env.VERCEL ? z.string() : z.string().url()
    ),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    // Operadores de plataforma (F05/D4): CSV de emails con acceso a TODAS las Tiendas
    // (rol de plataforma, no de una Tienda). Opcional y fail-closed: ausente/vacía ⇒
    // nadie es Operador (la autorización normal del panel es la membresía User↔Tenant).
    // Reemplaza a la `ADMIN_ALLOWLIST` mono-usuario pre-pivote (muerta con la allowlist
    // como gate del signIn — ahora cualquier cuenta Google obtiene sesión, D2).
    PLATFORM_OPERATOR_EMAILS: z.string().optional(),
    // Cifrado de credenciales por tenant (BYO-Flow, ADR-0006/S2). Clave AES-256 en
    // base64 (openssl rand -base64 32 → 32 bytes). Opcional: la app arranca sin ella;
    // `parsearClave` (services/cifrado) hace fail-fast al cifrar/descifrar si falta o
    // es inválida (I5/I7). NUNCA se loguea.
    CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
    // Flow (pasarela de pago, BYO-Flow ADR-0006): NO hay credenciales globales de
    // plataforma — cada tenant trae las suyas, cifradas en `FlowCredential` (las
    // siembran los seeds / cargará el panel en F05). Estas dos URLs sí son de
    // plataforma: se pasan a `payment/create` de Flow. Opcionales: la app arranca
    // sin ellas; la factory hace fail-fast recién al ejecutar crearPago (I7).
    // FLOW_URL_CONFIRMATION apunta al webhook único /api/webhooks/flow.
    FLOW_URL_CONFIRMATION: z.string().url().optional(),
    FLOW_URL_RETURN: z.string().url().optional(),
    // Storage de PDFs — Cloudflare R2, bucket privado S3-compatible (ADR-0002/0009, F03).
    // A diferencia de Flow (BYO por tenant, ADR-0006), el storage es de PLATAFORMA: una
    // sola cuenta R2 operada por el freelancer, un bucket con paths per-tenant. Opcionales:
    // la app arranca sin ellas; la factory `crearStorageService` hace fail-fast en runtime
    // si faltan al presignar/subir (I4/I7, patrón Flow). Las claves R2 son SECRETAS: solo
    // en env (Zod) y en memoria dentro del closure del service — jamás en logs ni respuestas.
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_ENDPOINT: z.string().url().optional(),
    // Correo transaccional — Resend (ADR-0010, F04). API key SECRETA del proveedor de
    // correo (una cuenta de PLATAFORMA, como el storage — no BYO por tenant). Opcional:
    // la app arranca sin ella; la factory `crearCorreoService` hace fail-fast en runtime
    // al enviar si falta. JAMÁS se loguea (I3). En el MVP se envía desde el remitente de
    // prueba `onboarding@resend.dev` hasta que la decisión abierta #4 (dominio) habilite
    // un dominio verificado.
    RESEND_API_KEY: z.string().optional(),
    // URL pública de la app para armar los enlaces de descarga del correo (D8/S5). El
    // endpoint `/api/descargas/<token>` es de PLATAFORMA (el token es unique global, no
    // resuelve tenant), así que el enlace NO lleva subdominio. Opcional: si falta, el
    // borde cae a `NEXTAUTH_URL` (que ya apunta a la app) — `APP_URL` desacopla el correo
    // del auth y permite un puerto de dev distinto (:3001) sin tocar NEXTAUTH_URL.
    APP_URL: z.string().url().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // Dominio raíz de la plataforma (ADR-0007): distingue el apex de un subdominio
    // de Tienda. PÚBLICA a propósito: la lee el middleware (runtime edge, Next
    // inlinea NEXT_PUBLIC_* en build) y no es secreto — es lo que se ve en la barra
    // de direcciones. Opcional: en dev cae a `localhost` (S1); en producción
    // `resolverConfigPlataforma` hace fail-fast si falta (I1). La decisión abierta
    // #4 (QUÉ dominio será) sigue abierta: esto solo define de dónde se lee.
    NEXT_PUBLIC_PLATFORM_DOMAIN: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    PLATFORM_OPERATOR_EMAILS: process.env.PLATFORM_OPERATOR_EMAILS,
    CREDENTIALS_ENCRYPTION_KEY: process.env.CREDENTIALS_ENCRYPTION_KEY,
    FLOW_URL_CONFIRMATION: process.env.FLOW_URL_CONFIRMATION,
    FLOW_URL_RETURN: process.env.FLOW_URL_RETURN,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_PLATFORM_DOMAIN: process.env.NEXT_PUBLIC_PLATFORM_DOMAIN,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
