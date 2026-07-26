import { z } from "zod";

/**
 * Inputs Zod de la facturación de la plataforma (F03, ADR-0026).
 *
 * Lo que NO hay acá es tan importante como lo que hay: **ningún input de plan, precio, monto ni
 * `tenantId`** (I4, lección H1 de datawalt-app). El plan y el monto los calcula el dominio contando
 * las suscripciones activas del Pagador; el tenant sale del host resuelto server-side. Si algún día
 * aparece un `plan` en este archivo, es un bug de seguridad económica.
 */

/** Largo máximo de un código de cupón. Tope defensivo: un código se reparte, no se redacta. */
const MAX_LARGO_CODIGO = 40;

export const iniciarRegistroTarjetaInput = z.object({
  /**
   * Código de [[Cupón de plataforma]] OPCIONAL. Se normaliza (mayúsculas, sin espacios) y se valida
   * SERVER-SIDE contra `PlatformCoupon`; un código inválido nunca llega a Flow.
   */
  codigo: z.string().trim().max(MAX_LARGO_CODIGO).optional(),
});

/**
 * Token que Flow devuelve en la `url_return` del registro de tarjeta. Es un IDENTIFICADOR para
 * consultar, no una prueba: el use case lo verifica contra `customer/getRegisterStatus` antes de
 * crear o cambiar cualquier cosa (I3).
 */
const tokenDeRegistro = z.object({
  token: z.string().min(1).max(200),
});

/** Retorno de la ACTIVACIÓN del plan (F03): del token nace la suscripción. */
export const activarPlanTrasRegistroInput = tokenDeRegistro;

/**
 * Retorno del CAMBIO de tarjeta (F10): del token sale la tarjeta nueva y nada más. Comparte forma
 * con el anterior pero se nombra aparte porque son dos flujos con guards distintos —uno exige que NO
 * haya plan activo, el otro que SÍ— y el día que uno gane un campo, el otro no debería heredarlo.
 */
export const confirmarCambioDeTarjetaInput = tokenDeRegistro;
