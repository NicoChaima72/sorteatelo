import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  enmascararEmail,
  getSorteoResumenStorefront,
} from "~/server/domain/checkout/getSorteoResumenStorefront";

/**
 * Tests del use case público `getSorteoResumenStorefront` (catálogo-v2 F06): resultado de los Raffle
 * CERRADOS de la Tienda del contexto, con el ganador ENMASCARADO + agregados — JAMÁS el correo
 * completo ni PII (ADR-0004). Tenant-scoped server-side (I1); nunca los cerrados de otro tenant.
 */

interface CerradoFake {
  tenantId: string;
  estado: "ACTIVO" | "CERRADO";
  ejecutadoAt: Date | null;
  id: string;
  nombre: string;
  premio: string;
  fechaFin: Date;
  ganadorEmail: string | null;
  totalEntries: number;
}

/** Fake del `findMany` con where (tenantId + estado CERRADO + ejecutadoAt not null) + take + orderBy. */
function fakeDb(raffles: CerradoFake[]) {
  return {
    raffle: {
      findMany: async ({
        where,
        take,
      }: {
        where: { tenantId: string; estado: string; ejecutadoAt: { not: null } };
        take?: number;
      }) => {
        const filtradas = raffles
          .filter(
            (x) =>
              x.tenantId === where.tenantId &&
              x.estado === where.estado &&
              x.ejecutadoAt !== null,
          )
          .slice(0, take ?? raffles.length);
        return filtradas.map((r) => ({
          id: r.id,
          nombre: r.nombre,
          premio: r.premio,
          fechaFin: r.fechaFin,
          ganadorEmail: r.ganadorEmail,
          _count: { entries: r.totalEntries },
        }));
      },
    },
  } as unknown as PrismaClient;
}

const cerrado = (over: Partial<CerradoFake>): CerradoFake => ({
  tenantId: "A",
  estado: "CERRADO",
  ejecutadoAt: new Date("2026-07-10"),
  id: "r1",
  nombre: "Sorteo de julio",
  premio: "Un ejemplar firmado",
  fechaFin: new Date("2026-07-01"),
  ganadorEmail: "mariajose@gmail.com",
  totalEntries: 42,
  ...over,
});

describe("domain/checkout/enmascararEmail (privacidad, ADR-0004)", () => {
  // checkout.resumen.mask.001 — enmascara: 2 primeros + *** + dominio; nunca el correo completo
  it("enmascara el correo dejando 2 chars + *** + dominio", () => {
    expect(enmascararEmail("mariajose@gmail.com")).toBe("ma***@gmail.com");
    expect(enmascararEmail("a@x.com")).toBe("a***@x.com"); // local corto ⇒ 1 char
    expect(enmascararEmail(null)).toBeNull();
    expect(enmascararEmail("sin-arroba")).toBeNull(); // sin @ ⇒ null (no mostramos nada)
    expect(enmascararEmail("@x.com")).toBeNull(); // sin parte local ⇒ null
    // nunca deja el correo completo
    expect(enmascararEmail("mariajose@gmail.com")).not.toContain("riajose");
  });
});

describe("domain/checkout/getSorteoResumenStorefront (fake db, público, tenant-scoped)", () => {
  // checkout.resumen.001 — devuelve cerrados con ganador enmascarado + conteo, SIN correo completo
  it("devuelve los cerrados del tenant con ganador enmascarado y conteo, sin correo completo", async () => {
    const res = await getSorteoResumenStorefront({
      db: fakeDb([cerrado({ tenantId: "A", ganadorEmail: "mariajose@gmail.com", totalEntries: 42 })]),
      tenantId: "A",
    });
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      premio: "Un ejemplar firmado",
      ganadorEnmascarado: "ma***@gmail.com",
      totalParticipaciones: 42,
    });
    // Privacidad (ADR-0004): jamás el correo completo ni la lista de participantes.
    expect(JSON.stringify(res)).not.toContain("mariajose@gmail.com");
    expect(JSON.stringify(res)).not.toContain("riajose");
    expect(res[0]).not.toHaveProperty("ganadorEmail");
    expect(res[0]).not.toHaveProperty("entries");
  });

  // checkout.resumen.002 — sin cerrados ⇒ [] (el widget se auto-oculta)
  it("sin raffles cerrados devuelve lista vacía", async () => {
    const res = await getSorteoResumenStorefront({
      db: fakeDb([cerrado({ tenantId: "A", estado: "ACTIVO", ejecutadoAt: null })]),
      tenantId: "A",
    });
    expect(res).toEqual([]);
  });

  // checkout.resumen.003 — nunca los cerrados de otro tenant (aislamiento)
  it("nunca devuelve los cerrados de otro tenant", async () => {
    const res = await getSorteoResumenStorefront({
      db: fakeDb([cerrado({ tenantId: "B", id: "otro" })]),
      tenantId: "A",
    });
    expect(res).toEqual([]);
  });

  // checkout.resumen.004 — respeta el max (take)
  it("respeta el máximo solicitado", async () => {
    const muchos = Array.from({ length: 10 }, (_, i) => cerrado({ id: `r${i}`, tenantId: "A" }));
    const res = await getSorteoResumenStorefront({ db: fakeDb(muchos), tenantId: "A", max: 3 });
    expect(res).toHaveLength(3);
  });

  // checkout.resumen.005 — ganador null (raffle cerrado sin ejecutar-con-ganador) ⇒ enmascarado null
  it("un cerrado sin ganadorEmail devuelve ganadorEnmascarado null", async () => {
    const res = await getSorteoResumenStorefront({
      db: fakeDb([cerrado({ tenantId: "A", ganadorEmail: null })]),
      tenantId: "A",
    });
    expect(res[0]?.ganadorEnmascarado).toBeNull();
  });
});
