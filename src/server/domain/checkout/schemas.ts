import { z } from "zod";

/**
 * Input del inicio de checkout: el correo del comprador (su identidad, ADR-0004)
 * y los productos a comprar. Sin cuenta de comprador en el MVP.
 *
 * NO lleva `tenantId`: la Tienda se resuelve SERVER-SIDE desde el subdominio (I1 /
 * ADR-0005; lección del bug H1 de datawalt-app). El use case recibe el `tenantId`
 * del contexto (`ctx.tenant.id`), nunca del input del cliente.
 */
export const iniciarCheckoutInput = z.object({
  email: z.string().email(),
  productIds: z.array(z.string().cuid()).min(1),
});

export type IniciarCheckoutInput = z.infer<typeof iniciarCheckoutInput>;

/**
 * Detalle de un producto del storefront (F03). El `id` SELECCIONA dentro de la Tienda; el
 * `tenantId` con el que se scopea sale del contexto (subdominio), NUNCA del input (I1).
 */
export const getProductoStorefrontInput = z.object({
  id: z.string().cuid(),
});

export type GetProductoStorefrontInput = z.infer<
  typeof getProductoStorefrontInput
>;
