import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getSorteoActivoStorefront } from "~/server/domain/checkout/getSorteoActivoStorefront";

/**
 * Tests del use case público `getSorteoActivoStorefront` (F05/D8). Devuelve SOLO datos públicos
 * del `Raffle` ACTIVO de la Tienda del contexto (nombre/premio/fechas/bases + conteo) — NUNCA los
 * correos de los participantes (privacidad, ADR-0004). Tenant-scoped server-side (I1); nunca el
 * sorteo de otro tenant. Sin sorteo activo ⇒ null.
 */

interface RaffleFake {
  tenantId: string;
  estado: "ACTIVO" | "CERRADO";
  id: string;
  nombre: string;
  premio: string;
  fechaInicio: Date;
  fechaFin: Date;
  premioImageUrl: string | null;
  totalEntries: number;
}

/** Fake que emula el `findFirst` con select (`_count.entries`). Las BASES ya no viajan por acá
 *  (admin-bases-pdf F07/D3): son un PDF por Sorteo que sirve `storefront/basesDelSorteo`. */
function fakeDb(raffles: RaffleFake[]) {
  return {
    raffle: {
      findFirst: async ({
        where,
      }: {
        where: { tenantId: string; estado: string };
      }) => {
        const r = raffles.find(
          (x) => x.tenantId === where.tenantId && x.estado === where.estado,
        );
        if (!r) return null;
        return {
          id: r.id,
          nombre: r.nombre,
          premio: r.premio,
          fechaInicio: r.fechaInicio,
          fechaFin: r.fechaFin,
          premioImageUrl: r.premioImageUrl,
          _count: { entries: r.totalEntries },
        };
      },
    },
  } as unknown as PrismaClient;
}

const raffle = (over: Partial<RaffleFake>): RaffleFake => ({
  tenantId: "A",
  estado: "ACTIVO",
  id: "r1",
  nombre: "Sorteo de lanzamiento",
  premio: "Un ejemplar firmado",
  fechaInicio: new Date("2026-07-01"),
  fechaFin: new Date("2026-08-01"),
  premioImageUrl: null,
  totalEntries: 3,
  ...over,
});

describe("domain/checkout/getSorteoActivoStorefront (fake db, público, tenant-scoped)", () => {
  // checkout.sorteo.storefront.001 — devuelve el ACTIVO del contexto con conteo, SIN correos
  it("devuelve el Raffle ACTIVO del tenant (nombre/premio/fechas + conteo) sin correos de participantes", async () => {
    const res = await getSorteoActivoStorefront({
      db: fakeDb([raffle({ tenantId: "A", totalEntries: 3 })]),
      tenantId: "A",
    });
    expect(res).toMatchObject({
      id: "r1",
      nombre: "Sorteo de lanzamiento",
      premio: "Un ejemplar firmado",
      totalParticipaciones: 3,
    });
    // Privacidad (ADR-0004): jamás correos ni lista de participantes.
    expect(JSON.stringify(res)).not.toContain("@");
    expect(res).not.toHaveProperty("participantes");
    expect(res).not.toHaveProperty("entries");
  });

  // checkout.sorteo.storefront.004 — devuelve premioImageUrl (o null), sin filtrar correos (F02)
  it("devuelve premioImageUrl del sorteo activo sin filtrar correos", async () => {
    const conImagen = await getSorteoActivoStorefront({
      db: fakeDb([
        raffle({
          tenantId: "A",
          premioImageUrl: "https://pub.r2.dev/A/sorteo/r1/premio?v=2",
        }),
      ]),
      tenantId: "A",
    });
    expect(conImagen?.premioImageUrl).toBe(
      "https://pub.r2.dev/A/sorteo/r1/premio?v=2",
    );
    expect(JSON.stringify(conImagen)).not.toContain("@");

    // Sin imagen de premio ⇒ null (el storefront degrada a gradiente temático, D7).
    const sinImagen = await getSorteoActivoStorefront({
      db: fakeDb([raffle({ tenantId: "A", premioImageUrl: null })]),
      tenantId: "A",
    });
    expect(sinImagen?.premioImageUrl).toBeNull();
  });

  // checkout.sorteo.storefront.002 — sin sorteo ACTIVO ⇒ null
  it("sin sorteo ACTIVO devuelve null", async () => {
    const res = await getSorteoActivoStorefront({
      db: fakeDb([raffle({ tenantId: "A", estado: "CERRADO" })]),
      tenantId: "A",
    });
    expect(res).toBeNull();
  });

  // checkout.sorteo.storefront.003 — nunca el sorteo de otro tenant (aislamiento)
  it("nunca devuelve el sorteo de otro tenant", async () => {
    const res = await getSorteoActivoStorefront({
      db: fakeDb([raffle({ tenantId: "B", id: "otro" })]),
      tenantId: "A",
    });
    expect(res).toBeNull();
  });
});
