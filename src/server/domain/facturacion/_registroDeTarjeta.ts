import { DomainError } from "~/server/domain/errors";
import { traduciendoErroresDeFlow } from "~/server/domain/facturacion/_erroresDeFlow";
import {
  FLOW_REGISTRO_OK,
  type FlowPlataformaService,
} from "~/server/services/flowPlataforma";

/**
 * La confirmación SERVER-SIDE del registro de tarjeta (I3) — el gate que comparten los dos caminos
 * que vuelven de Flow: activar el plan (F03) y cambiar la tarjeta (F10).
 *
 * El token que trae el navegador **no prueba nada**: se consulta `customer/getRegisterStatus` con
 * las credenciales de plataforma, y recién con un registro OK se escribe. Es el mismo principio de
 * ADR-0001 para las ventas — el redirect nunca confirma dinero.
 *
 * Está acá y no duplicado en cada use case porque las tres verificaciones son idénticas y ninguna
 * puede relajarse en uno solo de los dos caminos:
 *
 * 1. Que Flow haya respondido (un fallo del proveedor no es un registro).
 * 2. Que el `status` sea el de registro OK.
 * 3. Que el `customerId` del registro sea el NUESTRO. Sin esto, un token ajeno filtrado activaría un
 *    plan —o plantaría una tarjeta— a nombre de otra persona. **Y se exige presente**: el dato
 *    ausente no autoriza (misma doctrina que `_invoiceFlow.ts` y la red de huérfanas). Flow lo manda
 *    siempre —verificado contra el sandbox— así que su ausencia significa que algo no es lo que
 *    creemos; y desde que el retorno entra por un puente que acepta GET, el token es inyectable con
 *    un link, así que este guard es lo único que separa un plan ajeno de un click.
 *
 * De la tarjeta solo salen marca y últimos 4 (I7): son los únicos datos no sensibles que Flow
 * devuelve y los únicos que guardamos.
 */
export interface TarjetaRegistrada {
  marca: string | null;
  ultimos4: string | null;
}

export async function confirmarRegistroServerSide({
  flow,
  token,
  flowCustomerId,
}: {
  flow: FlowPlataformaService;
  token: string;
  /** El customer de Flow del Pagador de ESTA Tienda. */
  flowCustomerId: string;
}): Promise<TarjetaRegistrada> {
  const registro = await traduciendoErroresDeFlow(
    "No pudimos confirmar tu tarjeta con Flow. Vuelve a intentarlo en unos minutos.",
    () => flow.getEstadoRegistro(token),
  );

  if (Number(registro.status) !== FLOW_REGISTRO_OK) {
    throw new DomainError(
      "INVALID",
      "Flow no confirmó el registro de tu tarjeta. Puedes intentarlo de nuevo.",
    );
  }

  if (registro.customerId !== flowCustomerId) {
    throw new DomainError(
      "INVALID",
      "Ese registro de tarjeta no corresponde a tu cuenta.",
    );
  }

  return {
    marca: registro.creditCardType ?? null,
    ultimos4: registro.last4CardDigits ?? null,
  };
}
