import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { textoOpcionalANull } from "~/server/domain/panel/_internal";
import { type GuardarConfiguracionTiendaInput } from "~/server/domain/panel/schemas";

/**
 * Use case del panel (F04, D8): guarda la config de texto de la Tienda — descripción + color de
 * marca + redes/contacto del footer (plantilla-rica F02/D2). El HERO y el AVISO ya no se escriben acá
 * (admin-bases-pdf F06/D7): viven en el Documento de Página y se editan en el EDITOR. Las
 * BASES del sorteo NO se escriben acá desde admin-bases-pdf F03 (D2/D3): son un PDF del SORTEO
 * (`Raffle.basesPdfUrl`), subido desde `admin/sorteo.tsx`, no un texto de la Tienda.
 * Los ASSETS de marca (logo/hero-image/portada/premio) tampoco se escriben acá:
 * los persiste el flujo de subida (confirmarImagenSubida) tras verificar el objeto en R2 (D4/I6). El
 * `tenantId` sale de `acceso` (server-side): el input NO lleva tenantId, así que no se puede escribir
 * la config de otra Tienda (I1); sin membresía ⇒ `FORBIDDEN`. Los campos vacíos se guardan como `null`.
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
  const tenantId = resolverTenantDelPanel(acceso);

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      descripcion: textoOpcionalANull(input.descripcion),
      // `logoUrl` NO se escribe acá (D4/I6): lo persiste SOLO confirmarImagenSubida tras headObject.
      // Los DOS colores de marca se guardan juntos (admin-bases-pdf F06/D12): ambos son COLUMNAS del
      // Tenant que el storefront lee por request (`resolverBranding`), así que guardar ES aplicar —
      // no hay draft que publicar para un color. El editor sigue escribiendo `colorAcento` por su
      // propio procedure (`pagebuilder.setColorAcento`, auto-guardado): dos superficies, UNA columna.
      colorPrimario: textoOpcionalANull(input.colorPrimario),
      colorAcento: textoOpcionalANull(input.colorAcento),
      // Redes y contacto del footer (plantilla-rica F02/F03/D2). Vacío ⇒ null (footer oculta, D7).
      instagramUrl: textoOpcionalANull(input.instagramUrl),
      tiktokUrl: textoOpcionalANull(input.tiktokUrl),
      whatsappUrl: textoOpcionalANull(input.whatsappUrl),
      contactoEmail: textoOpcionalANull(input.contactoEmail),
    },
    select: { id: true },
  });

  return { guardada: true };
}
