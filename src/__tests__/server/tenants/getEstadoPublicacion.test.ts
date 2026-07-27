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
  /** Estado de la `PlatformSubscription` (ADR-0026); null ⇒ la Tienda no tiene plan. */
  suscripcion?: string | null;
  /** `PlatformExemption.exentaHasta`; `undefined` ⇒ sin exención, `null` ⇒ exenta PERPETUA. */
  exentaHasta?: Date | null;
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
      // Desde F06 el gate resuelve "hay producto entregable" con un `findMany` + la regla pura
      // `esProductoEntregable` (la comparación pool ≥ pack de un SOBRE no se expresa en un `where`).
      // Este fake sigue respondiendo por FLAG: devuelve un producto ESTANDAR con un archivo
      // confirmado (entregable) o la lista vacía. La semántica del filtro se testea contra la DB
      // real en `productos/hayProductoEntregable.test.ts`; acá el sujeto es la POLÍTICA del gate.
      findMany: async () =>
        (s.productoPublicable ?? true)
          ? [
              {
                modalidad: "ESTANDAR" as const,
                pdfPath: null,
                _count: { files: 1 },
                unidadesPorPack: 1,
                fuente: null,
              },
            ]
          : [],
    },
    raffle: {
      findFirst: async () =>
        (s.raffleActivo ?? false)
          ? { id: "r1", basesPdfUrl: s.basesPdf ?? null }
          : null,
    },
    // Facturación de la plataforma (ADR-0026): por default la Tienda tiene su plan AL_DIA, para
    // que los escenarios preexistentes sigan describiendo lo que describían (el requisito nuevo
    // no es el sujeto de esos tests).
    platformSubscription: {
      findUnique: async () => {
        const estado = s.suscripcion === undefined ? "AL_DIA" : s.suscripcion;
        return estado === null ? null : { estado };
      },
    },
    platformExemption: {
      findUnique: async () =>
        "exentaHasta" in s ? { exentaHasta: s.exentaHasta ?? null } : null,
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
    expect(res.requisitos.facturacion.cumplido).toBe(true);
    expect(res.puedePublicar).toBe(true);
  });

  // tenants.publicacion.010 — el checklist LEE la facturación real de la Tienda (ADR-0026, F03)
  it("refleja el requisito del plan según la suscripción y la exención de la Tienda", async () => {
    // Sin plan ni exención ⇒ el checklist muestra el paso "Activa tu plan" pendiente.
    const sinPlan = await getEstadoPublicacion({
      db: fakeDb({ suscripcion: null }),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(sinPlan.requisitos.facturacion.cumplido).toBe(false);
    expect(sinPlan.requisitos.facturacion.exenta).toBe(false);
    expect(sinPlan.puedePublicar).toBe(false);

    // Suscripción CANCELADA ⇒ tampoco cumple (republicar exige re-suscribir, D6).
    const cancelada = await getEstadoPublicacion({
      db: fakeDb({ suscripcion: "CANCELADA" }),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(cancelada.requisitos.facturacion.cumplido).toBe(false);

    // Tienda EXENTA sin suscripción ⇒ cumple y se marca `exenta` (la UI dirá "Plan cortesía").
    const exenta = await getEstadoPublicacion({
      db: fakeDb({ suscripcion: null, exentaHasta: null }),
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(exenta.requisitos.facturacion.cumplido).toBe(true);
    expect(exenta.requisitos.facturacion.exenta).toBe(true);
    expect(exenta.puedePublicar).toBe(true);
  });

  // tenants.publicacion.011 — la exención EXPIRADA se evalúa lazy y deja de cumplir (D8)
  it("una exención vencida deja de habilitar la publicación (evaluación lazy)", async () => {
    const db = fakeDb({
      suscripcion: null,
      exentaHasta: new Date("2026-07-01T00:00:00Z"),
    });
    const vencida = await getEstadoPublicacion({
      db,
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
      ahora: new Date("2026-07-26T00:00:00Z"),
    });
    expect(vencida.requisitos.facturacion.cumplido).toBe(false);

    // La MISMA fila, evaluada antes del corte, sí valía.
    const vigente = await getEstadoPublicacion({
      db,
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
      ahora: new Date("2026-06-15T00:00:00Z"),
    });
    expect(vigente.requisitos.facturacion.cumplido).toBe(true);
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
