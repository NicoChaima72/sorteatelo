/**
 * Service Correo — adapter al proveedor de correo transaccional Resend (ADR-0010).
 *
 * Es un adapter de la capa `services/`: no conoce sesión ni reglas de negocio, expone una
 * interfaz estable (`enviarCorreo` / `enviarLote`) para poder cambiar el proveedor concreto
 * (Resend → SES / Postmark / otro) con fricción mínima — la interfaz es NUESTRA, no la del SDK.
 * Por eso se habla con Resend por HTTP (`POST /emails` y `POST /emails/batch`) vía `fetch`
 * directo, SIN el SDK `resend` ni `react-email` (D4/I7: cero dependencias nuevas).
 *
 * La config (apiKey, timeout) entra como argumento explícito de la factory (nunca importa `~/env`
 * adentro), con fail-fast en runtime si falta al enviar (I6, patrón `services/flow.ts` /
 * `services/storage.ts`). La `RESEND_API_KEY` es SECRETA: jamás en logs, errores ni respuestas
 * (I3) — ni siquiera cuando Resend responde un error.
 *
 * **Remitente**: la Plataforma envía desde `no-reply@sorteatelo.cl` — dominio VERIFICADO en Resend
 * (ADR-0014) — en nombre del tenant (formato "Tienda X · vía Sortéatelo", reply-to del
 * Organizador). El valor concreto lo pone el dominio (`domain/correo/layoutCorreo.ts`, el chrome
 * compartido de F07), no este adapter. Plan Free: 100 correos/día, 3.000/mes, 1 dominio; el drenado lo tolera tratando el
 * 429 como cuota y no como fallo (ADR-0027 §5, I9). Ver ADR-0010/0008/0027.
 */

/** Endpoint de envío individual de Resend. */
export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Endpoint de envío en LOTE (F02/ADR-0027 §6). El rate limit de Resend es 10 req/s por team: 300
 * destinatarios por el endpoint individual son 300 llamadas (30 s de espera y un 429 seguro), por
 * el batch son 3.
 */
export const RESEND_BATCH_ENDPOINT = "https://api.resend.com/emails/batch";

/** Máximo de correos por request del endpoint batch de Resend. */
export const LOTE_MAX = 100;

/**
 * Techo de espera por request (ADR-0027 §6). Sin él, un Resend colgado se lleva puesta la corrida
 * entera del cron: Vercel corta la función y las filas ya reclamadas quedan con el intento gastado
 * y sin correo. 8 s deja margen para varios chunks dentro de una invocación.
 */
export const TIMEOUT_MS = 8_000;

/**
 * Subconjunto de `fetch` que el service necesita. El default es el `fetch` global de Node; los
 * tests inyectan un fake para inspeccionar el POST (url, bearer, body) sin tocar la red (I7).
 */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
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
  /**
   * Cabeceras extra del correo. Hoy el caso concreto es `List-Unsubscribe` /
   * `List-Unsubscribe-Post` en los recordatorios (F05, RFC 8058); los transaccionales no llevan.
   */
  headers?: Record<string, string>;
  /**
   * Etiquetas de Resend para segmentar métricas. **Ojo**: Resend solo acepta ASCII alfanumérico +
   * `_` + `-` en nombre y valor ⇒ sirven `tenantId`/`raffleId`/`tipo`, NUNCA el nombre de la
   * Tienda (tildes y espacios ⇒ 422 de todo el lote).
   */
  tags?: { name: string; value: string }[];
  /**
   * `Idempotency-Key` de Resend (ventana 24 h) — viaja como CABECERA, no en el body. Es la
   * SEGUNDA línea de defensa contra el duplicado; la primera y definitiva es el ledger
   * `CorreoEnviado` (ADR-0027 §6). En `enviarLote` la clave del lote se pasa por opciones.
   */
  idempotencyKey?: string;
}

export interface CorreoService {
  /** Envía UN correo por el proveedor y devuelve el id del envío. Lanza si falla (no traga). */
  enviarCorreo(input: CorreoInput): Promise<{ id: string }>;
  /**
   * Envía N correos en lote, chunkeando de a `LOTE_MAX`. Devuelve los ids del proveedor **en el
   * mismo orden que los inputs** (el caller escribe `proveedorId` fila por fila: un corrimiento le
   * pondría a un correo el id de otro). Lanza si algún chunk falla.
   */
  enviarLote(
    inputs: CorreoInput[],
    opciones?: { idempotencyKey?: string },
  ): Promise<{ ids: string[] }>;
}

export interface CorreoConfig {
  apiKey: string | undefined;
  /** Inyectable para test; en runtime usa el `fetch` global contra la API de Resend. */
  fetchImpl?: FetchLike;
  /** Techo de espera por request. Default `TIMEOUT_MS` (8 s); los tests lo bajan. */
  timeoutMs?: number;
}

/**
 * Error de envío con la información que el drenado necesita para decidir (ADR-0027 §5). Es la
 * interfaz NUESTRA del fallo, no la de Resend: el caller no parsea mensajes ni status codes.
 *
 * - `esCuota` — el proveedor rechazó por LÍMITE (429: cuota diaria del plan Free o rate limit de
 *   10 req/s), no porque el correo esté mal. Es retryable y **no consume presupuesto de intentos**
 *   (I9): un blast > 100/día se termina de drenar mañana en vez de degradar correos sanos.
 * - `idsParciales` — en un lote chunkeado, los ids de los correos que YA SALIERON antes de la
 *   falla. Descartarlos sería reenviarlos en la corrida siguiente (I2). Vacío en envío individual.
 *
 * El mensaje jamás incluye la `RESEND_API_KEY` (I6).
 */
export class CorreoError extends Error {
  readonly status: number | undefined;
  readonly esCuota: boolean;
  readonly idsParciales: string[];

  constructor(
    mensaje: string,
    opciones: { status?: number; idsParciales?: string[] } = {},
  ) {
    super(mensaje);
    this.name = "CorreoError";
    this.status = opciones.status;
    // 429 es el único status que Resend usa para límites (cuota diaria y rate limit comparten
    // código). Un 4xx de payload o un 5xx SON fallos reales y gastan intentos.
    this.esCuota = opciones.status === 429;
    this.idsParciales = opciones.idsParciales ?? [];
  }
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

/** Body de un correo tal como lo espera la API de Resend (snake_case donde corresponde). */
function cuerpoResend(input: CorreoInput): Record<string, unknown> {
  return {
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    ...(input.html ? { html: input.html } : {}),
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    // `idempotencyKey` NO va acá: es transporte (cabecera del request), no contenido del correo.
  };
}

/** Cabeceras del request a Resend. El Bearer lleva la key SECRETA: jamás se loguea (I6). */
function cabeceras(
  apiKey: string,
  idempotencyKey?: string,
): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

/**
 * Traduce una respuesta no-2xx de Resend a nuestro `CorreoError`. Se incluye el status (y el
 * mensaje del proveedor si lo hay) pero JAMÁS la apiKey (I6). Un ÚNICO lugar hace la traducción,
 * para que `enviarCorreo` y `enviarLote` clasifiquen la cuota igual.
 */
async function errorDeRespuesta(
  res: { status: number; json: () => Promise<unknown> },
  idsParciales: string[] = [],
): Promise<CorreoError> {
  let detalle = "";
  try {
    detalle = detalleDeError(await res.json());
  } catch {
    // body no-JSON: el status alcanza para diagnosticar.
  }
  return new CorreoError(
    `Resend respondió ${res.status}${detalle ? `: ${detalle}` : ""}.`,
    { status: res.status, idsParciales },
  );
}

export function crearCorreoService(config: CorreoConfig): CorreoService {
  const fetchImpl = config.fetchImpl ?? (globalThis.fetch as FetchLike);
  const timeoutMs = config.timeoutMs ?? TIMEOUT_MS;

  /**
   * Único punto de salida a la red: arma el POST con su `AbortSignal` y traduce el corte por
   * timeout a un `CorreoError` legible. Sin esto, el drenado recibiría una `DOMException` cruda
   * que no sabría clasificar (y cuyo mensaje no dice contra qué se cortó).
   */
  async function postear(
    url: string,
    headers: Record<string, string>,
    body: string,
    idsParciales: string[] = [],
  ) {
    try {
      return await fetchImpl(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // Se conservan los ids ya enviados también acá: el timeout puede caer en el chunk N (I2).
      throw new CorreoError(
        `Resend no respondió en ${timeoutMs} ms (${e instanceof Error ? e.name : "error"}).`,
        { idsParciales },
      );
    }
  }

  return {
    async enviarLote(inputs, opciones) {
      const apiKey = exigirApiKey(config.apiKey);
      const ids: string[] = [];

      for (let desde = 0; desde < inputs.length; desde += LOTE_MAX) {
        const chunk = inputs.slice(desde, desde + LOTE_MAX);
        // Clave DERIVADA por chunk: con una sola para todo el lote, Resend trataría el 2º chunk
        // como reintento del 1º (ventana 24 h) y devolvería la respuesta cacheada — 100 correos
        // que nunca salen y 100 ids repetidos en el ledger.
        const claveChunk = opciones?.idempotencyKey
          ? `${opciones.idempotencyKey}/${desde / LOTE_MAX}`
          : undefined;

        const res = await postear(
          RESEND_BATCH_ENDPOINT,
          cabeceras(apiKey, claveChunk),
          JSON.stringify(chunk.map(cuerpoResend)),
          ids,
        );

        // Los ids de los chunks que YA salieron viajan dentro del error: son correos que
        // efectivamente se entregaron, y perderlos significaría reenviarlos (I2).
        if (!res.ok) throw await errorDeRespuesta(res, ids);

        const json = (await res.json()) as { data?: { id?: string }[] };
        const devueltos = (json.data ?? []).map((item) => item?.id);

        // CONTRATO DURO del lote: un chunk 2xx tiene que traer EXACTAMENTE un id por correo, en
        // orden. Si falta uno —array corto o item sin `id`— no hay forma de saber a cuál le
        // corresponde cada id sin adivinar, y adivinar corre todas las posiciones siguientes: el
        // caller le escribiría a una fila el `proveedorId` de otra y dejaría filas ya enviadas
        // como PENDIENTE para reenviarlas (I2). Se corta acá, con los ids de los chunks COMPLETOS
        // anteriores; los de este chunk se descartan a propósito, no se compactan.
        if (
          devueltos.length !== chunk.length ||
          devueltos.some((id) => typeof id !== "string" || id.length === 0)
        ) {
          throw new CorreoError(
            `Resend aceptó el lote (status ${res.status}) pero devolvió ${devueltos.length} ids para ${chunk.length} correos.`,
            { status: res.status, idsParciales: ids },
          );
        }

        ids.push(...(devueltos as string[]));
      }

      return { ids };
    },

    async enviarCorreo(input) {
      const apiKey = exigirApiKey(config.apiKey);

      const res = await postear(
        RESEND_ENDPOINT,
        cabeceras(apiKey, input.idempotencyKey),
        JSON.stringify(cuerpoResend(input)),
      );

      if (!res.ok) throw await errorDeRespuesta(res);

      const json = (await res.json()) as { id?: string };
      if (!json.id) {
        throw new CorreoError(
          `Resend aceptó el envío pero no devolvió un id (status ${res.status}).`,
          { status: res.status },
        );
      }
      return { id: json.id };
    },
  };
}
