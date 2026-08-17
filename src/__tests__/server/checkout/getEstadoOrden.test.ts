import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { bloquesDeNumerosDelSorteo } from "~/lib/numerosDelSorteo";
import { getEstadoOrden } from "~/server/domain/checkout/getEstadoOrden";
import { crearLimitadorDeIntentos } from "~/server/security/limiteDeIntentos";

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
    /**
     * `DownloadGrant` de la orden, como `{id, token}` (F02/D1 de
     * `entrega-postpago-retorno-y-reacceso`). Se declaran DESORDENADOS a propósito en los fixtures:
     * el use case tiene que elegir siempre el mismo, y si el fake respetara el orden del fixture el
     * test no probaría nada. Vacío = orden sin grants.
     */
    grants: Array<{ id: string; token: string }>;
  };
}

/** Ordena los grants como lo haría Postgres con ese `orderBy`; sin `orderBy`, orden arbitrario. */
function ordenarGrants(
  grants: Array<{ id: string; token: string }>,
  direccion: "asc" | "desc" | undefined,
): Array<{ id: string; token: string }> {
  if (direccion === undefined) return grants;
  return [...grants].sort((a, b) =>
    direccion === "desc" ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id),
  );
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
              downloadGrants?: {
                select?: { token?: boolean };
                orderBy?: { id?: "asc" | "desc" };
                take?: number;
              };
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
            ...(sel?.downloadGrants
              ? {
                  // El fake HONRA el `orderBy` + `take`, y SOLO si vienen: sin `orderBy` devuelve el
                  // fixture en el orden en que se declaró —que a propósito no está ordenado— igual
                  // que Prisma devolvería el orden físico de la tabla, o sea cualquiera. Así, un use
                  // case que se olvidara del `orderBy` no pasaría el test del token determinista en
                  // vez de aprobarlo por accidente.
                  downloadGrants: ordenarGrants(p.order.grants, sel.downloadGrants!.orderBy?.id)
                    .slice(0, sel.downloadGrants!.take ?? p.order.grants.length)
                    .map((g) => ({ token: g.token })),
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
    grants: [],
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

  /*
    estado.009 (F02/D1 de `entrega-postpago-retorno-y-reacceso`) — una orden PAGADA devuelve además
    la URL de su página de entrega, y el token que elige es DETERMINISTA.

    Por qué cualquier token sirve pero igual tiene que ser siempre el mismo: una orden tiene un
    `DownloadGrant` por producto, pero `/entrega/<token>` muestra la orden COMPLETA — así que los
    tres tokens de este fixture llevan exactamente a la misma página. Aun así el use case ordena por
    `id` y toma uno: si eligiera "el que venga primero", dos pollings seguidos del MISMO retorno
    podrían mandar al Comprador a dos URLs distintas de la misma compra, y cualquier cosa que las
    compare (un test, un log, el historial del navegador) empezaría a mentir sin romperse.

    La URL es RELATIVA a propósito (D1): la página de entrega es host-agnóstica y el retorno vive en
    el subdominio del tenant, así que una URL absoluta obligaría a resolver el host acá — justo el
    dato que este use case no tiene ni debe tener.
  */
  it("una orden PAGADA devuelve urlEntrega con un token determinista de la orden (ruta relativa)", async () => {
    const db = fakeDb([
      pago({
        token: "tok-1",
        prefijoTicket: "ARMY",
        order: {
          estado: "PAGADO",
          numeros: [12],
          // Declarados fuera de orden: el determinismo lo pone el `orderBy`, no el fixture.
          grants: [
            { id: "grant-c", token: "gt-c" },
            { id: "grant-a", token: "gt-a" },
            { id: "grant-b", token: "gt-b" },
          ],
        },
      }),
    ]);

    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(res.urlEntrega).toBe("/entrega/gt-a");

    // Y dos llamadas seguidas dan la MISMA URL (es lo que hace el polling del retorno).
    const otra = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(otra.urlEntrega).toBe(res.urlEntrega);
  });

  /*
    estado.010 — antes de la confirmación NO hay URL de entrega, y la respuesta neutral queda
    IDÉNTICA. Es el mismo invariante que I1/ADR-0001 aplicado al enlace: la capability de descarga
    solo aparece cuando el WEBHOOK ya marcó PAGADO server-side, jamás porque el navegador volvió de
    Flow. Y `urlEntrega` está AUSENTE (no `null`): así el token ajeno/inexistente sigue devolviendo
    byte por byte lo que devolvía antes de F02, sin una clave nueva que insinúe que hay algo detrás.
  */
  it("PENDIENTE, FALLIDA y la respuesta neutral no traen urlEntrega ni siquiera con grants ya emitidos", async () => {
    const grants = [{ id: "grant-a", token: "gt-a" }];
    const db = fakeDb([
      pago({ token: "tok-pend", order: { estado: "PENDIENTE", grants } }),
      pago({ token: "tok-fall", order: { estado: "FALLIDO", grants } }),
      pago({
        token: "tok-B",
        tenantId: TENANT_B,
        order: { estado: "PAGADO", numeros: [77], grants },
      }),
    ]);

    const pendiente = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-pend" });
    const fallida = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-fall" });
    const ajena = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-B" });
    const inexistente = await getEstadoOrden({ db, tenantId: TENANT_A, token: "nope" });

    expect("urlEntrega" in pendiente).toBe(false);
    expect("urlEntrega" in fallida).toBe(false);
    // Las dos neutrales siguen siendo indistinguibles entre sí Y iguales a las de antes de F02 (I3).
    expect(ajena).toEqual({ estado: null, numeros: null, prefijo: null });
    expect(inexistente).toEqual(ajena);
    expect(Object.keys(ajena).sort()).toEqual(["estado", "numeros", "prefijo"]);
  });

  /*
    estado.011 — orden PAGADA SIN grants. No debería poder pasar: los grants nacen en la MISMA `$tx`
    que marca la orden PAGADA (`aplicarEfectosPostPago`), así que ver una cosa sin la otra sería un
    estado imposible. El caso existe igual porque el costo de equivocarse es asimétrico: si algún día
    lo fuera (una orden migrada a mano, un producto borrado), un `grants[0]!.token` reventaría el
    polling y le rompería la celebración a alguien que YA pagó. Sin URL se degrada al correo, que es
    exactamente el respaldo que D4 mantiene.
  */
  it("una orden PAGADA sin grants no trae urlEntrega y no explota (estado imposible, defensivo)", async () => {
    const db = fakeDb([
      pago({
        token: "tok-1",
        prefijoTicket: "ARMY",
        order: { estado: "PAGADO", numeros: [12], grants: [] },
      }),
    ]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect("urlEntrega" in res).toBe(false);
    // El resto de la respuesta sale intacto: la celebración con boletos no depende del enlace.
    expect(res).toEqual({ estado: "PAGADO", numeros: [12], prefijo: "ARMY" });
  });

  // estado.004 — la RESPUESTA no lleva PII (D5, reescrito): la forma creció a `{estado, numeros,
  // prefijo}` con F01 y a `urlEntrega` con F02, y el guard de I-T6 se mantiene sobre la forma NUEVA.
  // La ampliación de F02 es EXACTAMENTE una ruta relativa y nada más (I6): los Números del sorteo son
  // identidad pública del ticket (ADR-0024) — el correo, el total y los ítems siguen sin viajar.
  it("la respuesta PAGADA es exactamente { estado, numeros, prefijo, urlEntrega } — sin correo, montos ni ítems (I-T6)", async () => {
    const db = fakeDb([
      pago({
        token: "tok-1",
        prefijoTicket: "ARMY",
        order: { estado: "PAGADO", numeros: [12], grants: [{ id: "g1", token: "gt-1" }] },
      }),
    ]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(Object.keys(res).sort()).toEqual(["estado", "numeros", "prefijo", "urlEntrega"]);
    expect(JSON.stringify(res)).not.toContain("@"); // ningún correo se filtra
    expect(JSON.stringify(res)).not.toContain("3000"); // ningún monto se filtra
  });

  /*
    ── F03/D3: cuota por IP ────────────────────────────────────────────────────────────────────────
    Estos tres casos usan el limitador REAL (`crearLimitadorDeIntentos`) y no un `() => false`: lo que
    hay que probar no es que el use case respete un booleano, sino que la POLÍTICA configurada tolere
    el tráfico legítimo. Un fake siempre-false probaría el `if` y nada más.
  */

  // rate.estado.001 — el polling legítimo NUNCA se limita. Es I8 escrito como test: el retorno sondea
  // cada 2,5 s durante hasta 2 min ⇒ ~48 requests por compra. Se simulan DOS compras enteras seguidas
  // desde la misma IP (96 requests) y ninguna puede caer.
  it("el patrón de polling legítimo del retorno no se limita ni con dos compras seguidas desde la misma IP", async () => {
    const db = fakeDb([
      pago({ token: "tok-1", order: { estado: "PENDIENTE" } }),
    ]);
    const limitador = crearLimitadorDeIntentos({ limite: 240, ventanaMs: 60_000 });
    const permitirIntento = () => limitador.permitirIntento("tenant-A:1.2.3.4");

    for (let i = 0; i < 96; i++) {
      const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1", permitirIntento });
      expect(res.estado).toBe("PENDIENTE");
    }
  });

  // rate.estado.002 — pasado el techo, responde limitado con la MISMA semántica que `verificarTickets`
  // (`DomainError` TOO_MANY_REQUESTS), y sin tocar la DB: el gate va antes de la query.
  it("al exceder el techo lanza TOO_MANY_REQUESTS sin consultar la DB", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { payment: { findFirst } } as unknown as PrismaClient;
    const limitador = crearLimitadorDeIntentos({ limite: 3, ventanaMs: 60_000 });
    const permitirIntento = () => limitador.permitirIntento("tenant-A:1.2.3.4");

    for (let i = 0; i < 3; i++) {
      await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1", permitirIntento });
    }
    expect(findFirst).toHaveBeenCalledTimes(3);

    await expect(
      getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1", permitirIntento }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // La 4ª no llegó a la DB: una cuota agotada no cuesta ni una query.
    expect(findFirst).toHaveBeenCalledTimes(3);
  });

  // rate.estado.003 — la cuota es POR clave: que una IP se pase no puede dejar sin confirmación a otra
  // persona. Y la clave lleva el tenant, así que tampoco se comparte cupo entre Tiendas de la misma
  // lambda (el lanzamiento de una tienda grande no le come la cuota a las demás).
  it("IPs distintas —y Tiendas distintas— no comparten cupo", async () => {
    const db = fakeDb([
      pago({ token: "tok-1", order: { estado: "PENDIENTE" } }),
      pago({ token: "tok-B", tenantId: TENANT_B, order: { estado: "PENDIENTE" } }),
    ]);
    const limitador = crearLimitadorDeIntentos({ limite: 2, ventanaMs: 60_000 });
    const gate = (clave: string) => () => limitador.permitirIntento(clave);

    // La IP abusiva quema su cupo en la Tienda A.
    for (let i = 0; i < 2; i++) {
      await getEstadoOrden({
        db, tenantId: TENANT_A, token: "tok-1", permitirIntento: gate("tenant-A:9.9.9.9"),
      });
    }
    await expect(
      getEstadoOrden({
        db, tenantId: TENANT_A, token: "tok-1", permitirIntento: gate("tenant-A:9.9.9.9"),
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    // Otra IP en la MISMA Tienda: intacta.
    const otraIp = await getEstadoOrden({
      db, tenantId: TENANT_A, token: "tok-1", permitirIntento: gate("tenant-A:1.1.1.1"),
    });
    expect(otraIp.estado).toBe("PENDIENTE");

    // La MISMA IP en OTRA Tienda: también intacta.
    const otroTenant = await getEstadoOrden({
      db, tenantId: TENANT_B, token: "tok-B", permitirIntento: gate("tenant-B:9.9.9.9"),
    });
    expect(otroTenant.estado).toBe("PENDIENTE");
  });

  // rate.estado.004 — sin gate inyectado, pasa (falla ABIERTO, I8). Es el default del use case y la
  // política: un borde que se olvide de cablear la cuota sirve la confirmación igual.
  it("sin gate inyectado responde normal: el limitador falla ABIERTO", async () => {
    const db = fakeDb([pago({ token: "tok-1", order: { estado: "PAGADO", numeros: [5] } })]);
    const res = await getEstadoOrden({ db, tenantId: TENANT_A, token: "tok-1" });
    expect(res.estado).toBe("PAGADO");
  });
});
