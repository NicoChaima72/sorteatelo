import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { exigirPagadorDeLaTienda } from "~/server/domain/facturacion/_pagadorDeLaTienda";
import { confirmarRegistroServerSide } from "~/server/domain/facturacion/_registroDeTarjeta";
import { type FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Use case del panel (F10/D12): cierra el cambio de tarjeta cuando el Pagador vuelve del redirect
 * de Flow.
 *
 * **I3 — la confirmación es SERVER-SIDE**: el token que trae el navegador no prueba nada. Se consulta
 * `customer/getRegisterStatus` con las credenciales de plataforma, y solo con un registro OK se
 * reemplazan marca y últimos 4. De la tarjeta no se guarda nada más (I7): ni el PAN, ni un token
 * reversible, ni la fecha de vencimiento.
 *
 * **No toca la suscripción.** El plan sigue exactamente donde estaba —mismo `flowSubscriptionId`,
 * mismo período, mismo monto— y pasa a cobrarse con la tarjeta nueva porque en Flow la tarjeta es del
 * customer. Es idempotente por naturaleza: recargar el retorno vuelve a escribir los mismos dos
 * campos.
 */
export async function confirmarCambioDeTarjeta({
  db,
  acceso,
  flow,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  flow: FlowPlataformaService;
  input: { token: string };
}): Promise<{ marca: string | null; ultimos4: string | null }> {
  const tenantId = resolverTenantDelPanel(acceso);

  // El guard se repite acá y no solo en el inicio A PROPÓSITO: entre el redirect y la vuelta pasa un
  // viaje entero a Flow, y en el medio el plan pudo cancelarse.
  const pagador = await exigirPagadorDeLaTienda({
    db,
    tenantId,
    userId: acceso.userId,
  });

  // I3 + defensa en profundidad (el token tiene que ser de NUESTRO customer), en el gate compartido
  // con la activación: sin eso, un token ajeno filtrado dejaría a esta Tienda mostrando —y cobrando
  // con— la tarjeta de otra persona.
  const { marca, ultimos4 } = await confirmarRegistroServerSide({
    flow,
    token: input.token,
    flowCustomerId: pagador.flowCustomerId,
  });

  await db.platformBillingCustomer.update({
    where: { id: pagador.pagadorId },
    data: { tarjetaMarca: marca, tarjetaUltimos4: ultimos4 },
    select: { id: true },
  });

  return { marca, ultimos4 };
}
