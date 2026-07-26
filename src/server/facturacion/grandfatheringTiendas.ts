import { type PrismaClient } from "@prisma/client";

/**
 * Núcleo TESTEABLE del **grandfathering** del despliegue (F07/D3, ADR-0026): toda Tienda que ya
 * estaba PUBLICADA cuando se activó la facturación queda **exenta a perpetuidad** — sin cobro
 * retroactivo ni exigencia de tarjeta. En la práctica: el piloto y las tiendas demo.
 *
 * Recibe el cliente Prisma INYECTADO y devuelve un resultado estructurado; el wrapper
 * (`scripts/grandfather-tiendas-publicadas.ts`) lee `.env`, instancia su `PrismaClient` y formatea la
 * salida (patrón núcleo testeable + wrapper, backend-conventions § Scripts CLI).
 *
 * **Los tres filtros son load-bearing**, y ninguno es cosmético:
 * - `PUBLICADA`: el corte de D3 es haber estado VENDIENDO al desplegar. Una tienda a medio configurar
 *   no ganó nada que respetarle — cuando publique, paga como cualquiera.
 * - **sin `PlatformSubscription`**: una tienda que YA activó su plan está pagando. Darle además
 *   cortesía sería cobrarle y no cobrarle a la vez (el gate mira la exención primero, D8).
 * - **sin `PlatformExemption`**: la fila que ya existe se respeta tal cual. Puede ser una cortesía
 *   comercial CON fecha, y pisarla con una perpetua regalaría servicio que alguien decidió acotar.
 *
 * **Idempotente por partida doble**: el filtro de arriba en el `findMany`, y el `@unique` de
 * `PlatformExemption.tenantId` como árbitro real contra una DB VIVA (el mismo criterio que
 * `backfill-product-files.ts`: la idempotencia la garantiza la DB, no una heurística del script).
 *
 * **Por defecto no escribe** (`aplicar: false` ⇒ solo lista). Esta corrida regala servicio GRATIS y
 * PERPETUO: quien la ejecuta tiene que poder ver primero a quiénes, y recién entonces confirmar. Es
 * la misma dirección de falla del resto de la feature — el error barato es «la plataforma cobra
 * tarde», nunca «la plataforma regaló lo que no debía».
 */

/**
 * Qué pasó con una Tienda en el barrido:
 * - `creada`: esta corrida le insertó su exención.
 * - `a-crear`: candidata detectada en modo listado (`aplicar: false`); no se escribió nada.
 * - `ya-exenta`: otra corrida (o alguien por DB directa) le creó la exención mientras barríamos.
 * - `omitida-fila-ausente`: la Tienda se borró entre el `findMany` y el `create`. Se salta y se
 *   sigue: abortar dejaría a medias justo la corrida que tiene que poder repetirse.
 */
export type EstadoGrandfathering =
  | "creada"
  | "a-crear"
  | "ya-exenta"
  | "omitida-fila-ausente";

export interface ResultadoGrandfathering {
  tenantId: string;
  slug: string;
  estado: EstadoGrandfathering;
}

/** Por qué se otorgó. Queda escrito en la fila para que dentro de un año se entienda sin arqueología. */
export const NOTA_GRANDFATHER =
  "Tienda ya publicada al desplegar la facturación de la plataforma (D3, ADR-0026).";

type DbGrandfathering = Pick<PrismaClient, "tenant" | "platformExemption">;

export async function grandfatherTiendasPublicadas({
  db,
  aplicar,
}: {
  db: DbGrandfathering;
  /** `false` = listar candidatas sin escribir nada (el default del CLI). */
  aplicar: boolean;
}): Promise<ResultadoGrandfathering[]> {
  const candidatas = await db.tenant.findMany({
    where: {
      estado: "PUBLICADA",
      platformSubscription: { is: null },
      platformExemption: { is: null },
    },
    select: { id: true, slug: true },
    orderBy: { id: "asc" }, // orden determinista: la salida del CLI se lee y se compara entre corridas
  });

  const resultados: ResultadoGrandfathering[] = [];

  for (const tienda of candidatas) {
    resultados.push({
      tenantId: tienda.id,
      slug: tienda.slug,
      estado: aplicar ? await crearExencion(db, tienda.id) : "a-crear",
    });
  }

  return resultados;
}

/**
 * Crea la exención perpetua. Las dos carreras posibles contra una DB viva se leen como resultados,
 * no como errores: P2002 (alguien ya la creó ⇒ es justo lo que queríamos) y P2003 (la Tienda dejó de
 * existir ⇒ ya no hay nada que eximir).
 */
async function crearExencion(
  db: DbGrandfathering,
  tenantId: string,
): Promise<EstadoGrandfathering> {
  try {
    await db.platformExemption.create({
      data: {
        tenantId,
        motivo: "GRANDFATHER",
        exentaHasta: null, // PERPETUA (D3): con fecha, el piloto dejaría de vender el día que venciera
        nota: NOTA_GRANDFATHER,
      },
      select: { id: true },
    });
    return "creada";
  } catch (e) {
    if (esCodigoPrisma(e, "P2002")) return "ya-exenta";
    if (esCodigoPrisma(e, "P2003")) return "omitida-fila-ausente";
    throw e;
  }
}

/**
 * `true` si el error trae ese `code` de Prisma. Se detecta por el `code` sin depender de la clase
 * concreta (mismo criterio que `esNotFound` en `services/storage.ts` y que el backfill de archivos).
 */
function esCodigoPrisma(e: unknown, code: string): boolean {
  if (typeof e !== "object" || e === null) return false;
  return (e as { code?: string }).code === code;
}
