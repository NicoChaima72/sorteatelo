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
 * `pdfPath` es el SEAM de F03: en F05 no hay subida real de archivos (I6). El Organizador
 * ingresa/edita la ruta como texto claramente marcado "la subida real llega con F03".
 */
const pdfPath = z
  .string()
  .trim()
  .min(1, "Indica la ruta del PDF (la subida real llega con F03)");

export const crearProductoInput = z.object({
  titulo: z.string().trim().min(1, "El título es obligatorio").max(200),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(2000),
  precio: precioClp,
  pdfPath,
  portadaUrl: z.string().trim().url().optional().or(z.literal("")),
});
export type CrearProductoInput = z.infer<typeof crearProductoInput>;

export const actualizarProductoInput = z.object({
  id: z.string().cuid(),
  titulo: z.string().trim().min(1, "El título es obligatorio").max(200),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(2000),
  precio: precioClp,
  pdfPath,
  portadaUrl: z.string().trim().url().optional().or(z.literal("")),
  activo: z.boolean(),
});
export type ActualizarProductoInput = z.infer<typeof actualizarProductoInput>;

/** Listado de ventas del panel, paginado por cursor (backend-conventions § Paginación). */
export const listarVentasInput = z.object({
  cursor: z.string().cuid().nullish(),
});
export type ListarVentasInput = z.infer<typeof listarVentasInput>;

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
});
export type GuardarConfiguracionTiendaInput = z.infer<
  typeof guardarConfiguracionTiendaInput
>;
