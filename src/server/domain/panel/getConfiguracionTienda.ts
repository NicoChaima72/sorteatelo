import { type PrismaClient, type TenantStatus } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";

/**
 * Use case del panel (F04, D8): lee la config editable de la Tienda para poblar el formulario
 * de configuración. El `tenantId` sale de `acceso` (server-side); sin membresía ⇒ `FORBIDDEN`.
 * No devuelve nada sensible (las CredencialFlow tienen su propio estado leíble sin secretos).
 */
export async function getConfiguracionTienda({
  db,
  acceso,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
}): Promise<{
  nombre: string;
  slug: string;
  estado: TenantStatus;
  descripcion: string | null;
  logoUrl: string | null;
  colorPrimario: string | null;
  colorAcento: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  whatsappUrl: string | null;
  contactoEmail: string | null;
}> {
  const tenantId = resolverTenantDelPanel(acceso);

  // `logoUrl` se DEVUELVE (para mostrar el asset actual en el uploader) pero se ESCRIBE por el flujo
  // de subida, no por guardarConfiguracionTienda (D4/I6). Jamás secretos. El hero/aviso ya no se leen
  // acá (admin-bases-pdf F06/D7): son del Documento de Página, no de la card «Tu tienda».
  const tienda = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      nombre: true,
      slug: true,
      estado: true,
      descripcion: true,
      logoUrl: true,
      // Los dos colores de marca (admin-bases-pdf F06/D12): sin leer el acento, el form arrancaría
      // vacío y el primer «Guardar» lo borraría sin que el Organizador tocara nada.
      colorPrimario: true,
      colorAcento: true,
      instagramUrl: true,
      tiktokUrl: true,
      whatsappUrl: true,
      contactoEmail: true,
    },
  });

  return tienda;
}
