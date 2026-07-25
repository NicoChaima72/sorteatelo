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
  // `portadaUrl` MURIÓ como input de texto (plantilla-rica D4/I6, espejo de `logoUrl`): la portada
  // es un asset del bucket público que se SUBE (crearUrlSubidaImagen+confirmarImagenSubida). La
  // columna `Product.portadaUrl` la escribe SOLO el flujo de subida tras headObject — cerrar el
  // vector de una URL externa arbitraria en un campo que ahora es propaganda pública del storefront.
  // Opt-in al sorteo (ADR-0012/D1): comprarlo genera Tickets. Default false vía el form; se
  // persiste tal cual en el Product (scoped por tenant, nunca del input el tenantId, I1).
  participaEnSorteo: z.boolean(),
});
export type CrearProductoInput = z.infer<typeof crearProductoInput>;

export const actualizarProductoInput = z.object({
  id: z.string().cuid(),
  titulo: z.string().trim().min(1, "El título es obligatorio").max(200),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(2000),
  precio: precioClp,
  // `portadaUrl` fuera del input (D4/I6): editar el producto NO toca la portada; la sobrescribe el
  // flujo de subida. Ver `crearProductoInput`.
  activo: z.boolean(),
  participaEnSorteo: z.boolean(), // ADR-0012/D1 — editable en el panel; el snapshot al comprar es de OrderItem
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

/**
 * Alta de un sorteo desde el panel (F01/D3/D4/D13). NO lleva `tenantId` (sale del acceso, I1).
 * `fechaFin` como `z.coerce.date()` (superjson envía Date; el use case valida "futura" con mensaje
 * humano). `basesUrl` es un enlace INFORMATIVO opcional del sorteo (distinto del `Tenant.basesSorteo`
 * legal del gate, D7). `premioImageUrl` y `fechaInicio` NO van acá: la imagen se sube tras crear con
 * el `AssetUploader` (D5) y `fechaInicio = ahora` server-side (D3). `importarDesdeRaffleId` opcional
 * arrastra los participantes de un sorteo pasado del MISMO tenant (D13).
 */
export const crearSorteoInput = z.object({
  nombre: z.string().trim().min(1, "El nombre del sorteo es obligatorio").max(200),
  premio: z.string().trim().min(1, "El premio es obligatorio").max(200),
  fechaFin: z.coerce.date(),
  basesUrl: z.string().trim().url("Ingresa un enlace válido").optional().or(z.literal("")),
  importarDesdeRaffleId: z.string().cuid().optional(),
});
export type CrearSorteoInput = z.infer<typeof crearSorteoInput>;

/**
 * Edición del sorteo ACTIVO y NO ejecutado (F02/D6). Solo `nombre`/`premio`/`fechaFin`/`basesUrl`
 * (NO `estado`, NO `premioImageUrl` que va por el AssetUploader, NO campos de ejecución). El
 * `raffleId` del input se valida SIEMPRE contra el tenant resuelto server-side (I1/I4).
 */
export const editarSorteoInput = z.object({
  raffleId: z.string().cuid(),
  nombre: z.string().trim().min(1, "El nombre del sorteo es obligatorio").max(200),
  premio: z.string().trim().min(1, "El premio es obligatorio").max(200),
  fechaFin: z.coerce.date(),
  basesUrl: z.string().trim().url("Ingresa un enlace válido").optional().or(z.literal("")),
});
export type EditarSorteoInput = z.infer<typeof editarSorteoInput>;

export const guardarConfiguracionTiendaInput = z.object({
  descripcion: z.string().trim().max(2000).optional().or(z.literal("")),
  // `logoUrl` MURIÓ como input de texto (plantilla-rica D4/I6): el logo se SUBE como asset (bucket
  // público, ADR-0013) vía crearUrlSubidaImagen+confirmarImagenSubida — la columna la escribe SOLO
  // el flujo de subida, nunca un input de texto arbitrario. Idem heroImageUrl/portadaUrl/premioImageUrl.
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
  // Redes y contacto del footer (plantilla-rica F02/F03/D2). Opcionales; vacío ⇒ null (el footer
  // oculta el ícono/línea, D7). URLs validadas como URL; el contacto como email.
  instagramUrl: z.string().trim().url().optional().or(z.literal("")),
  tiktokUrl: z.string().trim().url().optional().or(z.literal("")),
  whatsappUrl: z.string().trim().url().optional().or(z.literal("")),
  contactoEmail: z.string().trim().email().optional().or(z.literal("")),
});
export type GuardarConfiguracionTiendaInput = z.infer<
  typeof guardarConfiguracionTiendaInput
>;

/**
 * Subida de un asset de marca al bucket PÚBLICO (plantilla-rica F03/ADR-0013): el cliente pide una
 * URL prefirmada para SU destino — NUNCA elige la key (la computa el server per-destino, D3/I6) ni
 * manda el `tenantId` (sale del acceso, I1). El `contentType` va contra la allowlist de imágenes
 * (D6). Discriminado por `destino`: portada exige `productId`, premio exige `raffleId`; logo/hero no.
 */
const contentTypeImagen = z.enum(["image/png", "image/jpeg", "image/webp"]);

const destinoImagen = z.discriminatedUnion("destino", [
  z.object({ destino: z.literal("logo") }),
  z.object({ destino: z.literal("hero") }),
  z.object({ destino: z.literal("portada"), productId: z.string().cuid() }),
  z.object({ destino: z.literal("premio"), raffleId: z.string().cuid() }),
]);

export const crearUrlSubidaImagenInput = z.intersection(
  destinoImagen,
  z.object({ contentType: contentTypeImagen }),
);
export type CrearUrlSubidaImagenInput = z.infer<
  typeof crearUrlSubidaImagenInput
>;

/** Confirmación de la subida de un asset (plantilla-rica F03): headObject + persiste la URL pública. */
export const confirmarImagenSubidaInput = destinoImagen;
export type ConfirmarImagenSubidaInput = z.infer<
  typeof confirmarImagenSubidaInput
>;
