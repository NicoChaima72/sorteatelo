import { type PrismaClient } from "@prisma/client";

/**
 * Data-loader de la página `/bases` del storefront (admin-bases-pdf F04, D4/D5, ADR-0008).
 *
 * Núcleo PURO respecto de la infraestructura (recibe `db` inyectado, no lee `env` ni resuelve el
 * host): el borde ya resolvió la Tienda por subdominio SERVER-SIDE y le pasa el `slug`. Devuelve el
 * PDF de bases del Raffle **ACTIVO** de esa Tienda.
 *
 * - **D4**: SIEMPRE el sorteo ACTIVO. Un sorteo cerrado no muestra sus bases acá aunque las tenga —
 *   las bases vigentes son las del sorteo que se está corriendo. (El historial de bases por sorteo
 *   pasado está explícitamente fuera de alcance en este plan.)
 * - **I1 (tenancy)**: la query se scopea por el `slug` del tenant resuelto server-side; jamás por
 *   algo que venga del cliente.
 * - **Fail-soft (D5)**: sin sorteo activo, o con sorteo activo sin PDF, devuelve estado VACÍO —
 *   `pdfUrl: null` — en vez de lanzar. La página pinta un vacío neutral; un 500 en una URL que el
 *   footer publica en TODA la tienda sería mucho peor que un mensaje honesto.
 * - Una URL vacía o en blanco cuenta como SIN bases (mismo criterio que el gate de publicación en
 *   `_publicacion.tieneValor`): la fuente es la misma columna, y las dos superficies no pueden
 *   discrepar sobre qué significa "hay bases".
 */

export interface BasesDelSorteo {
  /** URL pública del PDF de bases del sorteo ACTIVO, o `null` si no hay bases que mostrar. */
  pdfUrl: string | null;
  /** Datos del sorteo ACTIVO para encabezar la página, o `null` si no hay sorteo activo. */
  sorteo: { nombre: string; premio: string; fechaFin: Date } | null;
}

/**
 * El MISMO estado, ya serializable a JSON — la forma que cruza a `props` de `getServerSideProps`.
 *
 * Next serializa las props a JSON y un `Date` crudo lo hace LANZAR («cannot be serialized as JSON»),
 * o sea 500 en la URL legal que el footer publica en toda la tienda. El núcleo devuelve `Date`
 * porque es el tipo honesto del dominio; la conversión vive acá, en el borde, y el nombre
 * `fechaFinIso` deja el formato del cable a la vista de quien consume la prop (que debe hacer
 * `new Date(...)` para formatearla).
 */
export interface BasesDelSorteoSerializable {
  pdfUrl: string | null;
  sorteo: { nombre: string; premio: string; fechaFinIso: string } | null;
}

/** Convierte el estado del núcleo a su espejo JSON-safe para las props del SSR. PURO. */
export function serializarBases(bases: BasesDelSorteo): BasesDelSorteoSerializable {
  return {
    pdfUrl: bases.pdfUrl,
    sorteo: bases.sorteo
      ? {
          nombre: bases.sorteo.nombre,
          premio: bases.sorteo.premio,
          fechaFinIso: bases.sorteo.fechaFin.toISOString(),
        }
      : null,
  };
}

export async function resolverBasesDelSorteo({
  db,
  tenantSlug,
}: {
  db: Pick<PrismaClient, "raffle">;
  tenantSlug: string;
}): Promise<BasesDelSorteo> {
  const raffle = await db.raffle.findFirst({
    where: { estado: "ACTIVO", tenant: { slug: tenantSlug } }, // tenant resuelto server-side (I1)
    select: {
      nombre: true,
      premio: true,
      fechaFin: true,
      basesPdfUrl: true,
    },
  });

  if (!raffle) return { pdfUrl: null, sorteo: null };

  const pdfUrl = (raffle.basesPdfUrl?.trim().length ?? 0) > 0 ? raffle.basesPdfUrl : null;

  return {
    pdfUrl,
    sorteo: {
      nombre: raffle.nombre,
      premio: raffle.premio,
      fechaFin: raffle.fechaFin,
    },
  };
}
