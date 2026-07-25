import { describe, expect, it } from "vitest";

import { RichTextoSchema, type RichTexto, type Run } from "~/lib/pagebuilder/widgets";
import {
  aplicarLink,
  limpiarRichTexto,
  normalizarRuns,
  partirEnOffsets,
  quitarLink,
  textoPlano,
  toggleMarca,
  tramosARichTexto,
} from "~/lib/pagebuilder/runs-edicion";

/**
 * Tests de la manipulación PURA de runs del editor (Tanda 3 F03/D6). Aplican/quitan marcas y links sobre
 * OFFSETS del texto plano (el mismo modelo que el contenteditable serializa), normalizan (merge de
 * adyacentes iguales, sin vacíos, sin markDefs huérfanos) y el resultado SIEMPRE parsea contra el MISMO
 * `RichTextoSchema` server-side (I3/I-U1). Testeable en node sin DOM.
 */

const rico = (children: RichTexto["children"], markDefs?: RichTexto["markDefs"]): RichTexto =>
  ({ children, ...(markDefs ? { markDefs } : {}) });

describe("runs-edicion — normalización", () => {
  // page.runs.edit.001 — merge de runs adyacentes con las MISMAS marcas; drop de vacíos
  it("normalizarRuns une adyacentes iguales y descarta texto vacío", () => {
    const out = normalizarRuns([
      { t: "Hola " },
      { t: "" },
      { t: "mundo", m: ["acento"] },
      { t: " feliz", m: ["acento"] },
      { t: "!" },
    ]);
    expect(out).toEqual([{ t: "Hola " }, { t: "mundo feliz", m: ["acento"] }, { t: "!" }]);
  });

  // page.runs.edit.002 — NO merge si difieren marcas o link
  it("no une runs con distinto conjunto de marcas o distinto link", () => {
    const out = normalizarRuns([
      { t: "a", m: ["fuerte"] },
      { t: "b", m: ["enfasis"] },
      { t: "c", link: "l1" },
      { t: "d", link: "l2" },
    ]);
    expect(out).toHaveLength(4);
  });

  // page.runs.edit.003 — limpiarRichTexto quita markDefs huérfanos y produce algo que parsea
  it("limpiarRichTexto descarta markDefs no referenciados y el resultado parsea", () => {
    const sucio = rico(
      [{ t: "sin links" }],
      [{ id: "l1", destino: { tipo: "ancla", ancla: "catalogo" } }],
    );
    const limpio = limpiarRichTexto(sucio);
    expect(limpio.markDefs).toBeUndefined(); // el huérfano se fue
    expect(RichTextoSchema.safeParse(limpio).success).toBe(true);
  });
});

describe("runs-edicion — partirEnOffsets + textoPlano", () => {
  // page.runs.edit.004 — partir en offsets no cambia el texto plano ni pierde marcas
  it("parte runs en los offsets conservando texto y marcas", () => {
    const original: Run[] = [{ t: "Hola mundo", m: ["acento"] }];
    const partido = partirEnOffsets([...original], [5]);
    expect(textoPlano(partido)).toBe("Hola mundo");
    expect(partido).toEqual([
      { t: "Hola ", m: ["acento"] },
      { t: "mundo", m: ["acento"] },
    ]);
  });
});

describe("runs-edicion — toggleMarca sobre una selección", () => {
  // page.runs.edit.005 — aplicar marca sobre parte de un run lo parte y marca el tramo
  it("aplica una marca sobre [inicio,fin) partiendo el run y marcando el tramo", () => {
    const out = toggleMarca(rico([{ t: "Compra el libro" }]), 10, 15, "acento"); // "libro"
    expect(out.children).toEqual([{ t: "Compra el " }, { t: "libro", m: ["acento"] }]);
    expect(RichTextoSchema.safeParse(out).success).toBe(true);
  });

  // page.runs.edit.006 — toggle OFF: si todo el rango ya tiene la marca, la quita (y re-mergea)
  it("quita la marca si toda la selección ya la tiene (toggle) y re-mergea", () => {
    const marcado = toggleMarca(rico([{ t: "Compra el libro" }]), 10, 15, "acento");
    const desmarcado = toggleMarca(marcado, 10, 15, "acento");
    expect(desmarcado.children).toEqual([{ t: "Compra el libro" }]); // vuelve a un solo run plano
  });

  // page.runs.edit.007 — combinar marcas: acento + fuerte sobre el mismo tramo
  it("acumula marcas distintas sobre el mismo tramo (máx 4)", () => {
    let out = toggleMarca(rico([{ t: "hola" }]), 0, 4, "acento");
    out = toggleMarca(out, 0, 4, "fuerte");
    const run = out.children[0]!;
    expect(new Set(run.m)).toEqual(new Set(["acento", "fuerte"]));
    expect(RichTextoSchema.safeParse(out).success).toBe(true);
  });

  // page.runs.edit.008 — selección vacía ⇒ no cambia
  it("una selección vacía (inicio>=fin) no altera el RichTexto", () => {
    const original = rico([{ t: "hola" }]);
    expect(toggleMarca(original, 2, 2, "acento")).toEqual(original);
  });
});

describe("runs-edicion — links", () => {
  // page.runs.edit.009 — aplicar un link agrega el markDef y marca los runs del rango
  it("aplica un link sobre la selección: setea run.link + agrega el markDef", () => {
    const out = aplicarLink(rico([{ t: "ver el catálogo" }]), 4, 15, "l1", {
      tipo: "ancla",
      ancla: "catalogo",
    }); // "el catálogo"
    expect(out.markDefs).toEqual([{ id: "l1", destino: { tipo: "ancla", ancla: "catalogo" } }]);
    const conLink = out.children.find((r) => r.link === "l1");
    expect(conLink?.t).toBe("el catálogo");
    expect(RichTextoSchema.safeParse(out).success).toBe(true);
  });

  // page.runs.edit.010 — quitar el link limpia el markDef huérfano
  it("quitar el link deja el texto sin link y sin markDef huérfano", () => {
    const conLink = aplicarLink(rico([{ t: "mi sitio" }]), 0, 8, "l1", {
      tipo: "url",
      url: "https://x.cl",
    });
    const sinLink = quitarLink(conLink, 0, 8);
    expect(sinLink.children).toEqual([{ t: "mi sitio" }]);
    expect(sinLink.markDefs).toBeUndefined();
    expect(RichTextoSchema.safeParse(sinLink).success).toBe(true);
  });
});

describe("runs-edicion — tramosARichTexto (serialización de tramos del DOM)", () => {
  // page.runs.edit.011 — tramos planos (lo que el contenteditable extrae) → RichTexto válido normalizado
  it("convierte tramos del DOM a un RichTexto válido (merge + parse); tramos vacíos ⇒ null", () => {
    const ok = tramosARichTexto(
      [
        { t: "Hola " },
        { t: "mundo", m: ["acento"] },
        { t: "", m: ["fuerte"] }, // vacío ⇒ se descarta
      ],
      undefined,
    );
    expect(ok).toEqual({ children: [{ t: "Hola " }, { t: "mundo", m: ["acento"] }] });
    // todo vacío ⇒ null (el editor no emite)
    expect(tramosARichTexto([{ t: "" }], undefined)).toBeNull();
  });

  // page.runs.edit.012 — un markDef referenciado por un tramo con link se conserva; el resto se limpia
  it("conserva el markDef referenciado y descarta el huérfano al serializar", () => {
    const out = tramosARichTexto([{ t: "click", link: "l1" }], [
      { id: "l1", destino: { tipo: "pagina", slug: "sobre-mi" } },
      { id: "l2", destino: { tipo: "ancla", ancla: "sorteo" } }, // huérfano
    ]);
    expect(out?.markDefs).toEqual([{ id: "l1", destino: { tipo: "pagina", slug: "sobre-mi" } }]);
  });
});
