import { z } from "zod";

/**
 * Inputs del panel de Organizadores (F05). NINGUNO lleva `tenantId`: la Tienda sobre la
 * que se opera se resuelve SERVER-SIDE con `resolverTenantAutorizado(ctx.acceso, …)` a
 * partir de la membresía / flag Operador (I1/ADR-0005; lección H1 de datawalt-app). El
 * selector multi-tienda del Operador llega con F08 (S8).
 */

/** Precio en pesos chilenos ENTEROS como string (se persiste como `Decimal`, nunca `number`). */
const precioClp = z
  .string()
  .trim()
  .regex(/^\d+$/, "El precio debe ser un número entero de pesos (CLP)")
  .refine((v) => Number(v) > 0, "El precio debe ser mayor que 0");

/**
 * El seam de texto `pdfPath` de F05 MURIÓ con F03 (D4/I6): el cliente ya no escribe paths
 * (cerró el vector de un path arbitrario/ajeno como input). El `pdfPath` lo escribe SOLO
 * `confirmarPdfProducto` = key determinística `<tenantId>/<productId>.pdf`, computada
 * server-side. `crearProducto` nace con `pdfPath: null` (pendiente) y `activo: false`.
 */
export const crearProductoInput = z.object({
  titulo: z.string().trim().min(1, "El título es obligatorio").max(200),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(2000),
  precio: precioClp,
  portadaUrl: z.string().trim().url().optional().or(z.literal("")),
});
export type CrearProductoInput = z.infer<typeof crearProductoInput>;

export const actualizarProductoInput = z.object({
  id: z.string().cuid(),
  titulo: z.string().trim().min(1, "El título es obligatorio").max(200),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(2000),
  precio: precioClp,
  portadaUrl: z.string().trim().url().optional().or(z.literal("")),
  activo: z.boolean(),
});
export type ActualizarProductoInput = z.infer<typeof actualizarProductoInput>;

/**
 * Subida del PDF (F03/D4): el cliente pide una URL prefirmada para SU producto — NUNCA elige
 * la key (la computa el server con `keyDePdfProducto(tenantId, productId)`, I6) ni manda el
 * `tenantId` (sale del acceso, I1). Solo referencia el producto por id.
 */
export const crearUrlSubidaPdfInput = z.object({
  productId: z.string().cuid(),
});
export type CrearUrlSubidaPdfInput = z.infer<typeof crearUrlSubidaPdfInput>;

/** Confirmación de la subida (F03/D4): verifica con headObject y persiste `pdfPath`. */
export const confirmarPdfProductoInput = z.object({
  productId: z.string().cuid(),
});
export type ConfirmarPdfProductoInput = z.infer<typeof confirmarPdfProductoInput>;

/** Listado de ventas del panel, paginado por cursor (backend-conventions § Paginación). */
export const listarVentasInput = z.object({
  cursor: z.string().cuid().nullish(),
});
export type ListarVentasInput = z.infer<typeof listarVentasInput>;

/**
 * Reenvío del correo de descarga de una orden PAGADA (F04/D9). Solo referencia la orden por id: la
 * Tienda se resuelve server-side con `resolverTenantAutorizado` (I1), jamás del input.
 */
export const reenviarCorreoDescargaInput = z.object({
  orderId: z.string().cuid(),
});
export type ReenviarCorreoDescargaInput = z.infer<
  typeof reenviarCorreoDescargaInput
>;

export const guardarCredencialFlowInput = z.object({
  apiKey: z.string().trim().min(1, "Ingresa tu API Key de Flow"),
  secretKey: z.string().trim().min(1, "Ingresa tu Secret Key de Flow"),
  sandbox: z.boolean(),
});
export type GuardarCredencialFlowInput = z.infer<
  typeof guardarCredencialFlowInput
>;

export const ejecutarSorteoInput = z.object({
  raffleId: z.string().cuid(),
});
export type EjecutarSorteoInput = z.infer<typeof ejecutarSorteoInput>;

export const guardarConfiguracionTiendaInput = z.object({
  descripcion: z.string().trim().max(2000).optional().or(z.literal("")),
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  colorPrimario: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Usa un color hex (ej. #4f46e5)")
    .optional()
    .or(z.literal("")),
  basesSorteo: z.string().trim().max(20000).optional().or(z.literal("")),
  // Textos de la plantilla del storefront (F06/D4). Opcionales; vacío ⇒ null (el storefront
  // degrada con fallback a nombre/descripcion). El disclaimer del sorteo NO es un campo del
  // tenant (ADR-0008/D7) — no se edita acá.
  heroTitulo: z.string().trim().max(200).optional().or(z.literal("")),
  heroSubtitulo: z.string().trim().max(500).optional().or(z.literal("")),
  avisoTexto: z.string().trim().max(500).optional().or(z.literal("")),
});
export type GuardarConfiguracionTiendaInput = z.infer<
  typeof guardarConfiguracionTiendaInput
>;
