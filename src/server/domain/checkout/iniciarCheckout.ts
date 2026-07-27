import { Prisma, type PrismaClient } from "@prisma/client";

import {
  datosEntregableDeFila,
  esProductoEntregable,
  SELECCION_PRODUCTO_ENTREGABLE,
  seVendeDirecto,
} from "~/server/productos/productoEntregable";
import { SELECCION_CAMPO_DEL_CHECKOUT } from "~/server/domain/camposCheckout/camposActivos";
import { ordenDeCamposCheckout } from "~/server/domain/camposCheckout/reglas";
import { validarRespuestasDeCheckout } from "~/server/domain/camposCheckout/validarRespuestas";
import { DomainError } from "~/server/domain/errors";
import { type IniciarCheckoutInput } from "~/server/domain/checkout/schemas";
import { registrarConsentimientoRecordatorios } from "~/server/domain/correo/preferenciasDeCorreo";
import { cargarGateVenta } from "~/server/domain/facturacion/cargarGateVenta";
import { type FlowService } from "~/server/services/flow";

/**
 * Use case de dominio: inicia el checkout de una compra en UNA Tienda (ADR-0005).
 *
 * `tenantId` viene del contexto (resuelto server-side desde el subdominio), NUNCA del
 * input (I1). Todas las lecturas y escrituras se scopean por él:
 *
 * 1. Solo considera `Product`s de ESA Tienda: un `productId` de otra Tienda (o
 *    inexistente) ⇒ `NOT_FOUND` — el aislamiento cross-tenant es indistinguible de
 *    "no existe". Inactivo ⇒ `INACTIVE`.
 * 2. Crea una `Order` PENDIENTE con sus `OrderItem`(s) — cada ítem CONGELA como snapshot
 *    el `Product.precio` UNITARIO (I4/D5), su `cantidad` y el flag `participaEnSorteo`
 *    (D2, para que K de tickets sea estable ante replay del webhook, ADR-0012) —, el
 *    `total` = Σ `precio × cantidad` (Decimal server-side, I4), el correo del comprador, y
 *    el `Payment` PENDIENTE (monto = total). Order/OrderItem/Payment se crean con el
 *    `tenantId`. Todo en `prisma.$transaction`.
 * 3. Crea el pago en Flow (red, FUERA de la transacción DB) con la cuenta Flow del
 *    tenant (el `flow` ya viene instanciado con SUS credenciales — BYO-Flow, ADR-0006)
 *    y persiste el token para que el webhook confirme server-side; devuelve la URL de
 *    redirect de Flow.
 *
 * El `flow` entra inyectado (instanciado en el borde con las credenciales del tenant,
 * nunca dentro del dominio, I7).
 */
/**
 * Resuelve **qué se congela en el `OrderItem`** de una línea (F07, reescrito por la ENMIENDA v2).
 *
 * Bajo el modelo v2 un pack ES un producto (E13), así que esto dejó de tener ramas: el precio es el
 * `Product.precio` que el Organizador tipeó y las unidades son su `Product.unidadesPorPack`. No hay
 * opción que buscar, ni `packOptionId` que validar, ni un precio "de pack" distinto del precio del
 * producto — la simplificación que el usuario pidió al rechazar la v1 se ve entera acá.
 *
 * Se sigue devolviendo `unidadesPorPack` EXPLÍCITO (y no se deja al `@default(1)` de la columna)
 * porque de acá salen las dos cosas que F08 necesita estables ante replay: cuántos archivos se
 * sortean y cuántos tickets se emiten. Para un producto normal vale 1, que es un hecho VERDADERO
 * (comprar 3 unidades son 3 tickets = 1×3), no un relleno.
 *
 * Nunca se confía en un precio que venga del cliente: no existe tal campo en el input (I4).
 */
function snapshotDeLinea(producto: {
  precio: Prisma.Decimal;
  unidadesPorPack: number;
}): { precio: Prisma.Decimal; unidadesPorPack: number } {
  return {
    precio: producto.precio,
    unidadesPorPack: producto.unidadesPorPack,
  };
}

export async function iniciarCheckout({
  db,
  flow,
  tenantId,
  ip,
  input,
}: {
  db: PrismaClient;
  flow: FlowService;
  tenantId: string;
  /**
   * IP del request, derivada en el BORDE (F05/D5): es parte del registro verificable del
   * consentimiento, junto al timestamp y al texto exacto. Entra como dato y no se lee de `req` acá
   * adentro — el dominio no conoce el transporte. `null` cuando no se pudo derivar: se guarda null,
   * jamás un valor inventado.
   */
  ip: string | null;
  input: IniciarCheckoutInput;
}): Promise<{ orderId: string; total: string; redirectUrl: string }> {
  const { order, subject } = await db.$transaction(async (tx) => {
    // GATE DE VENTA por facturación (F05, D4/D5, ADR-0026), lo PRIMERO de la transacción: una Tienda
    // en pausa —dunning de Flow agotado, plan cancelado o cortesía vencida— deja de vender. El SSR ya
    // sirve la página neutral en vez del checkout, pero ese es el aviso; ESTE es el gate: recomputado
    // server-side dentro de la $tx, no se saltea con un POST a mano (mismo criterio que el gate de
    // publicación recomputado dentro de la $tx de `publicarTienda`).
    //
    // El mensaje es NEUTRAL a propósito: la mora es un asunto entre la Plataforma y el Organizador, y
    // el Comprador no tiene por qué enterarse de que esta tienda no pagó su plan.
    const gate = await cargarGateVenta({ db: tx, where: { id: tenantId } });
    if (!gate.puedeVender) {
      throw new DomainError(
        "INACTIVE",
        "Esta tienda no está recibiendo pedidos por ahora.",
      );
    }

    // Scoping por tenant (I1): solo productos de ESTA Tienda. Un productId de otra
    // Tienda no aparece acá ⇒ cae en el NOT_FOUND de abajo (aislamiento por construcción).
    const productos = await tx.product.findMany({
      where: { tenantId, id: { in: input.items.map((i) => i.productId) } },
      select: {
        id: true,
        titulo: true,
        precio: true,
        activo: true,
        participaEnSorteo: true,
        // ENMIENDA v2 — todo lo que hace falta para decidir si esta línea se puede vender Y qué
        // congela, en UN select compartido con el panel y con el gate de publicación (I5): la
        // modalidad (¿es una colección?), las unidades del pack, y la FUENTE con su pool. Todo
        // cuelga del producto, que ya está scopeado por `tenantId`, así que la fuente no puede ser
        // de otra Tienda por construcción (I1) — lo garantiza además `resolverFuenteDePack` al
        // crear el pack, y `fuenteId` es inmutable.
        ...SELECCION_PRODUCTO_ENTREGABLE,
      },
    });
    const porId = new Map(productos.map((p) => [p.id, p]));

    // El input ya trae productId único (refine del schema) — una línea por producto
    // (@@unique([orderId, productId])); la cantidad vive en la línea, no en filas repetidas.
    for (const { productId } of input.items) {
      const producto = porId.get(productId);
      if (!producto) {
        throw new DomainError("NOT_FOUND", `Producto ${productId} inexistente`);
      }
      if (!producto.activo) {
        throw new DomainError("INACTIVE", `Producto ${productId} inactivo`);
      }

      // Una COLECCIÓN no se compra (E15/E17): existe para que sus packs referencien su pool, y no
      // aparece en el catálogo. El rechazo es server-side y no "no está en la vitrina": la vitrina
      // es una vista, y un POST a mano no la mira. Es también el corte que impide vender el pool
      // entero al precio de referencia de la colección.
      if (!seVendeDirecto(producto)) {
        throw new DomainError(
          "INVALID",
          "Este producto no se vende por separado. Elige uno de los packs de la tienda.",
        );
      }

      // Gate de ENTREGA recomputado con los datos VIGENTES, con la MISMA regla que el guard de
      // activación del panel y el gate de publicación (I5). Para un pack de fuente SOBRE esto es
      // "el pool alcanza para las unidades que pide ESTE pack": sin él, F08 intentaría sortear más
      // archivos distintos de los que hay y reventaría contra el
      // `@@unique([orderItemId, packOrdinal, productFileId])` DESPUÉS de que el Comprador pagó.
      //
      // El gate mide contra el pack PEDIDO y no contra el más grande de la Tienda: rechazar la
      // compra de un pack de 1 porque existe otro de 4 sin cubrir sería castigar una venta que sí
      // se puede entregar. Bajo v2 eso sale gratis — cada pack es su propio producto y trae sus
      // propias `unidadesPorPack`.
      //
      // El rechazo ocurre ANTES de crear la Order y ANTES de tocar Flow: preferimos no vender a no
      // poder entregar. El mensaje NO dice cuántos archivos tiene la colección: el inventario de la
      // Tienda no es asunto del Comprador, y "prueba con otro" es lo accionable.
      if (!esProductoEntregable(datosEntregableDeFila(producto))) {
        throw new DomainError(
          "INVALID",
          "Este producto no está disponible por ahora. Prueba con otro.",
        );
      }
    }

    // Campos de checkout (F05): la definición que manda es la VIGENTE en la DB en este instante,
    // releída DENTRO de la $tx y scopeada por el `tenantId` del contexto (I1/I3) — nunca la que el
    // cliente tenía renderizada. Solo los ACTIVOS: desactivar un campo es sacarlo del checkout (D5).
    const definiciones = await tx.checkoutField.findMany({
      where: { tenantId, activo: true },
      orderBy: ordenDeCamposCheckout, // el MISMO orden del form: los errores nombran el primer campo que falta
      // El select público (el que ve el Comprador) + `id`, que acá sí hace falta para poblar `fieldId`.
      select: { ...SELECCION_CAMPO_DEL_CHECKOUT, id: true },
    });
    const respuestas = validarRespuestasDeCheckout({
      definiciones,
      respuestas: input.respuestas,
    });

    const items = input.items.map(({ productId, cantidad }) => {
      const producto = porId.get(productId)!;
      const { precio, unidadesPorPack } = snapshotDeLinea(producto);
      return {
        tenantId,
        productId,
        precio, // snapshot del precio de LO QUE SE COMPRA (I4/D5): el Product en ESTANDAR, el pack en SOBRE
        cantidad, // unidades de la línea (ADR-0012); en un SOBRE, cuántos PACKS
        participaEnSorteo: producto.participaEnSorteo, // snapshot del flag (D2)
        // EXPLÍCITO en las dos modalidades aunque la columna tenga `@default(1)`: el default está
        // para las filas históricas y para el código viejo deployado (ADR-0015), no para relevar a
        // este writer. De acá salen la asignación y los tickets de F08.
        unidadesPorPack,
      };
    });
    // total = Σ (precio unitario × cantidad), todo en Decimal server-side (I4) — el
    // cliente jamás suma ni multiplica dinero.
    const total = items.reduce(
      (acc, it) => acc.plus(it.precio.times(it.cantidad)),
      new Prisma.Decimal(0),
    );
    const subject = input.items
      .map(({ productId }) => porId.get(productId)!.titulo)
      .join(", ")
      .slice(0, 255);

    const order = await tx.order.create({
      data: {
        tenantId,
        email: input.email,
        estado: "PENDIENTE",
        total,
        items: { create: items },
        payment: { create: { tenantId, estado: "PENDIENTE", monto: total } },
        // Las respuestas se congelan en la MISMA sentencia que la Order (D2): no hay un instante
        // en que exista la compra sin los datos con que se hizo. Sin respuestas no se emite ni la
        // clave — una Tienda sin campos crea exactamente la Order de siempre (I9).
        ...(respuestas.length > 0
          ? {
              checkoutResponses: {
                // `tenantId` DESPUÉS del spread: el tenant del contexto gana por construcción, aunque
                // mañana el validador devuelva un campo con ese nombre (I1).
                create: respuestas.map((r) => ({ ...r, tenantId })),
              },
            }
          : {}),
      },
      select: { id: true, total: true, email: true },
    });

    // Consentimiento de recordatorios (F05/D5). Va DENTRO de la misma `$tx` que la Order —y
    // después de crearla, porque su FK cuelga de ella—: si la venta se revierte, no queda un
    // consentimiento prometido por una compra que no ocurrió. Solo se escribe cuando el checkbox
    // vino marcado: la ausencia de esta llamada ES el «no» (jamás premarcado).
    //
    // El use case NO puede lanzar (ver su docstring): un consentimiento de marketing no tiene
    // permitido voltear una compra por una colisión de unique.
    // `=== true` y no un truthy suelto: es el «jamás premarcado» expresado como código. La clave
    // es opcional en el schema justamente para que la AUSENCIA signifique no, y este guard sostiene
    // esa promesa también para un caller que no pase por Zod.
    if (input.aceptaRecordatorios === true) {
      await registrarConsentimientoRecordatorios({
        db: tx,
        tenantId,
        orderId: order.id,
        email: input.email,
        ip,
      });
    }

    return { order, subject };
  });

  const { redirectUrl, token, flowOrder } = await flow.crearPago({
    commerceOrder: order.id,
    subject,
    amount: order.total.toFixed(0), // CLP: pesos enteros, sin decimales
    email: order.email,
  });

  await db.payment.update({
    where: { orderId: order.id },
    data: { token, flowOrder },
  });

  return { orderId: order.id, total: order.total.toFixed(0), redirectUrl };
}
