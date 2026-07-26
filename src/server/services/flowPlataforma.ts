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
  /** URL a la que se redirige al Pagador para que ingrese su tarjeta. */
  url: string;
  token: string;
}

export interface FlowEstadoRegistro {
  /** 1 = registro OK. Cualquier otra cosa NO habilita crear la suscripción (I3). */
  status: number;
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

export interface FlowInvoice {
  id: number | string;
  subscription_id?: string;
  /** Estado del invoice según Flow. */
  status?: number;
  /** 1 = pagado. */
  paid?: number;
  amount?: number;
  period_start?: string | null;
  period_end?: string | null;
  payment_date?: string | null;
  next_attemp_date?: string | null; // sic: typo del proveedor
  attemp?: number; // sic
  paymentLink?: string | null;
  outstanding?: number;
  error?: string | null;
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
  /** Cambio de plan PROGRAMADO para la próxima renovación (D7): nunca retroactivo. */
  cambiarPlan(input: {
    subscriptionId: string;
    nuevoPlanId: string;
  }): Promise<FlowSuscripcion>;
  // invoice/*
  getInvoice(invoiceId: string): Promise<FlowInvoice>;
  // coupon/*
  crearCupon(input: {
    name: string;
    percentOff?: number;
    amount?: string;
    /** 1 = una vez, N = N períodos, undefined = para siempre. */
    duracionPeriodos?: number;
    /** ISO `YYYY-MM-DD`. */
    expira?: string;
    maxRedemptions?: number;
  }): Promise<FlowCupon>;
}

/**
 * Fail-fast de una credencial de PLATAFORMA. El mensaje nombra la env var que falta y JAMÁS incluye
 * su valor (I7) — mejor un 500 explícito que un cobro silenciosamente roto.
 */
function exigir(valor: string | undefined, envVar: string): string {
  if (!valor) {
    throw new Error(
      `Falta ${envVar} para operar la facturación de la plataforma — configúrala en .env (ver .env.example).`,
    );
  }
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
      return (await post("plan/create", {
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
      return (await get("plan/get", { planId })) as unknown as FlowPlan;
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
      })) as unknown as FlowRegistroTarjeta;
      return r;
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
      return (await post("subscription/changePlan", {
        subscriptionId: input.subscriptionId,
        newPlanId: input.nuevoPlanId,
        // 2 = el cambio rige desde la PRÓXIMA renovación (programado, nunca retroactivo — D7).
        temporality: 2,
      })) as unknown as FlowSuscripcion;
    },

    async getInvoice(invoiceId) {
      return (await get("invoice/get", {
        invoiceId,
      })) as unknown as FlowInvoice;
    },

    async crearCupon(input) {
      return (await post("coupon/create", {
        name: input.name,
        percent_off: input.percentOff,
        amount: input.amount,
        currency: input.amount === undefined ? undefined : "CLP",
        // Flow: duration 1 = "para siempre"; 2 = definida por `times` períodos.
        duration: input.duracionPeriodos === undefined ? 1 : 2,
        times: input.duracionPeriodos,
        expires: input.expira,
        max_redemptions: input.maxRedemptions,
      })) as unknown as FlowCupon;
    },
  };
}

/** Lanza si Flow responde !ok, SIN volcar la firma ni la apiKey del request (I7). */
async function exigirOk(
  res: { ok: boolean; status: number },
  ruta: string,
): Promise<void> {
  if (!res.ok) {
    throw new Error(`Flow (plataforma) ${ruta} respondió ${res.status}.`);
  }
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
