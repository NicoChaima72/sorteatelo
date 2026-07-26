import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { getSorteoDelPanel } from "~/server/domain/panel/getSorteoDelPanel";

/**
 * Tests del use case `getSorteoDelPanel` (F05 interna) con `db` FAKE. Lee el sorteo actual
 * de la Tienda (el más reciente) con sus participaciones reales, scopeado por el `tenantId`
 * resuelto server-side. Sin membresía ⇒ FORBIDDEN. Sin sorteo ⇒ sorteo: null.
 */

const acceso = (tenantIds: string[]): AccesoPanel => ({
  userId: "u1",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

/**
 * Fake FIEL en el `select`: proyecta solo los campos pedidos, como haría Prisma. Sin esto, un campo
 * que el use case OLVIDE seleccionar (p.ej. `ganadorNumero`) llegaría igual al resultado en el test
 * y se rompería recién en producción.
 */
function fakeDb(raffle: Record<string, unknown> | null) {
  return {
    raffle: {
      findFirst: async ({
        where,
        select,
      }: {
        where: { tenantId: string };
        select: Record<string, unknown>;
      }) => {
        if (where.tenantId !== "A" || !raffle) return null;
        return Object.fromEntries(
          Object.keys(select).map((campo) => [campo, raffle[campo]]),
        );
      },
    },
  } as unknown as PrismaClient;
}

const RAFFLE_A = {
  id: "r1",
  nombre: "Sorteo BTS",
  premio: "2 entradas",
  estado: "ACTIVO",
  fechaInicio: new Date("2026-01-01"),
  fechaFin: new Date("2026-03-01"),
  premioImageUrl: null,
  ganadorEmail: null,
  ganadorNumero: null,
  ejecutadoAt: null,
  ejecutadoPor: null,
  // El prefijo de ticket es de la TIENDA (F08/D12), así que llega por la relación del raffle.
  tenant: { prefijoTicket: "ARMY" },
  // 3 tickets de a@x.cl + 1 de b@x.cl ⇒ 4 participaciones, 2 participantes (ADR-0012). Con sus
  // Números del sorteo (ADR-0024): a@x.cl compró un bloque contiguo 10–12, b@x.cl el 9.
  entries: [
    { email: "a@x.cl", createdAt: new Date("2026-01-06"), numero: 12 },
    { email: "a@x.cl", createdAt: new Date("2026-01-05"), numero: 11 },
    { email: "a@x.cl", createdAt: new Date("2026-01-04"), numero: 10 },
    { email: "b@x.cl", createdAt: new Date("2026-01-03"), numero: 9 },
  ],
};

describe("domain/panel/getSorteoDelPanel (fake db, tenant-scoped)", () => {
  // panel.sorteo.get.001 — agrupa las participaciones por correo con su conteo de tickets
  it("agrupa las participaciones por correo con su conteo de tickets y devuelve totalParticipaciones", async () => {
    const res = await getSorteoDelPanel({
      db: fakeDb(RAFFLE_A),
      acceso: acceso(["A"]),
    });
    expect(res.sorteo).not.toBeNull();
    expect(res.sorteo!.nombre).toBe("Sorteo BTS");
    // totalParticipaciones = nº de tickets (RaffleEntry), no de participantes.
    expect(res.sorteo!.totalParticipaciones).toBe(4);
    const porCorreo = new Map(
      res.sorteo!.participantes.map((p) => [p.email, p]),
    );
    expect(porCorreo.size).toBe(2); // 2 participantes distintos
    expect(porCorreo.get("a@x.cl")!.tickets).toBe(3);
    expect(porCorreo.get("b@x.cl")!.tickets).toBe(1);
    // ultimaInscripcion = el ticket más reciente de ese correo
    expect(porCorreo.get("a@x.cl")!.ultimaInscripcion).toEqual(
      new Date("2026-01-06"),
    );
    expect(res.sorteo!.ejecutadoAt).toBeNull();
    expect(res.sorteo!.ganadorEmail).toBeNull();
  });

  // panel.sorteo.get.004 — cada participante trae SUS Números del sorteo (ADR-0024): es lo que el
  //                         Organizador necesita para responderle a un comprador "¿cuál es mi nº?"
  it("cada participante trae sus Números del sorteo ordenados ascendente", async () => {
    const res = await getSorteoDelPanel({
      db: fakeDb(RAFFLE_A),
      acceso: acceso(["A"]),
    });
    const porCorreo = new Map(
      res.sorteo!.participantes.map((p) => [p.email, p]),
    );
    // Ascendente aunque las entries llegan ordenadas por createdAt DESC (12, 11, 10).
    expect(porCorreo.get("a@x.cl")!.numeros).toEqual([10, 11, 12]);
    expect(porCorreo.get("b@x.cl")!.numeros).toEqual([9]);
  });

  // panel.sorteo.get.006 — F08/D12: el prefijo de la Tienda viaja SERVER-SIDE junto al sorteo, para
  //                         que el panel no tenga que ir a buscarlo por su cuenta ni inventarlo. Sin
  //                         prefijo configurado ⇒ `null` ⇒ los Números se muestran pelados.
  it("expone el prefijo de ticket de la Tienda; sin configurar, null", async () => {
    const conPrefijo = await getSorteoDelPanel({
      db: fakeDb(RAFFLE_A),
      acceso: acceso(["A"]),
    });
    expect(conPrefijo.sorteo!.prefijoTicket).toBe("ARMY");

    const sinPrefijo = await getSorteoDelPanel({
      db: fakeDb({ ...RAFFLE_A, tenant: { prefijoTicket: null } }),
      acceso: acceso(["A"]),
    });
    expect(sinPrefijo.sorteo!.prefijoTicket).toBeNull();
  });

  // panel.sorteo.get.005 — el sorteo ejecutado expone el NÚMERO ganador, no solo el correo
  it("un sorteo ejecutado expone el Número del sorteo ganador junto al correo", async () => {
    const res = await getSorteoDelPanel({
      db: fakeDb({
        ...RAFFLE_A,
        estado: "CERRADO",
        ganadorEmail: "a@x.cl",
        ganadorNumero: 11,
        ejecutadoAt: new Date("2026-03-01"),
        ejecutadoPor: "org@x.cl",
      }),
      acceso: acceso(["A"]),
    });
    expect(res.sorteo!.ganadorEmail).toBe("a@x.cl");
    expect(res.sorteo!.ganadorNumero).toBe(11);
  });

  // panel.sorteo.get.002 — Tienda sin sorteo ⇒ sorteo: null
  it("sin sorteo devuelve sorteo: null (empty state)", async () => {
    const res = await getSorteoDelPanel({
      db: fakeDb(null),
      acceso: acceso(["A"]),
    });
    expect(res.sorteo).toBeNull();
  });

  // panel.sorteo.get.003 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN", async () => {
    await expect(
      getSorteoDelPanel({ db: fakeDb(RAFFLE_A), acceso: acceso([]) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
