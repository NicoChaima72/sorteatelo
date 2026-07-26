import { z } from "zod";

/**
 * Inputs del dominio de Tiendas (self-service del Organizador, F08). Como en `panel/schemas.ts`,
 * NINGUNO lleva `tenantId`/`userId`: el alta liga al `userId` del acceso server-side (I1) y el
 * resto de los use cases (aceptarTos/publicar/despublicar) resuelven su Tienda con
 * `resolverTenantDelPanel(ctx.acceso)`. La validación fina del slug (formato + reservados)
 * vive en el use case `crearTienda` (reusa `esSlugValido` + `esSlugReservado`), no acá — así el
 * error de negocio es específico y la definición del subdominio no se duplica (D7).
 */

/**
 * Alta de una Tienda. El slug se normaliza (trim + lowercase) porque ES un subdominio DNS
 * (ADR-0007, siempre minúsculas); la forma exacta la valida `crearTienda` con `esSlugValido`.
 * Los límites de longitud acá son un cerco barato (un label DNS es ≤63 chars).
 */
export const crearTiendaInput = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Elige un identificador para tu tienda")
    .max(63, "El identificador es demasiado largo (máx. 63 caracteres)"),
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre de la tienda es obligatorio")
    .max(120, "El nombre es demasiado largo"),
});
export type CrearTiendaInput = z.infer<typeof crearTiendaInput>;
