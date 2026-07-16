import { type PrismaClient } from "@prisma/client";

import { env } from "~/env";
import { descifrar, parsearClave } from "~/server/services/cifrado";
import {
  crearFlowService,
  FLOW_PROD_BASE_URL,
  FLOW_SANDBOX_BASE_URL,
  type FlowConfig,
  type FlowService,
} from "~/server/services/flow";
import { DomainError } from "~/server/domain/errors";

/**
 * Instanciación del service Flow con las credenciales de UN tenant (BYO-Flow, ADR-0006).
 *
 * `construirFlowDeCredencial` es el NÚCLEO puro y testeable: recibe una credencial
 * CIFRADA (tal como vive en la DB) + la clave AES-256, la descifra y arma el service
 * con la baseUrl que corresponde al ambiente (sandbox/prod) de ESA cuenta Flow. No
 * toca `~/env` ni la DB: se testea con `cifrar`/`descifrar` y un `crearServicio` fake.
 *
 * `crearFlowServiceDeTenant` es el BORDE de cableado (no unit-testeado, como el wrapper
 * del webhook): lee la clave y las urls de plataforma de `~/env`, carga la `FlowCredential`
 * del tenant por `tenantId` y delega en el núcleo. Lo usa el checkout (router) para cobrar
 * con la cuenta Flow del Organizador dueño de la Tienda.
 *
 * I5 (ADR-0006): las credenciales viajan cifradas hasta acá; los secretos descifrados
 * viven solo en memoria dentro del closure del service y NUNCA se loguean.
 */

/** La `FlowCredential` tal como se lee de la DB: apiKey/secretKey CIFRADAS + ambiente. */
export interface CredencialFlowCifrada {
  apiKeyCifrada: string;
  secretKeyCifrada: string;
  sandbox: boolean;
}

/** URLs de plataforma que Flow necesita para `payment/create` (no para `getStatus`). */
export interface UrlsPlataforma {
  urlConfirmation?: string;
  urlReturn?: string;
}

/**
 * Núcleo puro: descifra la credencial del tenant y construye su `FlowService`.
 *
 * `crearServicio` se inyecta (default: la factory real) para poder testear qué config
 * recibe sin pegarle a Flow. Las `urls` son opcionales: el webhook (getStatus) no las
 * necesita; el checkout (crearPago) sí — la factory hace fail-fast si faltan al crear el pago.
 */
export function construirFlowDeCredencial({
  credencial,
  clave,
  urls,
  crearServicio = crearFlowService,
}: {
  credencial: CredencialFlowCifrada;
  clave: Buffer;
  urls?: UrlsPlataforma;
  crearServicio?: (config: FlowConfig) => FlowService;
}): FlowService {
  const apiKey = descifrar(credencial.apiKeyCifrada, clave);
  const secretKey = descifrar(credencial.secretKeyCifrada, clave);
  return crearServicio({
    apiKey,
    secretKey,
    baseUrl: credencial.sandbox ? FLOW_SANDBOX_BASE_URL : FLOW_PROD_BASE_URL,
    urlConfirmation: urls?.urlConfirmation,
    urlReturn: urls?.urlReturn,
  });
}

/**
 * Fail-fast de la clave de cifrado en el borde (no incluye el valor en el mensaje, I5).
 * Compartida por el checkout (`crearFlowServiceDeTenant`) y el wrapper del webhook, para
 * un único punto de verdad del mensaje.
 */
export function claveDeCifradoDeEnv(): Buffer {
  if (!env.CREDENTIALS_ENCRYPTION_KEY) {
    throw new Error(
      "Falta CREDENTIALS_ENCRYPTION_KEY para descifrar las credenciales Flow del tenant. " +
        "Configurala en .env (ver .env.example).",
    );
  }
  return parsearClave(env.CREDENTIALS_ENCRYPTION_KEY);
}

/**
 * Borde: construye el `FlowService` del tenant dueño del checkout, cargando su
 * `FlowCredential` de la DB por `tenantId` y descifrándola. Lo llama el router de
 * checkout dentro de `runDomain`, así que lanza `DomainError` si la Tienda no tiene
 * credenciales cargadas (una Tienda PUBLICADA debería tenerlas — ADR-0006).
 */
export async function crearFlowServiceDeTenant({
  db,
  tenantId,
}: {
  db: PrismaClient;
  tenantId: string;
}): Promise<FlowService> {
  const cred = await db.flowCredential.findUnique({
    where: { tenantId },
    select: { apiKeyCifrada: true, secretKeyCifrada: true, sandbox: true },
  });
  if (!cred) {
    throw new DomainError(
      "INVALID",
      "La Tienda no tiene credenciales de Flow configuradas.",
    );
  }
  return construirFlowDeCredencial({
    credencial: cred,
    clave: claveDeCifradoDeEnv(),
    urls: {
      urlConfirmation: env.FLOW_URL_CONFIRMATION,
      urlReturn: env.FLOW_URL_RETURN,
    },
  });
}
