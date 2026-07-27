import { type PrismaClient } from "@prisma/client";

/**
 * **Reply-to del Organizador** (T6/G8) — la derivación centralizada, en UN solo lugar.
 *
 * Regla cerrada del plan: `Tenant.contactoEmail ?? membresía más antigua`. Los dos escalones tienen
 * sentidos distintos y por eso el orden importa:
 *
 * 1. **`Tenant.contactoEmail`** es el correo de contacto que el Organizador ELIGIÓ publicar (el
 *    mismo que muestra el footer del storefront). Si lo configuró, es la dirección por la que quiere
 *    que le escriban.
 * 2. **La membresía más antigua** es el fallback: el correo con el que entró con Google. Sirve para
 *    que el Comprador siempre tenga a quién responderle, pero es un dato PERSONAL que nadie eligió
 *    publicar — por eso viaja en la cabecera `Reply-To` y **nunca se imprime en el cuerpo**.
 *
 * Sin ninguno de los dos, el correo sale sin `Reply-To`: es válido (D7). Poner un `null` en una
 * cabecera no lo es.
 *
 * Vive acá y no dentro de cada plantilla porque T6 lo pide explícitamente: «centralizar la
 * derivación en UN helper antes de multiplicar plantillas». Con dos correos ya multiplicadas (C1 y
 * C4/C5), dos implementaciones se habrían desincronizado en el primer cambio.
 *
 * Es **batch**: una sola query de membresías para todos los tenants del lote, y cero queries si
 * todos tienen contacto público. El seam `ResolverMensajes` de ADR-0027 pide justamente eso —
 * resolver 100 filas tiene que poder ser una query, no 100.
 */

/** Lo mínimo que hay que saber de un tenant para derivar su reply-to. */
export interface TenantConContacto {
  id: string;
  /** `Tenant.contactoEmail` — el contacto PÚBLICO, si el Organizador lo configuró. */
  contactoEmail: string | null;
}

export async function replyToDeTenants({
  db,
  tenants,
}: {
  db: PrismaClient;
  tenants: TenantConContacto[];
}): Promise<Map<string, string>> {
  const replyTos = new Map<string, string>();
  const sinContacto: string[] = [];

  for (const t of tenants) {
    const publico = t.contactoEmail?.trim();
    if (publico) replyTos.set(t.id, publico);
    else if (!sinContacto.includes(t.id)) sinContacto.push(t.id);
  }

  if (sinContacto.length === 0) return replyTos;

  const membresias = await db.tenantMembership.findMany({
    where: { tenantId: { in: sinContacto } },
    orderBy: { createdAt: "asc" },
    select: { tenantId: true, user: { select: { email: true } } },
  });
  for (const m of membresias) {
    // `User.email` es nullable (frontera NextAuth). Una membresía sin email no puede ser reply-to,
    // así que se salta y el siguiente Organizador del tenant tiene su chance.
    if (m.user.email && !replyTos.has(m.tenantId)) {
      replyTos.set(m.tenantId, m.user.email);
    }
  }

  return replyTos;
}
