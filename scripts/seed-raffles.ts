import { PrismaClient } from "@prisma/client";

/**
 * Siembra el Sorteo (`Raffle`) ACTIVO de cada tenant seed de dev (F02, D6): la Tienda
 * de la autora (tenant piloto — premio "2 entradas a un recital de BTS") y la Tienda de
 * prueba. El CRUD real del sorteo llega en F05; hasta entonces el Raffle ACTIVO se siembra
 * por script para que los efectos post-pago (`aplicarEfectosPostPago`) tengan dónde inscribir
 * la `RaffleEntry`.
 *
 * Patrón núcleo testeable + wrapper (backend-conventions § Scripts CLI):
 * - `sembrarRafflesActivos({ db, specs })` es el núcleo: recibe el cliente INYECTADO, es
 *   idempotente (find-or-create del Raffle ACTIVO por tenant — a lo sumo uno, S5) y devuelve
 *   un resultado estructurado. No toca env, no instancia Prisma, no hace exit.
 * - `main()` es el wrapper: carga .env, instancia su propio PrismaClient (excepción aceptada
 *   al singleton para scripts tsx), desconecta en finally y formatea la salida.
 *
 * Separado de `seed-tenants.ts` (no se toca lo que F01 dejó verde); depende de que los tenants
 * ya existan — si un tenant seed no está, se OMITE sin crashear (problema de orden de sembrado,
 * no del seed en sí; primero `npm run seed:tenants`).
 */

export interface EspecificacionRaffle {
  /** Slug del tenant dueño del sorteo (debe existir; lo siembra seed-tenants). */
  tenantSlug: string;
  nombre: string;
  premio: string;
  fechaInicio: Date;
  fechaFin: Date;
  /** Bases del sorteo (del Organizador, ADR-0008); la carga real llega en F05. */
  basesUrl?: string;
}

export interface ResultadoSeedRaffle {
  tenantSlug: string;
  /** `null` si el tenant no existe todavía (omitido). */
  tenantId: string | null;
  /** `null` si se omitió. */
  raffleId: string | null;
  raffleCreado: boolean;
  /** `true` si el tenant no existe todavía: no se creó ningún Raffle. */
  omitido: boolean;
}

type DbSeedRaffle = Pick<PrismaClient, "tenant" | "raffle">;

export async function sembrarRafflesActivos({
  db,
  specs,
}: {
  db: DbSeedRaffle;
  specs: EspecificacionRaffle[];
}): Promise<ResultadoSeedRaffle[]> {
  const resultados: ResultadoSeedRaffle[] = [];

  for (const spec of specs) {
    // 1) El tenant debe existir (lo siembra seed-tenants). Si no está, se omite sin
    //    crashear: es orden de sembrado, no un error del seed. El wrapper avisa.
    const tenant = await db.tenant.findUnique({
      where: { slug: spec.tenantSlug },
      select: { id: true },
    });
    if (!tenant) {
      resultados.push({
        tenantSlug: spec.tenantSlug,
        tenantId: null,
        raffleId: null,
        raffleCreado: false,
        omitido: true,
      });
      continue;
    }

    // 2) Raffle ACTIVO — idempotente por (tenantId, estado=ACTIVO): a lo sumo uno por
    //    tenant (S5, invariante de sembrado; no hay unique parcial en DB). Find-or-create.
    const activoExistente = await db.raffle.findFirst({
      where: { tenantId: tenant.id, estado: "ACTIVO" },
      select: { id: true },
    });
    const raffleCreado = activoExistente === null;
    let raffleId = activoExistente?.id ?? null;
    if (!activoExistente) {
      const creado = await db.raffle.create({
        data: {
          tenantId: tenant.id,
          nombre: spec.nombre,
          premio: spec.premio,
          estado: "ACTIVO",
          fechaInicio: spec.fechaInicio,
          fechaFin: spec.fechaFin,
          basesUrl: spec.basesUrl,
        },
        select: { id: true },
      });
      raffleId = creado.id;
    }

    resultados.push({
      tenantSlug: spec.tenantSlug,
      tenantId: tenant.id,
      raffleId,
      raffleCreado,
      omitido: false,
    });
  }

  return resultados;
}

/** Medianoche UTC de hoy (aritmética de fechas nativa, sin lib — backend-conventions). */
function medianocheUTCHoy(): Date {
  const ahora = new Date();
  return new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()),
  );
}

/** Suma `dias` a una fecha UTC (duración fija, no aritmética de meses — sin clamp). */
function sumarDiasUTC(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 24 * 60 * 60 * 1000);
}

async function main() {
  // Node 20.6+/24: carga .env sin dependencia externa (dotenv no es dep del repo).
  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: seguimos con process.env tal cual (CI/entornos con env inyectado).
  }

  // S10: ventana amplia que cubra el desarrollo (inicio hoy, fin +90 días). Las fechas
  // reales del sorteo del piloto las carga el Organizador en F05/F07.
  const inicio = medianocheUTCHoy();
  const fin = sumarDiasUTC(inicio, 90);

  const specs: EspecificacionRaffle[] = [
    {
      tenantSlug: "autora",
      nombre: "Sorteo de lanzamiento",
      premio: "2 entradas a un recital de BTS", // premio piloto (D6)
      fechaInicio: inicio,
      fechaFin: fin,
    },
    {
      tenantSlug: "prueba",
      nombre: "Sorteo de prueba",
      premio: "Premio de prueba del segundo tenant",
      fechaInicio: inicio,
      fechaFin: fin,
    },
  ];

  const db = new PrismaClient();
  try {
    const res = await sembrarRafflesActivos({ db, specs });
    for (const r of res) {
      if (r.omitido) {
        console.log(
          `⚠ omitido tenant "${r.tenantSlug}": no existe todavía ` +
            `(ejecuta primero: npm run seed:tenants)`,
        );
      } else {
        console.log(
          `${r.raffleCreado ? "✓ creado " : "= existía"} raffle ACTIVO de ` +
            `"${r.tenantSlug}" (${r.raffleId})`,
        );
      }
    }
  } finally {
    await db.$disconnect();
  }
}

// Solo corre como script invocado; importar el núcleo desde un test NO dispara main().
if (process.argv[1]?.includes("seed-raffles")) {
  main().catch((e) => {
    console.error(
      "✗ Falló el seed de raffles:",
      e instanceof Error ? e.message : e,
    );
    process.exit(1);
  });
}
