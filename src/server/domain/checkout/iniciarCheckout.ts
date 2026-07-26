import { Prisma, type PrismaClient, type ProductMode } from "@prisma/client";

import { SELECCION_CAMPO_DEL_CHECKOUT } from "~/server/domain/camposCheckout/camposActivos";
import { ordenDeCamposCheckout } from "~/server/domain/camposCheckout/reglas";
import { validarRespuestasDeCheckout } from "~/server/domain/camposCheckout/validarRespuestas";
import { DomainError } from "~/server/domain/errors";
import { type IniciarCheckoutInput } from "~/server/domain/checkout/schemas";
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
/** Lo que el checkout necesita saber del producto para resolver el precio de una línea (F07). */
interface ProductoParaLinea {
  precio: Prisma.Decimal;
  modalidad: ProductMode;
  _count: { files: number };
  packOptions: Array<{ id: string; unidades: number; precio: Prisma.Decimal }>;
}

/**
 * Resuelve **qué se congela en el `OrderItem`** de una línea: el precio y cuántos archivos del pool
 * entrega un pack (F07/D3).
 *
 * Es UNA función para las dos modalidades a propósito: el resto del use case (el total, el Payment,
 * el monto a Flow) no debe saber si compró un archivo o un sobre. Devuelve siempre las dos cosas, así
 * `unidadesPorPack` nunca queda implícito — para un ESTANDAR es **1**, que es un hecho VERDADERO
 * (comprar 3 unidades son 3 tickets = 1×3) y no un relleno.
 *
 * `packOptions` ya viene filtrado a las ACTIVAS y del producto del tenant resuelto server-side, así
 * que buscar el `packOptionId` acá dentro es a la vez la validación de vigencia y la de pertenencia
 * (I1): un id de otra Tienda, de otro producto o de una opción apagada simplemente no está en la
 * lista. Nunca se confía en un precio que venga del cliente — no existe tal campo en el input (I4).
 */
function snapshotDeLinea(
  producto: ProductoParaLinea,
  packOptionId: string | undefined,
): { precio: Prisma.Decimal; unidadesPorPack: number } {
  if (producto.modalidad !== "SOBRE") {
    if (packOptionId !== undefined) {
      // Ignorarlo en silencio sería peor: el Comprador creería que se lleva un pack.
      throw new DomainError(
        "INVALID",
        "Este producto no se vende por packs.",
      );
    }
    return { precio: producto.precio, unidadesPorPack: 1 };
  }

  if (packOptionId === undefined) {
    throw new DomainError(
      "INVALID",
      "Elige cuántos archivos quieres antes de comprar este sobre.",
    );
  }

  const opcion = producto.packOptions.find((o) => o.id === packOptionId);
  if (!opcion) {
    // Neutral y accionable: cubre "ya no existe", "la apagaron" y "es de otro producto/Tienda" con
    // la misma respuesta, sin fugar cuál de los tres fue (I1).
    throw new DomainError(
      "INVALID",
      "Esa opción ya no está disponible. Vuelve a elegir un pack.",
    );
  }

  // Gate del pool (D4/I7), recomputado acá con los datos VIGENTES: sin esto, F08 intentaría sortear
  // más archivos distintos de los que hay y reventaría contra el
  // `@@unique([orderItemId, packOrdinal, productFileId])` DESPUÉS de que el Comprador pagó. El
  // rechazo es ANTES de crear la Order y antes de tocar Flow: preferimos no vender a no poder
  // entregar. El mensaje no dice cuántos archivos tiene la colección — el inventario de la Tienda no
  // es asunto del Comprador, y "elige otro pack" es lo accionable.
  if (producto._count.files < opcion.unidades) {
    throw new DomainError(
      "INVALID",
      "Ese pack no está disponible por ahora. Prueba con uno más chico.",
    );
  }

  // El precio del PACK COMPLETO (nunca el `Product.precio`, que en un sobre es solo referencia, ni
  // un precio por unidad: multiplicarlo por `unidades` cobraría de más).
  return { precio: opcion.precio, unidadesPorPack: opcion.unidades };
}

export async function iniciarCheckout({
  db,
  flow,
  tenantId,
  input,
}: {
  db: PrismaClient;
  flow: FlowService;
  tenantId: string;
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
        // F07 — lo que hace falta para vender un SOBRE. Todo cuelga del producto, que ya está
        // scopeado por `tenantId`: el pack elegido no puede ser de otra Tienda por construcción (I1).
        modalidad: true,
        // Tamaño del POOL: solo los confirmados (un archivo a medio subir no es entregable, F06).
        _count: { select: { files: { where: { confirmadoAt: { not: null } } } } },
        // Solo las ACTIVAS: apagar una opción es sacarla de la venta (mismo criterio que los Campos
        // de checkout, releídos VIGENTES dentro de esta misma $tx — nunca lo que el cliente tenía
        // renderizado).
        packOptions: {
          where: { activo: true },
          select: { id: true, unidades: true, precio: true },
        },
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

    const items = input.items.map(({ productId, cantidad, packOptionId }) => {
      const producto = porId.get(productId)!;
      const { precio, unidadesPorPack } = snapshotDeLinea(
        producto,
        packOptionId,
      );
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
