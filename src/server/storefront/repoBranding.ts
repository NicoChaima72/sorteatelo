import { type PrismaClient } from "@prisma/client";

import { type RepoBranding } from "~/server/storefront/resolverBranding";

/**
 * Cableado del puerto de branding contra Prisma (borde, no unit-testeado — la política vive en
 * `resolverBranding.ts` y se testea con un repo fake). `select` explícito de los campos de MARCA
 * + `estado` (para el gate PUBLICADA): jamás arrastra la `FlowCredential` ni secretos.
 */
export function crearRepoBranding(db: PrismaClient): RepoBranding {
  return {
    findBrandingBySlug: (slug) =>
      db.tenant.findUnique({
        where: { slug },
        select: {
          estado: true,
          nombre: true,
          slug: true,
          descripcion: true,
          logoUrl: true,
          colorPrimario: true,
          heroTitulo: true,
          heroSubtitulo: true,
          avisoTexto: true,
        },
      }),
  };
}
