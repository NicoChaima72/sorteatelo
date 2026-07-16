import { type PrismaClient } from "@prisma/client";

import {
  construirFlowDeCredencial,
  type CredencialFlowCifrada,
} from "~/server/pago/flowDeTenant";
import {
  crearFlowService,
  type FlowConfig,
  type FlowGetStatusResponse,
  type FlowService,
} from "~/server/services/flow";

/**
 * Ruteo multi-tenant del webhook de Flow (paso 6 del roadmap, ADR-0006).
 *
 * EL mecanismo nuevo más riesgoso del pivote: una notificación de Flow trae un `token`;
 * de ahí hay que derivar QUÉ Tienda es dueña del pago y confirmar server-side con LAS
 * credenciales de ESA Tienda — nunca las de otra, nunca unas globales. Por eso el ruteo
 * es un núcleo con la dependencia de datos INYECTADA (`RepoRuteoFlow`): se testea entero
 * con un repo fake, sin DB ni credenciales reales.
 *
 * `crearEnrutadorFlow` devuelve una función `token → { tenantId, orderId, getStatus } | null`.
 * El `getStatus` ya viene ligado a las credenciales del tenant dueño (vía
 * `construirFlowDeCredencial`). `null` = ningún Payment matchea el token (notificación
 * ajena/desconocida): el núcleo del webhook la ack+ignora sin efecto.
 *
 * El `orderId` se devuelve desde NUESTRA DB (no del body de Flow): es la orden a la que
 * el token pertenece según nuestro registro, así la confirmación no depende de un campo
 * `commerceOrder` que venga en la respuesta de Flow.
 */

/** Lo que el ruteo necesita del `Payment` + la `FlowCredential` de su Tenant. */
export interface PagoConCredencial extends CredencialFlowCifrada {
  tenantId: string;
  orderId: string;
}

/** Puerto de datos del ruteo. El borde lo cabla contra Prisma; los tests, en memoria. */
export interface RepoRuteoFlow {
  /** token de Flow → Payment + credencial (cifrada) de su Tenant; `null` si ninguno matchea. */
  buscarPagoPorToken(token: string): Promise<PagoConCredencial | null>;
}

/** `getStatus` ya ligado a las credenciales del tenant dueño del pago. */
export type GetStatusDeTenant = (token: string) => Promise<FlowGetStatusResponse>;

/** Resultado del ruteo: la Tienda dueña + la orden + su `getStatus` tenant-scoped. */
export interface FlowRuteado {
  tenantId: string;
  orderId: string;
  getStatus: GetStatusDeTenant;
}

export type EnrutarFlowFn = (token: string) => Promise<FlowRuteado | null>;

/**
 * Construye el enrutador. `clave` = AES-256 para descifrar las credenciales del tenant.
 * `crearServicio` se inyecta (default: la factory real) para tests que quieran espiar
 * qué credenciales/urls recibe cada service sin pegarle a Flow.
 */
export function crearEnrutadorFlow({
  repo,
  clave,
  crearServicio = crearFlowService,
}: {
  repo: RepoRuteoFlow;
  clave: Buffer;
  crearServicio?: (config: FlowConfig) => FlowService;
}): EnrutarFlowFn {
  return async function enrutar(token) {
    const pago = await repo.buscarPagoPorToken(token);
    if (!pago) return null;

    // getStatus con las credenciales de ESTE tenant (descifradas). Sin urls: getStatus
    // no las usa (solo crearPago). El secreto vive solo en el closure del service.
    const flow = construirFlowDeCredencial({
      credencial: pago,
      clave,
      crearServicio,
    });

    return {
      tenantId: pago.tenantId,
      orderId: pago.orderId,
      getStatus: (t) => flow.getStatus(t),
    };
  };
}

/**
 * Borde: cabla el puerto de ruteo contra Prisma (no unit-testeado, como el wrapper).
 *
 * `Payment.token` es `@unique` a nivel plataforma (schema): el ruteo resuelve
 * token ⇒ Payment ⇒ Tenant ⇒ su FlowCredential. Si el Payment no existe, o su Tenant
 * no tiene credencial cargada, devuelve `null` (notificación no accionable ⇒ ack+ignore).
 */
export function crearRepoRuteoFlow(db: PrismaClient): RepoRuteoFlow {
  return {
    async buscarPagoPorToken(token) {
      const pago = await db.payment.findUnique({
        where: { token },
        select: {
          tenantId: true,
          orderId: true,
          tenant: {
            select: {
              flowCredential: {
                select: {
                  apiKeyCifrada: true,
                  secretKeyCifrada: true,
                  sandbox: true,
                },
              },
            },
          },
        },
      });
      const cred = pago?.tenant.flowCredential;
      if (!pago || !cred) return null;
      return {
        tenantId: pago.tenantId,
        orderId: pago.orderId,
        apiKeyCifrada: cred.apiKeyCifrada,
        secretKeyCifrada: cred.secretKeyCifrada,
        sandbox: cred.sandbox,
      };
    },
  };
}
