import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { documentoNuevaPagina } from "~/lib/pagebuilder/factory";
import { slugPagina } from "~/lib/pagebuilder/widgets";
import { DomainError } from "~/server/domain/errors";
import { esSlugPaginaReservado } from "~/server/tenancy/slugTienda";

/**
 * Use cases de MULTI-PÁGINA (Tanda 3 F04/D8, ADR-0016). CRUD de las `StorefrontPage` de una Tienda,
 * tenant-scoped SERVER-SIDE (I1) y en `$transaction` donde toca varias filas (I10). El slug de página se
 * valida con `slugPagina` (kebab ≤64, el MISMO que el destino de link de un run — un solo vocabulario) +
 * la lista de reservados (`esSlugPaginaReservado`, rutas estáticas). La unicidad la garantiza el
 * `@@unique([tenantId, slug])` (carrera ⇒ CONFLICT). `home` es especial: existe siempre, no se crea ni
 * renombra ni elimina.
 */

/** `true` sii el error de Prisma es una violación del unique (P2002). */
function esColisionUnique(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Normaliza + valida un slug de página; lanza INVALID si no sirve (forma o reservado). */
function validarSlug(slug: string): string {
  const limpio = slug.trim().toLowerCase();
  if (!slugPagina.safeParse(limpio).success) {
    throw new DomainError("INVALID", "El slug debe ser minúsculas y guiones (ej. sobre-mi).");
  }
  if (esSlugPaginaReservado(limpio)) {
    throw new DomainError("INVALID", `"${limpio}" es una ruta reservada de la plataforma.`);
  }
  return limpio;
}

export interface PaginaResumen {
  slug: string;
  enNav: boolean;
  publicado: boolean;
  publishedAt: Date | null;
  esHome: boolean;
}

/**
 * Lista las Páginas de la Tienda (F04/F05). `home` primero, el resto por antigüedad. `publicado` sale de
 * `publishedAt` (no se trae el JSON completo). Tenant-scoped (I1).
 */
export async function listarPaginas({
  db,
  tenantId,
}: {
  db: Pick<PrismaClient, "storefrontPage">;
  tenantId: string;
}): Promise<PaginaResumen[]> {
  const pages = await db.storefrontPage.findMany({
    where: { tenantId },
    select: { slug: true, enNav: true, publishedAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return pages
    .map((p) => ({
      slug: p.slug,
      enNav: p.enNav,
      publicado: p.publishedAt !== null,
      publishedAt: p.publishedAt,
      esHome: p.slug === "home",
    }))
    .sort((a, b) => (a.esHome === b.esHome ? 0 : a.esHome ? -1 : 1));
}

/**
 * Crea una Página nueva (F04): valida el slug (forma + reservados + distinto de `home`), siembra el
 * borrador con `documentoNuevaPagina` y respeta el `@@unique` (colisión ⇒ CONFLICT). `enNav` arranca en
 * false (I-U8). `nombre` es el título humano (semilla del hero); ausente ⇒ el slug.
 */
export async function crearPagina({
  db,
  tenantId,
  slug,
  nombre,
}: {
  db: Pick<PrismaClient, "storefrontPage">;
  tenantId: string;
  slug: string;
  nombre?: string;
}): Promise<{ slug: string }> {
  const limpio = validarSlug(slug);
  const nombreLimpio = nombre?.trim() ?? "";
  const doc = documentoNuevaPagina(nombreLimpio.length > 0 ? nombreLimpio : limpio);
  try {
    await db.storefrontPage.create({
      data: { tenantId, slug: limpio, draftJson: doc, enNav: false },
    });
  } catch (e) {
    if (esColisionUnique(e)) {
      throw new DomainError("CONFLICT", "Ya existe una página con ese slug.");
    }
    throw e;
  }
  return { slug: limpio };
}

/**
 * Renombra una Página (F05): prohíbe `home`, valida el slug nuevo, y mueve la fila + su HISTORIAL
 * (`StorefrontPageVersion`) al slug nuevo dentro de la MISMA `$transaction` (D8: el historial SIGUE a la
 * página). Colisión con un slug existente ⇒ CONFLICT.
 */
export async function renombrarPagina({
  db,
  tenantId,
  slug,
  slugNuevo,
}: {
  db: Pick<PrismaClient, "storefrontPage" | "storefrontPageVersion" | "$transaction">;
  tenantId: string;
  slug: string;
  slugNuevo: string;
}): Promise<{ slug: string }> {
  if (slug === "home") {
    throw new DomainError("INVALID", "La página de inicio no se puede renombrar.");
  }
  const destino = validarSlug(slugNuevo);
  if (destino === slug) return { slug: destino };
  try {
    await db.$transaction(async (tx) => {
      const existe = await tx.storefrontPage.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
        select: { id: true },
      });
      if (!existe) throw new DomainError("NOT_FOUND", "La página no existe.");
      // Mueve la fila y su historial al slug nuevo (el historial se ancla a (tenantId, slug), D8).
      await tx.storefrontPage.update({
        where: { tenantId_slug: { tenantId, slug } },
        data: { slug: destino },
      });
      await tx.storefrontPageVersion.updateMany({
        where: { tenantId, slug },
        data: { slug: destino },
      });
    });
  } catch (e) {
    if (esColisionUnique(e)) {
      throw new DomainError("CONFLICT", "Ya existe una página con ese slug.");
    }
    throw e;
  }
  return { slug: destino };
}

/**
 * Elimina una Página (F05): prohíbe `home`, borra la fila + su historial (`StorefrontPageVersion`, que NO
 * tiene FK a StorefrontPage) en la MISMA `$transaction` (D8: limpieza completa). Página inexistente ⇒
 * NOT_FOUND.
 */
export async function eliminarPagina({
  db,
  tenantId,
  slug,
}: {
  db: Pick<PrismaClient, "storefrontPage" | "storefrontPageVersion" | "$transaction">;
  tenantId: string;
  slug: string;
}): Promise<{ slug: string }> {
  if (slug === "home") {
    throw new DomainError("INVALID", "La página de inicio no se puede eliminar.");
  }
  await db.$transaction(async (tx) => {
    const existe = await tx.storefrontPage.findUnique({
      where: { tenantId_slug: { tenantId, slug } },
      select: { id: true },
    });
    if (!existe) throw new DomainError("NOT_FOUND", "La página no existe.");
    await tx.storefrontPage.delete({ where: { tenantId_slug: { tenantId, slug } } });
    await tx.storefrontPageVersion.deleteMany({ where: { tenantId, slug } });
  });
  return { slug };
}

/**
 * Setea `enNav` de una Página (F05): la suma/quita del nav derivado del header. Tenant-scoped (I1).
 */
export async function setEnNav({
  db,
  tenantId,
  slug,
  enNav,
}: {
  db: Pick<PrismaClient, "storefrontPage">;
  tenantId: string;
  slug: string;
  enNav: boolean;
}): Promise<{ slug: string; enNav: boolean }> {
  const res = await db.storefrontPage.updateMany({
    where: { tenantId, slug },
    data: { enNav },
  });
  if (res.count === 0) throw new DomainError("NOT_FOUND", "La página no existe.");
  return { slug, enNav };
}

// ── Inputs de los procedures del editor (F05) ──────────────────────────────────────────────────

/** Slug de una página para leer/editar (default home lo pone el use case). */
export const paginaSlugInput = z.object({ slug: slugPagina.optional() });

export const crearPaginaInput = z.object({
  slug: z.string().min(1).max(64),
  nombre: z.string().min(1).max(120).optional(),
});
export type CrearPaginaInput = z.infer<typeof crearPaginaInput>;

export const renombrarPaginaInput = z.object({
  slug: z.string().min(1).max(64),
  slugNuevo: z.string().min(1).max(64),
});
export type RenombrarPaginaInput = z.infer<typeof renombrarPaginaInput>;

export const eliminarPaginaInput = z.object({ slug: z.string().min(1).max(64) });
export type EliminarPaginaInput = z.infer<typeof eliminarPaginaInput>;

export const setEnNavInput = z.object({
  slug: z.string().min(1).max(64),
  enNav: z.boolean(),
});
export type SetEnNavInput = z.infer<typeof setEnNavInput>;
