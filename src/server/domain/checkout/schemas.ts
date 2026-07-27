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
 * **Los ítems de un carrito**: `{productId, cantidad}` y NADA más. Es el contrato compartido por las
 * dos superficies que miran el mismo carrito — `iniciarCheckout` (que COBRA) y `cotizarCarrito` (que
 * solo MUESTRA el total, F01 de `storefront-carrito-total-y-drawer`).
 *
 * Está extraído a una constante y no duplicado a propósito: si la cotización aceptara un carrito que
 * el checkout rechaza (o al revés), el Comprador vería un total para algo que después no puede pagar
 * — que es exactamente el defecto que la cotización vino a cerrar. Un solo schema ⇒ un solo veredicto.
 *
 * Lo que NO tiene, y no debe tener nunca, es un precio: el monto sale siempre de la fila vigente del
 * `Product` (I4). El `refine` garantiza un `productId` único por carrito — una línea por producto
 * (`@@unique([orderId, productId])`), con la cantidad en la línea y no en filas repetidas.
 */
const itemsDeCarrito = z
  .array(
    z.object({
      productId: z.string().cuid(),
      cantidad: z.number().int().min(1).max(MAX_CANTIDAD_POR_ITEM),
      /*
        `packOptionId` MURIÓ acá con la ENMIENDA v2 (E13). El carrito volvió a ser
        `{productId, cantidad}` y punto: un pack es un PRODUCTO más, así que elegir «4 stickers»
        es elegir un `productId`, no un producto + una opción adentro. Lo que se gana no es solo
        simplicidad de input — es que el cliente dejó de aportar NADA sobre el precio: el monto y
        el tamaño del pack salen los dos de la fila del producto y se congelan en el `OrderItem`
        (I4). Un `precio` que viaje del cliente no existe en este input y no debe existir nunca.
      */
    }),
  )
  .min(1)
  .refine(
    (items) => new Set(items.map((i) => i.productId)).size === items.length,
    { message: "Cada producto puede aparecer una sola vez en la orden." },
  );

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
  items: itemsDeCarrito,
  /**
   * Consentimiento de recordatorios del sorteo (F05/D5, CONTEXT § Consentimiento de recordatorios).
   *
   * **Un booleano y nada más.** Ni el texto que se mostró ni la fecha ni la IP viajan del cliente:
   * el server los pone desde `TEXTO_CONSENTIMIENTO_RECORDATORIOS` y del propio request. Dejar que
   * el navegador mande el texto de la prueba sería dejar que el evaluado escriba su propio
   * descargo — y la Ley 21.719 pide consentimiento DEMOSTRABLE.
   *
   * **Opcional, y sin `default(false)` a propósito**: la mitad de servidor del «jamás premarcado»
   * no vive en el schema sino en el use case, que exige `=== true` para escribir. Un default de Zod
   * solo protege el borde tRPC; el `=== true` protege también a cualquier caller que no pase por
   * acá (un test, un script futuro). La ausencia de la clave ES el «no», por las dos vías.
   *
   * NO es un [[Campo de checkout]]: es de PLATAFORMA, no configurable por el Organizador (que si
   * no podría borrarlo, renombrarlo o volverlo obligatorio).
   */
  aceptaRecordatorios: z.boolean().optional(),
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
 * Input de la **cotización del carrito** (F01): los mismos ítems del checkout y nada más — sin
 * correo (no hay compra que identificar) y sin `tenantId`, que sale del subdominio (I1/ADR-0005).
 *
 * Comparte `itemsDeCarrito` con `iniciarCheckoutInput` a propósito: el total que se muestra y el que
 * se cobra tienen que hablar del mismo carrito. Mismo tope de cantidad, misma unicidad, mismo cero
 * aporte del cliente sobre el precio.
 */
export const cotizarCarritoInput = z.object({ items: itemsDeCarrito });

export type CotizarCarritoInput = z.infer<typeof cotizarCarritoInput>;

/*
  `getProductoStorefrontInput` murió con su use case y con `/producto/[id]` (ENMIENDA v2, E2/F13):
  no queda detalle de producto que pedir — todo se agrega desde la tarjeta del catálogo (E1).
*/

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
 * La respuesta lleva el estado y —solo con la orden ya PAGADA— sus Números del sorteo con el prefijo
 * de la Tienda (F01/D1 de checkout-retorno-numeros-sorteo); nunca PII: ni correo, ni montos, ni ítems
 * (I-T6).
 */
export const getEstadoOrdenInput = z.object({
  token: z.string().min(1).max(256),
});

export type GetEstadoOrdenInput = z.infer<typeof getEstadoOrdenInput>;

/**
 * Input del **verificador público de tickets** (verificador-tickets F01/D1): el correo con el que
 * se compró, y NADA más. Sin `tenantId` (sale del subdominio, I1) y sin ninguna otra clave de
 * búsqueda — no se busca por número de ticket ni por código de orden (out of scope explícito).
 *
 * `.trim()` antes de `.email()` para que un espacio pegado al copiar desde el correo no se lea como
 * dirección inválida (D6; el use case vuelve a normalizar por su cuenta). El tope es el largo máximo
 * real de una dirección (RFC 5321): corta el payload absurdo sin opinar sobre direcciones legítimas.
 */
export const verificarTicketsInput = z.object({
  email: z.string().trim().min(1).max(254).email(),
});

export type VerificarTicketsInput = z.infer<typeof verificarTicketsInput>;
