import {
  type PlatformInvoiceStatus,
  type PlatformSubscriptionStatus,
} from "@prisma/client";

/**
 * Núcleo PURO de la derivación del estado de la Suscripción de plataforma (F01, D15, ADR-0026).
 *
 * Flow **no tiene `past_due` nativo** (verificado contra `apiFlow.yaml` v7 durante el grill): expone
 * `status` (0 inactiva / 1 activa / 2 trial / 4 cancelada), un flag `morose` (0/1/2) y sus invoices
 * con reintentos. Nuestra máquina `AL_DIA → COBRO_PENDIENTE → EN_PAUSA_POR_PAGO → CANCELADA` es
 * DERIVADA de esos datos — ya verificados SERVER-SIDE contra la API de Flow con las credenciales de
 * plataforma (I3) —, jamás copiada de un campo suyo ni del cuerpo del webhook.
 *
 * Sin DB ni red: el caller (el webhook de F04, el cron de F09) carga los datos y este módulo decide.
 */

/** Estado numérico de Flow para una suscripción cancelada. */
const FLOW_STATUS_CANCELADA = 4;

export interface DatosDerivacion {
  /** `status` de Flow: 0 inactiva, 1 activa, 2 trial, 4 cancelada. */
  statusFlow: number;
  /** Flag `morose` de Flow: 0 = al día; 1/2 = con mora en curso. */
  morose: number;
  /**
   * Espejo local de los invoices de la suscripción (`PlatformInvoice`). El orden no importa: la
   * derivación busca el peor impago, no el último.
   */
  invoices: { estado: PlatformInvoiceStatus }[];
}

/**
 * Deriva el estado de la suscripción. Prioridad, de más fuerte a más débil:
 *
 * 1. **Cancelada en Flow** manda sobre todo: no hay cobro que reclamar.
 * 2. **Algún invoice VENCIDA** ⇒ `EN_PAUSA_POR_PAGO`: el dunning de Flow se agotó y la tienda deja
 *    de vender (D4). El corte exige esta evidencia DURA — un invoice que Flow declaró incobrable —,
 *    nunca el flag `morose` solo: `morose` puede quedar pegado y suspender una tienda por un dato
 *    rancio castigaría al Organizador Y a sus Compradores (I5).
 * 3. **Algún invoice FALLIDA o `morose > 0`** ⇒ `COBRO_PENDIENTE`: Flow está reintentando, la tienda
 *    SIGUE vendiendo y solo se avisa (banner + correo). Acá `morose` sí suma como señal blanda.
 * 4. Si no ⇒ `AL_DIA`.
 *
 * La regularización cae sola de esta tabla: cuando el invoice impago pasa a `PAGADA` y Flow limpia
 * `morose`, ya no queda nada que dispare 2 ni 3 y el estado vuelve a `AL_DIA`.
 */
export function derivarEstadoSuscripcion(
  d: DatosDerivacion,
): PlatformSubscriptionStatus {
  if (d.statusFlow === FLOW_STATUS_CANCELADA) return "CANCELADA";

  if (d.invoices.some((i) => i.estado === "VENCIDA")) {
    return "EN_PAUSA_POR_PAGO";
  }
  if (d.morose > 0 || d.invoices.some((i) => i.estado === "FALLIDA")) {
    return "COBRO_PENDIENTE";
  }
  return "AL_DIA";
}

/**
 * `true` sii la suscripción cuenta como ACTIVA para el pricing del Pagador (I8) — es decir, todo lo
 * que no esté cancelado. Una tienda morosa o en pausa **sigue ocupando su lugar en la cuenta**: su
 * suscripción existe en Flow y el Organizador la puede regularizar. Regalarle mitad de precio a la
 * siguiente tienda solo porque esta dejó de pagar sería premiar la mora.
 */
export function esActiva(estado: PlatformSubscriptionStatus): boolean {
  return estado !== "CANCELADA";
}
