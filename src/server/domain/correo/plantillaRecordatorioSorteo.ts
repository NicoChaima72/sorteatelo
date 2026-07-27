import { remitenteDeCorreo } from "~/config/correo";
import { escaparHtml, sanearCabecera } from "~/server/domain/correo/_correoBase";
import { fechaHoraEnChile } from "~/server/domain/correo/_fechaDeCorreo";
import { cabecerasDeAvisos } from "~/server/domain/correo/bajaDeAvisos";
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
 * Plantilla PURA de los **recordatorios del sorteo** — C2 (T-48h) y C3 (T-6h), F06/D3. Sin `db`,
 * sin red, sin `env`.
 *
 * ── Son el ÚNICO correo de marketing del sistema, y eso cambia todo ────────────────────────────
 * D3 los trata a los dos como marketing (postura legal uniforme, art. 28 B): salen **solo con
 * consentimiento verificable y sin supresión** (I5) y llevan **opt-out siempre** — cabeceras RFC
 * 8058 para el botón nativo del buzón + el enlace visible que pone el layout. Es exactamente lo
 * contrario de C1/C4/C5, que son transaccionales y no llevan nada de eso. Por eso el remitente sale
 * de la clase `avisos` y no de `transaccional`: cuando D2 se reactive con Resend Pro, estos correos
 * se mudan a su propio subdominio y la reputación de las confirmaciones no viaja con ellos.
 *
 * ── La diferencia entre los dos (D3) ───────────────────────────────────────────────────────────
 * - **T-48h: informativo.** Recuerda que el sorteo cierra y con qué números está participando. No
 *   empuja a comprar: a dos días de distancia, apurar a alguien es ruido.
 * - **T-6h: con CTA de compra.** El mismo contenido + la invitación a sumar más números, que a esa
 *   altura es información útil y no presión.
 *
 * ── Lo que el copy NO puede decir, y por qué ───────────────────────────────────────────────────
 * **Nunca «faltan 48 horas» ni «quedan 6 horas».** El job es reconciliation-based: si el cron se
 * salta una corrida el recordatorio sale más tarde (ver `ventanasDeRecordatorio`), así que cualquier
 * cuenta regresiva absoluta puede llegar mintiendo. Se dice la **fecha y hora de cierre en hora de
 * Chile** (I7), que es verdad en cualquier corrida — y además es más accionable.
 *
 * Voz chilena sobria, tuteo (design.md §8). Sin lenguaje de rifa, sin urgencia inventada, sin
 * mayúsculas gritando.
 */

/** El sorteo del que habla el recordatorio. */
export interface SorteoDelRecordatorio {
  /** Nombre — obligatorio: todo correo que habla de un sorteo lo NOMBRA (I10). */
  nombre: string;
  /** `Raffle.premio`: la razón por la que el Comprador entró. */
  premio: string;
  /** Cierre. Se muestra en hora de Chile con la zona explícita (I7). */
  fechaFin: Date;
  /** `Tenant.prefijoTicket` (D12) — el MISMO texto que muestra el panel. `null` ⇒ número pelado. */
  prefijoTicket: string | null;
  /** `Raffle.basesPdfUrl` (ADR-0008). Ausente ⇒ no se muestra el enlace, nunca uno roto. */
  basesUrl?: string | null;
}

export interface CorreoRecordatorioArmado {
  from: string;
  subject: string;
  text: string;
  html: string;
  /** Cabeceras RFC 8058 del one-click. Van SIEMPRE en este correo y NUNCA en un transaccional (I5). */
  headers: Record<string, string>;
}

/** Rótulo del grupo de boletos. Mono y en versalitas, como el resto de los sellos del talonario. */
const ROTULO_NUMEROS = "TUS NÚMEROS";

export function armarCorreoRecordatorioSorteo({
  nombreTienda,
  logoUrl,
  colorPrimario,
  identidadLegal,
  sorteo,
  numeros,
  offsetHoras,
  urlTienda,
  urlBaja,
}: {
  nombreTienda: string;
  /** `Tenant.logoUrl` — encabezado con el logo; sin él, el nombre como texto (D11). */
  logoUrl?: string | null;
  /** `Tenant.colorPrimario` — tematiza el cuerpo; inválido/ausente ⇒ theme base (I11). */
  colorPrimario?: string | null;
  /** `Tenant.identidadLegal` (D6) — quién responde por la venta, en el pie. */
  identidadLegal?: string | null;
  sorteo: SorteoDelRecordatorio;
  /** TODOS los Números que esta persona tiene en el sorteo (no los de una compra suelta). */
  numeros: number[];
  /**
   * Cuál de los dos recordatorios es (D3). Decide el CTA y el asunto, y nada más: el resto del
   * correo es idéntico, porque la información que el Comprador necesita no cambia con la hora.
   */
  offsetHoras: number;
  /** Home del storefront de la Tienda. Solo se usa en el T-6h (el CTA de compra). */
  urlTienda: string;
  /** URL de baja one-click (RFC 8058) — el layout la dibuja en el pie y va también en la cabecera. */
  urlBaja: string;
}): CorreoRecordatorioArmado {
  // Clase `avisos` (I5): remitente de avisos + cabeceras de baja. Las dos cosas salen de la misma
  // decisión y por eso viajan juntas — ver `ClaseDeCorreo` en `~/config/correo`.
  const from = construirFrom(nombreTienda, remitenteDeCorreo("avisos"));
  const tienda = sanearNombreTienda(nombreTienda);
  // El nombre del sorteo va al ASUNTO, o sea a una cabecera: se sanea antes (la lección de F04 —
  // un `\r\n` en el nombre del sorteo era una cabecera inyectada).
  const nombreSorteo = sanearCabecera(sorteo.nombre, "");
  const premio = sanearCabecera(sorteo.premio, "");
  const tema = temaDeCorreo(colorPrimario);
  const ESTILO = estilosDeCuerpo(tema);

  const cierre = fechaHoraEnChile(sorteo.fechaFin);
  const boletos = ticketsDeNumeros({
    numeros,
    tema,
    prefijo: sorteo.prefijoTicket,
  });

  // La ÚNICA diferencia entre C2 y C3 (D3). `ultimasHoras` es el T-6h: el más cercano al cierre.
  const ultimasHoras = offsetHoras <= 6;
  const sufijo = nombreSorteo ? ` ${nombreSorteo}` : "";
  const subject = ultimasHoras
    ? `Últimas horas del sorteo${sufijo}`
    : `El sorteo${sufijo} de ${tienda} cierra pronto`;

  const lineaCierre = `El sorteo${sufijo} de ${tienda} cierra el ${cierre}.`;
  const lineaPremio = premio ? `El premio es ${premio}.` : "";
  // El CTA nombra lo que hace («sumar más números») y no «comprar ahora»: es lo que el Comprador
  // realmente gana, y es lo que la Tienda puede cumplir.
  const cta = ultimasHoras
    ? `Si quieres sumar más números, todavía alcanzas: ${urlTienda}`
    : "";

  const bases = sorteo.basesUrl
    ? {
        texto: [`Bases del sorteo: ${sorteo.basesUrl}`, ``],
        html: [
          `<p style="${ESTILO.nota}margin-bottom:12px;"><a href="${escaparHtml(sorteo.basesUrl)}" style="${ESTILO.enlace}">Bases del sorteo</a></p>`,
        ],
      }
    : { texto: [], html: [] };

  const { text, html } = envolverEnLayout({
    nombreTienda,
    logoUrl,
    colorPrimario,
    identidadLegal,
    nombreSorteo: sorteo.nombre, // slot del layout (I10)
    // El pie dibuja el enlace visible de baja; la cabecera del one-click va aparte, en `headers`.
    urlBaja,
    preheader: boletos.texto
      ? `Tus números: ${boletos.texto}`
      : lineaCierre,
    texto: [
      `Hola,`,
      ``,
      lineaCierre,
      ...(lineaPremio ? [lineaPremio] : []),
      ``,
      ...(boletos.texto
        ? [`Tus números en este sorteo:`, ``, `  ${boletos.texto}`, ``]
        : []),
      ...(cta ? [cta, ``] : []),
      ...bases.texto,
    ],
    html: [
      `<p style="${ESTILO.parrafo}">Hola,</p>`,
      `<p style="${ESTILO.parrafo}">El sorteo${nombreSorteo ? ` <strong>${escaparHtml(nombreSorteo)}</strong>` : ""} de ${escaparHtml(tienda)} cierra el <strong>${escaparHtml(cierre)}</strong>.${lineaPremio ? ` ${escaparHtml(lineaPremio)}` : ""}</p>`,
      ...(boletos.html
        ? [
            `<p style="margin:0 0 8px;font-family:${FUENTE_MONO};font-size:11px;letter-spacing:0.08em;color:${ESTILO.colorSecundario};">${ROTULO_NUMEROS}</p>`,
            boletos.html,
          ]
        : []),
      ...(ultimasHoras
        ? [
            `<p style="${ESTILO.parrafo}padding-top:8px;">Si quieres sumar más números, todavía alcanzas: <a href="${escaparHtml(urlTienda)}" style="${ESTILO.enlace}">${escaparHtml(tienda)}</a>.</p>`,
          ]
        : []),
      ...bases.html,
    ],
  });

  return {
    from,
    subject,
    text,
    html,
    headers: cabecerasDeAvisos({ urlBaja }),
  };
}
