/**
 * Plantilla PURA del correo de descarga (F04/D5/D6). Sin `db`, sin red, sin `env`: recibe los
 * datos ya derivados de la orden y devuelve el `{ from, subject, text, html }` listo para el
 * `CorreoService`. Testeable sin infraestructura.
 *
 * Contenido (D5, ADR-0010/0008): saludo, nombre de la Tienda, lista `título → enlace` (un ítem
 * por grant/producto), aviso de expiración, indicación de pedir reenvío respondiendo el correo, y
 * el DISCLAIMER de responsabilidad — el Comprador le compró al Organizador (la Tienda), responsable
 * de la venta y del sorteo; la Plataforma solo provee la infraestructura técnica.
 *
 * Español neutro ("puedes", "tienes"). Texto plano SIEMPRE (entregabilidad) + HTML mínimo inline
 * (sin `react-email` — S8). El correo JAMÁS expone `pdfPath` ni keys del bucket: solo los enlaces
 * `/api/descargas/<token>` que arma el use case.
 */

/**
 * Nombre visible de la Plataforma en el remitente y el disclaimer (marca "Sortéatelo",
 * dominio sorteatelo.cl — ADR-0014) — UN solo lugar para cambiarlo (D6).
 */
export const MARCA_PLATAFORMA = "Sortéatelo";

/**
 * Remitente real del correo transaccional: dominio `sorteatelo.cl` VERIFIED en Resend (ADR-0014/0015).
 * UN solo lugar para cambiarlo (D6). Buzón no monitoreado; el reply-to del Organizador va aparte.
 */
export const REMITENTE_CORREO = "no-reply@sorteatelo.cl";

export interface ItemDescarga {
  titulo: string;
  /** Enlace `<baseUrl>/api/descargas/<token>` (lo arma el use case; acá solo se renderiza). */
  enlace: string;
}

export interface CorreoDescargaArmado {
  from: string;
  subject: string;
  text: string;
  html: string;
}

// Caracteres de control (0x00–0x1F y 0x7F) como constante, para no incrustar bytes de control en
// la expresión regular (mismo criterio que `services/storage.ts`).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f]", "g");

/**
 * Sanea el nombre de la Tienda para interpolarlo en el `from`/`subject` del correo (una línea de
 * cabecera): quita caracteres de control / saltos de línea (anti header-injection) y colapsa
 * espacios. El nombre lo controla el Organizador dueño del tenant, pero no confiamos: un `\r\n` en
 * un `from` podría malformar la cabecera. El `text`/`html` se escapan aparte (`escaparHtml`).
 */
function sanearNombreEnCabecera(nombreTienda: string): string {
  const limpio = nombreTienda.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  return limpio.length > 0 ? limpio : MARCA_PLATAFORMA;
}

/**
 * `from` con nombre: `<Tienda> · vía <Marca> <remitente>` (D6). El correo sale "en nombre de" la
 * Tienda pero desde el remitente de la Plataforma — el Comprador ve de quién compró (ADR-0008/0010).
 */
export function construirFrom(nombreTienda: string): string {
  return `${sanearNombreEnCabecera(nombreTienda)} · vía ${MARCA_PLATAFORMA} <${REMITENTE_CORREO}>`;
}

/** Escapa los 5 caracteres peligrosos de HTML (los datos del tenant/producto se interpolan). */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function armarCorreoDescarga({
  nombreTienda,
  items,
  diasExpiracion,
}: {
  nombreTienda: string;
  items: ItemDescarga[];
  diasExpiracion: number;
}): CorreoDescargaArmado {
  const from = construirFrom(nombreTienda);
  // El subject es también una cabecera: se sanea igual que el from (anti header-injection).
  const subject = `Tu compra en ${sanearNombreEnCabecera(nombreTienda)}: enlaces de descarga`;

  const disclaimer =
    `Compraste en ${nombreTienda} a través de ${MARCA_PLATAFORMA}. ${nombreTienda} es ` +
    `responsable de la venta y del sorteo asociado; ${MARCA_PLATAFORMA} solo provee la ` +
    `infraestructura técnica.`;

  const avisoExpiracion =
    `Estos enlaces vencen en ${diasExpiracion} días. Si necesitas que te los reenviemos, ` +
    `responde este correo y ${nombreTienda} podrá ayudarte.`;

  // ── Texto plano ──────────────────────────────────────────────────────────────
  const lineasText = items
    .map((it) => `- ${it.titulo}: ${it.enlace}`)
    .join("\n");
  const text = [
    `Hola,`,
    ``,
    `Gracias por tu compra en ${nombreTienda}. Ya puedes descargar lo que compraste:`,
    ``,
    lineasText,
    ``,
    avisoExpiracion,
    ``,
    `—`,
    disclaimer,
  ].join("\n");

  // ── HTML mínimo inline ───────────────────────────────────────────────────────
  const lineasHtml = items
    .map(
      (it) =>
        `<li><a href="${escaparHtml(it.enlace)}">${escaparHtml(it.titulo)}</a></li>`,
    )
    .join("");
  const tiendaHtml = escaparHtml(nombreTienda);
  const html = [
    `<p>Hola,</p>`,
    `<p>Gracias por tu compra en <strong>${tiendaHtml}</strong>. Ya puedes descargar lo que compraste:</p>`,
    `<ul>${lineasHtml}</ul>`,
    `<p>${escaparHtml(avisoExpiracion)}</p>`,
    `<hr />`,
    `<p style="color:#666;font-size:13px">${escaparHtml(disclaimer)}</p>`,
  ].join("");

  return { from, subject, text, html };
}
