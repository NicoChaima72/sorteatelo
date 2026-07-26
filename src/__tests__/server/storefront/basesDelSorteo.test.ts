import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  resolverBasesDelSorteo,
  serializarBases,
} from "~/server/storefront/basesDelSorteo";

/**
 * Tests del data-loader de la página `/bases` del storefront (admin-bases-pdf F04, D4/D5, ADR-0008).
 * Es el núcleo PURO (db inyectado): resuelve el PDF de bases del Raffle **ACTIVO** de la Tienda ya
 * resuelta server-side por subdominio. Claves:
 *  - **D4**: SIEMPRE el sorteo ACTIVO — nunca uno cerrado, aunque tenga bases cargadas;
 *  - **I1/tenancy**: la query se scopea por el `slug` del tenant resuelto SERVER-SIDE, jamás por input;
 *  - **fail-soft, no fail-closed**: sin sorteo activo o sin PDF devuelve estado VACÍO (`pdfUrl: null`),
 *    NO un error — la página muestra un vacío neutral en vez de un 500 (D5).
 *
 * Cubre además el **BORDE de serialización** (`serializarBases`), que es donde el E2E encontró un 500
 * duro en los 6 tenants: el núcleo devuelve un `Date` (tipo honesto del dominio) y
 * `getServerSideProps` solo admite JSON. Los tests del núcleo NO lo veían por construcción.
 */

interface RaffleFake {
  estado: "ACTIVO" | "CERRADO";
  tenantSlug: string;
  nombre: string;
  premio: string;
  fechaFin: Date;
  basesPdfUrl: string | null;
}

const FIN = new Date("2026-09-01T12:00:00Z");

/** Fake db que respeta el `where` de la query real (estado + tenant por slug) y lo captura. */
function fakeDb(raffles: RaffleFake[]) {
  const wheres: unknown[] = [];
  const db = {
    raffle: {
      findFirst: async (args: {
        where: { estado: string; tenant: { slug: string } };
      }) => {
        wheres.push(args.where);
        const r = raffles.find(
          (x) =>
            x.estado === args.where.estado &&
            x.tenantSlug === args.where.tenant.slug,
        );
        if (!r) return null;
        return {
          nombre: r.nombre,
          premio: r.premio,
          fechaFin: r.fechaFin,
          basesPdfUrl: r.basesPdfUrl,
        };
      },
    },
  } as unknown as PrismaClient;
  return { db, wheres };
}

const activoConBases: RaffleFake = {
  estado: "ACTIVO",
  tenantSlug: "autora",
  nombre: "Sorteo de lanzamiento",
  premio: "Un pack firmado",
  fechaFin: FIN,
  basesPdfUrl: "https://pub.r2.dev/T1/sorteo/r1/bases.pdf?v=9",
};

describe("storefront/basesDelSorteo — resolverBasesDelSorteo", () => {
  // storefront.bases.001 — sorteo ACTIVO con PDF ⇒ devuelve la URL + los datos del sorteo
  it("con sorteo ACTIVO y PDF cargado devuelve la URL y el sorteo, scopeado al tenant del subdominio", async () => {
    const { db, wheres } = fakeDb([activoConBases]);
    const res = await resolverBasesDelSorteo({ db, tenantSlug: "autora" });

    expect(res.pdfUrl).toBe("https://pub.r2.dev/T1/sorteo/r1/bases.pdf?v=9");
    expect(res.sorteo).toMatchObject({
      nombre: "Sorteo de lanzamiento",
      premio: "Un pack firmado",
    });
    // I1: el filtro sale del tenant resuelto server-side + el estado ACTIVO (D4).
    expect(wheres[0]).toEqual({ estado: "ACTIVO", tenant: { slug: "autora" } });
  });

  // storefront.bases.002 — sin sorteo ACTIVO ⇒ estado vacío, NO error (D5)
  it("sin sorteo activo devuelve estado vacío (no lanza)", async () => {
    const { db } = fakeDb([{ ...activoConBases, estado: "CERRADO" }]);
    const res = await resolverBasesDelSorteo({ db, tenantSlug: "autora" });
    expect(res.pdfUrl).toBeNull();
    expect(res.sorteo).toBeNull();
  });

  // storefront.bases.003 — sorteo ACTIVO SIN PDF ⇒ estado vacío, pero conserva el sorteo (D5)
  it("con sorteo activo sin PDF devuelve pdfUrl null (no lanza) y conserva los datos del sorteo", async () => {
    const { db } = fakeDb([{ ...activoConBases, basesPdfUrl: null }]);
    const res = await resolverBasesDelSorteo({ db, tenantSlug: "autora" });
    expect(res.pdfUrl).toBeNull();
    expect(res.sorteo).not.toBeNull();
  });

  // storefront.bases.004 — nunca sirve las bases de OTRA Tienda (I1)
  it("no devuelve el sorteo de otra Tienda", async () => {
    const { db } = fakeDb([activoConBases]);
    const res = await resolverBasesDelSorteo({ db, tenantSlug: "prueba" });
    expect(res.pdfUrl).toBeNull();
    expect(res.sorteo).toBeNull();
  });

  // storefront.bases.005 — una URL vacía/en blanco NO cuenta como bases (espeja el gate de F03)
  it("un `basesPdfUrl` vacío o en blanco cuenta como sin bases", async () => {
    for (const vacio of ["", "   "]) {
      const { db } = fakeDb([{ ...activoConBases, basesPdfUrl: vacio }]);
      const res = await resolverBasesDelSorteo({ db, tenantSlug: "autora" });
      expect(res.pdfUrl).toBeNull();
    }
  });
});

/**
 * Espeja EXACTAMENTE lo que Next hace con las props de `getServerSideProps`: las serializa a JSON.
 * Si el valor no sobrevive el round-trip **idéntico**, Next lanza en runtime
 * («… cannot be serialized as JSON») y la página da 500 — que es el bug que el E2E encontró con un
 * `Date` crudo en `props`. `toStrictEqual` es deliberado: `toEqual` ignora claves `undefined`, que
 * Next TAMBIÉN rechaza.
 */
function roundTripJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("storefront/basesDelSorteo — serializarBases (borde SSR)", () => {
  // storefront.bases.006 — las props de `/bases` son JSON puro: el Date sale como ISO string
  it("convierte `fechaFin` (Date) a ISO string y el resultado sobrevive el round-trip JSON", async () => {
    const { db } = fakeDb([activoConBases]);
    const props = serializarBases(await resolverBasesDelSorteo({ db, tenantSlug: "autora" }));

    expect(props.sorteo).toEqual({
      nombre: "Sorteo de lanzamiento",
      premio: "Un pack firmado",
      fechaFinIso: FIN.toISOString(),
    });
    // El contrato que importa: lo que cruza a `props` es JSON puro (ni Date, ni undefined).
    expect(roundTripJson(props)).toStrictEqual(props);
  });

  // storefront.bases.007 — el estado VACÍO (D5) también cruza el borde sin inventar nada
  it("sin sorteo activo serializa el estado vacío tal cual (y también sobrevive el JSON)", async () => {
    const { db } = fakeDb([{ ...activoConBases, estado: "CERRADO" }]);
    const props = serializarBases(await resolverBasesDelSorteo({ db, tenantSlug: "autora" }));

    expect(props).toStrictEqual({ pdfUrl: null, sorteo: null });
    expect(roundTripJson(props)).toStrictEqual(props);
  });
});
