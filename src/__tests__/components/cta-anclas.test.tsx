import { MantineProvider } from "@mantine/core";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { type SeccionNode } from "~/lib/pagebuilder/schema";
import { type TenantBranding } from "~/styles/tenantTheme";

/**
 * Tests del DESTINO de los CTA de widgets (admin-bases-pdf **D14**). Un botón con `ancla:"bases"` es un
 * enlace LEGAL (ADR-0008): tiene que abrir el PDF de bases del sorteo activo — la ruta `/bases` — y no
 * scrollear a una sección de la home que el Organizador redactó. Es la MISMA regla que D13 aplicó al
 * navbar (`derivarNav`) y al chrome (`hrefMenuItem`), extendida acá a los CTA de contenido.
 *
 * Se testea por el RENDER de cada widget (no por el helper): lo que se rompió en producción fue el
 * `href` que ve el visitante, y estos componentes resolvían el ancla cada uno por su cuenta. El caso
 * REAL que lo destapó: `bcac` tiene un botón de hero «Ver bases del sorteo» con `ancla:"bases"` y su
 * home no emite ningún target `#bases` ⇒ el enlace no llevaba a ningún lado.
 *
 * `renderToStaticMarkup` + `MantineProvider` (mismo criterio que `estadisticas.test.tsx`). El sorteo
 * activo se moquea porque es una query tRPC (borde de datos, no colaborador interno): varios de estos
 * widgets lo consultan para decidir badges/countdown.
 */

vi.mock("~/components/storefront/use-sorteo-activo", () => ({
  useSorteoActivo: () => ({
    data: { id: "r1", nombre: "Sorteo", premio: "Premio", fechaFin: new Date("2099-01-01") },
    isError: false,
    isLoading: false,
  }),
}));

const BRANDING: TenantBranding = {
  nombre: "Tienda X",
  slug: "x",
  descripcion: null,
  logoUrl: null,
  colorPrimario: null,
  colorAcento: null,
  instagramUrl: null,
  tiktokUrl: null,
  whatsappUrl: null,
  contactoEmail: null,
};

/** Nodo mínimo de sección con props ya parseadas por su schema. */
const nodo = (tipo: string, props: unknown): SeccionNode =>
  ({ id: `n-${tipo}`, tipo, v: 1, props }) as unknown as SeccionNode;

/** Renderiza un widget del storefront dentro del provider y devuelve el HTML. */
const render = (Comp: ComponentType<never>, props: Record<string, unknown>): string =>
  renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(Comp as ComponentType<unknown>, props)),
  );

describe("CTA de widgets — ancla `bases` ⇒ ruta /bases (D14)", () => {
  // page.cta.bases.001 — el CTA del hero (el caso real de bcac) abre el PDF, no scrollea
  it("hero: el CTA principal con ancla `bases` apunta a /bases", async () => {
    const { StorefrontHero } = await import("~/components/storefront/storefront-hero");
    const { heroProps } = await import("~/lib/pagebuilder/widgets");
    const html = render(StorefrontHero as unknown as ComponentType<never>, {
      nodo: nodo(
        "hero",
        heroProps.parse({ ctaTexto: "Ver bases del sorteo", ctaAncla: "bases" }),
      ),
      branding: BRANDING,
    });
    expect(html).toContain('href="/bases"');
    expect(html).not.toContain('href="#bases"');
  });

  // page.cta.bases.002 — la banda `banner_cta` (CTA de página completa) respeta la misma regla
  it("banner_cta: el botón con ancla `bases` apunta a /bases", async () => {
    const { BannerCta } = await import("~/components/storefront/banner-cta");
    const { bannerCtaProps } = await import("~/lib/pagebuilder/widgets");
    const html = render(BannerCta as unknown as ComponentType<never>, {
      nodo: nodo(
        "banner_cta",
        bannerCtaProps.parse({ titulo: "Participa", ctaTexto: "Bases", ctaAncla: "bases" }),
      ),
    });
    expect(html).toContain('href="/bases"');
    expect(html).not.toContain('href="#bases"');
  });

  // page.cta.bases.003 — packs_precio resuelve igual en sus DOS variantes (`tarjeta` y `ficha`),
  // que renderizan su botón por caminos distintos.
  it("packs_precio: el CTA con ancla `bases` apunta a /bases en las dos variantes", async () => {
    const { PacksPrecio } = await import("~/components/storefront/packs-precio");
    const { packsPrecioProps } = await import("~/lib/pagebuilder/widgets");
    for (const variante of ["tarjeta", "ficha"] as const) {
      const html = render(PacksPrecio as unknown as ComponentType<never>, {
        nodo: nodo(
          "packs_precio",
          packsPrecioProps.parse({
            variante,
            items: [{ titulo: "Pack", precio: 3000, ctaTexto: "Bases", ctaAncla: "bases" }],
          }),
        ),
      });
      expect(html, variante).toContain('href="/bases"');
      expect(html, variante).not.toContain('href="#bases"');
    }
  });

  // page.cta.bases.004 — la tarjeta `momento_ticket` sigue la misma regla
  it("momento_ticket: el CTA con ancla `bases` apunta a /bases", async () => {
    const { MomentoTicket } = await import("~/components/storefront/momento-ticket");
    const { momentoTicketProps } = await import("~/lib/pagebuilder/widgets");
    const html = render(MomentoTicket as unknown as ComponentType<never>, {
      nodo: nodo(
        "momento_ticket",
        momentoTicketProps.parse({
          titulo: "¡Estás dentro!",
          codigoEjemplo: "ARMY-04821",
          ctaTexto: "Bases",
          ctaAncla: "bases",
        }),
      ),
    });
    expect(html).toContain('href="/bases"');
    expect(html).not.toContain('href="#bases"');
  });

  // page.cta.bases.005 — `bloque_ticket_promo` colapsa históricamente el enum a dos destinos
  // (sorteo/catálogo). El ancla de RUTA gana; el colapso de las demás NO se toca (fuera de D14).
  it("bloque_ticket_promo: `bases` va a /bases y `sorteo` sigue scrolleando a #sorteo", async () => {
    const { BloqueTicketPromo } = await import("~/components/storefront/bloque-ticket-promo");
    const { bloqueTicketPromoProps } = await import("~/lib/pagebuilder/widgets");
    const html = (ctaAncla: string) =>
      render(BloqueTicketPromo as unknown as ComponentType<never>, {
        nodo: nodo(
          "bloque_ticket_promo",
          bloqueTicketPromoProps.parse({ titulo: "Compra y participa", ctaTexto: "Ir", ctaAncla }),
        ),
      });
    expect(html("bases")).toContain('href="/bases"');
    expect(html("bases")).not.toContain('href="#bases"');
    expect(html("sorteo")).toContain('href="#sorteo"');
  });

  // page.cta.bases.006 — `urgencia_countdown`, mismo colapso histórico que el bloque promo
  it("urgencia_countdown: `bases` va a /bases y `sorteo` sigue scrolleando a #sorteo", async () => {
    const { UrgenciaCountdown } = await import("~/components/storefront/urgencia-countdown");
    const { urgenciaCountdownProps } = await import("~/lib/pagebuilder/widgets");
    const html = (ctaAncla: string) =>
      render(UrgenciaCountdown as unknown as ComponentType<never>, {
        nodo: nodo(
          "urgencia_countdown",
          urgenciaCountdownProps.parse({ ctaTexto: "Ir", ctaAncla }),
        ),
      });
    expect(html("bases")).toContain('href="/bases"');
    expect(html("bases")).not.toContain('href="#bases"');
    expect(html("sorteo")).toContain('href="#sorteo"');
  });

  // page.cta.bases.007 — GUARD: solo `bases` cambió de naturaleza. Las demás anclas del enum siguen
  // siendo scroll dentro de la página; si alguien "generalizara" la tabla, esto se pone rojo.
  it("las demás anclas del enum siguen scrolleando (`catalogo`/`como-funciona`, sin rutas nuevas)", async () => {
    const { BannerCta } = await import("~/components/storefront/banner-cta");
    const { bannerCtaProps } = await import("~/lib/pagebuilder/widgets");
    const html = (ctaAncla: string) =>
      render(BannerCta as unknown as ComponentType<never>, {
        nodo: nodo(
          "banner_cta",
          bannerCtaProps.parse({ titulo: "Participa", ctaTexto: "Ir", ctaAncla }),
        ),
      });
    expect(html("catalogo")).toContain('href="#catalogo"');
    expect(html("como-funciona")).toContain('href="#como-funciona"');
    expect(html("preguntas")).toContain('href="#preguntas"');
  });
});
