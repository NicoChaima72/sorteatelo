import { Prisma, type PrismaClient } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";
import { type IniciarCheckoutInput } from "~/server/domain/checkout/schemas";
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

    const items = input.items.map(({ productId, cantidad }) => {
      const producto = porId.get(productId)!;
      return {
        tenantId,
        productId,
        precio: producto.precio, // snapshot UNITARIO (I4/D5)
        cantidad, // unidades de la línea (ADR-0012)
        participaEnSorteo: producto.participaEnSorteo, // snapshot del flag (D2)
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
