import { PrismaClient } from "@prisma/client";

import {
  crearCuponDePlataforma,
  crearCuponInput,
  finDelDiaUTC,
  listarCuponesDePlataforma,
} from "../src/server/facturacion/cuponesPlataforma";
import { crearFlowPlataformaService } from "../src/server/services/flowPlataforma";

/**
 * CLI de [[Cupón de plataforma]] (F08, D9, ADR-0026). Los cupones NO tienen superficie en el panel
 * (coherente con ADR-0023): los crea y los consulta el Operador desde acá.
 *
 * Uso:
 *   npm run flow:cupones -- listar
 *   npm run flow:cupones -- crear --codigo ARMY2026 --porcentaje 50 --meses 3 --max 1
 *   npm run flow:cupones -- crear --codigo REGALO5K --monto 5000 --expira 2026-12-31 --nota "campaña X"
 *
 * Flags de `crear`:
 *   --codigo <TEXTO>    repartible; se normaliza a MAYÚSCULAS sin espacios (obligatorio)
 *   --porcentaje <1-100> descuento porcentual  ┐ exactamente UNO de los dos
 *   --monto <CLP entero> descuento en pesos    ┘
 *   --meses <N>         cuántos períodos dura el descuento; omitido = para siempre
 *   --max <N>           tope de canjes; omitido = ilimitado; 1 = código personal
 *   --expira <AAAA-MM-DD> hasta cuándo se puede CANJEAR
 *   --nota <TEXTO>      para qué se creó
 *
 * `crear` toca la cuenta Flow de PLATAFORMA y la DB en la misma corrida (ver
 * `src/server/facturacion/cuponesPlataforma.ts`, que explica por qué en ese orden). NUNCA imprime
 * credenciales (I7).
 */

/** Los únicos flags que este CLI entiende. Cualquier otro es un typo, no una opción ignorable. */
const FLAGS = [
  "codigo",
  "porcentaje",
  "monto",
  "meses",
  "max",
  "expira",
  "nota",
] as const;

/**
 * Revienta ante un flag desconocido. No es celo: `--maxCanjes 1` (en vez de `--max`) crearía un
 * cupón ILIMITADO en silencio, y `--expiraa` uno perpetuo — exactamente el error que el guard de
 * «flag sin valor» ya prohíbe, entrando por el nombre en vez de por el valor.
 */
function exigirFlagsConocidos() {
  for (const token of process.argv.slice(3)) {
    if (!token.startsWith("--")) continue;
    const nombre = token.slice(2);
    if (!FLAGS.includes(nombre as (typeof FLAGS)[number])) {
      throw new Error(
        `No conozco el flag --${nombre}. Los válidos son: ${FLAGS.map((f) => `--${f}`).join(", ")}.`,
      );
    }
  }
}

/** Lee `--flag valor` de argv. Devuelve `undefined` si el flag no está. */
function flag(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i === -1) return undefined;
  const valor = process.argv[i + 1];
  // Un flag sin valor (o seguido de otro flag) es un error de tipeo, no un `undefined` silencioso:
  // `--max --nota x` dejaría el cupón ilimitado sin que nadie se entere.
  if (valor === undefined || valor.startsWith("--")) {
    throw new Error(`El flag --${nombre} necesita un valor.`);
  }
  return valor;
}

function entero(nombre: string): number | undefined {
  const v = flag(nombre);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`--${nombre} tiene que ser un entero (recibí "${v}").`);
  return n;
}

function fechaDeFlag(nombre: string): Date | undefined {
  const v = flag(nombre);
  if (v === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`--${nombre} tiene que ser AAAA-MM-DD (recibí "${v}").`);
  }
  // La política del «hasta el final de ESE día» vive en el núcleo, con su test.
  return finDelDiaUTC(v);
}

async function crear(db: PrismaClient) {
  exigirFlagsConocidos();
  const porcentaje = entero("porcentaje");
  const monto = flag("monto");

  const parsed = crearCuponInput.safeParse({
    codigo: flag("codigo"),
    tipo: monto !== undefined ? "MONTO" : "PORCENTAJE",
    porcentaje,
    montoDescuento: monto,
    duracionMeses: entero("meses"),
    expiraAt: fechaDeFlag("expira"),
    maxCanjes: entero("max"),
    nota: flag("nota"),
  });

  if (!parsed.success) {
    // Los mensajes de los `.refine` están escritos para leerse en la terminal.
    throw new Error(parsed.error.issues.map((i) => `• ${i.message}`).join("\n"));
  }

  const sandbox = process.env.FLOW_PLATAFORMA_SANDBOX !== "false";
  const flow = crearFlowPlataformaService({
    apiKey: process.env.FLOW_PLATAFORMA_API_KEY,
    secretKey: process.env.FLOW_PLATAFORMA_SECRET_KEY,
    sandbox,
  });

  console.log(
    `Creando cupón — cuenta Flow de PLATAFORMA (${sandbox ? "SANDBOX" : "PRODUCCIÓN"})`,
  );
  const r = await crearCuponDePlataforma({ db, flow, input: parsed.data });
  console.log(`  ✓ ${r.codigo} creado (flowCouponId ${r.flowCouponId})`);
  console.log("    Se canjea en el paso «Activa tu plan» del checklist de publicación.");
}

async function listar(db: PrismaClient) {
  const cupones = await listarCuponesDePlataforma({ db });
  if (cupones.length === 0) {
    console.log("= no hay cupones creados.");
    return;
  }

  for (const c of cupones) {
    const tope = c.maxCanjes === null ? "∞" : String(c.maxCanjes);
    const vence = c.expiraAt ? ` · vence ${c.expiraAt.toISOString().slice(0, 10)}` : "";
    // Las reservas en curso se muestran APARTE del contador de canjes: ocupan cupo pero se liberan
    // solas si el intento se abandona, así que sumarlas diría que un código se quemó cuando no.
    const reservas =
      c.reservasEnCurso > 0 ? ` (+${c.reservasEnCurso} reserva/s en curso)` : "";
    console.log(
      `${c.activo ? "●" : "○"} ${c.codigo} — ${c.descuento} por ${c.duracion} · ` +
        `canjes ${c.canjes}/${tope}${reservas}${vence}${c.activo ? "" : " · DESACTIVADO"}`,
    );
    // El `flowCouponId` se imprime para poder cruzar con el panel de Flow (lo pide el check E2E).
    console.log(`      flow: ${c.flowCouponId}`);
    for (const r of c.redenciones) {
      console.log(
        `      ${r.consumado ? "↳" : "⋯"} ${r.createdAt.toISOString().slice(0, 10)}  ` +
          `${r.tenantNombre ?? "(tienda borrada)"} (${r.tenantId})` +
          `${r.pagadorEmail ? ` · ${r.pagadorEmail}` : ""}` +
          `${r.consumado ? "" : "  [reserva en curso]"}`,
      );
    }
  }
  console.log(`\n${cupones.length} cupón(es).`);
}

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env (CI/entornos con env inyectado).
  }

  const sub = process.argv[2];
  const db = new PrismaClient();
  try {
    if (sub === "crear") await crear(db);
    else if (sub === "listar") await listar(db);
    else {
      throw new Error(
        "Subcomando desconocido. Uso: `npm run flow:cupones -- listar` o `npm run flow:cupones -- crear --codigo X --porcentaje 50`.",
      );
    }
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("cupones-plataforma")) {
  main().catch((e) => {
    // El mensaje del service nombra la env var faltante, nunca su valor (I7).
    console.error("✗", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
