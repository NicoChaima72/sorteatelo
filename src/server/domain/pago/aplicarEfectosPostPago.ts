import { randomBytes } from "node:crypto";

import {
  claveConfirmacionCompra,
  encolarCorreos,
} from "~/server/domain/correo/ledgerCorreos";
import { DomainError } from "~/server/domain/errors";
import { type EfectosPostPago } from "~/server/domain/pago/efectosPostPago";
import { muestrearPacks } from "~/server/productos/muestrearPacks";

/**
 * Efectos post-pago per-tenant (F02). Materializa los dos efectos de negocio de una
 * venta pagada, DENTRO de la misma `prisma.$transaction` que la transición
 * `PENDIENTE → PAGADO` (recibe el `tx` transaccional) y SOLO en esa transición (el
 * núcleo del webhook lo invoca una sola vez — I2):
 *
 *  1. **Entitlement** (`DownloadGrant`, ADR-0002): un grant por `OrderItem`/producto
 *     (D4), con un `token` opaco crypto-random inadivinable (nunca logueado — I4) y
 *     `expiresAt` (S3: 30 días desde la confirmación). Idempotente por
 *     `@@unique([orderId, productId])`. **La cantidad NO lo altera** (I5/D4): comprar
 *     3 unidades de un PDF da 1 derecho de descarga, no 3.
 *  2. **Participación por TICKET** (`RaffleEntry`, CONTEXT § Participación, ADR-0012):
 *     `K = Σ cantidad de los ítems cuyo snapshot `participaEnSorteo` es true` (cada unidad
 *     de un producto participante = 1 ticket). Se crean **K** entries con `ordinal` 0..K-1
 *     (D3) en el `Raffle` ACTIVO **de la Tienda de la orden** (lookup scoped al `tenantId`
 *     derivado de la orden cargada vía `tx` — server-side, nunca input, I1), con `email`
 *     snapshot de `Order.email` (I5). `K = 0` (sin productos participantes) ⇒ ninguna entry.
 *     Idempotente por `@@unique([raffleId, orderId, ordinal])`.
 *
 * Reglas duras:
 * - **I1 (tenancy)**: el `tenantId` que se escribe en grants/entries y el que scopea el
 *   lookup del raffle salen de la ORDEN cargada por `tx`, jamás de un parámetro.
 * - **I3 (la venta es lo primario)**: sin productos participantes (K=0) o sin `Raffle`
 *   ACTIVO en la Tienda de la orden, se crean igual los grants y se OMITEN los tickets sin
 *   lanzar (log inocuo). Un problema del sorteo NUNCA revierte ni falla una orden pagada.
 * - **Idempotencia (ADR-0012)**: `createMany({ skipDuplicates: true })` se apoya en los
 *   `@@unique` para que una segunda invocación deje exactamente N grants + K entries (sin
 *   duplicar). K es estable entre corridas porque `participaEnSorteo`/`cantidad` son SNAPSHOT
 *   en el `OrderItem` (D2): el conjunto de ordinales 0..K-1 es determinístico y reproducible.
 *
 * Cumple el contrato `EfectosPostPago` tal cual (`{ tx, orderId }`), no toca
 * env/res/Flow, y se cabla desde el borde (wrapper del webhook), reemplazando
 * `noopEfectosPostPago` sin tocar el núcleo del webhook ni el contrato (I6).
 */

/**
 * Ventana de validez del derecho de descarga (S3; política final en F03). Exportada (aditivo,
 * sin cambio de comportamiento) para que el reenvío de F04 regenere los grants expirados con el
 * MISMO TTL y el correo de F04 avise la expiración correcta — una sola fuente de verdad.
 */
export const GRANT_TTL_DIAS = 30;

/**
 * Token opaco crypto-random (autoridad intrínseca del grant; D5/I4). Nunca se loguea. Exportado
 * (aditivo) para que el reenvío de F04 regenere tokens con exactamente la misma entropía/forma.
 */
export function generarTokenGrant(): string {
  return randomBytes(32).toString("base64url");
}

/** La forma mínima de una línea de orden para resolver su asignación (F08). */
interface LineaConSobre {
  id: string;
  productId: string;
  cantidad: number;
  unidadesPorPack: number;
  product: { modalidad: "ESTANDAR" | "SOBRE" };
}

/**
 * Sortea y persiste los archivos que le tocan a cada pack de cada línea SOBRE de la orden
 * (F08, D4/D12). Corre DENTRO de la misma `$transaction` que los grants y los tickets: o queda
 * todo, o no queda nada.
 *
 * **Idempotencia ante replay**: Flow reintenta el webhook, y la muestra es ALEATORIA — un segundo
 * pase sortearía OTROS archivos. El corte ("¿esta línea ya tiene asignaciones?") hace que valga la
 * muestra ORIGINAL, que es la que el Comprador ya pudo haber visto.
 *
 * El corte es por LÍNEA porque su sujeto es la línea: cada `OrderItem` tiene su propio pool y su
 * propio conjunto de coordenadas, y preguntar por la orden entera obligaría a decidir qué significa
 * "ya está" en una orden que mezcla dos sobres. NO es para recuperarse de una `$tx` a medias — eso
 * no existe: acá todo corre en UNA transacción atómica, o queda todo o no queda nada. Lo que cubre
 * son las invocaciones SEPARADAS y ya committeadas (el reintento real de Flow).
 *
 * En producción esta capa ni siquiera se alcanza: `confirmarPagoDeOrden` serializa la transición
 * `PENDIENTE → PAGADO` con un `updateMany` atómico y solo el ganador invoca este hook. El corte es
 * defensa en profundidad para el día que este use case tenga otro caller, y detrás está la red de
 * Postgres (`@@unique([orderItemId, packOrdinal, unidadOrdinal])`), que abortaría la `$tx`.
 *
 * El insert va **SIN `skipDuplicates`** a propósito (al revés que los grants y los tickets): con dos
 * uniques en la tabla, el `ON CONFLICT DO NOTHING` de Prisma no lleva target y aplicaría a los DOS
 * ⇒ una muestra buggeada con repetidos insertaría MENOS filas EN SILENCIO. Prefiero que aborte la
 * `$tx` y que Flow reintente.
 */
async function asignarArchivosDeSobres({
  tx,
  order,
}: {
  tx: Parameters<EfectosPostPago>[0]["tx"];
  order: { id: string; tenantId: string; items: LineaConSobre[] };
}): Promise<void> {
  const sobres = order.items.filter((i) => i.product.modalidad === "SOBRE");
  if (sobres.length === 0) return; // el 100% de las órdenes de hoy: ni una query de más

  for (const item of sobres) {
    // Corte de replay ANTES de sortear: si ya hay asignaciones, la muestra original manda.
    const yaAsignado = await tx.packAssignment.findFirst({
      where: { orderItemId: item.id },
      select: { id: true },
    });
    if (yaAsignado) {
      console.info(
        `[efectos-post-pago] Orden ${order.id} (tenant ${order.tenantId}): la línea ${item.id} ` +
          `ya tenía sus archivos asignados; replay no-op (no se re-sortea).`,
      );
      continue;
    }

    // El pool se resuelve DESDE el producto de la línea y filtrando los confirmados. Es la única
    // garantía de que un `PackAssignment` no apunte a un archivo de otro producto: las dos FKs de
    // esa tabla no se cruzan entre sí, así que no hay red de DB detrás de esto. El `tenantId` va
    // explícito aunque `productId` ya sea tenant-bound (defensa en profundidad, I1).
    const pool = await tx.productFile.findMany({
      where: {
        productId: item.productId,
        tenantId: order.tenantId,
        confirmadoAt: { not: null },
      },
      select: { id: true },
    });

    const esperadas = item.unidadesPorPack * item.cantidad;
    const coordenadas = muestrearPacks({
      pool: pool.map((f) => f.id),
      unidadesPorPack: item.unidadesPorPack,
      cantidad: item.cantidad,
    });

    if (coordenadas.length < esperadas) {
      // El pool encogió entre la compra y la confirmación del pago (el checkout ya había validado
      // que alcanzaba, F07). Camino de borde real: un producto que se pasa a borrador deja de estar
      // protegido por el guard de borrado de F06, y su orden puede seguir PENDIENTE.
      //
      // NO se lanza: hacerlo abortaría la $tx de una orden YA PAGADA, dejándola PENDIENTE para
      // siempre mientras Flow reintenta — el Comprador habría pagado y no tendría NADA. Se entrega
      // lo que el pool alcanza (nunca repitiendo dentro del pack) y se deja rastro fuerte.
      console.error(
        `[efectos-post-pago] Orden ${order.id} (tenant ${order.tenantId}): el pool del producto ` +
          `${item.productId} alcanzó para ${coordenadas.length} de ${esperadas} archivos ` +
          `(pack de ${item.unidadesPorPack} × ${item.cantidad}). Se entrega lo disponible: ` +
          `REVISAR con el Organizador.`,
      );
    }

    if (coordenadas.length === 0) continue; // pool vacío: no hay nada que insertar

    await tx.packAssignment.createMany({
      data: coordenadas.map((c) => ({
        tenantId: order.tenantId, // de la ORDEN, jamás de un parámetro (I1)
        orderItemId: item.id,
        productFileId: c.productFileId,
        packOrdinal: c.packOrdinal,
        unidadOrdinal: c.unidadOrdinal,
      })),
    });
  }
}

export const aplicarEfectosPostPago: EfectosPostPago = async ({ tx, orderId }) => {
  // Carga la orden por `tx` (misma transacción). De acá — no de un parámetro — salen el
  // `tenantId` (I1), el `email` (snapshot, I5) y los productos de sus ítems.
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      // `cantidad` + `participaEnSorteo` (snapshot al comprar, D2) alimentan K de tickets;
      // `productId` alimenta los grants (uno por producto, la cantidad no lo altera — I5/D4).
      items: {
        select: {
          id: true, // coordenada de las asignaciones del sobre (F08)
          productId: true,
          cantidad: true,
          participaEnSorteo: true,
          // SNAPSHOT del pack comprado (F05/F07). De acá salen las DOS cosas que tienen que ser
          // estables ante replay aunque el Organizador edite o BORRE la opción viva: cuántos
          // archivos se sortean y cuántos tickets se emiten (D6).
          unidadesPorPack: true,
          // La modalidad se lee del producto y no del ítem: es lo que decide si esta línea tiene
          // un sorteo de archivos que resolver.
          product: { select: { modalidad: true } },
        },
      },
    },
  });

  if (!order) {
    // No debería ocurrir: el núcleo confirma la orden antes de invocar el hook. Si pasa,
    // es una violación de integridad (no un "problema del sorteo") ⇒ revertir la
    // transacción es lo correcto.
    throw new DomainError(
      "NOT_FOUND",
      `Orden ${orderId} inexistente al aplicar efectos post-pago`,
    );
  }

  // 1) Entitlement: un DownloadGrant por ítem/producto (D4 — la cantidad NO lo altera), con el
  //    tenantId de la orden. Idempotente por @@unique([orderId, productId]) + skipDuplicates.
  const expiresAt = new Date(
    Date.now() + GRANT_TTL_DIAS * 24 * 60 * 60 * 1000,
  );
  await tx.downloadGrant.createMany({
    data: order.items.map((item) => ({
      tenantId: order.tenantId,
      orderId: order.id,
      productId: item.productId,
      token: generarTokenGrant(),
      expiresAt,
    })),
    skipDuplicates: true,
  });

  // 2) CONFIRMACIÓN DE COMPRA encolada en el ledger (F03/C1, ADR-0027 §2). La fila nace PENDIENTE
  //    dentro de ESTA `$transaction`: el correo es un compromiso de la venta, no un efecto suelto
  //    —si la orden queda pagada la fila existe, y si la $tx revierte no queda un correo prometido
  //    por una venta que no ocurrió—. El ENVÍO es post-commit (`waitUntil`) o por el cron; acá no
  //    se toca la red: el webhook jamás espera a Resend (I3).
  //
  //    Va ANTES de los tres `return` de abajo, y eso es lo importante: una orden SIN tickets (sin
  //    productos participantes, sin Raffle ACTIVO) igual recibe su confirmación —sin sección de
  //    sorteo, §5.2—. Ponerlo "junto a los tickets" dejaría sin correo justo a las compras que no
  //    participan del sorteo.
  //
  //    También va antes del `update` del contador de `Raffle`, que toma un row-lock sostenido hasta
  //    el COMMIT: cada escritura que se meta después alarga esa ventana (mismo criterio que la nota
  //    de la asignación de sobres).
  //
  //    Idempotente por `@@unique([tipo, clave])` + `skipDuplicates` (I2): el replay del webhook no
  //    puede crear una segunda fila, así que no puede salir un segundo correo.
  await encolarCorreos({
    db: tx,
    correos: [
      {
        tenantId: order.tenantId, // de la ORDEN, jamás de un parámetro (I1)
        tipo: "CONFIRMACION_COMPRA",
        clave: claveConfirmacionCompra({ orderId: order.id }),
        email: order.email, // snapshot del destinatario (ADR-0004)
      },
    ],
  });

  // 3) ASIGNACIÓN del sobre sorpresa (F08, D4/D12): qué archivos del pool le tocan a cada pack.
  //    Va DESPUÉS de los grants y ANTES de los tickets a propósito: los tickets toman un row-lock
  //    sobre el `Raffle` que se sostiene hasta el COMMIT, y esa ventana hay que dejarla lo más
  //    corta posible.
  await asignarArchivosDeSobres({ tx, order });

  // 4) Participación por TICKET (ADR-0012 + D6): K = Σ (unidadesPorPack × cantidad) de los ítems
  //    cuyo snapshot `participaEnSorteo` es true. Cada UNIDAD comprada = 1 ticket, y en un sobre un
  //    pack de 4 son 4 unidades ⇒ 4 tickets (D6: no castiga al que compra el pack grande).
  //    Para un ESTANDAR `unidadesPorPack` es 1 y la fórmula da exactamente lo de antes — por eso
  //    esa columna es NOT NULL con default 1 y no nullable: un `?? 1` olvidado serían 0 tickets
  //    para alguien que YA PAGÓ.
  const K = order.items.reduce(
    (acc, item) =>
      item.participaEnSorteo
        ? acc + item.unidadesPorPack * item.cantidad
        : acc,
    0,
  );

  if (K === 0) {
    // I3: sin productos participantes ⇒ 0 tickets, ninguna entry. La venta no se compromete.
    // Log inocuo (sin email ni token — I4): tenantId y orderId no son secretos.
    console.info(
      `[efectos-post-pago] Orden ${order.id} (tenant ${order.tenantId}): ` +
        `sin productos participantes; se omiten los tickets (la venta no se compromete).`,
    );
    return;
  }

  // Raffle ACTIVO de la Tienda de la orden (scoped al tenantId derivado server-side, I1).
  // `orderBy` determinista para que, si por error de sembrado hubiera más de un ACTIVO (S5),
  // la elección sea estable y reproducible — NUNCA se lanza por esto (I3).
  const raffleActivo = await tx.raffle.findFirst({
    where: { tenantId: order.tenantId, estado: "ACTIVO" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!raffleActivo) {
    // I3: sin sorteo ACTIVO en ESTA Tienda se omiten los tickets sin fallar. Log inocuo.
    console.info(
      `[efectos-post-pago] Orden ${order.id} (tenant ${order.tenantId}): ` +
        `sin Raffle ACTIVO en la Tienda; se omiten los ${K} tickets (la venta no se compromete).`,
    );
    return;
  }

  // REPLAY (ADR-0024 §3): el corte va ANTES de reclamar el rango. Si esta orden ya tiene
  // tickets en este sorteo, los efectos son no-op y —lo importante— el replay del webhook NO
  // CONSUME NÚMEROS. Sin este corte, `skipDuplicates` seguiría sin duplicar filas, pero el
  // contador ya habría avanzado K y el sorteo quedaría con un hueco por cada reintento de Flow.
  const yaInscrita = await tx.raffleEntry.findFirst({
    where: { raffleId: raffleActivo.id, orderId: order.id },
    select: { id: true },
  });
  if (yaInscrita) {
    console.info(
      `[efectos-post-pago] Orden ${order.id} (tenant ${order.tenantId}): ` +
        `ya tiene tickets en el sorteo ${raffleActivo.id}; replay no-op (no consume Números).`,
    );
    return;
  }

  // Reclamo del rango de K Números del sorteo (ADR-0024 §2) con UN SOLO UPDATE atómico: el
  // `increment` se resuelve en la DB (nunca leer-y-escribir: bajo READ COMMITTED eso es un lost
  // update) y el row-lock de la fila `Raffle` —tomado acá y sostenido hasta el COMMIT— SERIALIZA
  // las confirmaciones concurrentes del mismo sorteo, sin locks distribuidos ni SERIALIZABLE.
  // Va lo más TARDE posible dentro de la $tx (después de los grants) para acortar esa ventana.
  const { ultimoNumero } = await tx.raffle.update({
    where: { id: raffleActivo.id },
    data: { ultimoNumero: { increment: K } },
    select: { ultimoNumero: true },
  });
  const primerNumero = ultimoNumero - K + 1;

  // K RaffleEntry con ordinal 0..K-1 (D3), email snapshot (I5) y su Número del sorteo. Idempotente
  // por @@unique([raffleId, orderId, ordinal]) + skipDuplicates: una segunda invocación colisiona
  // con el MISMO conjunto determinístico de ordinales y no duplica (exactly-once, ADR-0012) — capa
  // defensiva detrás del corte de replay de arriba. K es estable porque participaEnSorteo/cantidad
  // son snapshot en el OrderItem (D2). Los K números son CONTIGUOS y alineados al ordinal: es lo
  // que permite comunicarlos como rango («tus números son 1043–1092», D8). Si la $tx aborta,
  // contador y entries revierten JUNTOS (I4: un número jamás se reutiliza).
  await tx.raffleEntry.createMany({
    data: Array.from({ length: K }, (_unused, ordinal) => ({
      tenantId: order.tenantId,
      raffleId: raffleActivo.id,
      orderId: order.id,
      email: order.email,
      ordinal,
      numero: primerNumero + ordinal,
    })),
    skipDuplicates: true,
  });
};
