import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getEstadoPublicacion } from "~/server/domain/tenants/getEstadoPublicacion";

/**
 * Tests de `getEstadoPublicacion` (F08/F03, D4) con `db` FAKE: la lectura server-side que
 * alimenta el checklist del panel Y el gate (misma lógica que publicarTienda, vía el núcleo
 * puro). Marca cumplidos exactamente los requisitos presentes; scopeado por tenant (I1).
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  esOperador: false,
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

interface Escenario {
  estado?: string;
  tosVersion?: string | null;
  /** `Raffle.basesPdfUrl` del sorteo ACTIVO (admin-bases-pdf F03/D2): null ⇒ sin bases subidas. */
  basesPdf?: string | null;
  flowConfigurada?: boolean;
  productoPublicable?: boolean;
  raffleActivo?: boolean;
}

const VIGENTE = "2026-07-17";

function fakeDb(s: Escenario) {
  const tenantId = "A";
  return {
    tenant: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        if (where.id !== tenantId) throw new Error("no encontrado");
        return {
          slug: "mi-tienda",
          estado: s.estado ?? "CONFIGURACION",
          tosVersion: s.tosVersion === undefined ? VIGENTE : s.tosVersion,
        };
      },
    },
    flowCredential: {
      findUnique: async () =>
        (s.flowConfigurada ?? true) ? { tenantId } : null,
    },
    product: {
      findFirst: async () =>
        (s.productoPublicable ?? true) ? { id: "p1" } : null,
    },
    raffle: {
      findFirst: async () =>
        (s.raffleActivo ?? false)
          ? { id: "r1", basesPdfUrl: s.basesPdf ?? null }
          : null,
    },
  } as unknown as PrismaClient;
}

describe("domain/tenants/getEstadoPublicacion (fake db, tenant-scoped)", () => {
  // tenants.publicacion.001 — marca cumplidos exactamente los requisitos presentes; puedePublicar
  it("con todo presente marca los 4 requisitos cumplidos y puedePublicar", async () => {
    const res = await getEstadoPublicacion({
      db: fakeDb({}),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(res.slug).toBe("mi-tienda");
    expect(res.estado).toBe("CONFIGURACION");
    expect(res.requisitos.tos.cumplido).toBe(true);
    expect(res.requisitos.flow.cumplido).toBe(true);
    expect(res.requisitos.producto.cumplido).toBe(true);
    expect(res.requisitos.bases.aplica).toBe(false);
    expect(res.puedePublicar).toBe(true);
  });

  // tenants.publicacion.001b — un requisito ausente se marca no-cumplido y baja puedePublicar
  it("con Flow sin configurar y sin producto publicable, esos dos quedan no cumplidos", async () => {
    const res = await getEstadoPublicacion({
      db: fakeDb({ flowConfigurada: false, productoPublicable: false }),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(res.requisitos.flow.cumplido).toBe(false);
    expect(res.requisitos.producto.cumplido).toBe(false);
    expect(res.requisitos.tos.cumplido).toBe(true); // este sí presente
    expect(res.puedePublicar).toBe(false);
  });

  // tenants.publicacion.tos.001 — ToS pendiente si null/distinta; cumplido si coincide (F02)
  it("el requisito ToS refleja tosVersion vs la versión vigente", async () => {
    const pendienteNull = await getEstadoPublicacion({
      db: fakeDb({ tosVersion: null }),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(pendienteNull.requisitos.tos.cumplido).toBe(false);

    const pendienteVieja = await getEstadoPublicacion({
      db: fakeDb({ tosVersion: "2020-01-01" }),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(pendienteVieja.requisitos.tos.cumplido).toBe(false);

    const cumplido = await getEstadoPublicacion({
      db: fakeDb({ tosVersion: VIGENTE }),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(cumplido.requisitos.tos.cumplido).toBe(true);
  });

  // tenants.publicacion.bases.001 — bases aplica SOLO con raffle activo
  it("bases aplica solo si hay un sorteo activo", async () => {
    const sinSorteo = await getEstadoPublicacion({
      db: fakeDb({ raffleActivo: false, basesPdf: null }),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(sinSorteo.requisitos.bases.aplica).toBe(false);
    expect(sinSorteo.requisitos.bases.cumplido).toBe(true); // no aplica ⇒ no bloquea

    const conSorteoSinBases = await getEstadoPublicacion({
      db: fakeDb({ raffleActivo: true, basesPdf: null }),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(conSorteoSinBases.requisitos.bases.aplica).toBe(true);
    expect(conSorteoSinBases.requisitos.bases.cumplido).toBe(false);
    expect(conSorteoSinBases.puedePublicar).toBe(false);
  });

  // tenants.publicacion.005 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN", async () => {
    await expect(
      getEstadoPublicacion({
        db: fakeDb({}),
        acceso: acceso([]),
        tosVersionVigente: VIGENTE,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
