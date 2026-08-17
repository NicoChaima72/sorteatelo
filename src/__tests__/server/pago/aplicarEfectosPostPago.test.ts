import { randomUUID } from "node:crypto";

import { type OrderStatus, type RaffleStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { aplicarEfectosPostPago } from "~/server/domain/pago/aplicarEfectosPostPago";
import { confirmarPagoDeOrden } from "~/server/domain/pago/confirmarPagoDeOrden";
import type {
  EnrutarFlowFn,
  FlowRuteado,
} from "~/server/pago/enrutarPagoFlow";
import type { FlowGetStatusResponse } from "~/server/services/flow";
import { manejarWebhookFlow } from "~/server/pago/webhookFlow";

/**
 * Tests DB-backed de `aplicarEfectosPostPago` (F02 + ADR-0012). Se ejercen contra la DB real (S9)
 * porque las propiedades clave — ticketing por cantidad, idempotencia por `@@unique` +
 * `skipDuplicates` con ordinales deterministas, scoping del lookup del raffle, aislamiento
 * cross-tenant y rollback DENTRO de la `$transaction` — viven en la semántica de Prisma/Postgres.
 *
 * ADR-0012: los tickets de una orden = `K = Σ cantidad de los ítems cuyo snapshot participaEnSorteo
 * es true`; se materializan como K `RaffleEntry` con `ordinal` 0..K-1. DownloadGrant sigue siendo
 * uno por (orden, producto) — la cantidad NO lo altera (I5/D4).
 *
 * Cada test crea sus tenants/productos/órdenes/raffles con slugs `test-efectos-*` y limpia antes/después.
 */

const PREFIJO = "test-efectos-";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  // Orden FK-safe: hijos (Restrict) antes que sus padres.
  // `CorreoEnviado` entra acá desde F03: la $tx post-pago encola la confirmación de compra, y su
  // FK a Tenant es Restrict ⇒ sin este delete el `tenant.deleteMany` del final falla.
  await db.correoEnviado.deleteMany({ where: { tenantId: { in: ids } } });
  await db.downloadGrant.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffleEntry.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffle.deleteMany({ where: { tenantId: { in: ids } } });
  // PackAssignment ANTES de orderItem y productFile: es Restrict hacia el archivo (F05/D4).
  await db.packAssignment.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.payment.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.productFile.deleteMany({ where: { tenantId: { in: ids } } });
  // Los PACKS antes que sus fuentes: el `onDelete: Restrict` de la self-relation aborta el borrado
  // de una fuente que todavía tenga packs colgando, y un `deleteMany` único borra en orden
  // arbitrario ⇒ fallaría de forma intermitente.
  await db.product.deleteMany({
    where: { tenantId: { in: ids }, fuenteId: { not: null } },
  });
  await db.product.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(limpiar);
afterEach(limpiar);

// ── Fixtures ────────────────────────────────────────────────────────────────
async function crearTenant(nombre: string) {
  return db.tenant.create({
    data: { slug: `${PREFIJO}${nombre}`, nombre, estado: "PUBLICADA" },
    select: { id: true },
  });
}

async function crearProducto(tenantId: string, titulo: string) {
  return db.product.create({
    data: {
      tenantId,
      titulo,
      descripcion: "desc",
      precio: "1000",
      pdfPath: `${tenantId}/${titulo}.pdf`,
    },
    select: { id: true },
  });
}

/**
 * Producto SOBRE con su pool ya confirmado y una opción de pack (F08).
 *
 * Los `ProductFile` se siembran con UN `createMany` y no en un `for`: contra la DB remota cada
 * roundtrip cuesta ~1s, y un pool de 6 archivos de a uno se come el `testTimeout` de 30s él solo.
 */
async function crearSobre(
  tenantId: string,
  titulo: string,
  { pool, unidades }: { pool: number; unidades: number },
) {
  /*
    ENMIENDA v2 (E13/E14): lo que antes era UN producto SOBRE con opciones de pack ahora son DOS
    productos — la COLECCIÓN (`modalidad SOBRE`, dueña del pool, que no se vende directo) y el PACK
    (un producto normal con `fuenteId` + `unidadesPorPack`, que es lo que el Comprador pone en el
    carrito). Lo que se devuelve como `id` es el del PACK, porque ES el producto de la línea de la
    orden; `coleccionId` queda expuesto para los tests que miran de dónde salieron los archivos.
  */
  const coleccion = await db.product.create({
    data: {
      tenantId,
      titulo,
      descripcion: "desc",
      precio: "999", // referencia: una colección no se cobra (E15)
      modalidad: "SOBRE",
    },
    select: { id: true },
  });

  await db.productFile.createMany({
    data: Array.from({ length: pool }, (_u, i) => ({
      tenantId,
      productId: coleccion.id,
      key: `${tenantId}/${coleccion.id}/f${i}.png`,
      contentType: "image/png",
      tipo: "IMAGEN" as const,
      nombreArchivo: `sticker-${i}.png`,
      bytes: 1024,
      confirmadoAt: new Date(), // confirmados ⇒ son pool
    })),
  });

  const pack = await db.product.create({
    data: {
      tenantId,
      titulo: `${titulo} × ${unidades}`,
      descripcion: "desc",
      precio: "10000", // el precio del PACK es su propio `Product.precio` (E13)
      // V-I7: un pack se persiste SIEMPRE ESTANDAR; lo que manda es la modalidad de su fuente.
      modalidad: "ESTANDAR",
      fuenteId: coleccion.id,
      unidadesPorPack: unidades,
    },
    select: { id: true },
  });

  return { id: pack.id, coleccionId: coleccion.id };
}

/** Ítem de una orden de prueba: por defecto participa con cantidad 1 (snapshot congelado en el OrderItem). */
interface ItemSpec {
  productId: string;
  cantidad?: number;
  participaEnSorteo?: boolean;
  /** Snapshot del pack comprado (F05/F07). 1 = producto estándar. */
  unidadesPorPack?: number;
}

async function crearRaffle(
  tenantId: string,
  estado: RaffleStatus,
  nombre = "Sorteo",
) {
  return db.raffle.create({
    data: {
      tenantId,
      nombre,
      premio: "premio",
      estado,
      fechaInicio: new Date(Date.UTC(2026, 0, 1)),
      fechaFin: new Date(Date.UTC(2026, 11, 31)),
    },
    select: { id: true },
  });
}

function crearItems(tenantId: string, items: ItemSpec[]) {
  return items.map((it) => ({
    tenantId,
    productId: it.productId,
    precio: "1000",
    cantidad: it.cantidad ?? 1,
    participaEnSorteo: it.participaEnSorteo ?? true, // snapshot; por defecto participa
    unidadesPorPack: it.unidadesPorPack ?? 1, // 1 = estándar (hecho verdadero, no relleno)
  }));
}

async function crearOrden(
  tenantId: string,
  email: string,
  items: ItemSpec[],
  estado: OrderStatus = "PAGADO",
) {
  return db.order.create({
    data: {
      tenantId,
      email,
      estado,
      total: "1000",
      items: { create: crearItems(tenantId, items) },
    },
    select: { id: true },
  });
}

/** Orden PENDIENTE + Payment PENDIENTE con token (para el test del webhook real). */
async function crearOrdenConPago(
  tenantId: string,
  email: string,
  items: ItemSpec[],
) {
  const token = randomUUID();
  const order = await db.order.create({
    data: {
      tenantId,
      email,
      estado: "PENDIENTE",
      total: "1000",
      items: { create: crearItems(tenantId, items) },
      payment: {
        create: { tenantId, estado: "PENDIENTE", monto: "1000", token },
      },
    },
    select: { id: true },
  });
  return { orderId: order.id, token };
}

/**
 * Presupuesto de la `$transaction` interactiva de estos tests. **No toca producción**: es el
 * `timeout` del cliente de Prisma para ESTA corrida, y existe porque el default (5 s) no fue
 * pensado para el enlace de una máquina de desarrollo en Chile contra el pooler de Supabase.
 *
 * Medido acá el 2026-07-26 (`tmp/f03-latencia.mts`): **~1.000 ms por statement suelto**, y dentro de
 * una transacción ~700 ms de `BEGIN`+`DEALLOCATE ALL`+`COMMIT` más ~450 ms por operación. El camino
 * post-pago hace 7-9 operaciones (orden → grants → fila del ledger → sobres → contador del Raffle →
 * entries), o sea ~4-5 s en el mejor caso: justo en el filo de los 5 s, y cualquier pico lo cruza.
 * Cuando eso pasa el síntoma NO se parece a lentitud sino a un bug («Transaction not found»,
 * porque Prisma ya cerró la transacción del lado del cliente).
 *
 * En producción la app y la DB están en la misma nube y cada operación cuesta milisegundos, así que
 * el default sobra; por eso el ajuste vive acá y no en el use case. Si alguna vez hay que subirlo
 * en producción, es una decisión con costo real (esta `$transaction` sostiene el row-lock del
 * `Raffle` hasta el COMMIT) y no se toma desde un test.
 */
const TX_TIMEOUT_MS = 60_000;

/** Corre el use case dentro de una $transaction real (como lo hace el webhook). */
function aplicar(orderId: string) {
  return db.$transaction((tx) => aplicarEfectosPostPago({ tx, orderId }), {
    timeout: TX_TIMEOUT_MS,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("domain/pago/aplicarEfectosPostPago (DB-backed, tenant-scoped, tickets por cantidad)", () => {
  // efectos.001 — N productos ⇒ N DownloadGrant con token único, tenantId de la orden y SIN
  // vencimiento. Lo último cambió en F01 de `entrega-postpago-retorno-y-reacceso` (D2): hasta acá
  // el grant nacía con `expiresAt` a 30 días (`GRANT_TTL_DIAS`, un placeholder de la era S3 que
  // nunca se re-decidió) y a los 3 meses el Comprador legítimo se encontraba un 404 sin ningún
  // camino de recuperación. Ahora nace `null` = no vence, y `expiresAt` queda como seam de
  // revocación administrativa. El resto del contrato del test es el de siempre.
  it("crea exactamente N DownloadGrant (uno por producto) con token único, SIN vencimiento y el tenantId de la orden", async () => {
    const t = await crearTenant("a");
    const p1 = await crearProducto(t.id, "P1");
    const p2 = await crearProducto(t.id, "P2");
    const p3 = await crearProducto(t.id, "P3");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: p1.id },
      { productId: p2.id },
      { productId: p3.id },
    ]);

    await aplicar(orden.id);

    const grants = await db.downloadGrant.findMany({
      where: { orderId: orden.id },
    });
    expect(grants).toHaveLength(3);
    expect(new Set(grants.map((g) => g.productId))).toEqual(
      new Set([p1.id, p2.id, p3.id]),
    );
    expect(new Set(grants.map((g) => g.token)).size).toBe(3);
    for (const g of grants) {
      expect(g.token.length).toBeGreaterThan(0);
      expect(g.tenantId).toBe(t.id);
      // NO vence: `null`, no «una fecha muy lejana». Que el assert sea `toBeNull` y no un rango es
      // deliberado — un sentinel a 100 años volvería a poner una bomba de tiempo en la entrega.
      expect(g.expiresAt).toBeNull();
    }
  });

  // efectos.ticket.001 — 1 ítem participante cantidad 3 ⇒ 3 RaffleEntry (ordinal 0,1,2), mismo correo
  it("un ítem participante con cantidad 3 ⇒ 3 RaffleEntry (ordinal 0,1,2), mismo correo, en el ACTIVO del tenant", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    const raffle = await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "compradora@example.cl", [
      { productId: p.id, cantidad: 3, participaEnSorteo: true },
    ]);

    await aplicar(orden.id);

    const entries = await db.raffleEntry.findMany({
      where: { orderId: orden.id },
      orderBy: { ordinal: "asc" },
    });
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.ordinal)).toEqual([0, 1, 2]);
    for (const e of entries) {
      expect(e.tenantId).toBe(t.id);
      expect(e.raffleId).toBe(raffle.id);
      expect(e.email).toBe("compradora@example.cl"); // snapshot de Order.email (I5)
    }
  });

  // efectos.numero.001 — K tickets ⇒ K Números del sorteo correlativos consecutivos desde 1,
  //                      y el contador del Raffle queda en K (ADR-0024 §1/§2)
  it("asigna K Números del sorteo correlativos consecutivos desde 1 y deja el contador del Raffle en K", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    const raffle = await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "compradora@example.cl", [
      { productId: p.id, cantidad: 3, participaEnSorteo: true },
    ]);

    await aplicar(orden.id);

    const entries = await db.raffleEntry.findMany({
      where: { orderId: orden.id },
      orderBy: { ordinal: "asc" },
      select: { numero: true },
    });
    expect(entries.map((e) => e.numero)).toEqual([1, 2, 3]);
    // El contador es high-water mark del sorteo, no el conteo de entries.
    const despues = await db.raffle.findUniqueOrThrow({
      where: { id: raffle.id },
      select: { ultimoNumero: true },
    });
    expect(despues.ultimoNumero).toBe(3);
  });

  // efectos.numero.002 — dos órdenes del MISMO sorteo, confirmadas en paralelo, jamás comparten
  //                      números: el row-lock de la fila Raffle serializa el reclamo (ADR-0024 §2)
  it("dos órdenes confirmadas en paralelo sobre el mismo sorteo jamás comparten Números (rangos contiguos, sin duplicados)", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    const raffle = await crearRaffle(t.id, "ACTIVO");
    const o1 = await crearOrden(t.id, "una@example.cl", [
      { productId: p.id, cantidad: 3, participaEnSorteo: true },
    ]);
    const o2 = await crearOrden(t.id, "otra@example.cl", [
      { productId: p.id, cantidad: 2, participaEnSorteo: true },
    ]);

    // Concurrencia real contra Postgres: las dos $transaction compiten por el row-lock del Raffle.
    await Promise.all([aplicar(o1.id), aplicar(o2.id)]);

    const entries = await db.raffleEntry.findMany({
      where: { raffleId: raffle.id },
      select: { orderId: true, numero: true, ordinal: true },
    });
    expect(entries).toHaveLength(5);
    // Sin duplicados y sin huecos: el conjunto es exactamente 1..5 (el orden entre órdenes es libre).
    const numeros = entries.map((e) => e.numero).sort((a, b) => a! - b!);
    expect(numeros).toEqual([1, 2, 3, 4, 5]);
    // Cada orden recibe un BLOQUE CONTIGUO alineado al ordinal (lo que permite el rango de D8).
    for (const orderId of [o1.id, o2.id]) {
      const suyas = entries
        .filter((e) => e.orderId === orderId)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((e) => e.numero!);
      const base = suyas[0]!;
      expect(suyas).toEqual(suyas.map((_unused, i) => base + i));
    }
    const despues = await db.raffle.findUniqueOrThrow({
      where: { id: raffle.id },
      select: { ultimoNumero: true },
    });
    expect(despues.ultimoNumero).toBe(5);
  });

  // efectos.numero.003 — REPLAY del webhook: no duplica entries y —clave— NO CONSUME Números
  //                      nuevos; el corte va antes de reclamar el rango (ADR-0024 §3, I4)
  it("el replay de la misma orden no consume Números nuevos: el contador no avanza y la orden siguiente sigue el correlativo", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    const raffle = await crearRaffle(t.id, "ACTIVO");
    const o1 = await crearOrden(t.id, "una@example.cl", [
      { productId: p.id, cantidad: 2, participaEnSorteo: true },
    ]);

    await aplicar(o1.id);
    await aplicar(o1.id); // replay del webhook de Flow
    await aplicar(o1.id); // y otro más

    const despues = await db.raffle.findUniqueOrThrow({
      where: { id: raffle.id },
      select: { ultimoNumero: true },
    });
    expect(despues.ultimoNumero).toBe(2); // NO 6: los replays no reclamaron rango
    expect(await db.raffleEntry.count({ where: { orderId: o1.id } })).toBe(2);

    // Y la orden siguiente arranca en 3: el replay no dejó un hueco en el correlativo.
    const o2 = await crearOrden(t.id, "otra@example.cl", [
      { productId: p.id, cantidad: 2, participaEnSorteo: true },
    ]);
    await aplicar(o2.id);
    const numerosO2 = await db.raffleEntry.findMany({
      where: { orderId: o2.id },
      orderBy: { ordinal: "asc" },
      select: { numero: true },
    });
    expect(numerosO2.map((e) => e.numero)).toEqual([3, 4]);
  });

  // efectos.numero.004 — I4: si la $tx aborta DESPUÉS de reclamar el rango, el contador revierte
  //                      junto con las entries. Un número reclamado por una $tx muerta no queda
  //                      "gastado": la orden siguiente arranca donde arrancaba la abortada.
  it("si la transacción se revierte después de reclamar el rango, el contador vuelve atrás (ningún Número queda gastado)", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    const raffle = await crearRaffle(t.id, "ACTIVO");
    const abortada = await crearOrden(t.id, "abortada@example.cl", [
      { productId: p.id, cantidad: 4, participaEnSorteo: true },
    ]);

    await expect(
      db.$transaction(
        async (tx) => {
          await aplicarEfectosPostPago({ tx, orderId: abortada.id });
          throw new Error("rollback forzado despues del reclamo");
        },
        { timeout: TX_TIMEOUT_MS },
      ),
    ).rejects.toThrow(/rollback forzado/);

    const despues = await db.raffle.findUniqueOrThrow({
      where: { id: raffle.id },
      select: { ultimoNumero: true },
    });
    expect(despues.ultimoNumero).toBe(0); // el increment revirtió con la $tx
    expect(await db.raffleEntry.count({ where: { raffleId: raffle.id } })).toBe(0);

    // Y una orden real posterior recibe 1..K, no K+1..: el rango abortado no dejó hueco.
    const buena = await crearOrden(t.id, "buena@example.cl", [
      { productId: p.id, cantidad: 2, participaEnSorteo: true },
    ]);
    await aplicar(buena.id);
    const numeros = await db.raffleEntry.findMany({
      where: { orderId: buena.id },
      orderBy: { ordinal: "asc" },
      select: { numero: true },
    });
    expect(numeros.map((e) => e.numero)).toEqual([1, 2]);
  });

  // efectos.ticket.002 — 1 participante×1 + 1 no-participante×5 ⇒ 1 RaffleEntry (solo participantes cuentan)
  it("mezcla 1 participante×1 + 1 no-participante×5 ⇒ 1 RaffleEntry (solo los participantes cuentan)", async () => {
    const t = await crearTenant("a");
    const participa = await crearProducto(t.id, "Participa");
    const noParticipa = await crearProducto(t.id, "NoParticipa");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: participa.id, cantidad: 1, participaEnSorteo: true },
      { productId: noParticipa.id, cantidad: 5, participaEnSorteo: false },
    ]);

    await aplicar(orden.id);

    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(1);
    // Y los dos grants existen (la entrega no depende del sorteo).
    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(2);
  });

  // efectos.ticket.003 — solo productos no participantes ⇒ 0 RaffleEntry (la venta no se compromete)
  it("orden con solo productos no participantes ⇒ 0 RaffleEntry (la venta no se compromete), grants sí", async () => {
    const t = await crearTenant("a");
    const p1 = await crearProducto(t.id, "P1");
    const p2 = await crearProducto(t.id, "P2");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: p1.id, cantidad: 2, participaEnSorteo: false },
      { productId: p2.id, cantidad: 1, participaEnSorteo: false },
    ]);

    await expect(aplicar(orden.id)).resolves.toBeUndefined(); // no lanza

    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(0);
    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(2);
  });

  // efectos.ticket.004 — sin Raffle ACTIVO ⇒ 0 entries aunque haya participantes (la venta no se compromete)
  it("sin Raffle ACTIVO en la tienda de la orden ⇒ 0 entries aunque haya productos participantes; grants sí", async () => {
    const a = await crearTenant("a"); // sin raffle activo
    const b = await crearTenant("b");
    await crearRaffle(b.id, "ACTIVO", "Sorteo de OTRA tienda");
    const pA = await crearProducto(a.id, "PA");
    const orden = await crearOrden(a.id, "fan@a.cl", [
      { productId: pA.id, cantidad: 4, participaEnSorteo: true },
    ]);

    await expect(aplicar(orden.id)).resolves.toBeUndefined();

    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(0);
    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(1);
  });

  // efectos.ticket.005 — idempotencia: invocarlo dos veces ⇒ exactamente K entries (no 2K)
  it("es idempotente: invocarlo dos veces deja exactamente K entries (ordinales deterministas) y N grants", async () => {
    const t = await crearTenant("a");
    const p1 = await crearProducto(t.id, "P1");
    const p2 = await crearProducto(t.id, "P2");
    await crearRaffle(t.id, "ACTIVO");
    // K = 3 (p1) + 2 (p2) = 5 tickets; 2 grants.
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: p1.id, cantidad: 3, participaEnSorteo: true },
      { productId: p2.id, cantidad: 2, participaEnSorteo: true },
    ]);

    await aplicar(orden.id);
    await aplicar(orden.id); // replay

    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(2);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(5);
    // Ordinales exactamente 0..4 una sola vez.
    const entries = await db.raffleEntry.findMany({
      where: { orderId: orden.id },
      orderBy: { ordinal: "asc" },
      select: { ordinal: true },
    });
    expect(entries.map((e) => e.ordinal)).toEqual([0, 1, 2, 3, 4]);
  });

  // efectos.ticket.006 — DownloadGrant = uno por (orden, producto), independiente de la cantidad
  it("DownloadGrant es uno por (orden, producto) independiente de la cantidad (×3 de un producto ⇒ 1 grant)", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: p.id, cantidad: 3, participaEnSorteo: true },
    ]);

    await aplicar(orden.id);

    // 1 grant (no 3), pero 3 tickets.
    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(1);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(3);
  });

  // efectos.ticket.007 — tenancy/aislamiento: los tickets caen en el raffle de la tienda de la orden, nunca en otra
  it("aisla cross-tenant: los tickets de una orden de A caen en el raffle de A, nunca en el de B", async () => {
    const a = await crearTenant("a");
    const b = await crearTenant("b");
    const raffleA = await crearRaffle(a.id, "ACTIVO", "Sorteo A");
    const raffleB = await crearRaffle(b.id, "ACTIVO", "Sorteo B");
    const pA = await crearProducto(a.id, "PA");
    const orden = await crearOrden(a.id, "fan@a.cl", [
      { productId: pA.id, cantidad: 2, participaEnSorteo: true },
    ]);

    await aplicar(orden.id);

    const entries = await db.raffleEntry.findMany({
      where: { orderId: orden.id },
    });
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((e) => e.raffleId))).toEqual(new Set([raffleA.id]));
    // El raffle de B jamás recibe tickets de una orden de A.
    expect(await db.raffleEntry.count({ where: { raffleId: raffleB.id } })).toBe(0);
  });

  // efectos.005 — los efectos viven en la MISMA transacción: si se revierte, no persiste nada
  it("no persiste ningún grant ni entry si la $transaction se revierte", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [{ productId: p.id }]);

    await expect(
      db.$transaction(
        async (tx) => {
          await aplicarEfectosPostPago({ tx, orderId: orden.id });
          throw new Error("rollback forzado");
        },
        { timeout: TX_TIMEOUT_MS },
      ),
    ).rejects.toThrow(/rollback forzado/);

    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(0);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(0);
  });

  // efectos.correo.001 — F03/C1: la confirmación de compra se ENCOLA en el ledger dentro de la
  // MISMA `$transaction` (T2/ADR-0027 §2). Es lo que hace que el correo sea un compromiso de la
  // venta y no un efecto suelto: si la orden queda pagada, la fila existe; si la $tx revierte, no.
  //
  // Se prueba junto el caso SIN tickets a propósito. Es el que más fácil se rompe: los tres
  // `return` tempranos del use case (K=0, sin Raffle ACTIVO, replay) están DESPUÉS del punto donde
  // uno pondría el encolado por costumbre, y una orden sin sorteo igual tiene que recibir su correo
  // de confirmación (degradación limpia, §5.2 — `correo.template.011`).
  it("encola la confirmación de compra en el ledger dentro de la $tx, también cuando la orden no genera tickets", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    await crearRaffle(t.id, "ACTIVO");
    const conTickets = await crearOrden(t.id, "fan@example.cl", [
      { productId: p.id, cantidad: 2, participaEnSorteo: true },
    ]);
    // Sin productos participantes ⇒ K=0 ⇒ el use case retorna antes de tocar el sorteo.
    const sinTickets = await crearOrden(t.id, "otra@example.cl", [
      { productId: p.id, participaEnSorteo: false },
    ]);

    await aplicar(conTickets.id);
    await aplicar(sinTickets.id);

    const filas = await db.correoEnviado.findMany({
      where: { tenantId: t.id },
      orderBy: { createdAt: "asc" },
    });
    expect(filas).toHaveLength(2);
    for (const fila of filas) {
      expect(fila.tipo).toBe("CONFIRMACION_COMPRA");
      expect(fila.estado).toBe("PENDIENTE"); // nace sin enviar: el envío es post-commit (I3)
      expect(fila.intentos).toBe(0);
      expect(fila.proveedorId).toBeNull();
      expect(fila.tenantId).toBe(t.id); // de la ORDEN, jamás de un parámetro (I1)
    }
    // La clave es el `orderId` pelado (`claveConfirmacionCompra`) y el email es el de SU orden.
    expect(filas.map((f) => f.clave).sort()).toEqual(
      [conTickets.id, sinTickets.id].sort(),
    );
    expect(
      filas.find((f) => f.clave === sinTickets.id)?.email,
    ).toBe("otra@example.cl");
  });

  // efectos.correo.002 — I2 (jamás un correo duplicado) por los dos caminos que pueden repetir el
  // encolado: el replay del webhook y el rollback. El primero no puede crear una 2ª fila (el
  // `@@unique([tipo, clave])` + `skipDuplicates`); el segundo no puede dejar NINGUNA (la fila vive
  // en la $tx de la venta, así que una venta que no ocurrió no deja un correo prometido).
  it("no duplica la fila ante un replay, y no deja ninguna si la $transaction se revierte", async () => {
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [{ productId: p.id }]);

    await aplicar(orden.id);
    await aplicar(orden.id); // replay del webhook
    expect(
      await db.correoEnviado.count({ where: { clave: orden.id } }),
    ).toBe(1);

    const revertida = await crearOrden(t.id, "nada@example.cl", [
      { productId: p.id },
    ]);
    await expect(
      db.$transaction(
        async (tx) => {
          await aplicarEfectosPostPago({ tx, orderId: revertida.id });
          throw new Error("rollback forzado");
        },
        { timeout: TX_TIMEOUT_MS },
      ),
    ).rejects.toThrow(/rollback forzado/);
    expect(
      await db.correoEnviado.count({ where: { clave: revertida.id } }),
    ).toBe(0);
  });

  // efectos.007 — un Raffle CERRADO no recibe tickets (solo el ACTIVO cuenta)
  it("un Raffle CERRADO en la tienda de la orden no recibe RaffleEntry (solo el ACTIVO cuenta)", async () => {
    const t = await crearTenant("a");
    const cerrado = await crearRaffle(t.id, "CERRADO");
    const p = await crearProducto(t.id, "P1");
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: p.id, cantidad: 2, participaEnSorteo: true },
    ]);

    await aplicar(orden.id);

    expect(await db.raffleEntry.count({ where: { raffleId: cerrado.id } })).toBe(0);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(0);
    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(1);
  });

  // efectos.008 — cableado real del webhook: PENDIENTE→PAGADO produce grants+tickets;
  //               replay y FALLIDO no producen efectos
  it("con el webhook real cableado: PENDIENTE→PAGADO produce grants+tickets; el replay y un FALLIDO no producen efectos", async () => {
    const t = await crearTenant("a");
    const p1 = await crearProducto(t.id, "P1");
    const p2 = await crearProducto(t.id, "P2");
    await crearRaffle(t.id, "ACTIVO");
    // p1 participa ×2, p2 participa ×1 ⇒ K = 3 tickets; 2 grants.
    const pagada = await crearOrdenConPago(t.id, "fan@example.cl", [
      { productId: p1.id, cantidad: 2, participaEnSorteo: true },
      { productId: p2.id, cantidad: 1, participaEnSorteo: true },
    ]);

    const enrutarFlow = enrutarFake(t.id, pagada.orderId, 2); // Flow: PAGADA
    const confirmarPago = (input: Parameters<typeof confirmarPagoDeOrden>[0]["input"]) =>
      confirmarPagoDeOrden({ db, input, aplicarEfectosPostPago });

    // 1) Transición PENDIENTE→PAGADO ⇒ grants + tickets.
    const r1 = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: pagada.token } },
      enrutarFlow,
      confirmarPago,
    });
    expect(r1.status).toBe(200);
    expect(await db.downloadGrant.count({ where: { orderId: pagada.orderId } })).toBe(2);
    expect(await db.raffleEntry.count({ where: { orderId: pagada.orderId } })).toBe(3);

    // 2) Replay del webhook ⇒ ack sin re-efectos (sigue 2 grants + 3 tickets).
    const r2 = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: pagada.token } },
      enrutarFlow,
      confirmarPago,
    });
    expect(r2.body).toMatchObject({ yaProcesado: true });
    expect(await db.downloadGrant.count({ where: { orderId: pagada.orderId } })).toBe(2);
    expect(await db.raffleEntry.count({ where: { orderId: pagada.orderId } })).toBe(3);

    // 3) Otra orden que Flow reporta FALLIDA ⇒ ningún efecto.
    const p3 = await crearProducto(t.id, "P3");
    const fallida = await crearOrdenConPago(t.id, "otra@example.cl", [
      { productId: p3.id, cantidad: 4, participaEnSorteo: true },
    ]);
    const r3 = await manejarWebhookFlow({
      req: { method: "POST", headers: {}, body: { token: fallida.token } },
      enrutarFlow: enrutarFake(t.id, fallida.orderId, 3), // Flow: RECHAZADA
      confirmarPago,
    });
    expect(r3.status).toBe(200);
    expect(await db.downloadGrant.count({ where: { orderId: fallida.orderId } })).toBe(0);
    expect(await db.raffleEntry.count({ where: { orderId: fallida.orderId } })).toBe(0);
  });

  // efectos.009 — el token del grant y el email del comprador no aparecen en logs
  it("no loguea el token del grant ni el email del comprador (el log del skip es inocuo)", async () => {
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      }),
    );

    // (a) Happy path con raffle activo: grants + tickets, NINGÚN log debe traer email/token.
    const t = await crearTenant("a");
    const p = await crearProducto(t.id, "P1");
    await crearRaffle(t.id, "ACTIVO");
    const conRaffle = await crearOrden(t.id, "secreta@example.cl", [
      { productId: p.id, cantidad: 2, participaEnSorteo: true },
    ]);
    await aplicar(conRaffle.id);

    // (b) Skip: sin productos participantes se loguea (inocuo) — no debe contener email ni token.
    const sinTicketsTenant = await crearTenant("b");
    const p2 = await crearProducto(sinTicketsTenant.id, "P2");
    await crearRaffle(sinTicketsTenant.id, "ACTIVO");
    const sinTickets = await crearOrden(sinTicketsTenant.id, "otra-secreta@example.cl", [
      { productId: p2.id, cantidad: 3, participaEnSorteo: false },
    ]);
    await aplicar(sinTickets.id);

    const grants = await db.downloadGrant.findMany({
      where: { tenantId: { in: [t.id, sinTicketsTenant.id] } },
      select: { token: true },
    });
    spies.forEach((s) => s.mockRestore());

    const salida = logs.join("\n");
    expect(salida).not.toContain("secreta@example.cl");
    expect(salida).not.toContain("otra-secreta@example.cl");
    for (const g of grants) {
      expect(salida).not.toContain(g.token);
    }
    // Y el skip sí dejó su rastro inocuo (referencia a la orden, sin secretos).
    expect(salida).toContain(sinTickets.id);
  });
});

/**
 * F08 — asignación aleatoria del sobre sorpresa (D4/D6/D12).
 *
 * DB-backed porque lo que se verifica son los `@@unique` de Postgres y la atomicidad de la `$tx`:
 * un `db` fake no puede fallar un constraint. Y porque el sampler es ALEATORIO — el sesgo se
 * verifica en `muestrearPacks.test.ts` con el azar inyectado; acá se verifica la INTEGRACIÓN.
 */
describe("domain/pago/aplicarEfectosPostPago — sobre sorpresa (F08)", () => {
  // efectos.sobre.001 — se asignan exactamente unidades × cantidad archivos, sin repetir en un pack
  it("asigna unidadesPorPack × cantidad archivos, sin duplicados dentro de cada pack y con packs independientes", async () => {
    const t = await crearTenant("sobre-a");
    const sobre = await crearSobre(t.id, "Stickers", { pool: 5, unidades: 4 });
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: sobre.id, cantidad: 3, unidadesPorPack: 4 },
    ]);

    await aplicar(orden.id);

    const asignaciones = await db.packAssignment.findMany({
      where: { tenantId: t.id },
      select: {
        packOrdinal: true,
        unidadOrdinal: true,
        productFileId: true,
        tenantId: true,
      },
    });

    // 4 × 3 = 12 archivos entregados.
    expect(asignaciones).toHaveLength(12);
    expect(asignaciones.every((a) => a.tenantId === t.id)).toBe(true);

    // Las coordenadas son el producto cartesiano completo: 3 packs × 4 unidades, sin huecos.
    expect(
      asignaciones.map((a) => `${a.packOrdinal}-${a.unidadOrdinal}`).sort(),
    ).toEqual([
      "0-0", "0-1", "0-2", "0-3",
      "1-0", "1-1", "1-2", "1-3",
      "2-0", "2-1", "2-2", "2-3",
    ]);

    // D4: DENTRO de cada pack, 4 archivos DISTINTOS del pool de 5.
    for (const packOrdinal of [0, 1, 2]) {
      const delPack = asignaciones
        .filter((a) => a.packOrdinal === packOrdinal)
        .map((a) => a.productFileId);
      expect(new Set(delPack).size).toBe(4);
    }
  });

  // efectos.sobre.002 — idempotencia exactly-once: el replay NO re-sortea ni duplica
  it("un replay del webhook no re-asigna ni duplica: vale la muestra ORIGINAL", async () => {
    const t = await crearTenant("sobre-b");
    const sobre = await crearSobre(t.id, "Stickers", { pool: 6, unidades: 2 });
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: sobre.id, cantidad: 2, unidadesPorPack: 2 },
    ]);

    await aplicar(orden.id);
    const primera = await db.packAssignment.findMany({
      where: { tenantId: t.id },
      orderBy: [{ packOrdinal: "asc" }, { unidadOrdinal: "asc" }],
      select: { productFileId: true, packOrdinal: true, unidadOrdinal: true },
    });

    // Flow reintenta. Con un pool de 6 y packs de 2, un segundo sorteo daría casi seguro OTROS
    // archivos: si el corte de replay no estuviera, esto duplicaría filas o cambiaría la muestra.
    // UN replay alcanza para probarlo y cada `aplicar` cuesta ~5s contra la DB remota.
    await aplicar(orden.id);

    const despues = await db.packAssignment.findMany({
      where: { tenantId: t.id },
      orderBy: [{ packOrdinal: "asc" }, { unidadOrdinal: "asc" }],
      select: { productFileId: true, packOrdinal: true, unidadOrdinal: true },
    });

    expect(despues).toHaveLength(4);
    expect(despues).toEqual(primera); // los MISMOS archivos, no solo la misma cantidad
  });

  // efectos.sobre.003 — D6: un pack de N son N tickets (no castiga al que compra el pack grande)
  it("un sobre participante genera unidadesPorPack × cantidad tickets", async () => {
    const t = await crearTenant("sobre-c");
    const sobre = await crearSobre(t.id, "Stickers", { pool: 4, unidades: 4 });
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: sobre.id, cantidad: 2, unidadesPorPack: 4, participaEnSorteo: true },
    ]);

    await aplicar(orden.id);

    // 4 × 2 = 8 tickets, con ordinales 0..7 contiguos (ADR-0012/ADR-0024).
    const entries = await db.raffleEntry.findMany({
      where: { orderId: orden.id },
      orderBy: { ordinal: "asc" },
      select: { ordinal: true, email: true },
    });
    expect(entries).toHaveLength(8);
    expect(entries.map((e) => e.ordinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(entries.every((e) => e.email === "fan@example.cl")).toBe(true);

    // Y el DownloadGrant sigue siendo UNO por producto: la cantidad no lo altera (I5/D4).
    const grants = await db.downloadGrant.findMany({
      where: { orderId: orden.id },
    });
    expect(grants).toHaveLength(1);
  });

  // efectos.sobre.004 — CERO REGRESIÓN del camino estándar: sin sobres no se asigna nada, y la
  // fórmula de tickets con `unidadesPorPack: 1` da exactamente lo de siempre (cantidad × 1)
  it("una orden sin sobres no crea ninguna asignación y mantiene los tickets por cantidad", async () => {
    const t = await crearTenant("sobre-d");
    const p = await crearProducto(t.id, "PDF");
    await crearRaffle(t.id, "ACTIVO");
    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: p.id, cantidad: 3 },
    ]);

    await aplicar(orden.id);

    expect(
      await db.packAssignment.count({ where: { tenantId: t.id } }),
    ).toBe(0);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(3);
  });

  // efectos.sobre.006 — el pool sale de la FUENTE de la línea, y nada más. Es el invariante que
  // schema-guardian marcó como SIN red de DB: las dos FKs de PackAssignment (orderItem y
  // productFile) no se cruzan entre sí, así que nada impide en la DB asignar el archivo de otro
  // producto o de otra Tienda. La única garantía es cómo está armada la query — y eso se testea acá.
  it("jamás sortea un archivo de otro producto ni de otra Tienda, ni uno sin confirmar", async () => {
    const t = await crearTenant("sobre-f");
    const otroTenant = await crearTenant("sobre-g");

    const sobre = await crearSobre(t.id, "Stickers", { pool: 2, unidades: 2 });
    // Decoys: mismo tenant/otro producto, otro tenant, y uno del PROPIO pool sin confirmar.
    const otroProducto = await crearSobre(t.id, "Otros stickers", {
      pool: 3,
      unidades: 1,
    });
    const sobreAjeno = await crearSobre(otroTenant.id, "Ajenos", {
      pool: 3,
      unidades: 1,
    });
    await db.productFile.create({
      data: {
        tenantId: t.id,
        productId: sobre.coleccionId,
        key: `${t.id}/${sobre.coleccionId}/pendiente.png`,
        contentType: "image/png",
        tipo: "IMAGEN",
        nombreArchivo: "a-medio-subir.png",
        confirmadoAt: null, // subida abandonada: NO es pool
      },
    });

    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: sobre.id, cantidad: 2, unidadesPorPack: 2 },
    ]);

    await aplicar(orden.id);

    const asignados = await db.packAssignment.findMany({
      where: { tenantId: t.id },
      select: { productFile: { select: { productId: true, confirmadoAt: true } } },
    });

    expect(asignados).toHaveLength(4); // 2 × 2
    // Todos de la COLECCIÓN que es fuente de la línea (E15), y todos confirmados.
    expect(
      asignados.every((a) => a.productFile.productId === sobre.coleccionId),
    ).toBe(true);
    expect(
      asignados.every((a) => a.productFile.confirmadoAt !== null),
    ).toBe(true);
    // Y ni un archivo de los decoys quedó tocado.
    expect(
      await db.packAssignment.count({
        where: {
          productFile: {
            productId: { in: [otroProducto.coleccionId, sobreAjeno.coleccionId] },
          },
        },
      }),
    ).toBe(0);
  });

  // efectos.sobre.005 — el pool encogió entre la compra y el pago (el producto se pasó a borrador y
  // se borraron archivos): la orden PAGADA no se puede revertir, así que se entrega lo que alcanza
  // y queda rastro fuerte. Nunca se repite un archivo para "completar" el pack.
  it("con el pool más corto que el pack entrega lo disponible sin fallar la orden pagada, y lo loguea", async () => {
    const logs: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });

    try {
      const t = await crearTenant("sobre-e");
      // Pool de 2 pero el snapshot dice packs de 4: es el estado imposible que el checkout ya
      // había descartado (F07) y que solo se alcanza si el pool encogió después.
      const sobre = await crearSobre(t.id, "Stickers", { pool: 2, unidades: 4 });
      const orden = await crearOrden(t.id, "fan@example.cl", [
        { productId: sobre.id, cantidad: 1, unidadesPorPack: 4 },
      ]);

      await aplicar(orden.id); // NO lanza: la venta ya está pagada

      const asignaciones = await db.packAssignment.findMany({
        where: { tenantId: t.id },
        select: { productFileId: true },
      });
      expect(asignaciones).toHaveLength(2); // lo que alcanzó, sin repetir
      expect(new Set(asignaciones.map((a) => a.productFileId)).size).toBe(2);

      // El grant se creó igual: el Comprador conserva su derecho de descarga.
      expect(
        await db.downloadGrant.count({ where: { orderId: orden.id } }),
      ).toBe(1);

      const salida = logs.join("\n");
      expect(salida).toContain(orden.id);
      expect(salida).toContain("REVISAR");
      expect(salida).not.toContain("fan@example.cl"); // sin PII (I4)
    } finally {
      spy.mockRestore();
    }
  });

  /*
    efectos.sobre.007 — el CASO LIBRO de la ENMIENDA v2 (E15/V-I2) del lado de los EFECTOS. Un pack
    cuya fuente es un producto ESTANDAR entrega N unidades del MISMO archivo, y por eso NO se
    muestrea nada: `origenDeArchivos` devuelve modalidad ESTANDAR y la línea ni siquiera entra al
    sorteo.

    Es el test que separa «pack» de «sorteo», que bajo la v1 eran sinónimos. Lo que fija:

    (a) CERO `PackAssignment`. La alternativa —crear las 4 filas del mismo archivo— es exactamente
        lo que el `@@unique([orderItemId, packOrdinal, productFileId])` NO prohíbe (los ordinales
        difieren) pero que dejaría a la página de entrega derivando copias sobre copias.
    (b) UN solo `DownloadGrant`, como cualquier producto: el grant es por (orden, producto) y las
        unidades no lo multiplican.
    (c) Tickets = `unidadesPorPack × cantidad` = 4 × 2 = 8, la MISMA fórmula que un pack de
        colección. Un pack de libros que diera 1 ticket sería la regresión silenciosa más cara de
        la enmienda: el Comprador paga por 4 y entra al sorteo como si hubiera comprado 1.
  */
  it("un pack de fuente ESTANDAR no asigna nada, deja un solo grant y emite unidades × cantidad tickets", async () => {
    const t = await crearTenant("sobre-f");
    await crearRaffle(t.id, "ACTIVO");

    // La fuente va DESPUBLICADA a propósito: es el caso «vendo solo el pack» de E17, y el origen de
    // los archivos no puede depender de que la fuente esté a la venta.
    const libro = await db.product.create({
      data: {
        tenantId: t.id,
        titulo: "El libro",
        descripcion: "desc",
        precio: "3000",
        activo: false,
        pdfPath: `${t.id}/el-libro.pdf`,
      },
      select: { id: true },
    });
    const pack = await db.product.create({
      data: {
        tenantId: t.id,
        titulo: "Pack 4 libros",
        descripcion: "desc",
        precio: "10000",
        fuenteId: libro.id,
        unidadesPorPack: 4,
      },
      select: { id: true },
    });

    const orden = await crearOrden(t.id, "fan@example.cl", [
      { productId: pack.id, cantidad: 2, unidadesPorPack: 4 },
    ]);

    await aplicar(orden.id);

    expect(await db.packAssignment.count({ where: { tenantId: t.id } })).toBe(0);
    expect(await db.downloadGrant.count({ where: { orderId: orden.id } })).toBe(1);
    expect(await db.raffleEntry.count({ where: { orderId: orden.id } })).toBe(8);
  });
});

/** Enrutador fake: token → tenant/orden reales + getStatus con el estado Flow dado. */
function enrutarFake(
  tenantId: string,
  orderId: string,
  status: number,
): EnrutarFlowFn {
  const getStatus = vi
    .fn<(token: string) => Promise<FlowGetStatusResponse>>()
    .mockResolvedValue({
      commerceOrder: "flow-dice-otra-cosa",
      status,
      flowOrder: 555,
      paymentData: { fee: "100" },
    });
  const ruteo: FlowRuteado = { tenantId, orderId, montoEsperado: 1000, getStatus };
  return vi.fn<EnrutarFlowFn>().mockResolvedValue(ruteo) as unknown as EnrutarFlowFn;
}
