import { describe, expect, it } from "vitest";

import { parsearDocumento } from "~/lib/pagebuilder/migrate";
import { SeccionNodeSchema } from "~/lib/pagebuilder/schema";
import {
  bloqueTicketPromoProps,
  compartirSorteoProps,
  ganadoresProps,
  garantiasSorteoProps,
  metaProgresoSorteoProps,
} from "~/lib/pagebuilder/widgets";

/**
 * Tests de los widgets [mvp-v2] lote sorteo/conversión (catálogo-v2 F06, síntesis §2): schema estricto
 * + enums cerrados de `bloque_ticket_promo`, `meta_progreso_sorteo`, `garantias_sorteo`,
 * `compartir_sorteo`, y el upgrade de `ganadores` a v2 (fuente manual|automatico) con migrate v1→v2
 * que conserva los items (D4). El use case `getSorteoResumenStorefront` (sin PII) se testea aparte.
 */

describe("pagebuilder/widgets sorteo (F06) — schema estricto + enums", () => {
  // page.sor.001 — bloque_ticket_promo: ctaAncla del enum, .strict, degradación (todo default)
  it("bloque_ticket_promo valida ancla del enum y rechaza campos extra", () => {
    expect(bloqueTicketPromoProps.safeParse({}).success).toBe(true); // todo default
    expect(bloqueTicketPromoProps.safeParse({ ctaAncla: "externo" }).success).toBe(false);
    expect(bloqueTicketPromoProps.safeParse({ html: "<b>x</b>" }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "bt", tipo: "bloque_ticket_promo", v: 1, props: {} }).success).toBe(true);
  });

  // page.sor.002 — meta_progreso_sorteo: metaTickets entero positivo (req), estilo del enum, hitos ≤6
  it("meta_progreso_sorteo exige metaTickets positivo, estilo del enum y hitos ≤6", () => {
    expect(metaProgresoSorteoProps.safeParse({ metaTickets: 500 }).success).toBe(true);
    expect(metaProgresoSorteoProps.safeParse({}).success).toBe(false); // metaTickets requerida
    expect(metaProgresoSorteoProps.safeParse({ metaTickets: 0 }).success).toBe(false); // positivo
    expect(metaProgresoSorteoProps.safeParse({ metaTickets: 10.5 }).success).toBe(false); // entero
    expect(metaProgresoSorteoProps.safeParse({ metaTickets: 500, estilo: "circulo" }).success).toBe(false);
    expect(metaProgresoSorteoProps.safeParse({ metaTickets: 500, hitos: Array(7).fill({ en: 100, etiqueta: "x" }) }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "mp", tipo: "meta_progreso_sorteo", v: 1, props: { metaTickets: 500 } }).success).toBe(true);
  });

  // page.sor.003 — garantias_sorteo: íconos del enum, items ≤6, .strict
  it("garantias_sorteo valida íconos del enum, items 1–6 y rechaza campos extra", () => {
    expect(garantiasSorteoProps.safeParse({}).success).toBe(true); // items opcional
    expect(garantiasSorteoProps.safeParse({ items: [{ icono: "escudo", titulo: "T" }] }).success).toBe(true);
    expect(garantiasSorteoProps.safeParse({ items: [{ icono: "inventado", titulo: "T" }] }).success).toBe(false);
    expect(garantiasSorteoProps.safeParse({ items: Array(7).fill({ icono: "escudo", titulo: "T" }) }).success).toBe(false);
    expect(SeccionNodeSchema.safeParse({ id: "gs", tipo: "garantias_sorteo", v: 1, props: {} }).success).toBe(true);
  });

  // page.sor.004 — compartir_sorteo: canales del enum cerrado, 1–5, .strict
  it("compartir_sorteo valida canales del enum, 1–5 y rechaza campos extra", () => {
    expect(compartirSorteoProps.safeParse({ canales: ["whatsapp", "copiar"] }).success).toBe(true);
    expect(compartirSorteoProps.safeParse({}).success).toBe(true); // canales default
    expect(compartirSorteoProps.safeParse({ canales: ["email"] }).success).toBe(false); // canal desconocido
    expect(compartirSorteoProps.safeParse({ canales: [] }).success).toBe(false); // min 1
    expect(compartirSorteoProps.safeParse({ canales: ["whatsapp"], url: "https://evil" }).success).toBe(false); // .strict (la URL la arma el render)
    expect(SeccionNodeSchema.safeParse({ id: "cs", tipo: "compartir_sorteo", v: 1, props: {} }).success).toBe(true);
  });
});

describe("pagebuilder/widgets sorteo (F06) — ganadores v2 (fuente manual|automatico)", () => {
  // page.sor.gan.001 — ganadores v1 migra on-read a v2 con fuente 'manual' conservando items
  it("ganadores v1 migra on-read a v2 con fuente 'manual' y conserva los items", () => {
    const raw = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [
        { id: "sec-gan", tipo: "ganadores", v: 1, props: { layout: "grid", items: [{ nombre: "Ana", premio: "iPad" }] } },
      ],
      overlays: [],
    };
    const doc = parsearDocumento(raw);
    const gan = doc.secciones[0]!;
    expect(gan.v).toBe(2);
    if (gan.tipo === "ganadores") {
      expect(gan.props.fuente).toBe("manual"); // conserva el look v1
      expect(gan.props.items?.[0]?.nombre).toBe("Ana"); // items intactos
    }
  });

  // page.sor.gan.002 — fuente automatico no requiere items; fuente inválida ⇒ rechazo
  it("ganadores automatico no requiere items; fuente fuera del enum ⇒ rechazo", () => {
    expect(ganadoresProps.safeParse({ fuente: "automatico", maxAutomaticos: 4 }).success).toBe(true);
    expect(ganadoresProps.safeParse({ fuente: "manual", items: [{ nombre: "A", premio: "P" }] }).success).toBe(true);
    expect(ganadoresProps.safeParse({ fuente: "otra" }).success).toBe(false);
    // maxAutomaticos fuera de 1–20 ⇒ rechazo
    expect(ganadoresProps.safeParse({ fuente: "automatico", maxAutomaticos: 99 }).success).toBe(false);
    // items sigue acotado a ≤20 cuando está presente
    expect(ganadoresProps.safeParse({ items: Array(21).fill({ nombre: "A", premio: "P" }) }).success).toBe(false);
  });
});
