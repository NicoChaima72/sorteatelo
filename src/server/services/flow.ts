import { createHmac } from "crypto";

/**
 * Service Flow — adapter a la pasarela de pago Flow.cl (sandbox por defecto).
 *
 * Es un adapter de la capa `services/`: no conoce sesión ni reglas de negocio,
 * expone una interfaz estable para poder cambiar el detalle del proveedor con
 * fricción mínima. La config (apiKey/secretKey/baseUrl/urls) entra como
 * argumento explícito de la factory (nunca importa `~/env` adentro) con
 * fail-fast en runtime si falta al ejecutar (I7). Los secretos NUNCA se loguean (I5).
 *
 * BYO-Flow (ADR-0006): esta factory se instancia UNA vez por tenant, con las
 * credenciales DESCIFRADAS de SU `FlowCredential` (ver `server/pago/flowDeTenant.ts`).
 * Dos tenants ⇒ dos services con secretKeys distintas ⇒ firmas HMAC distintas para
 * el mismo payload. La factory misma no sabe de tenants: solo recibe config.
 *
 * Ver ADR-0001 (confirmación server-side vía webhook idempotente) y ADR-0006 (BYO-Flow).
 */

/** Base URL de la API de Flow según el ambiente de la cuenta del tenant (por credencial). */
export const FLOW_SANDBOX_BASE_URL = "https://sandbox.flow.cl/api";
export const FLOW_PROD_BASE_URL = "https://www.flow.cl/api";

/**
 * Firma HMAC-SHA256 al estilo Flow: se ordenan los parámetros alfabéticamente
 * por clave, se concatena `clave+valor` (sin separador) y se firma con la
 * secretKey; el resultado hexadecimal es el parámetro `s`.
 */
export function firmarParams(
  params: Record<string, string | number>,
  secretKey: string,
): string {
  const cadena = Object.keys(params)
    .sort()
    .map((clave) => `${clave}${params[clave]}`)
    .join("");
  return createHmac("sha256", secretKey).update(cadena).digest("hex");
}

/** Respuesta de `payment/create`: la URL de pago + el token para redirigir. */
export interface FlowCrearPagoResponse {
  url: string;
  token: string;
  flowOrder?: number;
}

/** Respuesta (cruda, parseada) de `payment/getStatus`. */
export interface FlowGetStatusResponse {
  flowOrder?: number;
  commerceOrder: string;
  /** Estado Flow: 1 pendiente, 2 pagada, 3 rechazada, 4 anulada. */
  status: number;
  amount?: number;
  paymentData?: { fee?: string; balance?: string } | null;
}

export type HttpPost = (
  url: string,
  form: Record<string, string>,
) => Promise<FlowCrearPagoResponse>;

export type HttpGet = (
  url: string,
  query: Record<string, string>,
) => Promise<FlowGetStatusResponse>;

export interface FlowConfig {
  apiKey: string | undefined;
  secretKey: string | undefined;
  baseUrl: string | undefined;
  urlConfirmation: string | undefined;
  urlReturn: string | undefined;
  /** Inyectables para test; en runtime usan `fetch` contra la API de Flow. */
  httpPost?: HttpPost;
  httpGet?: HttpGet;
}

export interface CrearPagoInput {
  commerceOrder: string;
  subject: string;
  /** Monto en pesos enteros (CLP no tiene decimales), ya serializado desde Decimal. */
  amount: string;
  email: string;
}

export interface FlowService {
  crearPago(input: CrearPagoInput): Promise<{
    redirectUrl: string;
    token: string;
    flowOrder?: number;
  }>;
  getStatus(token: string): Promise<FlowGetStatusResponse>;
}

/** Fail-fast: exige que las credenciales/urls estén presentes al ejecutar. */
function exigir(valor: string | undefined, nombre: string): string {
  if (!valor) {
    // Nunca se incluye el valor (secreto) en el mensaje.
    throw new Error(
      `Falta ${nombre} para operar con Flow.`,
    );
  }
  return valor;
}

export function crearFlowService(config: FlowConfig): FlowService {
  const baseUrl = config.baseUrl ?? FLOW_SANDBOX_BASE_URL;
  const httpPost = config.httpPost ?? fetchPost;
  const httpGet = config.httpGet ?? fetchGet;

  return {
    async crearPago(input) {
      const apiKey = exigir(
        config.apiKey,
        "la apiKey de la FlowCredential del tenant (¿credencial vacía o sin cargar?)",
      );
      const secretKey = exigir(
        config.secretKey,
        "la secretKey de la FlowCredential del tenant (¿credencial vacía o sin cargar?)",
      );
      const urlConfirmation = exigir(
        config.urlConfirmation,
        "la env var FLOW_URL_CONFIRMATION — configúrala en .env (ver .env.example)",
      );
      const urlReturn = exigir(
        config.urlReturn,
        "la env var FLOW_URL_RETURN — configúrala en .env (ver .env.example)",
      );

      const params: Record<string, string> = {
        apiKey,
        commerceOrder: input.commerceOrder,
        subject: input.subject,
        currency: "CLP",
        amount: input.amount,
        email: input.email,
        urlConfirmation,
        urlReturn,
      };
      const payload = { ...params, s: firmarParams(params, secretKey) };

      const res = await httpPost(`${baseUrl}/payment/create`, payload);
      return {
        redirectUrl: `${res.url}?token=${res.token}`,
        token: res.token,
        flowOrder: res.flowOrder,
      };
    },

    async getStatus(token) {
      const apiKey = exigir(
        config.apiKey,
        "la apiKey de la FlowCredential del tenant (¿credencial vacía o sin cargar?)",
      );
      const secretKey = exigir(
        config.secretKey,
        "la secretKey de la FlowCredential del tenant (¿credencial vacía o sin cargar?)",
      );

      const params: Record<string, string> = { apiKey, token };
      const query = { ...params, s: firmarParams(params, secretKey) };
      return httpGet(`${baseUrl}/payment/getStatus`, query);
    },
  };
}

/** POST real a Flow (form-urlencoded). No se usa en tests (se inyecta httpPost). */
const fetchPost: HttpPost = async (url, form) => {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Flow payment/create respondió ${res.status}`);
  }
  return (await res.json()) as FlowCrearPagoResponse;
};

/** GET real a Flow. No se usa en tests (se inyecta httpGet). */
const fetchGet: HttpGet = async (url, query) => {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${url}?${qs}`, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Flow payment/getStatus respondió ${res.status}`);
  }
  return (await res.json()) as FlowGetStatusResponse;
};
