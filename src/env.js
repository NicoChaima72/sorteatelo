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
    // Flow SUSCRIPCIONES — cuenta PROPIA de la plataforma (ADR-0026, F02). El OTRO mundo
    // del dinero: acá Sortéatelo le cobra SU mensualidad a los Organizadores. Separado por
    // construcción del BYO-Flow de arriba (I1): estas credenciales JAMÁS cobran ventas de
    // tiendas, y las `FlowCredential` de un tenant jamás participan del cobro de suscripción.
    // Viven SOLO acá — nunca en DB, logs ni respuestas (I7, mismo estándar ADR-0006).
    // Opcionales: la app arranca sin ellas; `crearFlowPlataformaDeEnv` hace fail-fast al
    // ejecutar una llamada, nombrando la env var faltante y jamás su valor.
    FLOW_PLATAFORMA_API_KEY: z.string().optional(),
    FLOW_PLATAFORMA_SECRET_KEY: z.string().optional(),
    // Ambiente de la cuenta de plataforma. String y no boolean porque las env vars son
    // texto: SOLO el literal "false" activa producción (default sandbox — fallar hacia el
    // ambiente de prueba nunca le saca plata a nadie por accidente).
    FLOW_PLATAFORMA_SANDBOX: z.string().optional(),
    // `urlCallback` que se registra en los planes de Flow (webhook de suscripciones, F04).
    // En dev necesita un túnel público, igual que FLOW_URL_CONFIRMATION. Si falta, se deriva
    // de APP_URL/NEXTAUTH_URL + /api/webhooks/flow-suscripciones.
    FLOW_PLATAFORMA_URL_CALLBACK: z.string().url().optional(),
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
    // Assets PÚBLICOS de marca — Cloudflare R2, bucket PÚBLICO separado del privado de PDFs
    // (ADR-0013, plantilla-rica F01). Las imágenes del storefront (logo/hero/portadas/premio)
    // son propaganda cacheable servida por CDN, sin valor si se "filtran" — categóricamente
    // distintas del PDF vendido (privado + gated por Entitlement). La frontera público/privado
    // es a nivel de BUCKET, no de prefijo: un segundo bucket con lectura pública NO puede filtrar
    // un PDF porque los PDF no están ahí. Reusan R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/
    // ENDPOINT (misma cuenta R2 del Operador). Opcionales: la app arranca sin ellas; la factory
    // `crearStoragePublicoDeEnv` hace fail-fast al presignar/componer si faltan.
    //   - R2_PUBLIC_BUCKET: bucket con acceso público de lectura (el Operador lo crea + habilita
    //     el acceso público a mano en Cloudflare, como el CORS de F03).
    //   - R2_PUBLIC_BASE_URL: base de la URL pública (subdominio r2.dev gestionado en el MVP;
    //     dominio propio cuando se cierre la decisión #4/#5). Sin barra final.
    R2_PUBLIC_BUCKET: z.string().optional(),
    R2_PUBLIC_BASE_URL: z.string().url().optional(),
    // Correo transaccional — Resend (ADR-0010, F04). API key SECRETA del proveedor de
    // correo (una cuenta de PLATAFORMA, como el storage — no BYO por tenant). Opcional:
    // la app arranca sin ella; la factory `crearCorreoService` hace fail-fast en runtime
    // al enviar si falta. JAMÁS se loguea (I3). El remitente real es `no-reply@sorteatelo.cl`
    // — dominio VERIFICADO en Resend (ADR-0014); la decisión #4 se cerró. Plan Free asumido
    // como condición de diseño (100/día, 3.000/mes, 1 dominio): ver ADR-0027 §5 y su trigger
    // de upgrade a Pro.
    RESEND_API_KEY: z.string().optional(),
    // Secreto del cron horario de correos (F02, ADR-0027 §4). Vercel Cron lo manda como
    // `Authorization: Bearer $CRON_SECRET` a `/api/cron/correos`. Opcional en el schema
    // (la app arranca sin ella, igual que el resto de los secretos de feature) pero el
    // endpoint falla CERRADO: sin la var responde 500 y no drena nada — una env olvidada
    // no puede volverse un disparador público de correos a compradores. SECRETA: jamás en
    // logs ni respuestas (I6). Distinta por entorno.
    CRON_SECRET: z.string().optional(),
    // URL pública de la app para armar los enlaces de descarga del correo (D8/S5). El
    // endpoint `/api/descargas/<token>` es de PLATAFORMA (el token es unique global, no
    // resuelve tenant), así que el enlace NO lleva subdominio. Opcional: si falta, el
    // borde cae a `NEXTAUTH_URL` (que ya apunta a la app) — `APP_URL` desacopla el correo
    // del auth y permite un puerto de dev distinto (:3001) sin tocar NEXTAUTH_URL.
    APP_URL: z.string().url().optional(),
    // Token de PREVIEW del Borrador del page builder (F05, ADR-0016). El storefront público lee
    // SOLO publishedJson; con `?preview=<STOREFRONT_PREVIEW_TOKEN>` sirve el Borrador para revisarlo
    // antes de publicar (lo usa el editor del panel). Opcional: ausente ⇒ preview deshabilitada
    // (cualquier `?preview` ⇒ 404 neutral). Secreto de baja sensibilidad (solo abre un draft ya del
    // tenant), pero no se loguea. Distinto por entorno.
    STOREFRONT_PREVIEW_TOKEN: z.string().optional(),
    // Asistente de IA del editor (Tanda 3 F14/D21). API key del Vercel AI Gateway (`createGateway`).
    // OPCIONAL y fail-soft: ausente ⇒ el panel "Asistente" NO aparece (cero degradación fea, el editor
    // funciona igual). SECRETA: solo server-side, jamás en el cliente, log ni respuesta (patrón
    // FlowCredential ADR-0006). El gateway rutea al modelo por string `"provider/model"`.
    AI_GATEWAY_API_KEY: z.string().optional(),
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
    CREDENTIALS_ENCRYPTION_KEY: process.env.CREDENTIALS_ENCRYPTION_KEY,
    FLOW_URL_CONFIRMATION: process.env.FLOW_URL_CONFIRMATION,
    FLOW_URL_RETURN: process.env.FLOW_URL_RETURN,
    FLOW_PLATAFORMA_API_KEY: process.env.FLOW_PLATAFORMA_API_KEY,
    FLOW_PLATAFORMA_SECRET_KEY: process.env.FLOW_PLATAFORMA_SECRET_KEY,
    FLOW_PLATAFORMA_SANDBOX: process.env.FLOW_PLATAFORMA_SANDBOX,
    FLOW_PLATAFORMA_URL_CALLBACK: process.env.FLOW_PLATAFORMA_URL_CALLBACK,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_ENDPOINT: process.env.R2_ENDPOINT,
    R2_PUBLIC_BUCKET: process.env.R2_PUBLIC_BUCKET,
    R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    APP_URL: process.env.APP_URL,
    STOREFRONT_PREVIEW_TOKEN: process.env.STOREFRONT_PREVIEW_TOKEN,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
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
