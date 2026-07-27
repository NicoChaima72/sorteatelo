import {
  FLOW_PROD_BASE_URL,
  FLOW_SANDBOX_BASE_URL,
  firmarParams,
} from "~/server/services/flow";

/**
 * Service Flow SUSCRIPCIONES de PLATAFORMA — adapter a la cuenta Flow PROPIA de Sortéatelo
 * (ADR-0026). Es el **otro mundo del dinero**: acá la Plataforma le cobra SU mensualidad a los
 * Organizadores. No contradice ADR-0006 («la plataforma nunca mueve plata de terceros»): esta
 * plata es propia.
 *
 * ── I1, mundos separados ──────────────────────────────────────────────────────────────────────
 * Este módulo **no importa nada de `server/pago/`**: ni `FlowCredential`, ni `flowDeTenant`, ni el
 * cifrado AES de las credenciales BYO. Lo ÚNICO que comparte con el service BYO (`services/flow.ts`)
 * es la primitiva pública de firma (`firmarParams`) y las dos base URLs — el algoritmo HMAC de Flow
 * es el mismo para cualquier cuenta; lo que jamás se cruza son las CREDENCIALES.
 *
 * En la app hay **un solo productor** de este service: `server/facturacion/flowPlataformaDeEnv.ts`,
 * que no recibe argumentos y lee las env vars `FLOW_PLATAFORMA_*`. Que la factory acepte la config
 * explícita es lo que la hace testeable (convención de `services/`: nunca importar `~/env` adentro);
 * que el único cableado real sea el borde de env es lo que sostiene I1. Hay un test de regresión
 * (`flowPlataforma.i1.*`) que se pone rojo si alguien importa `crearFlowPlataformaService` fuera de
 * ese borde o si este archivo empieza a hablar con el mundo BYO.
 *
 * Las credenciales de plataforma viven SOLO en env — jamás en DB, logs ni respuestas (I7): fail-fast
 * con el NOMBRE de la env var faltante, nunca con su valor.
 */

/** Respuesta cruda de la API de Flow (JSON ya parseado). Cada método la refina a su shape. */
export type RespuestaFlow = Record<string, unknown>;

export type HttpPostPlataforma = (
  url: string,
  form: Record<string, string>,
) => Promise<RespuestaFlow>;

export type HttpGetPlataforma = (
  url: string,
  query: Record<string, string>,
) => Promise<RespuestaFlow>;

export interface FlowPlataformaConfig {
  apiKey: string | undefined;
  secretKey: string | undefined;
  /** Ambiente de la cuenta de PLATAFORMA (no la del tenant). Default: sandbox. */
  sandbox?: boolean;
  /** Inyectables para test; en runtime pegan con `fetch` a la API de Flow. */
  httpPost?: HttpPostPlataforma;
  httpGet?: HttpGetPlataforma;
}

// ── Constantes de la API de Flow Suscripciones ───────────────────────────────────────────────
/** `interval` = 3 significa MENSUAL en la API de Flow. */
export const FLOW_INTERVAL_MENSUAL = 3;
/** `status` de `customer/getRegisterStatus`: 1 = tarjeta registrada OK. */
export const FLOW_REGISTRO_OK = 1;
/** `status` de una suscripción de Flow: 0 inactiva, 1 activa, 2 trial, 4 cancelada. */
export const FLOW_SUSCRIPCION_CANCELADA = 4;
/**
 * `status` de un COBRO de Flow (el bloque `payment` de un invoice y la respuesta de
 * `payment/getStatus`): 1 pendiente, 2 pagada, 3 rechazada, 4 anulada.
 */
export const FLOW_PAGO_PAGADO = 2;

// ── Shapes de respuesta que consumimos ───────────────────────────────────────────────────────

export interface FlowPlan {
  planId: string;
  name?: string;
  amount?: number;
  currency?: string;
  interval?: number;
  status?: number;
}

export interface FlowCustomer {
  customerId: string;
  name?: string;
  email?: string;
  externalId?: string;
  /** Marca de la tarjeta registrada (dato NO sensible). */
  creditCardType?: string | null;
  /** Últimos 4 dígitos (dato NO sensible). */
  last4CardDigits?: string | null;
  /** 1 = tiene tarjeta registrada. */
  registerStatus?: string | number | null;
}

export interface FlowRegistroTarjeta {
  /**
   * URL COMPLETA a la que se redirige al Pagador para que ingrese su tarjeta — con el `?token=` ya
   * concatenado. Flow devuelve `url` y `token` por separado y **exige las dos partes juntas**: la
   * `url` pelada contesta «¡Ups! Ha ocurrido un error / Error Processing Request» (verificado contra
   * el sandbox, 3ª pasada del E2E). Mismo nombre y misma forma que `crearPago` del service BYO, que
   * ya lo resolvía así (`services/flow.ts`).
   */
  redirectUrl: string;
  token: string;
}

export interface FlowEstadoRegistro {
  /**
   * 1 = registro OK. Cualquier otra cosa NO habilita crear la suscripción (I3). Viaja como
   * **string** en el sandbox real (`"1"`), de ahí el `Number(...)` en los use cases — el tipo dice
   * las dos formas para que nadie asuma que se puede comparar con `===` a un número.
   */
  status: string | number;
  customerId?: string;
  creditCardType?: string | null;
  last4CardDigits?: string | null;
}

export interface FlowSuscripcion {
  subscriptionId: string;
  planId?: string;
  customerId?: string;
  /** 0 inactiva, 1 activa, 2 trial, 4 cancelada. */
  status?: number;
  /** Flag de mora de Flow: 0 al día, 1/2 con mora. NO es un `past_due` (D15). */
  morose?: number;
  period_start?: string | null;
  period_end?: string | null;
  next_invoice_date?: string | null;
  cancel_at_period_end?: number | null;
  /** Cuándo SURTE EFECTO un `changePlan` programado (temporalidad 2, D7). */
  new_plan_scheduled_change_date?: string | null;
  invoices?: FlowInvoice[];
}

/**
 * El bloque `payment` de un invoice: el cobro y, si se pagó, su pago. **Solo viene en
 * `invoice/get`** — el invoice embebido en `subscription/get` no lo trae.
 */
export interface FlowPagoDeInvoice {
  /** 1 pendiente de pago, 2 pagada, 3 rechazada, 4 anulada. */
  status?: number;
  paymentData?: {
    /** Cuándo se movió la plata (reloj de pared de Chile, ver `_fechaFlow.ts`). */
    date?: string | null;
    fee?: number | string | null;
    balance?: number | string | null;
  } | null;
}

/**
 * Un invoice de Flow, con las claves que la API manda DE VERDAD (verificado contra `apiFlow.yaml`
 * v7 y contra los payloads del sandbox, blocker 5 de la 4ª pasada del E2E).
 *
 * **Ojo con la superficie disponible**: `subscription/get` embebe una versión RECORTADA de este
 * objeto —sin `payment`, `paymentLink`, `error*` ni `chargeAttemps`—, así que todo lo que dependa de
 * esos cuatro campos necesita un `invoice/get` aparte. Lo que sí viaja embebido es `status`, que es
 * lo que permite derivar el estado del ledger sin una llamada extra por invoice.
 */
export interface FlowInvoice {
  id: number | string;
  subscriptionId?: string;
  customerId?: string;
  /** **0 impago, 1 pagado, 2 anulado.** El campo autoritativo del estado del cobro. */
  status?: number;
  /** Monto del importe. Flow lo manda como STRING con 4 decimales (`"25000.0000"`). */
  amount?: number | string;
  subject?: string;
  created?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  /** Fecha desde la cual Flow considera moroso el importe. */
  due_date?: string | null;
  next_attemp_date?: string | null; // sic: typo del proveedor
  /** Número de intentos de cobro del importe, **incluido el exitoso**. */
  attemp_count?: number; // sic
  /**
   * **NO es un contador**: «si este importe se cobrará» — 1 se cobrará, 0 no se cobrará. Un invoice
   * PAGADO viene con `attemped: 0` (y `attemp_count: 1`).
   */
  attemped?: number; // sic
  /** 0 sin error, 1 si el intento de cobro falló. */
  error?: number;
  errorDate?: string | null;
  errorDescription?: string | null;
  /** Link para pagar a mano. Solo en `invoice/get`, y solo mientras el invoice NO está pagado. */
  paymentLink?: string | null;
  /** Solo en `invoice/get`. */
  payment?: FlowPagoDeInvoice | null;
  /** Intentos de cargo **fallidos**. Solo en `invoice/get`. */
  chargeAttemps?: unknown[];
}

/**
 * Respuesta de `payment/getStatus` — el endpoint con el que se resuelve el `token` que Flow postea
 * al notificar una suscripción (F04). Es el MISMO endpoint que usa el webhook de ventas BYO, con
 * otras credenciales.
 */
export interface FlowEstadoPago {
  /**
   * La referencia del cobro. En una suscripción Flow la arma como
   * `<subscriptionId>_<invoiceId>_<fecha>` — es lo único que dice DE QUÉ suscripción habla la
   * notificación. Se parsea con `domain/facturacion/_commerceOrderFlow.ts`.
   */
  commerceOrder?: string | null;
  /** 1 pendiente, 2 pagado, 3 rechazado, 4 anulado. */
  status?: number;
  amount?: number | string | null;
}

export interface FlowCupon {
  id: number | string;
  name?: string;
  percent_off?: number | null;
  amount?: number | null;
  currency?: string | null;
  status?: number;
}

// ── Interfaz del service ─────────────────────────────────────────────────────────────────────

export interface CrearPlanInput {
  planId: string;
  name: string;
  /** Monto BRUTO mensual en CLP entero, ya serializado desde `Decimal` (nunca `number`). */
  amount: string;
  /** URL del webhook de suscripciones (F04). Flow notifica acá cada evento del plan. */
  urlCallback: string;
  /** Reintentos de cobro antes de dar el invoice por incobrable. Default de Flow: 3. */
  chargesRetriesNumber?: number;
  /** Días de gracia antes de considerar vencido el invoice. Default de Flow: 3. */
  daysUntilDue?: number;
}

export interface CrearSuscripcionInput {
  planId: string;
  customerId: string;
  /** Cupón de plataforma ya validado y reservado server-side (D9). */
  couponId?: string;
}

export interface FlowPlataformaService {
  // plan/*
  crearPlan(input: CrearPlanInput): Promise<FlowPlan>;
  getPlan(planId: string): Promise<FlowPlan>;
  // customer/*
  crearCustomer(input: {
    name: string;
    email: string;
    externalId: string;
  }): Promise<FlowCustomer>;
  getCustomer(customerId: string): Promise<FlowCustomer>;
  /** Inicia el registro de tarjeta: devuelve la URL a la que redirigir al Pagador. */
  registrarTarjeta(input: {
    customerId: string;
    urlReturn: string;
  }): Promise<FlowRegistroTarjeta>;
  /** Confirma SERVER-SIDE el resultado del registro; el redirect del navegador no prueba nada (I3). */
  getEstadoRegistro(token: string): Promise<FlowEstadoRegistro>;
  // subscription/*
  crearSuscripcion(input: CrearSuscripcionInput): Promise<FlowSuscripcion>;
  getSuscripcion(subscriptionId: string): Promise<FlowSuscripcion>;
  /** Cancela; con `alFinDelPeriodo` la tienda sigue vendiendo hasta cerrar el período (D6). */
  cancelarSuscripcion(input: {
    subscriptionId: string;
    alFinDelPeriodo: boolean;
  }): Promise<FlowSuscripcion>;
  /**
   * Cambio de plan (D7). **Es inmediato y NO es gratis**: Flow mueve el `planId` en el acto y emite
   * —y cobra— una factura por la diferencia del período EN CURSO. O sea que llamarlo a mitad de un
   * período ya pagado le cobra al Organizador un mes que no pidió (blocker 6 de la 4ª pasada del
   * E2E). Por eso el único caller es el cron (`facturacion/promocionesDePlan.ts`), que espera a que
   * el período que se está cobrando sea el que corresponde al plan nuevo.
   *
   * Tampoco es idempotente: repetirlo responde `400 code 1001` («el plan seleccionado es el mismo
   * que el actual»), que en la práctica es la confirmación de que ya estaba hecho.
   *
   * **`temporality` no existe.** Se le mandaba un `temporality: 2` creyendo que programaba el cambio;
   * los parámetros documentados de `subscription/changePlan` son `subscriptionId`, `newPlanId` y
   * `startDateOfNewPlan` (opcional, `YYYY-mm-dd`, y **tiene que caer dentro del ciclo de facturación
   * en curso**). Esa fecha tampoco sirve para diferir la promoción a la renovación siguiente: no se
   * puede apuntar fuera del ciclo actual, y `Subscription.in_new_plan_next_attempt_date` deja claro
   * que el cambio programado arrastra su propio intento de cobro igual. La programación es NUESTRA.
   */
  cambiarPlan(input: {
    subscriptionId: string;
    nuevoPlanId: string;
  }): Promise<FlowSuscripcion>;
  // invoice/*
  getInvoice(invoiceId: string): Promise<FlowInvoice>;
  // payment/*
  /**
   * Estado de un cobro por su `token`. Es la puerta de entrada del webhook (F04): Flow notifica las
   * suscripciones con un token y nada más, y de acá sale el `commerceOrder` que dice a qué
   * suscripción pertenece.
   */
  getEstadoPago(token: string): Promise<FlowEstadoPago>;
  // coupon/*
  crearCupon(input: {
    name: string;
    percentOff?: number;
    amount?: string;
    /**
     * Cuántos períodos dura el descuento: 1 = solo el primer cobro, N = N cobros,
     * `undefined` = para siempre. La traducción al `duration`/`times` de Flow vive en el adapter.
     */
    duracionPeriodos?: number;
    /** ISO `YYYY-MM-DD`. */
    expira?: string;
    maxRedemptions?: number;
  }): Promise<FlowCupon>;
}

/**
 * 4xx que NO son culpa del request: no los arregla cambiar lo que se manda, sino el tiempo o una
 * credencial correcta. `408`/`425` son timeouts de un proxy delante de Flow; `429` es rate limit;
 * `401`/`403` son la credencial de plataforma rotada o mal seteada en el despliegue.
 */
const ESTADOS_TRANSITORIOS = new Set([401, 403, 408, 425, 429]);

/**
 * Un error de la API de Flow con su código a la vista. Existe porque **hay decisiones que dependen
 * de si el rechazo es definitivo o transitorio**, y con un `Error` genérico habría que parsear texto:
 *
 * - El webhook (F04) tiene que ackear 200 ante un token que Flow no reconoce —reintentar no lo va a
 *   arreglar, y machacar con 500 arriesga que Flow desactive el `urlCallback`— y responder 500 ante
 *   una caída, donde el reintento es justamente la red que no pierde el cobro. La línea fina entre
 *   una cosa y la otra la traza `esIrreintentable`.
 * - El recálculo de planes (F06) tiene que tragarse el `code 1001` de `changePlan` («el plan
 *   seleccionado es el mismo que el actual»), que no es una falla sino la confirmación de que el
 *   cambio ya estaba hecho — `changePlan` NO es idempotente (verificado en el sandbox).
 *
 * NUNCA lleva credenciales: solo la ruta, el status HTTP y lo que Flow puso en `code`/`message` (I7).
 */
export class ErrorFlowPlataforma extends Error {
  readonly ruta: string;
  readonly httpStatus: number;
  readonly codigoFlow: number | null;

  constructor(args: {
    ruta: string;
    httpStatus: number;
    codigoFlow: number | null;
    mensajeFlow: string | null;
  }) {
    const detalle =
      args.codigoFlow === null
        ? ""
        : ` (code ${args.codigoFlow}${args.mensajeFlow ? `: ${args.mensajeFlow}` : ""})`;
    super(`Flow (plataforma) ${args.ruta} respondió ${args.httpStatus}${detalle}.`);
    this.name = "ErrorFlowPlataforma";
    this.ruta = args.ruta;
    this.httpStatus = args.httpStatus;
    this.codigoFlow = args.codigoFlow;
  }

  /**
   * `true` si insistir no puede cambiar el resultado: Flow entendió el request y lo rechazó por lo
   * que decía, no por cómo estaba el mundo.
   *
   * Los tres 4xx excluidos son la línea fina, y equivocarla cuesta un cobro: **401/403** (credencial
   * de plataforma rotada o mal seteada en Vercel) y **429** (rate limit bajo una ráfaga de
   * notificaciones) son fallos NUESTROS y pasajeros. Si el webhook los leyera como definitivos
   * ackearía 200, Flow no reintentaría nunca y el cobro se perdería en silencio — el modo de falla
   * del blocker 4, en una versión mucho más difícil de diagnosticar (el resto de la app seguiría
   * andando). Se arreglan solos en cuanto la credencial vuelve o baja la ráfaga.
   */
  get esIrreintentable(): boolean {
    if (ESTADOS_TRANSITORIOS.has(this.httpStatus)) return false;
    return this.httpStatus >= 400 && this.httpStatus < 500;
  }
}

/**
 * Falta una credencial de plataforma en el entorno. Es una clase aparte de `ErrorFlowPlataforma`
 * porque el destinatario es otro: acá **no falló Flow, falló el despliegue**, y el mensaje —que
 * nombra la env var— es lo único accionable que hay. Por eso es el único error del mundo Flow que
 * NO se traduce a una frase genérica antes de llegar a la pantalla (ver `_erroresDeFlow.ts`).
 */
export class ErrorConfiguracionFlow extends Error {
  constructor(readonly envVar: string) {
    super(
      `Falta ${envVar} para operar la facturación de la plataforma — configúrala en .env (ver .env.example).`,
    );
    this.name = "ErrorConfiguracionFlow";
  }
}

/**
 * Fail-fast de una credencial de PLATAFORMA. El mensaje nombra la env var que falta y JAMÁS incluye
 * su valor (I7) — mejor un 500 explícito que un cobro silenciosamente roto.
 */
function exigir(valor: string | undefined, envVar: string): string {
  if (!valor) throw new ErrorConfiguracionFlow(envVar);
  return valor;
}

/** Descarta las claves `undefined` y castea todo a string (la API de Flow es form-urlencoded). */
function limpiar(
  params: Record<string, string | number | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
}

export function crearFlowPlataformaService(
  config: FlowPlataformaConfig,
): FlowPlataformaService {
  const baseUrl =
    config.sandbox === false ? FLOW_PROD_BASE_URL : FLOW_SANDBOX_BASE_URL;
  const httpPost = config.httpPost ?? fetchPost;
  const httpGet = config.httpGet ?? fetchGet;

  /** Credenciales exigidas EN CADA llamada (no al construir): fail-fast en runtime, patrón `services/flow.ts`. */
  function credenciales() {
    return {
      apiKey: exigir(config.apiKey, "FLOW_PLATAFORMA_API_KEY"),
      secretKey: exigir(config.secretKey, "FLOW_PLATAFORMA_SECRET_KEY"),
    };
  }

  /** POST firmado a la API de Flow. */
  async function post(
    ruta: string,
    params: Record<string, string | number | undefined>,
  ): Promise<RespuestaFlow> {
    const { apiKey, secretKey } = credenciales();
    const limpios = limpiar({ ...params, apiKey });
    return httpPost(`${baseUrl}/${ruta}`, {
      ...limpios,
      s: firmarParams(limpios, secretKey),
    });
  }

  /** GET firmado a la API de Flow. */
  async function get(
    ruta: string,
    params: Record<string, string | number | undefined>,
  ): Promise<RespuestaFlow> {
    const { apiKey, secretKey } = credenciales();
    const limpios = limpiar({ ...params, apiKey });
    return httpGet(`${baseUrl}/${ruta}`, {
      ...limpios,
      s: firmarParams(limpios, secretKey),
    });
  }

  return {
    async crearPlan(input) {
      return (await post("plans/create", {
        planId: input.planId,
        name: input.name,
        currency: "CLP",
        amount: input.amount,
        interval: FLOW_INTERVAL_MENSUAL,
        interval_count: 1,
        // Sin trial: la suscripción arranca al publicar y la etapa de configuración es el gratis (D2).
        trial_period_days: 0,
        days_until_due: input.daysUntilDue,
        charges_retries_number: input.chargesRetriesNumber,
        urlCallback: input.urlCallback,
      })) as unknown as FlowPlan;
    },

    async getPlan(planId) {
      return (await get("plans/get", { planId })) as unknown as FlowPlan;
    },

    async crearCustomer(input) {
      return (await post("customer/create", {
        name: input.name,
        email: input.email,
        externalId: input.externalId,
      })) as unknown as FlowCustomer;
    },

    async getCustomer(customerId) {
      return (await get("customer/get", {
        customerId,
      })) as unknown as FlowCustomer;
    },

    async registrarTarjeta(input) {
      const r = (await post("customer/register", {
        customerId: input.customerId,
        url_return: input.urlReturn,
      })) as { url?: string; token?: string };

      // Fail-fast antes del redirect: una respuesta a medias mandaría al Pagador a una pantalla de
      // error de Flow, y desde ahí el flujo no tiene vuelta. Mejor un error legible en el panel.
      if (!r.url || !r.token) {
        throw new Error(
          "Flow (plataforma) /api/customer/register no devolvió la url y el token del registro de tarjeta.",
        );
      }
      return {
        redirectUrl: `${r.url}?token=${encodeURIComponent(r.token)}`,
        token: r.token,
      };
    },

    async getEstadoRegistro(token) {
      return (await get("customer/getRegisterStatus", {
        token,
      })) as unknown as FlowEstadoRegistro;
    },

    async crearSuscripcion(input) {
      return (await post("subscription/create", {
        planId: input.planId,
        customerId: input.customerId,
        couponId: input.couponId,
      })) as unknown as FlowSuscripcion;
    },

    async getSuscripcion(subscriptionId) {
      return (await get("subscription/get", {
        subscriptionId,
      })) as unknown as FlowSuscripcion;
    },

    async cancelarSuscripcion(input) {
      return (await post("subscription/cancel", {
        subscriptionId: input.subscriptionId,
        // Flow espera 0/1: 1 = al cierre del período (D6, sin prorrateos ni reembolsos).
        at_period_end: input.alFinDelPeriodo ? 1 : 0,
      })) as unknown as FlowSuscripcion;
    },

    async cambiarPlan(input) {
      // Sin `startDateOfNewPlan`: el cambio se pide justo cuando ya corresponde aplicarlo (ver el
      // contrato arriba y `facturacion/promocionesDePlan.ts`). El `temporality: 2` que iba acá no es
      // un parámetro de este endpoint — Flow lo ignoraba, y de ahí venía la ilusión de que el cambio
      // quedaba «programado».
      return (await post("subscription/changePlan", {
        subscriptionId: input.subscriptionId,
        newPlanId: input.nuevoPlanId,
      })) as unknown as FlowSuscripcion;
    },

    async getInvoice(invoiceId) {
      return (await get("invoice/get", {
        invoiceId,
      })) as unknown as FlowInvoice;
    },

    async getEstadoPago(token) {
      return (await get("payment/getStatus", {
        token,
      })) as unknown as FlowEstadoPago;
    },

    async crearCupon(input) {
      return (await post("coupon/create", {
        name: input.name,
        percent_off: input.percentOff,
        amount: input.amount,
        currency: input.amount === undefined ? undefined : "CLP",
        // Flow (verificado contra el sandbox, blocker 3 de la 3ª pasada del E2E): **`duration = 0`
        // es «para siempre»** y va SIN `times`; **`duration = 1` es «N períodos»** y `times` es
        // obligatorio. No hay un valor 2. La lectura anterior (1 = siempre, 2 = definida) hacía que
        // el CLI no pudiera crear NINGÚN cupón: las dos ramas rebotaban con «The duration must be
        // 0 or 1» o «If duration = 1 times must be sent».
        duration: input.duracionPeriodos === undefined ? 0 : 1,
        times: input.duracionPeriodos,
        expires: input.expira,
        max_redemptions: input.maxRedemptions,
      })) as unknown as FlowCupon;
    },
  };
}

/**
 * Lanza si Flow responde !ok, SIN volcar la firma ni la apiKey del request (I7).
 *
 * Del cuerpo del error se rescatan **solo** `code` y `message` —los dos únicos campos que Flow manda
 * ahí— porque el `code` es lo que permite tomar decisiones: un `1001` de `changePlan` significa «ya
 * estaba en ese plan» y no es una falla, mientras que un `105` significa que el endpoint no existe.
 * Nada del request (que sí lleva credenciales) entra en el mensaje.
 */
async function exigirOk(res: Response, ruta: string): Promise<void> {
  if (res.ok) return;

  let codigoFlow: number | null = null;
  let mensajeFlow: string | null = null;
  try {
    const cuerpo = (await res.json()) as { code?: unknown; message?: unknown };
    if (typeof cuerpo?.code === "number") codigoFlow = cuerpo.code;
    if (typeof cuerpo?.message === "string") mensajeFlow = cuerpo.message;
  } catch {
    // Cuerpo vacío o no-JSON (un 502 del proxy, por ejemplo): el status ya dice bastante.
  }

  throw new ErrorFlowPlataforma({
    ruta,
    httpStatus: res.status,
    codigoFlow,
    mensajeFlow,
  });
}

/** POST real a Flow (form-urlencoded). No se usa en tests (se inyecta `httpPost`). */
const fetchPost: HttpPostPlataforma = async (url, form) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  await exigirOk(res, new URL(url).pathname);
  return (await res.json()) as RespuestaFlow;
};

/** GET real a Flow. No se usa en tests (se inyecta `httpGet`). */
const fetchGet: HttpGetPlataforma = async (url, query) => {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${url}?${qs}`, { method: "GET" });
  await exigirOk(res, new URL(url).pathname);
  return (await res.json()) as RespuestaFlow;
};
