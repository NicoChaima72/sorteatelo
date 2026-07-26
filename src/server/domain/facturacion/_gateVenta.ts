import {
  type PlatformSubscriptionStatus,
  type TenantStatus,
} from "@prisma/client";

/**
 * Núcleo PURO del gate de venta derivado (F01/F05, D4/D5, ADR-0026). Es la ÚNICA fuente de verdad
 * de «¿esta Tienda puede vender AHORA?», y la comparten por construcción el SSR del storefront, el
 * checkout y el modo restringido del panel.
 *
 * La regla (D5): `PUBLICADA && (facturación al día || exenta vigente)`. El eje de facturación está
 * SEPARADO de `TenantStatus`, que queda intacto (I6): una tienda morosa **sigue** `PUBLICADA` —
 * simplemente no vende — y `SUSPENDIDA` conserva su semántica de incumplimiento (ADR-0023).
 *
 * Lo que este gate NO toca (I5, la regla que protege al Comprador): las descargas por Entitlement
 * (`/api/descargas/[token]`) y el verificador de tickets. El Comprador nunca paga la mora del
 * Organizador — ya compró, y lo suyo sigue funcionando aunque la tienda esté en pausa.
 *
 * Sin DB ni sesión: el caller carga los datos y este módulo decide.
 */

/** Por qué una Tienda NO puede vender. Alimenta la página neutral y el banner del panel (F05). */
export type MotivoSinVenta =
  /** La Tienda no está PUBLICADA (eje operativo, no de facturación). */
  | "NO_PUBLICADA"
  /** Nunca activó su plan, o lo canceló y se cerró el período. */
  | "SIN_PLAN"
  /** El dunning de Flow se agotó: hay que regularizar con el `paymentLink`. */
  | "EN_PAUSA_POR_PAGO"
  /** Tenía Exención con fecha y se venció (evaluado lazy acá, D8). */
  | "EXENCION_EXPIRADA";

export interface DatosGateVenta {
  estadoTienda: TenantStatus;
  /** Estado de su `PlatformSubscription`, o `null` si no tiene (nunca publicó / re-suscribir). */
  estadoSuscripcion: PlatformSubscriptionStatus | null;
  /** Su `PlatformExemption`, o `null`. `exentaHasta: null` = perpetua. */
  exencion: { exentaHasta: Date | null } | null;
  /**
   * "Ahora" INYECTADO: la expiración de la exención se evalúa lazy en este mismo gate (D8), sin
   * cron que corte. Inyectarlo mantiene el núcleo puro y hace testeable el borde de la fecha.
   */
  ahora: Date;
}

export interface EstadoGateVenta {
  puedeVender: boolean;
  /** `true` si vende por Exención vigente (la página Plan muestra "Plan cortesía"). */
  exenta: boolean;
  /** Por qué no vende; `null` cuando sí puede. */
  motivo: MotivoSinVenta | null;
}

/**
 * `true` sii la suscripción, POR SÍ SOLA, sostiene la venta (D4): durante los reintentos de Flow la
 * tienda sigue operando y solo se avisa. Vive acá y no inline en el gate porque lo consultan también
 * las superficies que hablan del VENCIMIENTO de una cortesía — el preaviso del banner (F07) y la
 * página Plan —, y las tres tienen que responder lo mismo: si hay un plan que la sostiene después,
 * el vencimiento de la cortesía no es un evento y no hay nada que anunciar.
 */
export function suscripcionSostieneVenta(
  estado: PlatformSubscriptionStatus | null,
): boolean {
  return estado === "AL_DIA" || estado === "COBRO_PENDIENTE";
}

/** `true` sii la exención está vigente al momento `ahora` (perpetua = `exentaHasta` null). */
export function exencionVigente(
  exencion: { exentaHasta: Date | null } | null,
  ahora: Date,
): boolean {
  if (!exencion) return false;
  return (
    exencion.exentaHasta === null || exencion.exentaHasta.getTime() > ahora.getTime()
  );
}

/**
 * Evalúa el gate. Orden de las ramas, y por qué:
 *
 * 1. **`TenantStatus` primero**: si la Tienda no está publicada no hay nada que discutir, y así el
 *    motivo que sale es el operativo (no uno de facturación que confundiría al Organizador).
 * 2. **Exención vigente**: gana sobre cualquier estado de suscripción — una tienda cortesía no
 *    tiene suscripción Flow ni tarjeta (D8), así que preguntar por su plan no tiene sentido.
 * 3. **Suscripción**: `AL_DIA` y `COBRO_PENDIENTE` venden (D4 — durante los reintentos de Flow solo
 *    se avisa: banner + correo, la tienda sigue operando); `EN_PAUSA_POR_PAGO` no; `CANCELADA` y
 *    "sin fila" son el mismo caso de cara al Comprador: no hay plan que sostenga la venta.
 * 4. Si nada la habilita y su exención venció, el motivo lo dice explícitamente
 *    (`EXENCION_EXPIRADA`) en vez del genérico `SIN_PLAN`: son dos conversaciones distintas con el
 *    Organizador.
 */
export function evaluarGateVenta(d: DatosGateVenta): EstadoGateVenta {
  if (d.estadoTienda !== "PUBLICADA") {
    return { puedeVender: false, exenta: false, motivo: "NO_PUBLICADA" };
  }

  if (exencionVigente(d.exencion, d.ahora)) {
    return { puedeVender: true, exenta: true, motivo: null };
  }

  if (suscripcionSostieneVenta(d.estadoSuscripcion)) {
    return { puedeVender: true, exenta: false, motivo: null };
  }

  if (d.estadoSuscripcion === "EN_PAUSA_POR_PAGO") {
    return { puedeVender: false, exenta: false, motivo: "EN_PAUSA_POR_PAGO" };
  }

  // Sin plan vivo. Si la Tienda TENÍA exención y se venció, ese es el motivo real.
  const motivo: MotivoSinVenta = d.exencion ? "EXENCION_EXPIRADA" : "SIN_PLAN";
  return { puedeVender: false, exenta: false, motivo };
}

/**
 * `true` sii la Tienda está **"en pausa"** (D4): publicada, pero su facturación no sostiene la venta.
 * Es el ÚNICO interruptor de los dos efectos de F05 — el storefront sirve la página neutral y el panel
 * queda restringido a la página Plan.
 *
 * Se define por NEGACIÓN del único motivo del eje OPERATIVO (`NO_PUBLICADA`) en vez de enumerar los
 * del eje comercial: así un motivo nuevo de facturación entra al modo pausa por DEFAULT. La falla
 * segura es «se avisa y se restringe», nunca «sigue vendiendo sin plan».
 *
 * Dos consecuencias deliberadas de que el eje operativo NO encienda la pausa (I6 — los ejes no se
 * mezclan):
 * - Una tienda en `CONFIGURACION` no vende, pero su panel queda ENTERO: restringirlo sería impedirle
 *   terminar de configurarse, que es justo lo que tiene que hacer para publicar y empezar a pagar.
 * - Una tienda DESPUBLICADA que además debe tampoco queda restringida: ya no vende (la palanca de
 *   cobro está aplicada por su propia mano) y despublicar no cancela la suscripción (D6), así que la
 *   deuda sigue viva y el banner igual se lo dice. Encerrarla en la página Plan por una tienda que
 *   ella misma sacó de circulación no cobra más rápido, solo estorba.
 */
export function enPausaPorFacturacion(estado: EstadoGateVenta): boolean {
  return !estado.puedeVender && estado.motivo !== "NO_PUBLICADA";
}

/**
 * Cuántos días antes del vencimiento de una Exención se empieza a avisar (F07/D8). Lo comparten el
 * banner del panel y el correo (6) del cron diario (F09/D11): el Organizador que ve el cartel y el
 * que recibe el correo tienen que estar hablando de la misma ventana.
 */
export const DIAS_AVISO_EXPIRACION_EXENCION = 7;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * `true` sii la Exención está VIGENTE pero le quedan `DIAS_AVISO_EXPIRACION_EXENCION` días o menos
 * (F07/D8). Dos exclusiones deliberadas:
 * - **Perpetua** (`exentaHasta: null`, el GRANDFATHER del despliegue, D3): no vence nunca, así que
 *   avisarle una expiración sería inventarle un problema.
 * - **Ya vencida**: eso no es un preaviso sino un hecho consumado, y tiene su propio aviso
 *   (`EXENCION_EXPIRADA`, con la tienda ya en pausa).
 */
export function exencionPorExpirar(
  exencion: { exentaHasta: Date | null } | null,
  ahora: Date,
): boolean {
  const hasta = exencion?.exentaHasta;
  if (!hasta) return false;
  if (!exencionVigente(exencion, ahora)) return false;
  return hasta.getTime() - ahora.getTime() <= DIAS_AVISO_EXPIRACION_EXENCION * MS_POR_DIA;
}

/**
 * Qué se le avisa al Organizador sobre su facturación (banner del panel, F05/D4 + F07/D8).
 * `null` = nada.
 *
 * Dos de los avisos NO cortan la venta y aun así se muestran: `COBRO_PENDIENTE` (D4 literal: durante
 * los reintentos de Flow la tienda sigue vendiendo y solo se avisa) y `EXENCION_POR_EXPIRAR` (la
 * cortesía todavía vale, pero se termina). El resto son los motivos de la pausa, nombrados uno por
 * uno porque cada uno pide una acción distinta del Organizador — regularizar un cobro, re-suscribir
 * tras cancelar o contratar al vencer la cortesía son tres conversaciones, no un «hay un problema»
 * genérico.
 */
export type AvisoFacturacion =
  | "COBRO_PENDIENTE"
  | "EXENCION_POR_EXPIRAR"
  | Exclude<MotivoSinVenta, "NO_PUBLICADA">;

/**
 * Precedencia por GRAVEDAD: la pausa manda sobre el aviso de reintento, y este sobre el preaviso de
 * la cortesía.
 *
 * La pausa vs. el reintento son en la práctica excluyentes (una suscripción en `COBRO_PENDIENTE`
 * habilita la venta), salvo en la tienda despublicada morosa — donde el gate devuelve `NO_PUBLICADA`,
 * no hay pausa que anunciar y el aviso que corresponde es el del cobro fallido.
 *
 * El reintento sobre el preaviso SÍ puede darse de verdad: una tienda que se suscribió y DESPUÉS
 * recibió una cortesía con fecha puede tener las dos cosas a la vez. Gana el cobro fallido, que es
 * plata real y tiene una tarjeta que arreglar hoy.
 *
 * **El preaviso de la cortesía solo sale si la Tienda va a dejar de vender cuando venza.** Con un
 * plan que la sostiene después (`suscripcionSostieneVenta`), el vencimiento es un no-evento: no hay
 * nada que avisar y el copy del banner —«tu tienda vende sin costo», «va a necesitar un plan»— sería
 * directamente falso para alguien a quien ya le están cobrando.
 *
 * **Decisión explícita, no olvido**: una tienda exenta con la suscripción en `EN_PAUSA_POR_PAGO`
 * (dunning agotado ANTES de que se le otorgara la cortesía) no ve el banner de la deuda mientras la
 * cortesía viva. Otorgar cortesía a quien no pudo pagar es precisamente el Operador diciendo «no me
 * pagues por ahora, sigue vendiendo»; perseguirla con un cartel rojo de mora sería contradecir su
 * propia decisión. Al vencer la cortesía el gate vuelve a `EN_PAUSA_POR_PAGO` y el aviso —con su
 * `paymentLink`— reaparece solo.
 */
export function derivarAvisoFacturacion(d: {
  gate: EstadoGateVenta;
  estadoSuscripcion: PlatformSubscriptionStatus | null;
  /** Su `PlatformExemption`, para el preaviso de expiración (F07/D8). */
  exencion: { exentaHasta: Date | null } | null;
  /** "Ahora" INYECTADO, igual que en el gate: la ventana se evalúa lazy, sin cron que la abra. */
  ahora: Date;
}): AvisoFacturacion | null {
  const { puedeVender, motivo } = d.gate;
  if (!puedeVender && motivo !== null && motivo !== "NO_PUBLICADA") return motivo;
  if (d.estadoSuscripcion === "COBRO_PENDIENTE") return "COBRO_PENDIENTE";
  if (
    !suscripcionSostieneVenta(d.estadoSuscripcion) &&
    exencionPorExpirar(d.exencion, d.ahora)
  ) {
    return "EXENCION_POR_EXPIRAR";
  }
  return null;
}
