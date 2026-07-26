import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { exigirPagadorDeLaTienda } from "~/server/domain/facturacion/_pagadorDeLaTienda";
import { type FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Use case del panel (F10/D12): **cambiar la tarjeta** de una Tienda que ya tiene plan activo.
 *
 * Es el mismo `customer/register` de la activación (F03) apuntando al customer que YA existe: en
 * Flow la tarjeta vive en el customer, no en la suscripción, así que re-registrarla deja al plan
 * vivo cobrando con el medio de pago nuevo. Por eso acá no se toca nada de la suscripción — ni se
 * cancela ni se recrea: hacerlo sería perder el período ya pagado por un cambio de plástico.
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (ADR-0005) y, además, restringido al Pagador
 * (ver `exigirPagadorDeLaTienda`). NO cambia nada todavía: la tarjeta se reemplaza recién al VOLVER
 * del redirect, con el registro confirmado server-side (`confirmarCambioDeTarjeta`, I3).
 */
export async function iniciarCambioDeTarjeta({
  db,
  acceso,
  flow,
  urlRetorno,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  flow: FlowPlataformaService;
  /** URL del panel a la que Flow devuelve el navegador con el token del registro. */
  urlRetorno: string;
}): Promise<{ redirectUrl: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const pagador = await exigirPagadorDeLaTienda({
    db,
    tenantId,
    userId: acceso.userId,
  });

  const registro = await flow.registrarTarjeta({
    customerId: pagador.flowCustomerId,
    urlReturn: urlRetorno,
  });

  return { redirectUrl: registro.url };
}
