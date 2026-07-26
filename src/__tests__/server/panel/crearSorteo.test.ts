import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { crearSorteo } from "~/server/domain/panel/crearSorteo";

/**
 * Tests del use case `crearSorteo` (F01) con `db` FAKE STATEFUL. Claves: nace ACTIVO con
 * `fechaInicio = ahora` (inyectable); SECUENCIAL — guard atómico 1-ACTIVO en la $tx (CONFLICT si ya
 * hay uno); `fechaFin` futura server-side (INVALID); scoped por tenant (FORBIDDEN sin membresía, el
 * `tenantId` jamás del input); las BASES no son campo de creación (admin-bases-pdf F02/D2: el PDF se
 * sube aparte con key per-raffle, y `basesUrl` externo murió con D3); arrastre de participantes de un sorteo
 * pasado del MISMO tenant (copia re-ordinalada; origen ajeno ⇒ NOT_FOUND).
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

const AHORA = new Date("2026-02-15T12:00:00Z");
const FUTURO = new Date("2026-03-15T12:00:00Z");
const PASADO = new Date("2026-01-15T12:00:00Z");

interface FakeOpts {
  /** Raffle ACTIVO ya existente del tenant (dispara el guard 1-ACTIVO). */
  activo?: { id: string; tenantId: string } | null;
  /** Raffles buscables por id (para el origen del arrastre). */
  rafflesPorId?: Record<string, { id: string; tenantId: string }>;
  /** Entries por raffleId (origen del arrastre). */
  entriesPorRaffle?: Record<string, Array<{ orderId: string; email: string }>>;
}

function fakeDb({
  activo = null,
  rafflesPorId = {},
  entriesPorRaffle = {},
}: FakeOpts = {}) {
  let creado: { data: Record<string, unknown>; id: string } | null = null;
  const entriesCreadas: Array<Record<string, unknown>> = [];
  let n = 0;

  const tx = {
    raffle: {
      findFirst: async ({
        where,
      }: {
        where: { tenantId: string; estado?: string; id?: string };
      }) => {
        if (where.estado === "ACTIVO") {
          return activo && activo.tenantId === where.tenantId
            ? { id: activo.id }
            : null;
        }
        const r = where.id ? rafflesPorId[where.id] : undefined;
        return r && r.tenantId === where.tenantId ? { id: r.id } : null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = `nuevo-${n++}`;
        creado = { data, id };
        return { id };
      },
    },
    raffleEntry: {
      findMany: async ({ where }: { where: { raffleId: string } }) =>
        entriesPorRaffle[where.raffleId] ?? [],
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        entriesCreadas.push(...data);
        return { count: data.length };
      },
    },
  };

  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;

  return { db, getCreado: () => creado, getEntriesCreadas: () => entriesCreadas };
}

describe("domain/panel/crearSorteo (fake db stateful, secuencial 1-ACTIVO + arrastre)", () => {
  // panel.sorteo.crear.001 — crea ACTIVO con fechaInicio = ahora y campos correctos
  it("crea un Raffle ACTIVO del tenant resuelto server-side con fechaInicio = ahora", async () => {
    const { db, getCreado } = fakeDb();
    const res = await crearSorteo({
      db,
      acceso: acceso(["A"]),
      input: { nombre: "Sorteo verano", premio: "iPhone", fechaFin: FUTURO },
      ahora: AHORA,
    });
    expect(res.id).toBe("nuevo-0");
    const data = getCreado()!.data;
    expect(data.tenantId).toBe("A");
    expect(data.nombre).toBe("Sorteo verano");
    expect(data.premio).toBe("iPhone");
    expect(data.estado).toBe("ACTIVO");
    expect(data.fechaInicio).toEqual(AHORA);
    expect(data.fechaFin).toEqual(FUTURO);
    // Las BASES no son campo de creación (admin-bases-pdf F02/D2/I2): el Raffle nace sin ellas y
    // el PDF se sube después (key per-raffle, necesita el id). `crearSorteo` no escribe la columna.
    expect(data.basesPdfUrl).toBeUndefined();
    expect(data.basesUrl).toBeUndefined(); // el enlace externo legacy salió del input (D3)
  });

  // panel.sorteo.crear.002 — SECUENCIAL: ya hay un ACTIVO ⇒ CONFLICT, sin crear un segundo
  it("RECHAZA (CONFLICT) si el tenant ya tiene un Raffle ACTIVO, sin crear un segundo", async () => {
    const { db, getCreado } = fakeDb({ activo: { id: "r-activo", tenantId: "A" } });
    await expect(
      crearSorteo({
        db,
        acceso: acceso(["A"]),
        input: { nombre: "Otro", premio: "Nada", fechaFin: FUTURO },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getCreado()).toBeNull();
  });

  // panel.sorteo.crear.003 — fechaFin no futura ⇒ INVALID
  it("RECHAZA (INVALID) si fechaFin no es futura respecto a ahora", async () => {
    const { db, getCreado } = fakeDb();
    await expect(
      crearSorteo({
        db,
        acceso: acceso(["A"]),
        input: { nombre: "S", premio: "P", fechaFin: PASADO },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getCreado()).toBeNull();
  });

  // panel.sorteo.crear.004 — el único raffle previo está CERRADO (no ACTIVO) ⇒ permite crear
  it("permite crear un nuevo ACTIVO si no hay ninguno ACTIVO (el previo está CERRADO)", async () => {
    // El guard solo mira estado ACTIVO: con activo=null (todos los previos cerrados) crea.
    const { db, getCreado } = fakeDb({ activo: null });
    const res = await crearSorteo({
      db,
      acceso: acceso(["A"]),
      input: { nombre: "Temporada 2", premio: "Cámara", fechaFin: FUTURO },
      ahora: AHORA,
    });
    expect(res.id).toBe("nuevo-0");
    expect(getCreado()!.data.estado).toBe("ACTIVO");
  });

  // panel.sorteo.crear.005 — sin membresía ⇒ FORBIDDEN (nunca usa tenantId del input)
  it("sin membresía ⇒ FORBIDDEN", async () => {
    const { db, getCreado } = fakeDb();
    await expect(
      crearSorteo({
        db,
        acceso: acceso([]),
        input: { nombre: "S", premio: "P", fechaFin: FUTURO },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getCreado()).toBeNull();
  });

  // panel.sorteo.crear.006 — las BASES son OPCIONALES al crear (el gate las exige recién al publicar)
  // Reescrito de "basesUrl vacío ⇒ null" al comportamiento nuevo (admin-bases-pdf F02/D2/D3): el
  // enlace externo `basesUrl` YA NO es input, y `crearSorteo` no escribe ninguna columna de bases —
  // el PDF entra SOLO por `confirmarBasesSubidas` tras el presigned PUT (I2/I6).
  it("crea sin bases: el sorteo nace válido y `crearSorteo` no escribe ninguna columna de bases", async () => {
    const { db, getCreado } = fakeDb();
    const res = await crearSorteo({
      db,
      acceso: acceso(["A"]),
      input: { nombre: "S", premio: "P", fechaFin: FUTURO },
      ahora: AHORA,
    });
    expect(res.id).toBe("nuevo-0");
    const data = getCreado()!.data;
    expect(Object.keys(data)).not.toContain("basesPdfUrl");
    expect(Object.keys(data)).not.toContain("basesUrl");
  });

  // panel.sorteo.crear.007 — arrastre: replica los tickets del origen re-ordinalados por orden
  it("con importarDesdeRaffleId replica los tickets del origen (conteo por comprador preservado, re-ordinalado por orden)", async () => {
    const { db, getCreado, getEntriesCreadas } = fakeDb({
      rafflesPorId: { viejo: { id: "viejo", tenantId: "A" } },
      entriesPorRaffle: {
        viejo: [
          { orderId: "o1", email: "a@x.cl" },
          { orderId: "o1", email: "a@x.cl" },
          { orderId: "o2", email: "b@x.cl" },
          { orderId: "o3", email: "a@x.cl" },
        ],
      },
    });
    await crearSorteo({
      db,
      acceso: acceso(["A"]),
      input: {
        nombre: "Temporada 2",
        premio: "Cámara",
        fechaFin: FUTURO,
        importarDesdeRaffleId: "viejo",
      },
      ahora: AHORA,
    });

    const nuevoId = getCreado()!.id;
    const copiadas = getEntriesCreadas();
    // 4 tickets totales (preserva el conteo por comprador: a@x.cl 3, b@x.cl 1).
    expect(copiadas).toHaveLength(4);
    expect(copiadas.every((e) => e.raffleId === nuevoId)).toBe(true);
    expect(copiadas.every((e) => e.tenantId === "A")).toBe(true);
    const emails = copiadas.map((e) => e.email).sort();
    expect(emails).toEqual(["a@x.cl", "a@x.cl", "a@x.cl", "b@x.cl"]);
    // re-ordinalado por orden: o1 tiene 2 tickets ⇒ ordinales 0 y 1; o2/o3 ⇒ 0.
    const o1 = copiadas.filter((e) => e.orderId === "o1").map((e) => e.ordinal).sort();
    expect(o1).toEqual([0, 1]);
    expect(copiadas.filter((e) => e.orderId === "o2").map((e) => e.ordinal)).toEqual([0]);
    expect(copiadas.filter((e) => e.orderId === "o3").map((e) => e.ordinal)).toEqual([0]);
  });

  // panel.sorteo.crear.008 — origen de otro tenant / inexistente ⇒ NOT_FOUND, no crea
  it("con importarDesdeRaffleId de otro tenant o inexistente ⇒ NOT_FOUND sin crear el sorteo", async () => {
    const { db, getCreado, getEntriesCreadas } = fakeDb({
      rafflesPorId: { ajeno: { id: "ajeno", tenantId: "B" } }, // pertenece a otro tenant
      entriesPorRaffle: { ajeno: [{ orderId: "o1", email: "x@x.cl" }] },
    });
    await expect(
      crearSorteo({
        db,
        acceso: acceso(["A"]),
        input: {
          nombre: "S",
          premio: "P",
          fechaFin: FUTURO,
          importarDesdeRaffleId: "ajeno",
        },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getCreado()).toBeNull();
    expect(getEntriesCreadas()).toHaveLength(0);
  });
});
