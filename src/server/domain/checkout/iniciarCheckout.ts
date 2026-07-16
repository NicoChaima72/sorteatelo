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
 * 2. Crea una `Order` PENDIENTE con sus `OrderItem`(s) — el precio de cada ítem se
 *    CONGELA como snapshot del `Product.precio` al momento de la compra (I4) —, el
 *    `total` = suma, el correo del comprador, y el `Payment` PENDIENTE (monto = total).
 *    Order/OrderItem/Payment se crean con el `tenantId`. Todo en `prisma.$transaction`.
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
      where: { tenantId, id: { in: input.productIds } },
      select: { id: true, titulo: true, precio: true, activo: true },
    });
    const porId = new Map(productos.map((p) => [p.id, p]));

    // productIds únicos, preservando el orden pedido (un producto se compra una sola
    // vez por orden — @@unique([orderId, productId])).
    const idsUnicos = [...new Set(input.productIds)];
    for (const id of idsUnicos) {
      const producto = porId.get(id);
      if (!producto) {
        throw new DomainError("NOT_FOUND", `Producto ${id} inexistente`);
      }
      if (!producto.activo) {
        throw new DomainError("INACTIVE", `Producto ${id} inactivo`);
      }
    }

    const items = idsUnicos.map((id) => ({
      tenantId,
      productId: id,
      precio: porId.get(id)!.precio, // snapshot (I4)
    }));
    const total = items.reduce(
      (acc, it) => acc.plus(it.precio),
      new Prisma.Decimal(0),
    );
    const subject = idsUnicos
      .map((id) => porId.get(id)!.titulo)
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
