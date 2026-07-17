import { type PrismaClient } from "@prisma/client";

import { DomainError } from "~/server/domain/errors";
import { GRANT_TTL_DIAS } from "~/server/domain/pago/aplicarEfectosPostPago";
import { armarCorreoDescarga } from "~/server/domain/correo/plantillaDescarga";
import { type CorreoService } from "~/server/services/correo";

/**
 * Use case de dominio (F04/D3/D6/D7): envía UN correo con los enlaces de descarga de TODOS los
 * grants de una orden. Es la pieza compartida por el envío post-pago (decorator del webhook, F02)
 * y el reenvío del panel (F03) — una sola definición del contenido/derivación.
 *
 * Reglas duras:
 * - **I4 (tenancy / datos server-side)**: TODO el contenido (destino, nombre de Tienda, reply-to,
 *   títulos, tokens) se deriva de la ORDEN cargada por `db` a partir del `orderId` — jamás de un
 *   parámetro externo. El caller (webhook o reenvío) ya resolvió QUÉ orden es server-side.
 * - **D7 (reply-to)**: se usa el `User.email` de la `TenantMembership` MÁS ANTIGUA del tenant
 *   (`Tenant` no tiene campo de contacto — S4). Sin membresía ⇒ correo sin reply-to (válido).
 * - **D8 (enlace)**: `<baseUrl>/api/descargas/<token>` (endpoint de PLATAFORMA, token unique global
 *   ⇒ sin subdominio). `baseUrl` entra como argumento (el borde lee env).
 * - **I3 (secretos/tokens)**: los tokens solo viajan en el correo al Comprador; este use case no los
 *   loguea. El `pdfPath`/keys del bucket NUNCA se cargan ni exponen — solo el token del grant.
 *
 * Corre FUERA de cualquier `$transaction` (post-commit, D1): los tokens ya existen en DB.
 */
export async function enviarCorreoDescargaDeOrden({
  db,
  correo,
  orderId,
  baseUrl,
}: {
  db: PrismaClient;
  correo: CorreoService;
  orderId: string;
  baseUrl: string;
}): Promise<{ enviado: true; id: string; items: number }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      email: true,
      tenantId: true,
      tenant: { select: { nombre: true } },
      // Un ítem por grant (D3). `orderBy` estable para un correo reproducible. Solo el token
      // (autoridad del enlace) y el título — NUNCA `pdfPath`/keys del bucket (I3).
      downloadGrants: {
        select: { token: true, product: { select: { titulo: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!order) {
    // No debería ocurrir: el caller confirma/valida la orden antes de invocar. Si pasa, es una
    // violación de integridad, no una condición esperada del correo.
    throw new DomainError(
      "NOT_FOUND",
      `Orden ${orderId} inexistente al enviar el correo de descarga`,
    );
  }

  const base = baseUrl.replace(/\/+$/, ""); // sin barra final (evita `//api/...`)
  const items = order.downloadGrants.map((g) => ({
    titulo: g.product.titulo,
    enlace: `${base}/api/descargas/${g.token}`,
  }));

  const replyTo = await replyToDelOrganizador(db, order.tenantId);

  const { from, subject, text, html } = armarCorreoDescarga({
    nombreTienda: order.tenant.nombre,
    items,
    diasExpiracion: GRANT_TTL_DIAS,
  });

  const { id } = await correo.enviarCorreo({
    from,
    to: order.email,
    replyTo,
    subject,
    text,
    html,
  });

  return { enviado: true, id, items: items.length };
}

/**
 * Reply-to = email del Organizador (D7). Deriva del `User` de la `TenantMembership` MÁS ANTIGUA del
 * tenant (`orderBy createdAt asc`). Sin membresía ⇒ `undefined` (correo sin reply-to). Cuando F08
 * agregue un email de contacto por Tienda, se cambia SOLO acá la fuente.
 */
async function replyToDelOrganizador(
  db: PrismaClient,
  tenantId: string,
): Promise<string | undefined> {
  const membresia = await db.tenantMembership.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { email: true } } },
  });
  return membresia?.user.email ?? undefined;
}
