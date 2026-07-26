import { readFileSync } from "fs";

import { PrismaClient } from "@prisma/client";

import { persistirUrlBases } from "~/server/domain/panel/_basesSorteo";
import { CONTENT_TYPE_PDF } from "~/server/services/storage";
import {
  crearStoragePublicoService,
  keyBasesSorteo,
} from "~/server/services/storagePublico";

/**
 * Script de OPERADOR: sube un PDF de BASES ya existente en disco al Sorteo ACTIVO de una
 * Tienda, por el MISMO camino que el panel (admin-bases-pdf, ADR-0008/0013): key derivada
 * server-side (`keyBasesSorteo` — el caller jamás la elige), objeto en el bucket PÚBLICO
 * (las bases son un documento público por naturaleza; nunca un PDF de producto, I1),
 * verificación `headObject` post-PUT y persistencia de la URL con cache-buster vía
 * `persistirUrlBases` (el único escritor de `Raffle.basesPdfUrl`, junto al use case del panel).
 *
 * La diferencia con el flujo del panel es solo el transporte: acá el PUT es server-side
 * (`putObject`) en vez de presigned-PUT desde el navegador — el Operador ya tiene el archivo
 * en su disco. Re-correrlo re-sube sobre la MISMA key y el `?v=` nuevo busta el CDN.
 *
 * Uso: `tsx scripts/subir-bases-sorteo.ts <slug> <ruta-al-pdf>`
 */

async function main() {
  const [slug, rutaPdf] = process.argv.slice(2);
  if (!slug || !rutaPdf) {
    console.error("Uso: tsx scripts/subir-bases-sorteo.ts <slug> <ruta-al-pdf>");
    process.exit(1);
  }

  // Node 20.6+/24: carga .env sin dependencia externa (mismo patrón que seed-tenants).
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env tal cual.
  }

  // Mismo mapeo de env que `crearStoragePublicoDeEnv` (sin pasar por ~/env para no exigir
  // acá el resto del schema de runtime). El service hace fail-fast si falta algo (I7).
  const storage = crearStoragePublicoService({
    endpoint: process.env.R2_ENDPOINT,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_PUBLIC_BUCKET,
    baseUrl: process.env.R2_PUBLIC_BASE_URL,
  });

  const cuerpo = readFileSync(rutaPdf);
  if (cuerpo.subarray(0, 5).toString("latin1") !== "%PDF-") {
    console.error(`El archivo "${rutaPdf}" no parece un PDF (falta el header %PDF-).`);
    process.exit(1);
  }

  const db = new PrismaClient();
  try {
    const tenant = await db.tenant.findUnique({
      where: { slug },
      select: { id: true, nombre: true },
    });
    if (!tenant) throw new Error(`No existe un tenant con slug "${slug}".`);

    const raffle = await db.raffle.findFirst({
      where: { tenantId: tenant.id, estado: "ACTIVO" },
      select: { id: true, nombre: true },
    });
    if (!raffle) throw new Error(`"${slug}" no tiene un Sorteo ACTIVO al que colgar las bases.`);

    const key = keyBasesSorteo(tenant.id, raffle.id);
    await storage.putObject({ key, body: cuerpo, contentType: CONTENT_TYPE_PDF });

    // Verificación real antes de persistir (espejo de confirmarBasesSubidas): la columna
    // jamás debe apuntar a un objeto inexistente.
    const existe = await storage.headObject(key);
    if (!existe) throw new Error(`El PUT no dejó el objeto en "${key}" — no persisto nada.`);

    const url = storage.urlPublica(key);
    await persistirUrlBases({ db, tenantId: tenant.id, raffleId: raffle.id, url });

    console.log(
      `✓ Bases subidas para "${tenant.nombre}" (${slug}) — sorteo "${raffle.nombre}" (${raffle.id})\n` +
        `  key: ${key} (${cuerpo.length} bytes)\n` +
        `  url: ${url}\n` +
        `Verificá en: http://${slug}.localhost:3001/bases`,
    );
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar desde un test NO dispara main().
if (process.argv[1]?.includes("subir-bases-sorteo")) {
  main().catch((e) => {
    // Solo el mensaje (nunca volcar objetos que pudieran arrastrar credenciales R2).
    console.error("✗ Falló la subida de bases:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
