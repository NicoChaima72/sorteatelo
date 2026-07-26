import { clp } from "~/lib/formato";
import { escaparHtml } from "~/server/domain/correo/_correoBase";
import { fechaHoraEnChile } from "~/server/domain/correo/_fechaDeCorreo";
import {
  construirFrom,
  envolverEnLayout,
  estilosDeCuerpo,
  FUENTE_MONO,
  sanearNombreTienda,
  temaDeCorreo,
  ticketsDeNumeros,
} from "~/server/domain/correo/layoutCorreo";

/**
 * Plantilla PURA del correo **C1 — confirmación de compra** (F03/D1/D8/D12, ADR-0027 §7). Sin `db`,
 * sin red, sin `env`: recibe los datos ya derivados de la orden y devuelve el
 * `{ from, subject, text, html }` listo para el `CorreoService`. Testeable sin infraestructura.
 *
 * ── De dónde viene ────────────────────────────────────────────────────────────────────────────
 * Nació en F04 como el correo de DESCARGA (enlaces + disclaimer) y F03 la hizo CRECER: el mismo
 * correo post-pago es ahora la confirmación de la compra completa. No son dos correos —sería
 * mandarle dos mensajes al Comprador por la misma acción— sino uno que ahora dice todo lo que pasó:
 * qué números le tocaron, de qué sorteo, cuándo cierra, qué compró y de dónde lo baja. Por eso el
 * módulo cambió de nombre; el `plantillaDescarga.ts` de F04/F07 es este archivo.
 *
 * ── Qué lleva y por qué ───────────────────────────────────────────────────────────────────────
 * 1. **Los Números del sorteo como BOLETOS** (D10), con el prefijo de la Tienda si lo tiene (D12).
 *    Es lo que la landing promete y ninguna superficie mostraba: la razón de ser de C1.
 * 2. **El sorteo NOMBRADO** (D1/I10). Una Tienda tiene n sorteos y solo uno activo: el Comprador no
 *    tiene que adivinar de cuál le hablan. El nombre va al slot del layout, arriba del cuerpo.
 * 3. **El cierre en hora de Chile con la zona dicha** (I7) — es lo único del correo que depende de
 *    un reloj y el server corre en UTC.
 * 4. **Resumen de la orden**: número, fecha, artículos y total en CLP. Es lo que el Comprador cita
 *    cuando escribe preguntando algo, y lo que el Organizador busca en su export de ventas.
 * 5. **Bases del sorteo** cuando la Tienda las cargó, + el disclaimer de responsabilidad (ADR-0008)
 *    que pone el layout.
 * 6. Los **enlaces de entrega** y su aviso de expiración, que es lo que este correo ya hacía.
 *
 * **Degradación limpia sin sorteo**: una orden sin tickets (producto que no participa, o Tienda sin
 * sorteo ACTIVO al pagar) recibe el MISMO correo sin la sección de sorteo — ni rótulo vacío, ni
 * «tus números: —», ni un sorteo inventado (design.md §5.2).
 *
 * Voz chilena sobria, tuteo (docs/design.md §8). Texto plano SIEMPRE (entregabilidad) + HTML inline
 * sobre el layout F07 (sin `react-email` — T5). El correo JAMÁS expone una key del bucket de ningún
 * tipo: solo los enlaces `/entrega/<token>` que arma el use case (I2/ADR-0002).
 *
 * El copy de la entrega es TIPO-AGNÓSTICO por construcción desde productos-tipos-digitales F03:
 * habla de «lo que compraste» y nunca de «tu PDF», así que sirve igual para EPUB, imágenes, audio o
 * ZIP. El nombre real del archivo lo pone el `Content-Disposition` de la descarga, no el correo.
 */

export interface ItemDescarga {
  titulo: string;
  /**
   * Enlace `<baseUrl>/entrega/<token>` — la PÁGINA de entrega (F09/D5), donde el Comprador ve y
   * baja lo que compró (incluidos los N archivos que le tocaron en un sobre sorpresa). Lo arma el
   * use case; esta plantilla solo lo renderiza y no conoce su forma.
   */
  enlace: string;
}

/**
 * El sorteo al que entró ESTA compra. Ausente ⇒ el correo sale sin sección de sorteo (degradación).
 */
export interface SorteoDeLaCompra {
  /** Nombre del sorteo — obligatorio: un correo que habla de un sorteo lo NOMBRA (I10). */
  nombre: string;
  /** Cierre del sorteo. Se muestra en hora de Chile con la zona explícita (I7). */
  fechaFin: Date;
  /**
   * Números del sorteo de ESTA orden (ADR-0024). Es la compra la que se está confirmando, así que
   * son sus números y no todos los del Comprador en el sorteo: salen de un solo bloque contiguo ⇒
   * un solo boleto. Vacío ⇒ la sección no se dibuja.
   */
  numeros: number[];
  /** `Tenant.prefijoTicket` (D12) — el MISMO que muestra el panel. `null` ⇒ números pelados. */
  prefijoTicket: string | null;
  /** `Raffle.basesPdfUrl` (ADR-0008). Ausente ⇒ no se muestra el enlace, nunca uno roto. */
  basesUrl?: string | null;
}

/** Los datos de la compra que el Comprador necesita para identificarla después. */
export interface ResumenDeOrden {
  /** `Order.id`. Es lo que el Comprador cita y lo que el Organizador encuentra en su export. */
  numeroDeOrden: string;
  /** Cuándo se hizo la compra; se muestra en hora de Chile (I7). */
  fecha: Date;
  /**
   * Total de la orden como **string `Decimal`** — jamás un `number` (CLAUDE.md § Regla de oro). La
   * plantilla solo lo FORMATEA con `Intl` (`~/lib/formato`), nunca hace aritmética con él.
   */
  totalClp: string;
  /** Cuántas unidades compró en total (Σ `cantidad` de las líneas). */
  articulos: number;
}

export interface CorreoConfirmacionArmado {
  from: string;
  subject: string;
  text: string;
  html: string;
}

/** Rótulo de la sección de números. Mono y en versalitas: es el sello del talonario (design.md §4). */
const ROTULO_NUMEROS = "TUS NÚMEROS";

export function armarCorreoConfirmacionCompra({
  nombreTienda,
  logoUrl,
  colorPrimario,
  items,
  diasExpiracion,
  orden,
  sorteo,
}: {
  nombreTienda: string;
  /** `Tenant.logoUrl` — encabezado con el logo de la Tienda; sin él, su nombre (D9-rev/D11). */
  logoUrl?: string | null;
  /** `Tenant.colorPrimario` — tematiza el cuerpo; inválido/ausente ⇒ theme base (D9-rev/I11). */
  colorPrimario?: string | null;
  items: ItemDescarga[];
  diasExpiracion: number;
  orden: ResumenDeOrden;
  /** Ausente ⇒ la compra no generó tickets: el correo sale sin sección de sorteo. */
  sorteo?: SorteoDeLaCompra;
}): CorreoConfirmacionArmado {
  const from = construirFrom(nombreTienda);
  // El subject es también una cabecera: se sanea igual que el from (anti header-injection).
  const tienda = sanearNombreTienda(nombreTienda);
  // Mismo color que va a usar el layout: `temaDeCorreo` es determinista, así que llamarlo acá para
  // el cuerpo no puede desalinearse del chrome que lo envuelve (D9-rev).
  const tema = temaDeCorreo(colorPrimario);
  const ESTILO = estilosDeCuerpo(tema);

  // Los boletos se dibujan una sola vez y se usan en HTML y en texto plano: `ticketsDeNumeros`
  // devuelve las dos representaciones juntas justamente para que no puedan desincronizarse (D10).
  const boletos = sorteo
    ? ticketsDeNumeros({
        numeros: sorteo.numeros,
        tema,
        prefijo: sorteo.prefijoTicket,
      })
    : { html: "", texto: "" };
  // «Habla de un sorteo» = tiene números que mostrar. Un sorteo sin números no da nada que decirle
  // al Comprador sobre ESTA compra, así que degrada igual que si no hubiera sorteo (§5.2).
  const conSorteo = sorteo !== undefined && boletos.texto !== "";

  const subject = conSorteo
    ? `Tu compra en ${tienda}: tus números y tu descarga`
    : `Tu compra en ${tienda}: enlaces de descarga`;
  const preheader = conSorteo
    ? `Tus números: ${boletos.texto} · ${sorteo!.nombre}`
    : `Tus enlaces de descarga de ${tienda}`;

  const avisoExpiracion =
    `Estos enlaces vencen en ${diasExpiracion} días. Si necesitas que te los reenviemos, ` +
    `responde este correo y ${tienda} podrá ayudarte.`;

  // ── Sección del sorteo (D1/D8/D10/I7/I10) ──────────────────────────────────
  const cierre = conSorteo ? fechaHoraEnChile(sorteo!.fechaFin) : "";
  const lineaCierre = conSorteo
    ? `El sorteo ${sorteo!.nombre} cierra el ${cierre}.`
    : "";
  const textoSorteo = conSorteo
    ? [
        `Ya estás participando. Estos son tus números:`,
        ``,
        `  ${boletos.texto}`,
        ``,
        lineaCierre,
        ...(sorteo!.basesUrl ? [`Bases del sorteo: ${sorteo!.basesUrl}`] : []),
        ``,
      ]
    : [];
  const htmlSorteo = conSorteo
    ? [
        `<p style="${ESTILO.parrafo}">Ya estás participando. Estos son tus números:</p>`,
        `<p style="margin:0 0 8px;font-family:${FUENTE_MONO};font-size:11px;letter-spacing:0.08em;color:${tema.acento};">${escaparHtml(ROTULO_NUMEROS)}</p>`,
        boletos.html,
        `<p style="${ESTILO.parrafo}padding-top:8px;">${escaparHtml(lineaCierre)}</p>`,
        ...(sorteo!.basesUrl
          ? [
              `<p style="${ESTILO.nota}"><a href="${escaparHtml(sorteo!.basesUrl)}" style="${ESTILO.enlace}">Bases del sorteo</a></p>`,
            ]
          : []),
      ]
    : [];

  // ── Resumen de la orden ────────────────────────────────────────────────────
  // Filas `etiqueta: valor` y no una tabla de líneas de compra: el detalle fino ya lo tiene el
  // Comprador en la página de entrega, y lo que necesita en el correo es poder CITAR la compra.
  const fechaCompra = fechaHoraEnChile(orden.fecha);
  const total = clp(orden.totalClp);
  const filasResumen: Array<[string, string]> = [
    ["Nº de orden", orden.numeroDeOrden],
    ["Fecha", fechaCompra],
    ["Artículos", `${orden.articulos}`],
    ["Total", total],
  ];

  const { text, html } = envolverEnLayout({
    nombreTienda,
    logoUrl,
    colorPrimario,
    // El slot del sorteo del layout (I10): el nombre queda arriba del cuerpo, en el talón.
    ...(conSorteo ? { nombreSorteo: sorteo!.nombre } : {}),
    preheader,
    texto: [
      `Hola,`,
      ``,
      `Gracias por tu compra en ${tienda}. Acá está todo lo de tu compra.`,
      ``,
      ...textoSorteo,
      `Ya puedes descargar lo que compraste:`,
      ``,
      ...items.map((it) => `- ${it.titulo}: ${it.enlace}`),
      ``,
      avisoExpiracion,
      ``,
      `Resumen de tu compra`,
      ...filasResumen.map(([etiqueta, valor]) => `- ${etiqueta}: ${valor}`),
    ],
    html: [
      `<p style="${ESTILO.parrafo}">Hola,</p>`,
      `<p style="${ESTILO.parrafo}">Gracias por tu compra en <strong>${escaparHtml(tienda)}</strong>. Acá está todo lo de tu compra.</p>`,
      ...htmlSorteo,
      `<p style="${ESTILO.parrafo}">Ya puedes descargar lo que compraste:</p>`,
      `<ul style="${ESTILO.lista}">` +
        items
          .map(
            (it) =>
              `<li style="${ESTILO.itemLista}"><a href="${escaparHtml(it.enlace)}" style="${ESTILO.enlace}">${escaparHtml(it.titulo)}</a></li>`,
          )
          .join("") +
        `</ul>`,
      `<p style="${ESTILO.nota}">${escaparHtml(avisoExpiracion)}</p>`,
      // El resumen va con tabla (no `<dl>`): es lo único que un cliente de correo alinea igual en
      // todas partes, y acá la alineación es lo que lo hace legible de un vistazo.
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;width:100%;border-top:1px solid ${tema.linea};">` +
        filasResumen
          .map(
            ([etiqueta, valor], i) =>
              `<tr>` +
              `<td style="padding:${i === 0 ? 12 : 4}px 8px 4px 0;font-size:13px;color:${ESTILO.colorSecundario};white-space:nowrap;">${escaparHtml(etiqueta)}</td>` +
              // Los montos y el número de orden en mono + `tabular-nums`, como todo número de la
              // marca (design.md §3) y como la columna de Números del panel.
              `<td style="padding:${i === 0 ? 12 : 4}px 0 4px;font-family:${FUENTE_MONO};font-size:13px;font-variant-numeric:tabular-nums;color:${ESTILO.colorTexto};" align="right">${escaparHtml(valor)}</td>` +
              `</tr>`,
          )
          .join("") +
        `</table>`,
    ],
  });

  return { from, subject, text, html };
}
