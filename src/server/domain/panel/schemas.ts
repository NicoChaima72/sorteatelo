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
 * Cuántas unidades del contenido de la fuente entrega un PACK (ENMIENDA v2, E15).
 *
 * Entero ≥1 con tope 50: no es una restricción del dominio sino un cinturón contra el dedo pesado —
 * un pack de 5.000 unidades no es un producto, es una colección entera, y el gate «la fuente
 * alcanza» volvería el pack inactivable sin que se entienda por qué. El tope real lo pone ese gate.
 *
 * `.default(1)` para que un producto NORMAL no tenga que mandarlo: 1 es un hecho verdadero (vende 1
 * unidad de sí mismo), igual que en la columna. Ojo: el default NO es la garantía del invariante
 * «sin fuente ⇒ 1» — esa la impone el use case escribiendo el valor derivado, porque un cliente a
 * mano puede mandar `{fuenteId: null, unidadesPorPack: 5}` y eso serían 5 tickets por 1 archivo.
 */
const unidadesPorPackDeUnPack = z
  .number()
  .int("Las unidades del pack tienen que ser un número entero")
  .min(1, "El pack tiene que entregar al menos 1 archivo")
  .max(50, "Un pack de más de 50 archivos es demasiado grande")
  .default(1);

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
  // Modalidad de venta (F05/F06, D2/D9): lo ÚNICO que el Organizador declara sobre la forma del
  // producto (el TIPO de archivo lo deriva el server del MIME, D9). `ESTANDAR` = un archivo fijo;
  // `SOBRE` = pool con asignación aleatoria por compra.
  //
  // Se elige al CREAR y no se edita después: `actualizarProductoInput` no la acepta a propósito. Un
  // cambio de modalidad sobre un producto que ya tiene pool y opciones rompería el invariante
  // "ESTANDAR ⇒ exactamente 1 archivo confirmado" (F02) y dejaría opciones de pack huérfanas, y las
  // reglas de esa migración (¿qué archivo del pool sobrevive? ¿qué pasa si ya se vendió?) son
  // decisión de producto, no algo que el implementer pueda inventar. Un producto recién creado con
  // la modalidad equivocada se borra y se crea de nuevo.
  modalidad: z.enum(["ESTANDAR", "SOBRE"]),
  // ── Un pack es un producto más (ENMIENDA v2, E13/E15) ──────────────────────
  // `fuenteId` = de dónde salen los archivos que entrega. `null` (el default) ⇒ producto normal:
  // entrega los suyos, exactamente como siempre. No-null ⇒ es un PACK y entrega `unidadesPorPack`
  // del contenido de ESE producto.
  //
  // El id SELECCIONA entre los productos de la Tienda ya resuelta server-side; quién es fuente
  // válida (mismo tenant, no es a su vez un pack) lo decide `resolverFuenteDePack`, no este schema
  // (I1 — el input jamás autoriza).
  fuenteId: z.string().cuid().nullable().default(null),
  unidadesPorPack: unidadesPorPackDeUnPack,
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
  // `unidadesPorPack` SÍ es editable (E15): subir un «Pack 4 libros» a 6 es un cambio de producto
  // normal, y la historia la protege el snapshot del `OrderItem` (las órdenes viejas conservan el
  // pack que se compró). El use case lo IGNORA si el producto no es un pack — ver ahí por qué.
  unidadesPorPack: unidadesPorPackDeUnPack,
  // `fuenteId` NO está acá y es deliberado (V-I1c): la fuente se elige al CREAR y no se edita, mismo
  // patrón que `modalidad`. Re-apuntar un pack a otra fuente cambiaría en silencio QUÉ compró la
  // gente que ya lo compró, y las reglas de esa migración (¿qué pasa con las asignaciones ya
  // sorteadas?) son decisión de producto, no algo que el implementer pueda inventar.
});
export type ActualizarProductoInput = z.infer<typeof actualizarProductoInput>;

/**
 * Subida de un ARCHIVO de producto (productos-tipos-digitales F02, D1/D9). Generaliza a
 * `crearUrlSubidaPdfInput`, que era PDF-only y ni siquiera declaraba el tipo.
 *
 * El cliente NUNCA elige la key (la computa el server con `keyDeArchivoProducto`, I6) ni manda el
 * `tenantId` (sale del acceso, I1). Aporta tres cosas: qué producto, qué MIME reporta el navegador
 * y con qué nombre mostrar el archivo.
 *
 * `contentType` es un `z.string()` y NO un `z.enum(MIMES_ARCHIVO_PRODUCTO)` a propósito: el
 * navegador manda ALIAS reales (`application/x-zip-compressed` en Windows, `audio/x-m4a` en
 * Safari) que un enum del set canónico rechazaría con un falso negativo. La allowlist la aplica
 * `resolverTipoArchivo` en el use case, que además normaliza el alias — un solo lugar donde vive
 * la política (D1/I4), en vez de dos definiciones que pueden discrepar. El largo acotado evita que
 * entre un header absurdo.
 *
 * `nombreArchivo` es SOLO para mostrar/descargar: el server lo sanea y le impone la extensión del
 * MIME validado. No influye en la key ni en el tipo (D9).
 */
export const crearUrlSubidaArchivoInput = z.object({
  productId: z.string().cuid(),
  contentType: z.string().trim().min(1).max(120),
  nombreArchivo: z.string().trim().min(1).max(200),
});
export type CrearUrlSubidaArchivoInput = z.infer<typeof crearUrlSubidaArchivoInput>;

/**
 * Confirmación de la subida (F02/D7): `statObject` verifica existencia + tamaño (≤20 MB) y marca
 * la fila entregable. Referencia el ARCHIVO por su id (no el producto): un sobre tiene M archivos
 * y hay que poder confirmar exactamente el que se acaba de subir.
 */
export const confirmarArchivoProductoInput = z.object({
  fileId: z.string().cuid(),
});
export type ConfirmarArchivoProductoInput = z.infer<
  typeof confirmarArchivoProductoInput
>;

/**
 * Borrado de un archivo del producto (F06/D4/I7): una lámina del pool de un sobre, o el archivo de un
 * producto estándar. Solo el `fileId` — la Tienda sale del acceso (I1) y el use case decide si el
 * borrado es admisible (sin asignaciones, y sin dejar sin entregar a un producto que está a la venta).
 */
export const borrarArchivoDeProductoInput = z.object({
  fileId: z.string().cuid(),
});
export type BorrarArchivoDeProductoInput = z.infer<
  typeof borrarArchivoDeProductoInput
>;

/**
 * Los inputs de OPCIONES DE PACK (`crearOpcionDePackInput`/`actualizarOpcionDePackInput`/
 * `borrarOpcionDePackInput`) MURIERON el 2026-07-26 con la ENMIENDA v2 (E13/E14): un pack ya no es
 * una «opción» dentro de un sobre sino un PRODUCTO más, así que se crea y se edita con
 * `crearProductoInput`/`actualizarProductoInput` como cualquier otro. Ver `fuenteDeArchivos.ts`.
 */

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
  /**
   * Prefijo de los Números del sorteo de esta Tienda (F08/D12): `ARMY` ⇒ `ARMY-1043`. Identidad de
   * la Tienda —como el logo y los colores— y por eso se edita en esta misma card.
   *
   * Se guarda DESNUDO: el «-» lo pone el formateador (`~/lib/numerosDelSorteo`), así que `ARMY-` es
   * inválido a propósito — si se aceptara, la mitad de las tiendas guardaría el guion y la otra
   * mitad no, y la salida sería `ARMY--1043` para unas y `ARMY-1043` para otras.
   *
   * La normalización a MAYÚSCULAS vive ACÁ y no en el formulario porque este esquema es el borde
   * COMPARTIDO por las dos puertas a la columna (el panel y la tool MCP `configurar_tienda`, misma
   * lección que `colorPrimario`/`colorAcento`): con la normalización en el componente, un guardado
   * por MCP escribiría minúsculas y el mismo tenant mostraría `army-1043` en una superficie y
   * `ARMY-1043` en otra.
   *
   * Solo `[A-Za-z0-9]`: el prefijo se imprime en el correo y en el panel, y acotarlo a ASCII
   * alfanumérico lo deja utilizable en cualquier superficie futura (incluidos los `tags` de Resend,
   * que rechazan tildes y espacios con un 422 de TODO el lote). El tope de 8 es cosmético —un
   * prefijo largo empuja el rango fuera de la columna del panel—, no una restricción del dominio.
   */
  prefijoTicket: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9]{1,8}$/,
      "Usa entre 1 y 8 letras o números, sin espacios ni símbolos (el «-» lo agregamos nosotros)",
    )
    .transform((v) => v.toUpperCase())
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
  /**
   * Identidad legal del Organizador (F05/D6, ADR-0008): nombre o razón social de quien responde por
   * la venta y el sorteo. Se imprime en el PIE de todo correo al Comprador — el disclaimer dice el
   * reparto de responsabilidades y esto dice QUIÉN es la parte responsable (un nombre de fantasía
   * no identifica a nadie ante un reclamo).
   *
   * TEXTO LIBRE acotado en largo y nada más: no se valida forma de RUT ni de razón social. Un
   * Organizador puede ser una persona natural, una EIRL o una SpA, y en el pie lo que hace falta es
   * un nombre reconocible, no un dato tributario parseable (eso sería otro plan). Vacío ⇒ null ⇒ el
   * pie no dibuja la línea.
   */
  identidadLegal: z.string().trim().max(200).optional().or(z.literal("")),
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
