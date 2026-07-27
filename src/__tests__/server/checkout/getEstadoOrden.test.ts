import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { bloquesDeNumerosDelSorteo } from "~/lib/numerosDelSorteo";
import { getEstadoOrden } from "~/server/domain/checkout/getEstadoOrden";

/**
 * Tests del use case `getEstadoOrden` (estado de orden por token de Flow, builder-tanda-1 F08/D12,
 * ampliado en `checkout-retorno-numeros-sorteo` F01/D1). Devuelve el estado y —solo cuando el webhook
 * ya confirmó `PAGADO`— los **Números del sorteo** de esa compra con el prefijo de la Tienda; jamás
 * correo, montos ni ítems (I-T6). Tenant-scoped por el contexto (I1): un token de OTRA Tienda o
 * inexistente ⇒ respuesta neutral idéntica. Es SOLO-LECTURA: no confirma ni marca nada (la
 * confirmación es exclusiva del webhook, I6/ADR-0001).
 *
 * Las tres respuestas de `numeros` son distintas a propósito: `null` = todavía no confirmada,
 * `[]` = pagada sin tickets (D4), `[n…]` = pagada con sus números.
 */

interface PaymentFake {
  token: string;
  tenantId: string;
  /** `Tenant.prefijoTicket` de la Tienda dueña del pago (F08/D12 de correos): `null` = sin prefijo. */
  prefijoTicket: string | null;
  order: {
    estado: string;
    email: string;
    total: string;
    /** Números del sorteo de las `RaffleEntry` de ESTA orden (ADR-0024). Vacío = orden sin tickets. */
    numeros: number[];
  };
}

/** Fake db: `payment.findFirst` filtra por token + tenantId y proyecta SOLO lo pedido en `select`. */
function fakeDb(payments: PaymentFake[]) {
  return {
    payment: {
      findFirst: async ({
        where,
        select,
      }: {
        where: { token: string; tenantId: string };
        select?: {
          order?: {
            select?: {
              estado?: boolean;
              email?: boolean;
              total?: boolean;
              raffleEntries?: { select?: { numero?: boolean }; orderBy?: unknown };
            };
          };
          tenant?: { select?: { prefijoTicket?: boolean } };
        };
      }) => {
        const p = payments.find((x) => x.token === where.token && x.tenantId === where.tenantId);
        if (!p) return null;
        // Emula la proyección de Prisma: solo devuelve lo que el `select` pidió. El use case pide
        // `order.estado` + los NÚMEROS + el prefijo ⇒ el correo/total NUNCA salen del use case.
        const sel = select?.order?.select;
        const wantEmail = sel?.email === true;
        const wantTotal = sel?.total === true;
        return {
          order: {
            estado: p.order.estado,
            ...(sel?.raffleEntries
              ? {
                  // Prisma devuelve las filas ordenadas por el `orderBy` del select; el fake ordena
                  // igual para que el test no dependa del orden en que se declaró el fixture.
                  raffleEntries: [...p.order.numeros]
                    .sort((a, b) => a - b)
                    .map((numero) => ({ numero })),
                }
              : {}),
            ...(wantEmail ? { email: p.order.email } : {}),
            ...(wantTotal ? { total: p.order.total } : {}),
          },
          ...(select?.tenant?.select?.prefijoTicket === true
            ? { tenant: { prefijoTicket: p.prefijoTicket } }
            : {}),
        };
      },
    },
  } as unknown as PrismaClient;
}

const TENANT_A = "tenant-A";
const TENANT_B = "tenant-B";

const pago = (
  over: Partial<Omit<PaymentFake, "order">> & { order?: Partial<PaymentFake["order"]> },
): PaymentFake => ({
  token: "tok-1",
  tenantId: TENANT_A,
  prefijoTicket: null,
  ...over,
  order: {
    estado: "PENDIENTE",
    email: "comprador@ejemplo.cl",
    total: "3000",
    numeros: [],
    ...over.order,
  },
});

describe("domain/checkout/getEstadoOrden (fake db, tenant-scoped, sin PII)", () => {
  // estado.001 — token de la Tienda del contexto ⇒ el estado, y NADA de números mientras el webhook
  // no confirma (D1): `numeros: null` es «todavía no sé», distinto del `[]` de estado.006.
  it("una orden PENDIENTE devuelve su estado con numeros null (los números no viajan antes de la confirmación)", async () => {
    // La Tienda SÍ tiene prefijo configurado: que igual salga `prefijo: null` es lo que fija que el
    // par números+prefijo viaja JUNTO y solo tras la confirmación.
    const db = fakeDb([
      pago({ token: "tok-1", prefijoTicket: "ARMY", order: { estado: "PENDIENTE" } }),
    ]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(res).toEqual({ estado: "PENDIENTE", numeros: null, prefijo: null });
  });

  // estado.005 — PAGADA con tickets ⇒ viajan los Números del sorteo de ESA orden + el prefijo de la
  // Tienda (D1). Es lo que la celebración del retorno dibuja como boletos: la identidad PÚBLICA del
  // ticket (ADR-0024), no PII.
  it("una orden PAGADA con tickets devuelve sus Números del sorteo y el prefijo de la Tienda", async () => {
    const db = fakeDb([
      pago({
        token: "tok-1",
        prefijoTicket: "ARMY",
        order: { estado: "PAGADO", numeros: [1044, 1043, 1045] },
      }),
    ]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(res).toEqual({ estado: "PAGADO", numeros: [1043, 1044, 1045], prefijo: "ARMY" });
  });

  // estado.006 — PAGADA SIN tickets (productos que no participan del sorteo, o sin sorteo activo al
  // pagar) ⇒ `[]`, NO `null` (D4). La distinción es la que le deja a la UI celebrar sin bloque de
  // boletos en vez de quedarse esperando números que no van a llegar.
  it("una orden PAGADA sin tickets devuelve numeros vacío, no null", async () => {
    const db = fakeDb([
      pago({ token: "tok-1", prefijoTicket: "ARMY", order: { estado: "PAGADO", numeros: [] } }),
    ]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(res.numeros).toEqual([]);
    expect(res.numeros).not.toBeNull();
  });

  // estado.001b — cuando el webhook ya confirmó, la query LEE PAGADO (no lo confirma ella)
  it("lee PAGADO cuando el webhook ya transicionó la orden", async () => {
    const db = fakeDb([pago({ token: "tok-1", order: { estado: "PAGADO", email: "x@y.cl", total: "3000" } })]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(res.estado).toBe("PAGADO");
  });

  // estado.007 — FALLIDA ⇒ `numeros: null` igual que PENDIENTE: un pago que no se concretó no tiene
  // números que mostrar, y la UI de F03 le habla con su copy propio, sin prometer tickets.
  it("una orden FALLIDA devuelve su estado con numeros null", async () => {
    const db = fakeDb([
      pago({ token: "tok-1", prefijoTicket: "ARMY", order: { estado: "FALLIDO" } }),
    ]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(res).toEqual({ estado: "FALLIDO", numeros: null, prefijo: null });
  });

  // estado.002 — token de OTRA Tienda ⇒ respuesta neutral (aislamiento cross-tenant, I1). Que la
  // orden ajena esté PAGADA y CON números no cambia nada: nada de ella sale por esta Tienda.
  it("un token de otra Tienda ⇒ respuesta neutral, sin estado ni números (no filtra existencia)", async () => {
    const db = fakeDb([
      pago({
        token: "tok-B",
        tenantId: TENANT_B,
        prefijoTicket: "BTS",
        order: { estado: "PAGADO", numeros: [77] },
      }),
    ]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-B" });
    expect(res).toEqual({ estado: null, numeros: null, prefijo: null });
  });

  // estado.003 — token inexistente ⇒ MISMA respuesta neutral que estado.002 (indistinguibles)
  it("un token inexistente ⇒ la misma respuesta neutral que un token ajeno", async () => {
    const db = fakeDb([]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "nope" });
    expect(res).toEqual({ estado: null, numeros: null, prefijo: null });
  });

  // estado.008 — Tienda SIN `prefijoTicket` ⇒ `prefijo: null`, y el par (números, prefijo) que sale
  // de acá, pasado por el punto ÚNICO de presentación (I4), da los números desnudos. Se assertea
  // contra `bloquesDeNumerosDelSorteo` y no contra un string armado a mano: es exactamente lo que la
  // celebración del retorno va a dibujar, y lo mismo que ya dice el correo.
  it("una Tienda sin prefijo devuelve prefijo null y sus números se presentan desnudos", async () => {
    const db = fakeDb([
      pago({
        token: "tok-1",
        prefijoTicket: null,
        order: { estado: "PAGADO", numeros: [7, 8, 9, 15] },
      }),
    ]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(res.prefijo).toBeNull();
    expect(bloquesDeNumerosDelSorteo(res.numeros ?? [], res.prefijo)).toEqual(["7–9", "15"]);
  });

  // estado.004 — la RESPUESTA no lleva PII (D5, reescrito): la forma creció a `{estado, numeros,
  // prefijo}` con F01, y el guard de I-T6 se mantiene sobre la forma NUEVA. Los Números del sorteo
  // son identidad pública del ticket (ADR-0024) — el correo, el total y los ítems NO viajan.
  it("la respuesta es exactamente { estado, numeros, prefijo } — sin correo, montos ni ítems (I-T6)", async () => {
    const db = fakeDb([
      pago({ token: "tok-1", prefijoTicket: "ARMY", order: { estado: "PAGADO", numeros: [12] } }),
    ]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(Object.keys(res).sort()).toEqual(["estado", "numeros", "prefijo"]);
    expect(JSON.stringify(res)).not.toContain("@"); // ningún correo se filtra
    expect(JSON.stringify(res)).not.toContain("3000"); // ningún monto se filtra
  });
});
