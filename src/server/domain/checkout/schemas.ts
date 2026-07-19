import { z } from "zod";

/** Tope de cordura de unidades por producto en una orden (S1, ADR-0012): evita abuso/overflow. */
export const MAX_CANTIDAD_POR_ITEM = 99;

/**
 * Input del inicio de checkout: el correo del comprador (su identidad, ADR-0004)
 * y los ítems a comprar — cada uno con su `cantidad` (≥1, ADR-0012). Sin cuenta de
 * comprador en el MVP.
 *
 * NO lleva `tenantId`: la Tienda se resuelve SERVER-SIDE desde el subdominio (I1 /
 * ADR-0005; lección del bug H1 de datawalt-app). El use case recibe el `tenantId`
 * del contexto (`ctx.tenant.id`), nunca del input del cliente. NO lleva precio ni
 * total: el dinero lo calcula el server con `Decimal` (I4). El `refine` garantiza un
 * productId único por orden (una línea por producto — `@@unique([orderId, productId])`);
 * la cantidad vive en la línea, no en filas repetidas.
 */
export const iniciarCheckoutInput = z.object({
  email: z.string().email(),
  items: z
    .array(
      z.object({
        productId: z.string().cuid(),
        cantidad: z.number().int().min(1).max(MAX_CANTIDAD_POR_ITEM),
      }),
    )
    .min(1)
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      { message: "Cada producto puede aparecer una sola vez en la orden." },
    ),
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

/**
 * Input del resolver de catálogo del page builder (F05): `modo` + `productoIds` de la sección de
 * catálogo del documento. El `tenantId` con el que se scopea NO viene acá — sale del contexto
 * (subdominio, I1). Los `productoIds` son referencias públicas (el documento publicado es público);
 * la seguridad es el scoping por tenant del contexto, no ocultar estos ids.
 */
export const listarProductosDeCatalogoInput = z.object({
  modo: z.enum(["todos", "seleccion"]),
  productoIds: z.array(z.string().cuid()).max(60).optional(),
});

export type ListarProductosDeCatalogoInput = z.infer<
  typeof listarProductosDeCatalogoInput
>;

/**
 * Input del resumen de sorteos CERRADOS (catálogo-v2 F06): `max` acota cuántos ganadores devolver
 * (el widget `ganadores` automatico pasa su `maxAutomaticos`). El `tenantId` sale del contexto (I1),
 * jamás del input. Todo opcional ⇒ el use case aplica su cota dura por defecto.
 */
export const getSorteoResumenStorefrontInput = z
  .object({ max: z.number().int().min(1).max(20).optional() })
  .optional();

export type GetSorteoResumenStorefrontInput = z.infer<
  typeof getSorteoResumenStorefrontInput
>;
