import { PrismaClient } from "@prisma/client";

import { grandfatherTiendasPublicadas } from "../src/server/facturacion/grandfatheringTiendas";

/**
 * CLI del **grandfathering** del despliegue de la facturación (F07/D3, ADR-0026): las Tiendas que ya
 * estaban PUBLICADAS cuando se activó el cobro quedan **exentas a perpetuidad** — sin cobro
 * retroactivo ni exigencia de tarjeta. En la práctica: el piloto y las tiendas demo.
 *
 * Uso:  npm run grandfather:tiendas             ← LISTA las candidatas, no escribe nada
 *       npm run grandfather:tiendas -- --aplicar ← crea las exenciones
 *
 * **El default es listar**, a diferencia del resto de los scripts del repo. La razón es el efecto:
 * esta corrida regala servicio GRATIS y PERPETUO, así que quien la ejecuta tiene que poder ver a
 * quiénes ANTES de confirmar. Con `--aplicar` es idempotente (el `@unique` de
 * `PlatformExemption.tenantId` es el árbitro), así que repetirla es seguro.
 *
 * Corre **una vez por ambiente**, idealmente justo después del deploy que activa la facturación: a
 * partir de ahí publicar exige plan o exención (F03), así que una tienda PUBLICADA sin ninguno de los
 * dos deja de existir y las corridas siguientes no encuentran candidatas.
 *
 * Patrón núcleo testeable + wrapper (backend-conventions § Scripts CLI): la lógica y sus filtros
 * viven en `src/server/facturacion/grandfatheringTiendas.ts`; acá solo se lee `.env`, se instancia el
 * cliente y se formatea la salida.
 */

async function main() {
  // Node 20.6+/24: carga .env sin dependencia externa. Sin `.env` en disco (CI, Vercel) se sigue
  // con `process.env` tal cual — mismo patrón que `backfill-product-files.ts`.
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env.
  }

  const aplicar = process.argv.includes("--aplicar");

  const db = new PrismaClient();
  try {
    const res = await grandfatherTiendasPublicadas({ db, aplicar });

    if (res.length === 0) {
      console.log(
        "= nada que hacer: no hay tiendas PUBLICADAS sin plan y sin exención.",
      );
      return;
    }

    for (const r of res) {
      if (r.estado === "creada") {
        console.log(`  ✓ ${r.slug} (${r.tenantId}) — exención GRANDFATHER perpetua creada`);
      } else if (r.estado === "a-crear") {
        console.log(`  · ${r.slug} (${r.tenantId}) — candidata`);
      } else if (r.estado === "ya-exenta") {
        console.log(`  = ${r.slug} (${r.tenantId}) — ya tenía exención; no se toca`);
      } else {
        console.warn(`  ! ${r.slug} (${r.tenantId}) — se borró durante el barrido; omitida`);
      }
    }

    if (!aplicar) {
      console.log(
        `\n${res.length} tienda(s) quedarían exentas a perpetuidad. ` +
          "Nada se escribió: volvé a correrlo con `-- --aplicar` para confirmar.",
      );
      return;
    }

    const creadas = res.filter((r) => r.estado === "creada").length;
    console.log(
      `\nListo: ${creadas} exención(es) creada(s) de ${res.length} tienda(s) publicada(s) sin plan.`,
    );
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("grandfather-tiendas-publicadas")) {
  main().catch((e) => {
    console.error(
      "✗ Falló el grandfathering de tiendas publicadas:",
      e instanceof Error ? e.message : e,
    );
    process.exit(1);
  });
}
