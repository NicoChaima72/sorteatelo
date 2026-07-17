/**
 * Service Correo — adapter al proveedor de correo transaccional Resend (ADR-0010).
 *
 * Es un adapter de la capa `services/`: no conoce sesión ni reglas de negocio, expone una
 * interfaz estable (`enviarCorreo`) para poder cambiar el proveedor concreto (Resend → SES /
 * Postmark / otro) con fricción mínima — la interfaz es NUESTRA, no la del SDK. Por eso se
 * habla con Resend por su ÚNICO endpoint HTTP (`POST /emails`) vía `fetch` directo, SIN el SDK
 * `resend` ni `react-email` (D4/I7: cero dependencias nuevas; el swap a SDK sería trivial).
 *
 * La config (apiKey) entra como argumento explícito de la factory (nunca importa `~/env`
 * adentro), con fail-fast en runtime si falta al enviar (I6, patrón `services/flow.ts` /
 * `services/storage.ts`). La `RESEND_API_KEY` es SECRETA: jamás en logs, errores ni respuestas
 * (I3) — ni siquiera cuando Resend responde un error.
 *
 * En el MVP la Plataforma envía desde su remitente de PRUEBA (`onboarding@resend.dev`) en nombre
 * del tenant (formato "Tienda X · vía Sortealo", reply-to del Organizador) hasta que la decisión
 * abierta #4 (dominio de la plataforma) habilite un dominio verificado. Ver ADR-0010/0008.
 */

/** Endpoint único de envío de Resend (la superficie que usamos: un POST). */
export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Subconjunto de `fetch` que el service necesita. El default es el `fetch` global de Node; los
 * tests inyectan un fake para inspeccionar el POST (url, bearer, body) sin tocar la red (I7).
 */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface CorreoInput {
  /** Remitente con nombre, formato `Nombre <email>`. Lo arma el dominio (marca + tienda). */
  from: string;
  /** Destinatario (identidad del Comprador = su correo, ADR-0004). */
  to: string;
  /** Reply-to del Organizador si existe (ADR-0010); ausente = correo sin reply-to. */
  replyTo?: string;
  subject: string;
  /** Cuerpo en texto plano (siempre presente — entregabilidad). */
  text: string;
  /** Cuerpo HTML opcional (Resend prefiere el HTML si viene). */
  html?: string;
}

export interface CorreoService {
  /** Envía UN correo por el proveedor y devuelve el id del envío. Lanza si falla (no traga). */
  enviarCorreo(input: CorreoInput): Promise<{ id: string }>;
}

export interface CorreoConfig {
  apiKey: string | undefined;
  /** Inyectable para test; en runtime usa el `fetch` global contra la API de Resend. */
  fetchImpl?: FetchLike;
}

/** Fail-fast: exige la apiKey al ejecutar. NUNCA incluye el valor (secreto) en el mensaje. */
function exigirApiKey(apiKey: string | undefined): string {
  if (!apiKey) {
    throw new Error(
      "Falta RESEND_API_KEY para enviar correos — configúrala en .env (ver .env.example).",
    );
  }
  return apiKey;
}

/** Extrae un mensaje de error legible del body de Resend, sin arriesgar filtrar secretos. */
function detalleDeError(json: unknown): string {
  if (json && typeof json === "object" && "message" in json) {
    const m = (json as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

export function crearCorreoService(config: CorreoConfig): CorreoService {
  const fetchImpl = config.fetchImpl ?? (globalThis.fetch as FetchLike);

  return {
    async enviarCorreo(input) {
      const apiKey = exigirApiKey(config.apiKey);

      // Body de la API de Resend (snake_case: `reply_to`). Solo se incluyen los campos
      // presentes (html/reply_to son opcionales).
      const body: Record<string, unknown> = {
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      };

      const res = await fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          // El Bearer lleva la key SECRETA: nunca se loguea (I3). Va solo en el header.
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Se incluye el status (y el mensaje de Resend si lo hay) pero JAMÁS la apiKey (I3).
        let detalle = "";
        try {
          detalle = detalleDeError(await res.json());
        } catch {
          // body no-JSON: el status alcanza para diagnosticar.
        }
        throw new Error(
          `Resend respondió ${res.status}${detalle ? `: ${detalle}` : ""}.`,
        );
      }

      const json = (await res.json()) as { id?: string };
      if (!json.id) {
        throw new Error(
          `Resend aceptó el envío pero no devolvió un id (status ${res.status}).`,
        );
      }
      return { id: json.id };
    },
  };
}
