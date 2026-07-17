import { describe, expect, it } from "vitest";

import {
  type RepoBranding,
  resolverBrandingDesdeHost,
  type TenantBrandingPersistido,
} from "~/server/storefront/resolverBranding";

/**
 * Tests del resolver de branding server-side del storefront (F01/D1/D3, ADR-0007). Espeja el
 * criterio de `resolverTenantDesdeHost` (host → zona → Tienda PUBLICADA) pero devuelve los
 * campos de MARCA para tematizar por request. Núcleo con el repo INYECTADO (sin Prisma): la
 * política de "solo PUBLICADA sirve" vive acá, no en el repo.
 *
 * Cubre la Validación F01: publicada ⇒ campos de marca; apex/www ⇒ plataforma sin branding;
 * inexistente/en configuración/suspendida ⇒ respuesta neutral idéntica (no filtra el motivo, I2).
 */

const config = { dominioRaiz: "localhost" };

const persistido = (
  slug: string,
  estado: TenantBrandingPersistido["estado"],
): TenantBrandingPersistido => ({
  estado,
  nombre: `Tienda ${slug}`,
  slug,
  descripcion: "desc",
  logoUrl: null,
  colorPrimario: "#4f46e5",
  heroTitulo: "Hola",
  heroSubtitulo: null,
  avisoTexto: null,
});

function fakeRepo(tiendas: TenantBrandingPersistido[]): RepoBranding {
  return {
    findBrandingBySlug: async (slug) =>
      tiendas.find((t) => t.slug === slug) ?? null,
  };
}

describe("server/storefront/resolverBranding", () => {
  // storefront.branding.001 — Tienda publicada ⇒ zona storefront con sus campos de marca
  it("un host de Tienda PUBLICADA devuelve zona storefront con el branding (sin `estado`)", async () => {
    const res = await resolverBrandingDesdeHost({
      host: "autora.localhost:3001",
      config,
      repo: fakeRepo([persistido("autora", "PUBLICADA")]),
    });
    expect(res.zona).toBe("storefront");
    if (res.zona !== "storefront") throw new Error("narrow");
    expect(res.branding).toMatchObject({
      nombre: "Tienda autora",
      slug: "autora",
      colorPrimario: "#4f46e5",
      heroTitulo: "Hola",
    });
    // No filtra el estado al cliente (no lo necesita el chrome).
    expect(res.branding).not.toHaveProperty("estado");
  });

  // storefront.branding.002 — apex y www ⇒ zona plataforma, sin branding, sin tocar la DB
  it("el apex y www resuelven zona plataforma sin branding", async () => {
    const repo = fakeRepo([]);
    for (const host of ["localhost:3001", "www.localhost:3001"]) {
      const res = await resolverBrandingDesdeHost({ host, config, repo });
      expect(res).toEqual({ zona: "plataforma" });
    }
  });

  // storefront.branding.003 — inexistente / en configuración / suspendida ⇒ MISMA respuesta neutral
  it("slug inexistente, en CONFIGURACION o SUSPENDIDA dan la misma respuesta neutral (no filtra el motivo)", async () => {
    const repo = fakeRepo([
      persistido("enconfig", "CONFIGURACION"),
      persistido("suspendida", "SUSPENDIDA"),
      persistido("enalta", "ALTA"),
    ]);
    for (const slug of ["nope", "enconfig", "suspendida", "enalta"]) {
      const res = await resolverBrandingDesdeHost({
        host: `${slug}.localhost:3001`,
        config,
        repo,
      });
      expect(res).toEqual({ zona: "sin-storefront" });
    }
  });

  // storefront.branding.004 — host no interpretable ⇒ sin-storefront (fail-closed)
  it("un host no interpretable cae en sin-storefront", async () => {
    const res = await resolverBrandingDesdeHost({
      host: "otra-cosa.example.com",
      config,
      repo: fakeRepo([]),
    });
    expect(res).toEqual({ zona: "sin-storefront" });
  });
});
