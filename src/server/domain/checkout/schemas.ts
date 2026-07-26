import { z } from "zod";

import { MAX_CAMPOS_ACTIVOS } from "~/server/domain/camposCheckout/reglas";

/** Tope de cordura de unidades por producto en una orden (S1, ADR-0012): evita abuso/overflow. */
export const MAX_CANTIDAD_POR_ITEM = 99;

/**
 * Cotas de TRANSPORTE de las respuestas de checkout (F05). NO son la validación del dato: esa
 * corre contra la definición vigente en `validarRespuestasDeCheckout` (I3), y es la que produce
 * mensajes que nombran el campo. Acá solo se corta el payload absurdo antes de gastar una query.
 *
 * Por eso el tope de `valor` es holgado y no 200: si fuera el mismo del TEXTO, un texto de 201
 * caracteres moriría con un error de Zod ("string demasiado largo", sin decir cuál campo) en vez
 * del mensaje de dominio que sí nombra el campo.
 */
const MAX_RESPUESTAS = MAX_CAMPOS_ACTIVOS; // una Tienda no puede tener más campos activos que esto
const MAX_LARGO_CLAVE = 80; // el filtro REAL es pertenecer a las definiciones vigentes, no el largo
const MAX_LARGO_VALOR = 1000;

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
 *
 * `respuestas` (F05) son los datos ADICIONALES que pide la Tienda (Campos de checkout): `{clave,
 * valor}` y nada más. Opcionales con default `[]` — una Tienda sin campos manda el payload de
 * siempre (I9). Que falte un obligatorio NO se detecta acá sino contra la definición vigente
 * dentro de la `$tx` (I3): el cliente no es quien decide qué es obligatorio.
 */
export const iniciarCheckoutInput = z.object({
  email: z.string().email(),
  items: z
    .array(
      z.object({
        productId: z.string().cuid(),
        cantidad: z.number().int().min(1).max(MAX_CANTIDAD_POR_ITEM),
        /**
         * Opción de pack elegida, SOLO para productos modalidad SOBRE (F07/D3). Es lo ÚNICO que el
         * cliente aporta sobre el precio, y ni siquiera es el precio: es un id que SELECCIONA entre
         * las opciones ACTIVAS de ESE producto (que ya está scopeado por el tenant del subdominio,
         * I1). El monto y el tamaño del pack los lee el server de la fila vigente y los congela en
         * el `OrderItem` (I4) — un `precio` que viaje del cliente no existe en este input y no debe
         * existir nunca.
         *
         * Opcional porque un producto ESTANDAR no lleva ninguna; que FALTE en un sobre (o que
         * SOBRE en un estándar) lo rechaza el use case con mensaje, no Zod: la modalidad es un dato
         * de la DB y el schema no la conoce.
         */
        packOptionId: z.string().cuid().optional(),
      }),
    )
    .min(1)
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      { message: "Cada producto puede aparecer una sola vez en la orden." },
    ),
  respuestas: z
    .array(
      z.object({
        clave: z.string().min(1).max(MAX_LARGO_CLAVE),
        // Shape LAXO a propósito: el `valor` llega como lo emite el input de Mantine que le tocó
        // (texto, número del NumberInput, booleano del Checkbox, `null` de un Select limpiado). El
        // TIPO no viaja — el server lo lee de la definición vigente y valida contra ella (I3).
        valor: z.union([
          z.string().max(MAX_LARGO_VALOR),
          z.number(),
          z.boolean(),
          z.null(),
        ]),
      }),
    )
    .max(MAX_RESPUESTAS)
    .default([])
    .refine(
      (respuestas) =>
        new Set(respuestas.map((r) => r.clave)).size === respuestas.length,
      { message: "Cada campo puede responderse una sola vez." },
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

/**
 * Input del estado de una orden por su token de Flow (builder-tanda-1 F08/D12). El `token` es el que
 * viaja en la URL de retorno de Flow (opaco). El `tenantId` sale del contexto (I1), jamás del input.
 * La respuesta es solo el estado enum, sin PII (I-T6).
 */
export const getEstadoOrdenInput = z.object({
  token: z.string().min(1).max(256),
});

export type GetEstadoOrdenInput = z.infer<typeof getEstadoOrdenInput>;
