/**
 * **Baja de avisos one-click** (F05, RFC 8058 + D3/I5). Todo lo que rodea al enlace de baja:
 * cómo se arma su URL, qué cabeceras lleva el correo y cuál es el texto del enlace visible.
 *
 * Vive junto —y no repartido entre la plantilla y el endpoint— porque las tres piezas tienen que
 * apuntar al MISMO sitio: si la cabecera y el enlace visible se separan, un cliente de correo da de
 * baja por un camino y el otro queda muerto, y el Comprador que no logra darse de baja marca spam.
 *
 * ── Qué NO va acá ──────────────────────────────────────────────────────────────────────────────
 * La supresión en sí (el efecto) vive en `preferenciasDeCorreo.ts`, y la política del borde
 * (método, token desconocido, idempotencia) en `server/correo/bajaCorreo.ts`. Esto es solo el
 * vocabulario del enlace.
 */

/**
 * Ruta del endpoint público de baja. Un solo lugar, porque la escriben tres: el correo (link
 * visible), la cabecera `List-Unsubscribe` y el propio wrapper Next
 * (`pages/api/correo/baja/[token].ts`), que tiene que existir en ESTA ruta o el enlace es un 404.
 */
export const RUTA_BAJA = "/api/correo/baja";

/**
 * URL absoluta de baja para un token. Absoluta y no relativa: un correo no tiene contra qué
 * resolver un path — es la misma razón por la que el logo del layout exige URL absoluta.
 *
 * El `baseUrl` es el de la PLATAFORMA (`APP_URL`), no el subdominio de la Tienda: el token es
 * unique global y rutea token ⇒ fila ⇒ tenant, exactamente como `/api/descargas/<token>`.
 */
export function urlDeBaja({
  baseUrl,
  token,
}: {
  baseUrl: string;
  token: string;
}): string {
  return `${baseUrl.replace(/\/+$/, "")}${RUTA_BAJA}/${encodeURIComponent(token)}`;
}

/**
 * Cabeceras del one-click unsubscribe (RFC 8058). Van **SOLO en los correos de avisos** (I5): un
 * `List-Unsubscribe` en la confirmación de una compra le declara a Gmail que ese correo es
 * promocional y que el Comprador puede dejar de recibirlo — y no puede: es transaccional, sale
 * siempre.
 *
 * Las dos cabeceras van JUNTAS y no se pueden separar: `List-Unsubscribe-Post` es lo que le dice al
 * proveedor «esta URL acepta el POST del botón de un solo click»; sin ella, Gmail no muestra el
 * botón nativo y la URL queda solo como enlace. Por eso esta función devuelve el PAR y no una a la
 * vez.
 *
 * El `mailto:` alternativo que RFC 8058 permite se OMITE a propósito: el buzón de envío es
 * `no-reply` y no lo lee nadie, así que ofrecerlo sería prometer un canal muerto.
 */
export function cabecerasDeAvisos({
  urlBaja,
}: {
  urlBaja: string;
}): Record<string, string> {
  return {
    // Los `<>` son parte de la sintaxis de la cabecera (RFC 2369), no decoración.
    "List-Unsubscribe": `<${urlBaja}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * Texto del enlace de baja VISIBLE en el cuerpo. El botón nativo del cliente de correo (el de las
 * cabeceras de arriba) no lo muestran todos los buzones, así que el enlace también va escrito: la
 * alternativa real a no encontrar cómo darse de baja es marcar spam, y eso lo paga el dominio
 * compartido por TODAS las Tiendas (I2).
 */
export const TEXTO_ENLACE_BAJA = "No quiero estos recordatorios";
