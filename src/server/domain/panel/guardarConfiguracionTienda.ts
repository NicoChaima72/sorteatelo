import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantAutorizado } from "~/server/authPolicy";
import { textoOpcionalANull } from "~/server/domain/panel/_internal";
import { type GuardarConfiguracionTiendaInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F04, D8): guarda la config básica de la Tienda — bases del sorteo
 * (texto borrador, ADR-0008) + plantilla (descripcion/logoUrl/colorPrimario). F06 aplica el
 * theming real sobre estos valores; F05 solo los persiste. El `tenantId` sale de `acceso`
 * (server-side): el input NO lleva tenantId, así que no se puede escribir la config de otra
 * Tienda (I1); sin membresía ⇒ `FORBIDDEN`. Los campos vacíos se guardan como `null`.
 */
export async function guardarConfiguracionTienda({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: GuardarConfiguracionTiendaInput;
}): Promise<{ guardada: true }> {
  const tenantId = resolverTenantAutorizado({
    esOperador: acceso.esOperador,
    tenantIdsDeMembresia: acceso.tenantIds,
  });

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      descripcion: textoOpcionalANull(input.descripcion),
      logoUrl: textoOpcionalANull(input.logoUrl),
      colorPrimario: textoOpcionalANull(input.colorPrimario),
      basesSorteo: textoOpcionalANull(input.basesSorteo),
      // Textos de la plantilla del storefront (F06/D4).
      heroTitulo: textoOpcionalANull(input.heroTitulo),
      heroSubtitulo: textoOpcionalANull(input.heroSubtitulo),
      avisoTexto: textoOpcionalANull(input.avisoTexto),
    },
    select: { id: true },
  });

  return { guardada: true };
}
