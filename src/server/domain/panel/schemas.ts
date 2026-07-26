import { z } from "zod";

/**
 * Inputs del panel de Organizadores (F05). NINGUNO lleva `tenantId`: la Tienda sobre la
 * que se opera se resuelve SERVER-SIDE con `resolverTenantDelPanel(ctx.acceso)` a
 * partir de la MEMBRESÍA (I1/ADR-0005; lección H1 de datawalt-app).
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
 * Tienda se resuelve server-side con `resolverTenantDelPanel` (I1), jamás del input.
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
 * humano). `fechaInicio = ahora` server-side (D3). `importarDesdeRaffleId` opcional arrastra los
 * participantes de un sorteo pasado del MISMO tenant (D13).
 *
 * NINGÚN asset va acá — ni `premioImageUrl` ni `basesPdfUrl`: ambos se SUBEN tras crear (la key es
 * per-raffle y necesita el id), y sus columnas las escribe SOLO el flujo presigned PUT + `headObject`
 * (I2/I6). El enlace externo `basesUrl` MURIÓ como input con admin-bases-pdf D2/D3: las bases legales
 * son SIEMPRE un PDF del Sorteo, no una URL arbitraria que el Organizador tipea (mismo criterio que
 * mató `portadaUrl`/`logoUrl` como inputs de texto en plantilla-rica D4/I6). Las bases son OPCIONALES
 * al crear: el gate de publicación las exige recién al publicar con un sorteo ACTIVO (F03/ADR-0008).
 */
export const crearSorteoInput = z.object({
  nombre: z.string().trim().min(1, "El nombre del sorteo es obligatorio").max(200),
  premio: z.string().trim().min(1, "El premio es obligatorio").max(200),
  fechaFin: z.coerce.date(),
  importarDesdeRaffleId: z.string().cuid().optional(),
});
export type CrearSorteoInput = z.infer<typeof crearSorteoInput>;

/**
 * Edición del sorteo ACTIVO y NO ejecutado (F02/D6). Solo `nombre`/`premio`/`fechaFin` (NO `estado`,
 * NO los assets `premioImageUrl`/`basesPdfUrl` que van por sus uploaders, NO campos de ejecución). El
 * `raffleId` del input se valida SIEMPRE contra el tenant resuelto server-side (I1/I4). REEMPLAZAR
 * las bases no es editar un campo: es re-subir el PDF sobre la misma key (admin-bases-pdf F02/D2).
 */
export const editarSorteoInput = z.object({
  raffleId: z.string().cuid(),
  nombre: z.string().trim().min(1, "El nombre del sorteo es obligatorio").max(200),
  premio: z.string().trim().min(1, "El premio es obligatorio").max(200),
  fechaFin: z.coerce.date(),
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
  // El SEGUNDO color de marca (builder-tanda-1 F01/D2) se edita también acá, junto al primario
  // (admin-bases-pdf F06/D7/D12): la marca base de la Tienda deja de estar partida entre el admin y
  // el editor. NO es una vía de persistencia nueva — `Tenant.colorAcento` es una COLUMNA (vive fuera
  // del Documento, I-T1), la misma que escribe `pagebuilder.setColorAcento` desde el editor; acá
  // entra por el mismo `update` que ya escribe `colorPrimario`. Misma regex que el primario y que
  // `setColorAcentoInput`: las dos puertas a la misma columna no pueden discrepar sobre qué es un
  // color válido. Vacío ⇒ null ⇒ los esquemas `acento*` degradan a la escala de marca (I-T2).
  colorAcento: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Usa un color hex (ej. #ffc530)")
    .optional()
    .or(z.literal("")),
  // `basesSorteo` MURIÓ como campo de configuración (admin-bases-pdf F03/D2/D3): las bases legales
  // son SIEMPRE un PDF y viven en el SORTEO (`Raffle.basesPdfUrl`), no como texto de la Tienda. Un
  // cliente viejo que siga mandando el textarea ve su campo DESCARTADO acá (no está en el schema) y
  // la columna no se escribe — no puede resucitar el texto mientras la columna vive (muere en F07).
  // `heroTitulo`/`heroSubtitulo`/`avisoTexto` (y el asset `heroImageUrl`) MURIERON como campos de
  // configuración (admin-bases-pdf F06/D7): el storefront lee TODO del Documento de Página desde el
  // page builder, así que editarlos acá guardaba con un toast de éxito y no cambiaba nada. El hero y
  // el aviso se editan en el EDITOR de la tienda. Sus columnas se dropean en F07 (script F05 corrido).
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
  // El destino `hero` MURIÓ con la card «Tu tienda» (admin-bases-pdf F06/D7): la imagen del hero es
  // del Documento de Página y se sube desde el EDITOR (destino `pagina`, modelo `PageAsset`). Dejarlo
  // acá sería mantener viva una puerta que escribe una columna que F07 dropea.
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

/**
 * Subida del PDF de BASES del Sorteo al bucket PÚBLICO (admin-bases-pdf F01, D1/D2, ADR-0008/0013).
 * Destino `bases`: el ÚNICO del bucket público que admite `application/pdf` (I1) — por eso vive en su
 * propio par de inputs y NO dentro del `destinoImagen` discriminado (mezclarlos abriría `application/pdf`
 * a logo/hero/portada/premio). El cliente solo referencia el SORTEO por id: nunca elige la key (la
 * computa el server con `keyBasesSorteo`, I6) ni manda `tenantId` (sale del acceso, I1) ni la URL final.
 * `contentType` es un `z.literal` — el enum de un solo valor deja explícito que no hay allowlist que
 * ampliar acá; el service lo re-valida antes de firmar (defensa en profundidad).
 */
export const crearUrlSubidaBasesInput = z.object({
  raffleId: z.string().cuid(),
  contentType: z.literal("application/pdf"),
});
export type CrearUrlSubidaBasesInput = z.infer<typeof crearUrlSubidaBasesInput>;

/** Confirmación de la subida de las bases (F01): headObject + persiste `Raffle.basesPdfUrl`. */
export const confirmarBasesSubidasInput = z.object({
  raffleId: z.string().cuid(),
});
export type ConfirmarBasesSubidasInput = z.infer<
  typeof confirmarBasesSubidasInput
>;
