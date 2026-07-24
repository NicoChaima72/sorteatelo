import { describe, expect, it } from "vitest";

import {
  MUESTRA_SORTEO_ACTIVO,
  MUESTRA_SORTEO_RESUMEN,
} from "~/components/storefront/preview-muestra";
import {
  CATEGORIAS_WIDGET,
  TIPOS_OVERLAY,
  TIPOS_SECCION,
  WIDGET_META,
  WIDGET_REGISTRY,
  type CategoriaWidgetUI,
  type WidgetTipo,
} from "~/lib/pagebuilder/widgets";

/**
 * Tests del catálogo VISUAL del editor (catálogo-v2 F11, WidgetGallery). Cubren las piezas PURAS del
 * dock/galería: (a) cada widget del registro declara una `categoria` de UI válida (tab de la galería);
 * (b) la galería lista SOLO tipos de sección y son filtrables por categoría sin dejar ninguno afuera; y
 * (c) los datos de MUESTRA de las previews tienen el shape correcto y el ganador va enmascarado (no PII).
 * El comportamiento client (dock resize/colapso, previews reales, hook preview-aware) es E2E de navegador.
 */

const TIPOS = Object.keys(WIDGET_REGISTRY) as WidgetTipo[];
const CATS = new Set<string>(CATEGORIAS_WIDGET);

describe("editor/galeria — F11: categoría de UI del registro (generativo)", () => {
  // page.gal.001 — WIDGET_META.categoria existe y es una categoría válida para CADA widget del registro
  it("cada widget declara una categoria válida", () => {
    for (const tipo of TIPOS) {
      const cat = WIDGET_META[tipo].categoria;
      expect(CATS.has(cat), `${tipo}: categoria inválida (${cat})`).toBe(true);
    }
  });
});

describe("editor/galeria — F11: la galería lista solo secciones, filtrables por categoría", () => {
  // page.gal.002 — TIPOS_SECCION cubre exactamente las secciones; ningún overlay se cuela; el filtro por
  // categoría particiona los tipos de sección sin perder ninguno (unión de las 5 categorías = TIPOS_SECCION).
  it("la galería filtra secciones por categoría sin dejar ninguna fuera y sin overlays", () => {
    // Ningún tipo de sección es también overlay (la galería usa TIPOS_SECCION ⇒ no muestra overlays).
    const overlays = new Set<WidgetTipo>(TIPOS_OVERLAY);
    for (const t of TIPOS_SECCION) {
      expect(overlays.has(t), `${t} no debe ser overlay`).toBe(false);
    }
    // La unión de los filtros por categoría reconstruye exactamente TIPOS_SECCION.
    const porCategoria = new Set<WidgetTipo>();
    for (const cat of CATEGORIAS_WIDGET) {
      for (const t of TIPOS_SECCION.filter((x) => WIDGET_META[x].categoria === (cat as CategoriaWidgetUI))) {
        porCategoria.add(t);
      }
    }
    expect(porCategoria.size).toBe(TIPOS_SECCION.length);
    for (const t of TIPOS_SECCION) expect(porCategoria.has(t)).toBe(true);
  });
});

describe("editor/galeria — F11: datos de muestra de las previews", () => {
  // page.gal.003 — la muestra del sorteo activo tiene el shape del use case; el resumen enmascara el ganador
  it("la muestra estática es válida y el ganador va enmascarado (sin PII)", () => {
    expect(MUESTRA_SORTEO_ACTIVO.totalParticipaciones).toBeGreaterThan(0);
    expect(MUESTRA_SORTEO_ACTIVO.fechaFin instanceof Date).toBe(true);
    expect(MUESTRA_SORTEO_RESUMEN.length).toBeGreaterThan(0);
    for (const g of MUESTRA_SORTEO_RESUMEN) {
      // Ganador enmascarado (2 chars + *** + dominio) — la muestra no exhibe un correo completo.
      expect(g.ganadorEnmascarado).toMatch(/\*\*\*@/);
    }
  });
});
