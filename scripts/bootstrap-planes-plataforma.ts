import { derivarUrlCallback } from "../src/server/domain/facturacion/_urlWebhook";
import { bootstrapPlanesPlataforma } from "../src/server/facturacion/bootstrapPlanes";
import { crearFlowPlataformaService } from "../src/server/services/flowPlataforma";

/**
 * CLI de puesta en marcha de la facturación de la plataforma (F02, ADR-0026): crea en la cuenta
 * Flow PROPIA los 2 planes de suscripción — full ($25.000) y adicional ($12.500), mensuales — con
 * su `urlCallback` apuntando al webhook de suscripciones (F04).
 *
 * Uso:  npm run flow:planes
 *       (o) tsx scripts/bootstrap-planes-plataforma.ts
 *
 * **Idempotente**: un plan que ya existe se reporta y NO se toca (ver `bootstrapPlanes.ts`).
 * Corre una vez por ambiente (sandbox y producción tienen cuentas Flow distintas).
 *
 * Patrón núcleo testeable + wrapper (backend-conventions § Scripts CLI): la lógica vive en
 * `src/server/facturacion/bootstrapPlanes.ts` con el service inyectado; acá solo se lee `.env`, se
 * cablea el service real y se formatea la salida.
 *
 * Este script NO toca la DB: los planes viven en Flow, no en `PlatformSubscription`. Y NUNCA
 * imprime las credenciales (I7) — solo el ambiente y el callback, que son inocuos.
 */

async function main() {
  // Los scripts tsx corren fuera de Next y no pasan por `src/env.js`. El try/catch es el patrón
  // de la casa (`backfill-product-files.ts`, `configurar-cors-r2.ts`): sin `.env` en disco —
  // entornos donde las env vars ya vienen inyectadas (CI, Vercel) — se sigue con `process.env`.
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env tal cual.
  }

  const sandbox = process.env.FLOW_PLATAFORMA_SANDBOX !== "false";
  // Misma prioridad que la app (núcleo puro compartido): explícita → APP_URL → NEXTAUTH_URL.
  const urlCallback = derivarUrlCallback({
    explicita: process.env.FLOW_PLATAFORMA_URL_CALLBACK,
    appUrl: process.env.APP_URL,
    nextAuthUrl: process.env.NEXTAUTH_URL,
  });

  if (!urlCallback) {
    throw new Error(
      "No pude armar el urlCallback del webhook: define FLOW_PLATAFORMA_URL_CALLBACK " +
        "(o APP_URL / NEXTAUTH_URL) en .env. Ver .env.example.",
    );
  }

  const flow = crearFlowPlataformaService({
    apiKey: process.env.FLOW_PLATAFORMA_API_KEY,
    secretKey: process.env.FLOW_PLATAFORMA_SECRET_KEY,
    sandbox,
  });

  console.log(
    `Bootstrap de planes — cuenta Flow de PLATAFORMA (${sandbox ? "SANDBOX" : "PRODUCCIÓN"})`,
  );
  console.log(`  urlCallback: ${urlCallback}`);

  const res = await bootstrapPlanesPlataforma({ flow, urlCallback });

  for (const p of res.creados) {
    console.log(`  ✓ creado    ${p.flowPlanId} — $${p.montoCLP}/mes (${p.plan})`);
  }
  for (const p of res.existentes) {
    console.log(`  = ya existía ${p.flowPlanId} (${p.plan}) — no se toca`);
  }
  console.log(
    `Listo: ${res.creados.length} creado(s), ${res.existentes.length} ya existente(s).`,
  );
}

// Solo corre como script invocado; importar desde un test NO dispara main().
if (process.argv[1]?.includes("bootstrap-planes-plataforma")) {
  main().catch((e) => {
    // El mensaje del service nombra la env var faltante, nunca su valor (I7).
    console.error(
      "✗ No se pudieron crear los planes:",
      e instanceof Error ? e.message : e,
    );
    process.exit(1);
  });
}
