import { type PrismaClient } from "@prisma/client";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { type AccesoPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { type CrearTiendaInput } from "~/server/domain/tenants/schemas";
import { esSlugValido } from "~/server/tenancy/parsearHost";
import { esSlugReservado } from "~/server/tenancy/slugTienda";

/**
 * Use case del alta self-service de Tiendas (F08/F01). Un usuario logueado SIN Tienda crea
 * la suya: valida el slug (formato de subdominio + no reservado, D7), exige que aún no tenga
 * membresía (MVP: 1 Tienda por Organizador, D8) y crea el `Tenant` (en CONFIGURACION, D1) +
 * su `TenantMembership` en UNA sola `$transaction` — atómico: sin membresía huérfana si algo
 * falla, sin Tienda sin dueño.
 *
 * Aislamiento (I1/ADR-0005): el `userId` de la membresía sale del `acceso` resuelto
 * SERVER-SIDE en `panelProcedure`, NUNCA del input (el input solo trae slug + nombre). Este
 * es el ÚNICO use case del panel que no pasa por `resolverTenantDelPanel`: precede a la
 * primera membresía del usuario (crearla es su razón de ser).
 *
 * Backstops de las dos invariantes, dentro de la $transaction:
 * - **Slug único** (= subdominio, ADR-0007): pre-chequeo + el `@unique` de `Tenant.slug` de DB
 *   como garantía última ante una carrera.
 * - **D8 (1 Tienda por Organizador)**: recontar las membresías del `userId` DENTRO de la tx.
 *   El snapshot `acceso.tenantIds` (cargado en `panelProcedure` ANTES de la tx) solo sirve de
 *   fast-fail; NO hay `@unique` de DB que lo respalde (`TenantMembership` es unique por
 *   `[userId, tenantId]`, no por `userId` solo — a propósito: el Operador podría sumar un user a
 *   varias Tiendas post-MVP). El recuento en la tx es el guard autoritativo de D8.
 */
export async function crearTienda({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearTiendaInput;
}): Promise<{ id: string; slug: string }> {
  const slug = input.slug;

  // 1) Slug bien formado como label DNS (= subdominio, ADR-0007). Reusa esSlugValido (I4).
  if (!esSlugValido(slug)) {
    throw new DomainError(
      "INVALID",
      "El identificador de la tienda solo admite minúsculas, números y guiones (sin guion al inicio ni al final).",
    );
  }

  // 2) Reservados de plataforma (apex/www, endpoints, panel del Operador).
  if (esSlugReservado(slug)) {
    throw new DomainError(
      "INVALID",
      "Ese identificador está reservado por la plataforma. Elige otro.",
    );
  }

  // 3) MVP: un Organizador administra UNA Tienda (D8). Fast-fail con el snapshot `acceso.tenantIds`
  //    (server-side, I1) para no abrir una tx si ya sabemos que tiene una. El guard AUTORITATIVO
  //    se recuenta dentro de la tx (abajo): el snapshot pudo cargarse antes de otra alta.
  if (acceso.tenantIds.length > 0) {
    throw new DomainError(
      "CONFLICT",
      "Tu cuenta ya administra una tienda. En esta versión cada cuenta tiene una sola tienda.",
    );
  }

  // 4) Tenant + membresía atómicos, dentro de la tx.
  return db.$transaction(async (tx) => {
    // D8 autoritativo: recontar las membresías del user DENTRO de la tx (el snapshot pre-tx es
    // solo fast-fail y no hay `@unique` de DB por `userId` que lo respalde — ver comentario de
    // cabecera). Cierra la carrera de dos altas del mismo usuario (doble submit).
    const membresiasActuales = await tx.tenantMembership.count({
      where: { userId: acceso.userId },
    });
    if (membresiasActuales > 0) {
      throw new DomainError(
        "CONFLICT",
        "Tu cuenta ya administra una tienda. En esta versión cada cuenta tiene una sola tienda.",
      );
    }

    // Slug: pre-chequeo para un CONFLICT limpio; el `@unique` de DB es el backstop último.
    const existente = await tx.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (existente) {
      throw new DomainError(
        "CONFLICT",
        "Ese identificador ya está en uso por otra tienda. Elige otro.",
      );
    }

    const tenant = await tx.tenant.create({
      data: { slug, nombre: input.nombre, estado: "CONFIGURACION" }, // D1
      select: { id: true, slug: true },
    });

    await tx.tenantMembership.create({
      data: { userId: acceso.userId, tenantId: tenant.id }, // userId del acceso (I1)
    });

    // La Tienda nace con su Página de tienda (page builder, R5/ADR-0016): draft = published =
    // documento inicial (una Tienda nueva no tiene branding aún ⇒ hero sin overrides). En la MISMA
    // $transaction: sin Tienda sin Página. El storefront público lee `publishedJson` (F05), así que
    // se publica el documento inicial de una vez (equivalente a la plantilla vacía actual).
    // Sin overrides de hero: una Tienda nueva no tiene branding y el render degrada a su
    // `nombre`/`descripcion` (admin-bases-pdf F07 — antes se pasaban 3 nulls explícitos porque el
    // seam venía de columnas del Tenant que ya no existen).
    const doc = documentoInicial({});
    await tx.storefrontPage.create({
      data: {
        tenantId: tenant.id,
        draftJson: doc,
        publishedJson: doc,
        publishedAt: new Date(),
      },
    });

    return { id: tenant.id, slug: tenant.slug };
  });
}
