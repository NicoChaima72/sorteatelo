import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import {
  type EstadoPublicacion,
  evaluarPublicacion,
} from "~/server/domain/tenants/_publicacion";
import { TOS_VERSION } from "~/server/tos/tos";

/**
 * Use case del panel (F08/F03, D4): estado de publicación de la Tienda. Carga los datos que el
 * gate necesita (ToS aceptado, FlowCredential, ≥1 producto publicable, sorteo activo + bases) y
 * los evalúa con el núcleo puro `evaluarPublicacion` — la MISMA lógica que recomputa
 * `publicarTienda` server-side (I2). Es la única fuente de verdad del checklist del panel.
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1/ADR-0005); sin membresía ⇒ `FORBIDDEN`.
 * `tosVersionVigente` se inyecta (default `TOS_VERSION`) para testear sin acoplar a la constante.
 */
export async function getEstadoPublicacion({
  db,
  acceso,
  tosVersionVigente = TOS_VERSION,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  tosVersionVigente?: string;
}): Promise<EstadoPublicacion & { slug: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const [tenant, flow, productoPublicable, raffleActivo] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { slug: true, estado: true, tosVersion: true },
    }),
    // Solo si existe: NUNCA se traen las columnas cifradas (I6/ADR-0006).
    db.flowCredential.findUnique({
      where: { tenantId },
      select: { tenantId: true },
    }),
    // Publicable = entregable: activo Y con PDF ya subido (I9/D5).
    db.product.findFirst({
      where: { tenantId, activo: true, pdfPath: { not: null } },
      select: { id: true },
    }),
    // Las BASES del gate salen del Raffle ACTIVO (admin-bases-pdf F03/D2/D3): se trae su
    // `basesPdfUrl` en la MISMA query que ya resolvía "hay sorteo activo".
    db.raffle.findFirst({
      where: { tenantId, estado: "ACTIVO" },
      select: { id: true, basesPdfUrl: true },
    }),
  ]);

  const evaluado = evaluarPublicacion({
    estado: tenant.estado,
    tosVersion: tenant.tosVersion,
    tosVersionVigente,
    flowConfigurada: flow !== null,
    tieneProductoPublicable: productoPublicable !== null,
    hayRaffleActivo: raffleActivo !== null,
    basesPdfDelRaffleActivo: raffleActivo?.basesPdfUrl ?? null,
  });

  return { slug: tenant.slug, ...evaluado };
}
