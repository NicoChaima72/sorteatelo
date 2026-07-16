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
    ADMIN_ALLOWLIST: z.string(),
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
    ADMIN_ALLOWLIST: process.env.ADMIN_ALLOWLIST,
    CREDENTIALS_ENCRYPTION_KEY: process.env.CREDENTIALS_ENCRYPTION_KEY,
    FLOW_URL_CONFIRMATION: process.env.FLOW_URL_CONFIRMATION,
    FLOW_URL_RETURN: process.env.FLOW_URL_RETURN,
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
