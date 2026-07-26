import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { ordenDeCamposCheckout } from "~/server/domain/camposCheckout/reglas";

/**
 * Selector del panel (F02): los Campos de checkout de la Tienda, como los administra el Organizador.
 *
 * Trae ACTIVOS **e INACTIVOS**: a diferencia del checkout (F04), que solo renderiza los activos,
 * acá el inactivo es material de trabajo — se reactiva o se borra, y conserva su lugar en el orden.
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1/ADR-0005). No hay paginación: el tope de 10
 * activos (D6) más los desactivados mantienen la lista corta por diseño.
 */
export async function listarCamposCheckout({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}) {
  const tenantId = resolverTenantDelPanel(acceso);

  return db.checkoutField.findMany({
    where: { tenantId },
    orderBy: ordenDeCamposCheckout,
    select: {
      id: true,
      clave: true,
      etiqueta: true,
      tipo: true,
      obligatorio: true,
      placeholder: true,
      textoAyuda: true,
      posicion: true,
      activo: true,
      opciones: true,
      defaultMarcado: true,
    },
  });
}
