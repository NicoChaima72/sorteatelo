import { APP_CONFIG } from "~/config/app";
import { remitenteDeCorreo } from "~/config/correo";
import { TEXTO_ENLACE_BAJA } from "~/server/domain/correo/bajaDeAvisos";
import {
  bloquesDeNumerosDelSorteo,
  formatearNumerosDelSorteo,
} from "~/lib/numerosDelSorteo";
import { escaparHtml, sanearCabecera } from "~/server/domain/correo/_correoBase";
import { esHex, generarEscalaColor } from "~/styles/tenantTheme";

/**
 * LAYOUT compartido de los correos al Comprador (F07 / D9 / **D9-rev**) — el chrome que envuelve
 * TODA plantilla: la de descarga y las que traen F03–F06 (confirmación, resultado, recordatorios).
 *
 * Puro: sin `db`, sin red, sin `env`. Entra el branding del `Tenant` + el cuerpo que armó la
 * plantilla (texto plano + HTML ya escapado) y sale el correo entero con encabezado, pie y
 * disclaimer.
 *
 * ── Quién habla ───────────────────────────────────────────────────────────────────────────────
 * La **Tienda es protagonista** y la plataforma firma el chrome (D1): el Comprador le compró al
 * Organizador (ADR-0008), Sortéatelo solo pone la infraestructura. Por eso el logo (o el nombre)
 * de la Tienda va grande en el encabezado y la marca aparece como «vía Sortéatelo» + el wordmark
 * del pie. Lo mismo que ya hacía el `from`.
 *
 * ── Dos orígenes de color, dos reglas (D9-rev / I11 / design.md §9) ────────────────────────────
 * La 1ª versión tematizaba el correo entero con la paleta El Talonario. El usuario, mirando los
 * correos reales en su buzón, pidió lo contrario: el correo habla en voz de la TIENDA.
 * 1. **El CUERPO es color-desde-dato del tenant**: `Tenant.colorPrimario` expandido con
 *    `generarEscalaColor` — la MISMA función que arma el theme del storefront, así que el correo y
 *    la tienda salen del mismo color y no pueden desalinearse. Sin color o con hex inválido degrada
 *    a los tonos del theme base de plataforma, igual que `overrideDesdeBranding`.
 * 2. **El chrome de plataforma que sobrevive** («vía Sortéatelo» + el pie con wordmark y
 *    disclaimer) usa hex que son **copia literal** de tonos de `src/styles/theme.ts`, cada uno
 *    anotado con su token: copiar sí, inventar un tono nuevo no.
 *
 * ── Por qué el HTML se ve así ─────────────────────────────────────────────────────────────────
 * Es HTML de CORREO, no de la app, y ahí no corre casi nada de lo que la landing da por sentado:
 * - **Estilos inline y nada más**: sin `<style>`, sin clases, sin CSS externo — Gmail descarta el
 *   `<head>` en varias vistas y Outlook renderiza con Word.
 * - **Layout con tablas** (`role="presentation"`), no flex ni grid: Outlook no los soporta.
 * - **Fuentes del sistema**: sin `@font-face` ni webfonts. Fraunces / Bricolage / IBM Plex Mono no
 *   viajan a un buzón, así que se nombran primero y detrás va el stack de sistema; lo que SÍ viaja
 *   de la identidad son los COLORES y el wordmark tipográfico (docs/design.md §2/§3).
 * - **Sin `react-email`** (T5): HTML a mano, igual que `plantillaDescarga.ts`.
 *
 * La gramática del talonario (design.md §4) se traduce a lo que un cliente de correo sí sabe
 * pintar, pero **en el color de la Tienda**: banda arriba, franja/plumón bajo el encabezado,
 * perforación dashed antes del pie y los Números del sorteo como boletos. El pie en tinta y el
 * «éa» amarillo del wordmark son lo único que sigue siendo de la plataforma.
 *
 * Voz: español chileno sobrio, tuteo, sin posesivos empalagosos (docs/design.md §8).
 */

/**
 * Nombre visible de la Plataforma en el remitente, el chrome y el disclaimer (ADR-0014). Sale de
 * `APP_CONFIG` y no de un literal: el nombre de la marca tiene UNA fuente en todo el repo
 * (`src/config/app.ts`), y este módulo es el primer artefacto de marca fuera de React.
 */
export const MARCA_PLATAFORMA = APP_CONFIG.name;

/**
 * Remitente del correo TRANSACCIONAL. **Ya no es una constante escrita acá**: F05 cumplió el seam
 * de D2 y el dominio de envío vive en `src/config/correo.ts`, elegido por `ClaseDeCorreo`.
 *
 * Sobrevive como export por UN consumidor concreto: `plantillasFacturacion.ts`, que es el otro eje
 * del correo del producto (la Plataforma escribiéndole en nombre propio al Organizador, sin Tienda
 * protagonista) y arma su `from` a mano. Las plantillas al COMPRADOR no lo usan: piden su remitente
 * con `remitenteDeCorreo(clase)` y se lo pasan a `construirFrom` — así una plantilla de avisos no
 * puede salir por el buzón transaccional el día que D2 se reactive.
 */
export const REMITENTE_CORREO = remitenteDeCorreo("transaccional");

/**
 * Hex de PLATAFORMA que sobreviven al rework: el pie (banda tinta + wordmark + disclaimer) y los
 * neutrales del texto. **Excepción declarada a "cero hex fuera del theme"**, de la misma familia
 * que `public/og.svg` / `favicon.svg` (design.md §9): un correo no puede leer
 * `var(--mantine-color-*)` porque el buzón del Comprador no tiene el theme de Mantine.
 *
 * La excepción autoriza **copiar** tonos del theme, NO inventarlos: cada valor de acá es literal de
 * `src/styles/theme.ts` y lleva anotado su token, así que el mapa es auditable de un vistazo y hay
 * algo concreto que actualizar a mano si la paleta se mueve.
 *
 * Lo que YA NO vive acá (D9-rev): el color del encabezado, la franja, la perforación y los acentos
 * del cuerpo. Eso ahora sale del `Tenant` (ver `temaDeCorreo`).
 */
const COLOR = {
  /** `amarillo[6]` — el «éa» del wordmark del pie: el resaltado de la marca de plataforma. */
  amarillo: "#ffc530",
  /**
   * `gray[9]` / `black` — tinta: el texto del cuerpo, la banda del pie y el número de un boleto en
   * variante `neutro` (el grupo que NO manda la mirada, ver `ticketsDeNumeros`).
   */
  tinta: "#191b22",
  /** `gray[6]` — tinta-suave (`dimmed`): texto secundario y rótulos. */
  tintaSuave: "#565b68",
  /** `gray[4]` — tinta-tenue: el texto del pie sobre la banda oscura. */
  tintaTenue: "#9aa0ad",
  blanco: "#ffffff",
} as const;

/**
 * Escala de degradación cuando el `Tenant` no tiene `colorPrimario` válido: el primario de
 * plataforma. Es **copia literal** de `theme.colors.sorteatelo` (design.md §9) y no
 * `generarEscalaColor("#2b3fbf")`, porque los tonos del theme están afinados a mano y una escala
 * derivada daría hex parecidos pero distintos — el correo sin branding tiene que verse como la
 * plataforma se ve de verdad.
 *
 * Es la MISMA degradación del storefront: sin color de marca, `overrideDesdeBranding` no toca el
 * theme y queda el primario base.
 */
const ESCALA_PLATAFORMA: readonly string[] = [
  "#eaecf9", // sorteatelo[0]
  "#d0d5f1", // sorteatelo[1]
  "#aeb5e7", // sorteatelo[2]
  "#8893db", // sorteatelo[3]
  "#6675d1", // sorteatelo[4]
  "#495ac8", // sorteatelo[5]
  "#2b3fbf", // sorteatelo[6] ← base (primaryShade)
  "#2333a0", // sorteatelo[7]
  "#1c2a7e", // sorteatelo[8]
  "#151e5c", // sorteatelo[9]
];

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#rrggbb` ⇒ `{r,g,b}`. Solo se llama con hex ya validados (los de la escala). */
function aRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function aHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mezcla dos colores (`t` = 0 ⇒ `a` intacto, 1 ⇒ `b`). Determinista. */
function mezclar(a: string, b: string, t: number): string {
  const x = aRgb(a);
  const y = aRgb(b);
  return aHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
  });
}

/** Luminancia relativa WCAG 2.1 de un hex (0 = negro, 1 = blanco). */
function luminancia(hex: string): number {
  const { r, g, b } = aRgb(hex);
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razón de contraste WCAG entre dos hex (1:1 a 21:1). */
function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Contraste mínimo de texto normal (WCAG AA). */
const CONTRASTE_AA = 4.5;

/**
 * Tonos del correo derivados del branding de la Tienda. Los nombres son ROLES, no colores: qué
 * pinta cada tono, para que una plantilla nunca tenga que elegir un hex.
 */
interface TonosCorreo {
  /** Tinte casi-blanco de la marca: fondo de la página del correo y de los boletos. */
  tinte: string;
  /** Banda del encabezado: el color de marca de la Tienda tal cual. */
  banda: string;
  /** Texto sobre la banda — blanco o tinta, el que más contraste dé (nunca ilegible). */
  bandaTexto: string;
  /** Texto secundario sobre la banda («vía Sortéatelo»): el mismo, un paso apagado. */
  bandaSuave: string;
  /** El plumón del talonario bajo el encabezado: un tono más profundo de la marca. */
  franja: string;
  /** Enlaces y Números del sorteo: el tono de marca más claro que sigue siendo legible en blanco. */
  acento: string;
  /** Perforaciones y bordes de boleto: la marca en tono línea. */
  linea: string;
}

declare const temaValidado: unique symbol;

/**
 * Un `TonosCorreo` que SOLO puede haber salido de `temaDeCorreo`. La marca es de tipos, sin costo
 * en runtime, y existe por una razón concreta: cada campo de acá se interpola crudo en un atributo
 * `style`, así que el punto donde se validó el hex (`esHex`) tiene que ser el ÚNICO nacimiento
 * posible. Sin la marca, una plantilla de F03/F04/F06 podría armarse un tema a mano con dato del
 * tenant adentro y saltarse la validación sin que nada se queje — un contrato de honor. Con ella
 * no compila.
 */
export type TemaCorreo = TonosCorreo & { readonly [temaValidado]: never };

/**
 * Deriva los tonos del correo del `colorPrimario` del `Tenant` (D9-rev/I11). **Puro y
 * determinista**: mismo hex ⇒ mismos tonos, así que la plantilla puede llamarlo por su cuenta para
 * pintar un boleto y va a coincidir con el layout que la envuelve.
 *
 * `colorPrimario` inválido, vacío o ausente ⇒ escala de plataforma. Nunca lanza: el color lo escribe
 * el Organizador y un correo no puede caerse porque alguien pegó `rojo` en un campo de color. Y el
 * dato **jamás se interpola sin validar** (`esHex`, I11): acá es donde un `colorPrimario` hostil
 * —`#fff;background:url(javascript:…)`— entraría a un atributo `style`.
 */
export function temaDeCorreo(colorPrimario?: string | null): TemaCorreo {
  const escala: readonly string[] = esHex(colorPrimario)
    ? generarEscalaColor(colorPrimario)
    : ESCALA_PLATAFORMA;

  const banda = escala[6]!;
  // Contraste calculado, no asumido: una Tienda amarilla con texto blanco encima no se lee. Se
  // elige el extremo que más contraste dé, y no hay gate de AA como en `acento` porque no habría
  // qué hacer si fallara: el color de la banda ES el de la Tienda y no es nuestro para oscurecerlo.
  // Tampoco hace falta — el peor fondo posible (el gris medio de luminancia ~0,185) deja igual
  // 4,4:1 contra el blanco, sobre el 3:1 que AA pide para el titular grande del encabezado.
  const bandaTexto =
    contraste(banda, COLOR.blanco) >= contraste(banda, COLOR.tinta)
      ? COLOR.blanco
      : COLOR.tinta;

  const tinte = escala[0]!;

  // Se arma tipado como `TonosCorreo` (para que falte-un-campo siga siendo error de compilación) y
  // se marca al salir: el `as` es el sello del único constructor autorizado, no un escape de tipos.
  const tonos: TonosCorreo = {
    tinte,
    banda,
    bandaTexto,
    // El «vía Sortéatelo» es chrome discreto: el mismo color del titular, un cuarto del camino de
    // vuelta al fondo. Mezclar (en vez de tomar otro tono de la escala) mantiene el contraste
    // acotado y predecible para CUALQUIER color de marca.
    bandaSuave: mezclar(bandaTexto, banda, 0.25),
    franja: escala[8]!,
    // El primer tono de la escala, de claro a oscuro, que se lee sobre el TINTE. Un enlace o un
    // número en el amarillo de la Tienda sería invisible; bajar hasta el que cumple AA conserva la
    // familia de color sin sacrificar la lectura. La referencia es el tinte y no el blanco de la
    // carta a propósito: es el fondo del boleto, el más oscuro de los dos sobre los que este tono
    // se apoya — el que cumple ahí cumple también sobre blanco, al revés no.
    acento:
      [escala[6]!, escala[7]!, escala[8]!, escala[9]!].find(
        (tono) => contraste(tono, tinte) >= CONTRASTE_AA,
      ) ?? escala[9]!,
    linea: escala[3]!,
  };
  return tonos as TemaCorreo;
}

/** Stack de texto: familias que existen en Windows/macOS/Android/iOS sin descargar nada. */
const FUENTE_TEXTO =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/**
 * Stack editorial para el nombre de la Tienda: traduce el rol de Fraunces (serif cálida de los
 * headings, design.md §3) con serifas que sí están instaladas en cualquier cliente.
 */
const FUENTE_TITULO = "Georgia, 'Times New Roman', Times, serif";
/**
 * Stack mono para números y etiquetas (el «Nº 000001» del boleto, design.md §3). Lo van a usar las
 * plantillas de F03–F06 para los Números del sorteo; el layout ya lo expone para que ninguna
 * invente el suyo.
 */
export const FUENTE_MONO =
  "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

/** Ancho clásico de correo: entra en cualquier cliente de escritorio y no rompe en móvil. */
const ANCHO = 600;

/**
 * Alto del logo de la Tienda en el encabezado (px). Se fija el ALTO y no el ancho para que logos de
 * proporciones distintas ocupen el mismo peso visual — el mismo criterio del header del storefront
 * (`height: 36`), un punto más grande porque acá no compite con una barra de navegación.
 */
const ALTO_LOGO = 40;

/**
 * Estilos inline del CUERPO, listos para que las plantillas los peguen en su HTML. Existen para
 * que ninguna plantilla repita un hex ni un stack de fuentes: el layout es el dueño del lenguaje
 * visual (design.md §9 — cero hex disperso), las plantillas solo componen contenido.
 *
 * Pasó de constante a FUNCIÓN del tema en el rework D9-rev: el color de acción ya no es el cobalto
 * de plataforma, es el de la Tienda. Se llama con el mismo `colorPrimario` que recibe el layout.
 */
export function estilosDeCuerpo(tema: TemaCorreo) {
  return {
    parrafo: "margin:0 0 12px;",
    /** Enlace en el acento de la Tienda: es su color de acción. */
    enlace: `color:${tema.acento};`,
    /** Nota al pie del cuerpo (avisos, letra chica) — un escalón por debajo del texto. */
    nota: `margin:0;color:${COLOR.tintaSuave};font-size:13px;`,
    lista: "margin:0 0 16px;padding-left:20px;",
    itemLista: "margin:0 0 6px;",
    /**
     * Los dos tonos de texto SUELTOS, para cuando una plantilla arma su propia tabla y necesita el
     * color sin un estilo completo alrededor (el resumen de orden de F03 es el primer caso: sus
     * celdas mezclan color con padding y alineación que solo ella conoce). Se exponen acá y no como
     * hex en la plantilla por la misma razón que todo lo demás de este objeto — design.md §9, el
     * layout es el único dueño de la paleta del correo.
     */
    colorTexto: COLOR.tinta,
    colorSecundario: COLOR.tintaSuave,
  } as const;
}

export interface CorreoEnvuelto {
  text: string;
  html: string;
}

/** Rótulo del talón del boleto. Mono y corto: es el sello del talonario, no un título. */
const ETIQUETA_TICKET = "Nº";

/**
 * Los **Números del sorteo** renderizados como BOLETOS (D10, pedido textual del usuario: «que en
 * vez de números parezcan tickets»). La primitiva vive acá y no en cada plantilla para que F03
 * (confirmación), F04 (resultado) y F06 (recordatorios) dibujen el mismo boleto.
 *
 * ── Qué se puede dibujar y qué no ──────────────────────────────────────────────────────────────
 * La gramática del talonario (design.md §4) pide muescas troqueladas. En un buzón no hay
 * pseudo-elementos, ni `position:absolute`, ni SVG confiable, así que el boleto se sugiere con lo
 * que Outlook y Gmail sí pintan: **tabla de dos celdas, borde, esquinas redondeadas y una
 * perforación dashed** entre el talón y el número. Donde el `border-radius` no llega (Word), queda
 * un recuadro con su perforación — degrada a algo que sigue leyéndose como boleto.
 *
 * El número va en **mono** para que coincida con la columna Números del panel (design.md §3): el
 * Comprador y el Organizador miran el mismo dato escrito igual.
 *
 * ── Un boleto por BLOQUE ───────────────────────────────────────────────────────────────────────
 * El plegado es el MISMO del panel (`~/lib/numerosDelSorteo`) y cada bloque contiguo es un boleto:
 * una compra de 50 tickets es UN boleto `1043–1092`, y tres compras sueltas son tres. El `texto`
 * que devuelve es exactamente el string del panel: el `text/plain` no dibuja nada.
 *
 * Cantidad de boletos: sale de cuántas COMPRAS separadas hizo el comprador en el mismo sorteo, no
 * de cuántos tickets tiene (50 tickets de una compra = 1 boleto). El techo realista está muy por
 * debajo del recorte de Gmail (~102 KB), así que no se acota acá; si F03 encuentra un caso que
 * duela, el cap es suyo — es quien conoce el copy con el que se anuncia el resto.
 *
 * `prefijo` es `Tenant.prefijoTicket` (F08/D12) y va OBLIGATORIO —no opcional— por la misma razón
 * que en el helper: una plantilla que se olvidara de pasarlo mandaría `1043` al buzón mientras el
 * panel muestra `ARMY-1043`, y ese desalineamiento es justo lo que I12 existe para impedir.
 */
export function ticketsDeNumeros({
  numeros,
  tema,
  prefijo,
  etiqueta = ETIQUETA_TICKET,
  variante = "acento",
}: {
  numeros: number[];
  tema: TemaCorreo;
  /** `Tenant.prefijoTicket` — `null` ⇒ boletos con el número pelado, como antes de F08. */
  prefijo: string | null;
  etiqueta?: string;
  /**
   * Peso visual del boleto. `"acento"` (default, y lo que hacían todas las plantillas hasta F04) es
   * el número en el color de marca; `"neutro"` lo pinta en tinta.
   *
   * Existe porque el correo de resultado (C5) dibuja DOS grupos de boletos en la misma pantalla —el
   * número que ganó y los del destinatario— y con el mismo tratamiento se leen como una sola lista:
   * quien escanea el correo puede creer que sus números salieron. El rótulo de arriba no alcanza,
   * eso se ve mirando el render y no aserido. El que manda la mirada es el GANADOR, que es la
   * noticia; los propios acompañan.
   */
  variante?: "acento" | "neutro";
}): { html: string; texto: string } {
  const bloques = bloquesDeNumerosDelSorteo(numeros, prefijo);
  if (bloques.length === 0) return { html: "", texto: "" };

  // El talón va un paso más oscuro que el cuerpo del boleto, no del mismo tono: la perforación es
  // 1 px dashed y hay clientes (Word, y cualquiera que recomprima el render) donde esa línea
  // desaparece. Con dos tonos distintos el ojo sigue viendo DOS mitades troqueladas aunque el
  // troquel no se dibuje — el borde es el detalle, el cambio de tono es lo que sostiene la lectura.
  const talon =
    `background-color:${mezclar(tema.tinte, tema.linea, 0.3)};border:1px solid ${tema.linea};border-right:0;` +
    `border-radius:10px 0 0 10px;padding:12px 10px 12px 14px;` +
    `font-family:${FUENTE_MONO};font-size:11px;line-height:1;letter-spacing:0.08em;` +
    `color:${COLOR.tintaSuave};white-space:nowrap;`;
  const cuerpo =
    `background-color:${tema.tinte};border:1px solid ${tema.linea};border-left:1px dashed ${tema.linea};` +
    `border-radius:0 10px 10px 0;padding:12px 16px;` +
    `font-family:${FUENTE_MONO};font-size:19px;line-height:1;font-weight:bold;` +
    // `tabular-nums` como en la columna Números del panel (design.md §3). El cliente que no lo
    // soporte lo ignora y el mono ya da el ancho fijo — no hay degradación que administrar.
    // La tinta del `neutro` contrasta de sobra contra el tinte (el tono 0 de cualquier escala), así
    // que la variante no necesita el gate de AA que sí tiene `acento`.
    `font-variant-numeric:tabular-nums;color:${variante === "acento" ? tema.acento : COLOR.tinta};white-space:nowrap;`;

  const html = bloques
    .map(
      (bloque) =>
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 8px;"><tr>` +
        `<td style="${talon}">${escaparHtml(etiqueta)}</td>` +
        `<td style="${cuerpo}">${escaparHtml(bloque)}</td>` +
        `</tr></table>`,
    )
    .join("");

  return { html, texto: formatearNumerosDelSorteo(numeros, prefijo) };
}

export interface OpcionesLayout {
  /** Nombre de la Tienda — protagonista del encabezado (D1). El layout lo sanea y lo escapa. */
  nombreTienda: string;
  /**
   * `Tenant.logoUrl` — el logo de la Tienda en el encabezado (D9-rev). Debe ser una URL ABSOLUTA
   * https: un correo no tiene contra qué resolver un path relativo. Ausente o no-absoluta ⇒ el
   * nombre de la Tienda como texto (D11, §5.2).
   */
  logoUrl?: string | null;
  /**
   * `Tenant.colorPrimario` — tematiza el CUERPO del correo (D9-rev/I11). Ausente o inválido ⇒
   * tonos del theme base de plataforma, sin reventar.
   */
  colorPrimario?: string | null;
  /**
   * Nombre del sorteo, cuando el correo habla de uno (I10): una Tienda tiene n sorteos y solo uno
   * activo, así que el Comprador nunca tiene que adivinar de cuál le hablan. Ausente ⇒ el bloque
   * no se dibuja (degradación elegante, design.md §5.2).
   */
  nombreSorteo?: string;
  /**
   * `Tenant.identidadLegal` (F05/D6) — nombre o razón social del Organizador que responde por la
   * venta y el sorteo. Va en el PIE, después del disclaimer de ADR-0008: el disclaimer dice el
   * reparto de responsabilidades y esto dice QUIÉN es la parte responsable (un nombre de fantasía
   * no identifica a nadie ante un reclamo). Ausente o vacío ⇒ la línea no se dibuja (§5.2).
   */
  identidadLegal?: string | null;
  /**
   * Baja de avisos (F05, RFC 8058) — **SOLO en correos de la clase `avisos`** (I5). Dibuja el
   * enlace VISIBLE en el pie; las cabeceras del one-click las pone quien arma el `CorreoInput`
   * (`cabecerasDeAvisos`), porque son transporte y no layout. Ausente ⇒ el pie no menciona ninguna
   * baja, que es lo correcto en un transaccional: de la confirmación de tu compra no te podés dar
   * de baja.
   */
  urlBaja?: string | null;
  /** Resumen de una línea que el cliente muestra junto al asunto. Nunca se ve dentro del correo. */
  preheader: string;
  /** Cuerpo en texto plano, línea por línea (el texto plano no se escapa: no es markup). */
  texto: string[];
  /** Cuerpo en HTML, fragmento por fragmento. Ya viene escapado por la plantilla. */
  html: string[];
}

/**
 * Sanea el nombre de la Tienda para una CABECERA (`from`/`subject`): sin saltos de línea ni
 * caracteres de control (anti header-injection). Vacío tras sanear ⇒ cae a la marca, nunca a un
 * `from` sin nombre.
 */
export function sanearNombreTienda(nombreTienda: string): string {
  return sanearCabecera(nombreTienda, MARCA_PLATAFORMA);
}

/**
 * Caracteres que rompen una **address-list** de correo si aparecen en un display name sin comillas
 * (RFC 5322 «specials»): `<`/`>` abren un segundo `angle-addr`, la coma y el punto y coma separan
 * direcciones, y la comilla y la barra invertida rompen el quoting.
 */
const ESPECIALES_DEL_FROM = /[<>",;\\]/g;

/**
 * Saneo ESTRICTO para el display name del `from`. Es más duro que `sanearNombreTienda` a propósito:
 * ahí el nombre es texto que se va a escapar como HTML, acá es una **cabecera de direcciones**.
 *
 * El agujero concreto que tapa: una Tienda llamada `Regalos <ataque@evil.cl>` producía
 * `Regalos <ataque@evil.cl> · vía Sortéatelo <no-reply@sorteatelo.cl>` — dos `angle-addr` en un
 * mismo `from`. Según cómo lo parsee el proveedor eso es un 422 que voltea **el lote entero**
 * (hasta 100 correos de varios tenants caídos por el nombre de UNA tienda) o un correo que sale
 * con un remitente que no es el nuestro. El nombre lo escribe el Organizador y con el self-service
 * lo escribe cualquiera, así que no se confía (misma postura que el saneo anti-CRLF).
 */
function sanearNombreEnFrom(nombreTienda: string): string {
  // Reemplazo por espacio y no borrado: `Tienda,ARMY` no puede quedar `TiendaARMY`. El colapso de
  // espacios lo hace después `sanearCabecera`.
  return sanearCabecera(
    nombreTienda.replace(ESPECIALES_DEL_FROM, " "),
    MARCA_PLATAFORMA,
  );
}

/**
 * `from` con nombre: `<Tienda> · vía <Marca> <remitente>` (D1/D6). El correo sale «en nombre de»
 * la Tienda pero desde el remitente de la Plataforma — el Comprador ve de quién compró
 * (ADR-0008/0010).
 *
 * El `remitente` entra como DATO y es **obligatorio** (seam de D2, F05): quien arma el correo
 * declara su `ClaseDeCorreo` y de ahí sale el buzón (`remitenteDeCorreo`). Con un default acá, una
 * plantilla de avisos nueva saldría en silencio por el buzón transaccional el día que se contrate
 * Resend Pro y los subdominios se separen — el mismo criterio por el que el prefijo de ticket de
 * F08 es un parámetro obligatorio y no opcional.
 */
export function construirFrom(
  nombreTienda: string,
  remitente: string,
): string {
  return `${sanearNombreEnFrom(nombreTienda)} · vía ${MARCA_PLATAFORMA} <${remitente}>`;
}

/**
 * Disclaimer de responsabilidad (ADR-0008/0010, D6): el Comprador le compró a la TIENDA, que
 * responde por la venta y el sorteo; la Plataforma solo provee la infraestructura. Vive en el
 * layout y no en cada plantilla justamente para que ninguna pueda nacer sin él.
 */
function disclaimer(nombreTienda: string): string {
  return (
    `Compraste en ${nombreTienda} a través de ${MARCA_PLATAFORMA}. ${nombreTienda} es ` +
    `responsable de la venta y del sorteo asociado; ${MARCA_PLATAFORMA} solo provee la ` +
    `infraestructura técnica.`
  );
}

/**
 * Wordmark tipográfico del pie: el nombre con el «éa» en amarillo. Es el plumón de la marca
 * traducido a lo único que un cliente de correo pinta seguro — un `<span>` de color. Misma regla
 * que el componente `Wordmark`: si el nombre no se parte por «éa», sale plano (degrada, no rompe).
 */
function wordmarkHtml(): string {
  const partes = MARCA_PLATAFORMA.split("éa");
  const nombre =
    partes.length === 2
      ? `${escaparHtml(partes[0] ?? "")}<span style="color:${COLOR.amarillo};">éa</span>${escaparHtml(partes[1] ?? "")}`
      : escaparHtml(MARCA_PLATAFORMA);
  return `<span style="font-family:${FUENTE_TEXTO};font-size:16px;font-weight:bold;color:${COLOR.blanco};letter-spacing:-0.02em;">${nombre}</span>`;
}

/**
 * URL de imagen que un cliente de correo puede cargar sin pensarlo: **absoluta y con TLS**, sin
 * espacios ni caracteres que puedan cerrar el atributo. Todo lo demás (key del bucket, path
 * relativo, `http://`, `data:`, `javascript:`) se trata como «no hay logo» y degrada al nombre.
 *
 * No alcanza con escapar: un path relativo no rompe nada pero llega como `<img>` roto al buzón de
 * un tercero, que es exactamente lo que la degradación de §5.2 existe para evitar. `Tenant.logoUrl`
 * hoy lo escribe `confirmarImagenSubida` con la URL pública del bucket, pero el campo fue texto
 * libre antes de plantilla-rica D4/I6 y esto corre sobre datos viejos.
 */
const URL_IMAGEN_SEGURA = /^https:\/\/[^\s"'<>]{1,500}$/;

function logoUsable(logoUrl?: string | null): string | null {
  if (!logoUrl) return null;
  // Los controles se descartan ANTES del regex, con el mismo criterio que `sanearCabecera` usa para
  // el nombre de la Tienda: `[^\s…]` no los cubre (un `\x01` no es whitespace) y dejarlos pasar sería
  // inconsistente con la defensa que el resto del módulo ya aplica al dato del mismo origen.
  const sinControl = Array.from(logoUrl).every((c) => {
    const code = c.charCodeAt(0);
    return code > 0x1f && code !== 0x7f;
  });
  return sinControl && URL_IMAGEN_SEGURA.test(logoUrl) ? logoUrl : null;
}

/** Una fila de la tabla exterior: `<tr><td …>contenido</td></tr>`. */
function fila(estilo: string, contenido: string): string {
  return `<tr><td style="${estilo}">${contenido}</td></tr>`;
}

export function envolverEnLayout({
  nombreTienda,
  logoUrl,
  colorPrimario,
  nombreSorteo,
  identidadLegal,
  urlBaja,
  preheader,
  texto,
  html,
}: OpcionesLayout): CorreoEnvuelto {
  // El nombre viaja por dos caminos con defensas distintas: saneo (es una línea, nunca un párrafo)
  // y escapado (se interpola en el HTML). Los dos, no uno.
  const tienda = sanearNombreTienda(nombreTienda);
  const tiendaHtml = escaparHtml(tienda);
  const sorteo = nombreSorteo ? sanearCabecera(nombreSorteo, "") : "";
  const pie = disclaimer(tienda);
  // Mismo trato que el nombre de la Tienda: lo escribe el Organizador, así que se sanea (es una
  // línea del pie) y se escapa al interpolarlo. Vacío tras sanear ≡ ausente: un espacio tipeado no
  // es una identidad legal, y dibujar un renglón en blanco es peor que no dibujar nada (§5.2).
  const identidadLegalTexto = identidadLegal
    ? sanearCabecera(identidadLegal, "")
    : "";
  const tema = temaDeCorreo(colorPrimario);
  const logo = logoUsable(logoUrl);

  // ── Texto plano ────────────────────────────────────────────────────────────
  // Siempre presente (entregabilidad): un correo solo-HTML puntúa como spam y hay clientes que
  // solo muestran esto.
  const text = [
    `${tienda} · vía ${MARCA_PLATAFORMA}`,
    ...(sorteo ? [`Sorteo: ${sorteo}`] : []),
    "".padEnd(48, "-"),
    "",
    ...texto,
    "",
    "".padEnd(48, "-"),
    pie,
    // D6: quién responde. En el texto plano va como renglón propio y sin rótulo inventado — es el
    // mismo dato que el HTML muestra bajo el disclaimer.
    ...(identidadLegalTexto ? [identidadLegalTexto] : []),
    // I5/RFC 8058: solo los AVISOS traen baja. El `text/plain` la lleva como URL desnuda porque no
    // hay dónde colgar un enlace, y sin ella el que lee en texto plano no tendría cómo salir.
    ...(urlBaja ? ["", `${TEXTO_ENLACE_BAJA}: ${urlBaja}`] : []),
    `${MARCA_PLATAFORMA} · ${APP_CONFIG.dominio}`,
  ].join("\n");

  // ── HTML ───────────────────────────────────────────────────────────────────
  // Identidad de la Tienda: su logo o, si no tiene, su nombre (D11 — la MISMA degradación que el
  // storefront, design.md §5.2; acá no se inventa un monograma que la tienda no usa en ningún otro
  // lado). El logo va sobre un chip blanco y no directo sobre la banda de color: un logo lo dibuja
  // un tercero para SU fondo, y el color de la banda lo elige el Organizador — sin el chip, un logo
  // oscuro sobre una marca oscura desaparece. El `height` va también como atributo porque Outlook
  // renderiza con Word y ahí el CSS de la imagen no siempre llega.
  const identidad = logo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
      `<td style="background-color:${COLOR.blanco};border-radius:10px;padding:10px 14px;">` +
      `<img src="${escaparHtml(logo)}" alt="${escaparHtml(tienda)}" height="${ALTO_LOGO}" style="height:${ALTO_LOGO}px;width:auto;max-width:100%;display:block;border:0;outline:none;text-decoration:none;font-family:${FUENTE_TITULO};font-size:19px;font-weight:bold;color:${COLOR.tinta};" />` +
      `</td></tr></table>`
    : `<div style="font-family:${FUENTE_TITULO};font-size:21px;font-weight:bold;color:${tema.bandaTexto};line-height:1.25;">${tiendaHtml}</div>`;

  const encabezado = fila(
    `background-color:${tema.banda};padding:24px 28px;`,
    identidad +
      `<div style="font-family:${FUENTE_TEXTO};font-size:12px;color:${tema.bandaSuave};padding-top:${logo ? 10 : 6}px;">vía ${escaparHtml(MARCA_PLATAFORMA)}</div>`,
  );

  // La franja es el plumón del talonario en el color de la Tienda: 6 px, sin texto. `font-size:0` +
  // `line-height:0` porque si no Outlook le mete la altura de una línea vacía.
  const franja = fila(
    `background-color:${tema.franja};height:6px;font-size:0;line-height:0;`,
    "&nbsp;",
  );

  // Etiqueta del sorteo (I10). Mono + mayúsculas: es el rótulo del talón, no un título. Va sobre
  // el blanco de la carta y se separa del cuerpo con una PERFORACIÓN (design.md §4), no con un
  // fondo propio: un fondo gris acá se confunde con el del correo y la carta parece cortada.
  const etiquetaSorteo = sorteo
    ? fila(
        "padding:16px 28px 0;",
        // El troquelado va en un div INTERNO, no en el borde del `<td>`: sobre el td la línea
        // cruzaría la carta de lado a lado y la partiría en dos. Así queda con el mismo margen
        // lateral que la perforación del pie.
        `<div style="padding-bottom:14px;border-bottom:2px dashed ${tema.linea};">` +
          `<span style="font-family:${FUENTE_MONO};font-size:11px;letter-spacing:0.08em;color:${COLOR.tintaSuave};">SORTEO</span>` +
          `<span style="font-family:${FUENTE_TEXTO};font-size:14px;color:${COLOR.tinta};padding-left:8px;">${escaparHtml(sorteo)}</span>` +
          `</div>`,
      )
    : "";

  const cuerpo = fila(
    `padding:28px;font-family:${FUENTE_TEXTO};font-size:15px;line-height:1.6;color:${COLOR.tinta};`,
    html.join(""),
  );

  // Perforación: la línea troquelada entre el cuerpo y el pie (design.md §4). Con aire abajo: sin
  // él la línea queda pegada a la banda oscura del pie y deja de leerse como troquelado.
  const perforacion = fila(
    "padding:0 28px 14px;",
    `<div style="border-top:2px dashed ${tema.linea};font-size:0;line-height:0;">&nbsp;</div>`,
  );

  // Estilo compartido de las líneas del pie: sobre la banda tinta, en tinta-tenue. Una constante y
  // no tres literales, para que la identidad legal y la baja no se vayan separando del disclaimer.
  const estiloLineaPie = `font-family:${FUENTE_TEXTO};font-size:12px;line-height:1.6;color:${COLOR.tintaTenue};`;

  const pieHtml = fila(
    `background-color:${COLOR.tinta};padding:20px 28px;`,
    `${wordmarkHtml()}` +
      `<div style="${estiloLineaPie}padding-top:8px;">${escaparHtml(pie)}</div>` +
      // D6 — la identidad legal va DESPUÉS del disclaimer: primero el reparto de
      // responsabilidades, después quién es la parte responsable.
      (identidadLegalTexto
        ? `<div style="${estiloLineaPie}padding-top:6px;">${escaparHtml(identidadLegalTexto)}</div>`
        : "") +
      // Baja de avisos (I5): solo si el correo es de la clase `avisos`. El enlace va SUBRAYADO y
      // en un tono legible sobre la banda oscura — un enlace de baja escondido es la vía más
      // corta a que marquen spam, y eso lo paga el dominio compartido por todas las Tiendas.
      (urlBaja
        ? `<div style="${estiloLineaPie}padding-top:10px;">` +
          `<a href="${escaparHtml(urlBaja)}" style="color:${COLOR.tintaTenue};text-decoration:underline;">${escaparHtml(TEXTO_ENLACE_BAJA)}</a>` +
          `</div>`
        : ""),
  );

  const htmlCompleto =
    `<!DOCTYPE html>` +
    `<html lang="es"><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `</head>` +
    `<body style="margin:0;padding:0;background-color:${tema.tinte};">` +
    // Preheader: lo que el cliente muestra junto al asunto en la bandeja. Oculto en el cuerpo.
    `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escaparHtml(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${tema.tinte};">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="${ANCHO}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${ANCHO}px;background-color:${COLOR.blanco};border-radius:18px;overflow:hidden;">` +
    encabezado +
    franja +
    etiquetaSorteo +
    cuerpo +
    perforacion +
    pieHtml +
    `</table></td></tr></table></body></html>`;

  return { text, html: htmlCompleto };
}
