/**
 * DECISIÓN PURA del modo RESTRINGIDO del panel por facturación (F05/D4, ADR-0026).
 *
 * Cuando la Tienda entra «en pausa por pago» —dunning de Flow agotado, plan cancelado con el período
 * cerrado, o cortesía vencida— el panel se reduce a UNA página: «Plan», la que tiene el estado y el
 * `paymentLink` con que se regulariza. Es la palanca de cobro del lado del Organizador; la del lado
 * del Comprador es que el storefront deja de vender.
 *
 * Va SEPARADA de `decidirAccesoAdmin` (que resuelve host + sesión + membresía) porque son dos ejes
 * distintos y el ORDEN importa: primero se autoriza, y recién a un miembro legítimo se le cuenta que
 * su tienda está en pausa. Mezclarlas obligaría además a que la decisión de autorización —que hoy no
 * toca la DB de facturación— cargara el estado comercial de una tienda que quizá no administra.
 *
 * Sin request, sin DB, sin sesión: el borde (`guardPaginaAdmin`) resuelve los hechos y traduce.
 */

/** La única página del panel que responde con la Tienda en pausa. */
export const RUTA_PLAN = "/admin/plan";

export interface EntradaRestriccion {
  /** `true` sii la Tienda está PUBLICADA y su facturación no sostiene la venta (`enPausaPorFacturacion`). */
  enPausa: boolean;
  /** Ruta pedida dentro del panel, sin query (`/admin`, `/admin/productos`). */
  ruta: string;
}

/**
 * `{ destino }` si esta ruta debe redirigir; `null` si puede responder.
 *
 * El permiso se evalúa por SEGMENTO de ruta y no por prefijo de texto: `startsWith("/admin/plan")`
 * dejaría entrar cualquier ruta futura que arrancara con esas letras (`/admin/planificacion`), y la
 * restricción se convertiría en coladera por un descuido de naming. Las subrutas SÍ pasan
 * (`/admin/plan/retorno` es la vuelta de Flow tras re-registrar la tarjeta: si redirigiera, el
 * Organizador en pausa no podría cambiar su medio de pago — o sea, no podría salir de la pausa).
 */
export function decidirRestriccionFacturacion(
  entrada: EntradaRestriccion,
): { destino: string } | null {
  if (!entrada.enPausa) return null;
  const permitida =
    entrada.ruta === RUTA_PLAN || entrada.ruta.startsWith(`${RUTA_PLAN}/`);
  return permitida ? null : { destino: RUTA_PLAN };
}
