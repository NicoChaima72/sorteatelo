import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { despublicarTienda } from "~/server/domain/tenants/despublicarTienda";
import { publicarTienda } from "~/server/domain/tenants/publicarTienda";

/**
 * Tests de las transiciones de publicación (F08/F03, D5/D6, ADR-0008) con `db` FAKE STATEFUL.
 * `publicarTienda` RECOMPUTA el gate server-side dentro de la $transaction (I2: jamás confía en
 * el cliente) y transiciona {ALTA|CONFIGURACION}→PUBLICADA SOLO si pasa; `despublicarTienda`
 * PUBLICADA→CONFIGURACION (reversible). Ambas scopeadas por membresía (I1).
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  email: "org@x.cl",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

const VIGENTE = "2026-07-17";

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

/** Fake stateful para publicarTienda: expone la $tx y captura la transición de estado. */
function fakePublicar(s: Escenario) {
  const estadoRef = { valor: s.estado ?? "CONFIGURACION" };
  const tx = {
    tenant: {
      findUniqueOrThrow: async () => ({
        estado: estadoRef.valor,
        tosVersion: s.tosVersion === undefined ? VIGENTE : s.tosVersion,
      }),
      update: async ({ data }: { data: { estado: string } }) => {
        estadoRef.valor = data.estado;
        return { id: "A" };
      },
    },
    flowCredential: {
      findUnique: async () =>
        (s.flowConfigurada ?? true) ? { tenantId: "A" } : null,
    },
    product: {
      // Desde F06 el gate resuelve "hay producto entregable" con un `findMany` + la regla pura
      // `esProductoEntregable`, leído con la MISMA `tx` (I2). El fake sigue respondiendo por FLAG:
      // un producto ESTANDAR con archivo confirmado (entregable), o la lista vacía. El filtro real
      // se testea contra la DB en `productos/hayProductoEntregable.test.ts`.
      findMany: async () =>
        (s.productoPublicable ?? true)
          ? [
              {
                modalidad: "ESTANDAR" as const,
                pdfPath: null,
                _count: { files: 1 },
                packOptions: [],
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
    // Facturación de la plataforma (ADR-0026): default AL_DIA para que los escenarios
    // preexistentes sigan aislando el requisito que cada uno testea.
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
  };
  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;
  return { db, estadoRef };
}

describe("domain/tenants/publicarTienda (fake db stateful, gate recomputado)", () => {
  // tenants.publicacion.002 — todos los requisitos ⇒ CONFIGURACION→PUBLICADA
  it("con todos los requisitos, transiciona CONFIGURACION→PUBLICADA", async () => {
    const { db, estadoRef } = fakePublicar({});
    const res = await publicarTienda({
      db,
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(res.estado).toBe("PUBLICADA");
    expect(estadoRef.valor).toBe("PUBLICADA");
  });

  // tenants.publicacion.012 — SIN plan activo ni exención, publicar se RECHAZA server-side
  // (ADR-0026, F03/D2 + I2/I4): el gate se recomputa dentro de la $tx; no alcanza con que la UI
  // esconda el botón. Es la defensa contra un cliente que llame la mutation a mano.
  it("sin suscripción activa ni exención NO publica, aunque el resto del checklist esté listo", async () => {
    const { db, estadoRef } = fakePublicar({ suscripcion: null });
    await expect(
      publicarTienda({ db, acceso: acceso(["A"]), tosVersionVigente: VIGENTE }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(estadoRef.valor).toBe("CONFIGURACION"); // no transicionó

    // El mensaje le dice al Organizador QUÉ falta.
    const cancelada = fakePublicar({ suscripcion: "CANCELADA" });
    await expect(
      publicarTienda({
        db: cancelada.db,
        acceso: acceso(["A"]),
        tosVersionVigente: VIGENTE,
      }),
    ).rejects.toThrow(/plan/i);
  });

  // tenants.publicacion.013 — tienda EXENTA publica SIN tarjeta ni suscripción (D8)
  it("una tienda exenta publica sin pasar por la tarjeta", async () => {
    const { db, estadoRef } = fakePublicar({
      suscripcion: null,
      exentaHasta: null, // exención PERPETUA (cortesía / grandfather)
    });
    const res = await publicarTienda({
      db,
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(res.estado).toBe("PUBLICADA");
    expect(estadoRef.valor).toBe("PUBLICADA");
  });

  // tenants.publicacion.002b — requisito faltante ⇒ INVALID y NO publica (gate recomputado)
  it("con un requisito faltante NO publica y devuelve INVALID con el faltante", async () => {
    const { db, estadoRef } = fakePublicar({ flowConfigurada: false });
    await expect(
      publicarTienda({ db, acceso: acceso(["A"]), tosVersionVigente: VIGENTE }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(estadoRef.valor).toBe("CONFIGURACION"); // no transicionó
  });

  // tenants.publicacion.003 — raffle activo SIN PDF de bases ⇒ falla (ADR-0008); sin sorteo ⇒ publica
  // Reescrito (admin-bases-pdf F03/D2/D3): el gate recomputado server-side ahora exige el
  // `basesPdfUrl` del Raffle ACTIVO, no el texto `Tenant.basesSorteo`.
  it("con sorteo activo sin el PDF de bases falla; sin sorteo activo publica igual", async () => {
    const bloqueado = fakePublicar({ raffleActivo: true, basesPdf: null });
    await expect(
      publicarTienda({
        db: bloqueado.db,
        acceso: acceso(["A"]),
        tosVersionVigente: VIGENTE,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(bloqueado.estadoRef.valor).toBe("CONFIGURACION");

    const ok = fakePublicar({ raffleActivo: false });
    const res = await publicarTienda({
      db: ok.db,
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(res.estado).toBe("PUBLICADA");
  });

  // tenants.publicacion.003b — sorteo activo CON el PDF de bases ⇒ el gate DESBLOQUEA y publica
  // La otra mitad de la validación: subir el PDF tiene que dejar publicar, no solo dejar de bloquear.
  it("con sorteo activo y el PDF de bases subido, publica", async () => {
    const { db, estadoRef } = fakePublicar({
      raffleActivo: true,
      basesPdf: "https://pub.r2.dev/A/sorteo/r1/bases.pdf?v=1",
    });
    const res = await publicarTienda({
      db,
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(res.estado).toBe("PUBLICADA");
    expect(estadoRef.valor).toBe("PUBLICADA");
  });

  // tenants.publicacion.002c — ya PUBLICADA ⇒ idempotente (no re-evalúa el gate ni rompe)
  it("publicar una Tienda ya PUBLICADA es idempotente", async () => {
    const { db } = fakePublicar({ estado: "PUBLICADA", flowConfigurada: false });
    const res = await publicarTienda({
      db,
      acceso: acceso(["A"]),
      tosVersionVigente: VIGENTE,
    });
    expect(res.estado).toBe("PUBLICADA");
    expect(res.yaPublicada).toBe(true);
  });

  // tenants.publicacion.002d — SUSPENDIDA no se auto-publica (la reactiva el soporte) ⇒ CONFLICT
  it("una Tienda SUSPENDIDA no puede auto-publicarse ⇒ CONFLICT", async () => {
    const { db, estadoRef } = fakePublicar({ estado: "SUSPENDIDA" });
    await expect(
      publicarTienda({ db, acceso: acceso(["A"]), tosVersionVigente: VIGENTE }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(estadoRef.valor).toBe("SUSPENDIDA");
  });

  // tenants.publicacion.006 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN", async () => {
    const { db } = fakePublicar({});
    await expect(
      publicarTienda({ db, acceso: acceso([]), tosVersionVigente: VIGENTE }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

/** Fake para despublicarTienda: updateMany con guard WHERE estado=PUBLICADA. */
function fakeDespublicar(estadoActual: string) {
  const estadoRef = { valor: estadoActual };
  const db = {
    tenant: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; estado: string };
        data: { estado: string };
      }) => {
        if (estadoRef.valor === where.estado) {
          estadoRef.valor = data.estado;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
  } as unknown as PrismaClient;
  return { db, estadoRef };
}

describe("domain/tenants/despublicarTienda (fake db)", () => {
  // tenants.publicacion.004 — PUBLICADA→CONFIGURACION (reversible)
  it("despublicar transiciona PUBLICADA→CONFIGURACION", async () => {
    const { db, estadoRef } = fakeDespublicar("PUBLICADA");
    const res = await despublicarTienda({ db, acceso: acceso(["A"]) });
    expect(res.estado).toBe("CONFIGURACION");
    expect(estadoRef.valor).toBe("CONFIGURACION");
  });

  // tenants.publicacion.004b — no estaba publicada ⇒ CONFLICT (guard atómico, count 0)
  it("despublicar una Tienda no publicada ⇒ CONFLICT", async () => {
    const { db, estadoRef } = fakeDespublicar("CONFIGURACION");
    await expect(
      despublicarTienda({ db, acceso: acceso(["A"]) }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(estadoRef.valor).toBe("CONFIGURACION");
  });

  // tenants.publicacion.004c — sin membresía (Tienda ajena) ⇒ FORBIDDEN antes de tocar la DB
  it("sin membresía ⇒ FORBIDDEN (no puede despublicar una Tienda ajena)", async () => {
    const { db, estadoRef } = fakeDespublicar("PUBLICADA");
    await expect(
      despublicarTienda({ db, acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(estadoRef.valor).toBe("PUBLICADA"); // intacta
  });
});
