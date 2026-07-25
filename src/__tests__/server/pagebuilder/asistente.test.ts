import { describe, expect, it } from "vitest";

import { PageDocumentSchema, type PageDocument } from "~/lib/pagebuilder/schema";
import {
  asistente,
  construirHerramientas,
  MAX_PASOS_ASISTENTE,
  NOMBRES_TOOLS_ASISTENTE,
} from "~/server/domain/pagebuilder/asistente";

/**
 * Tests del asistente de IA del editor (Tanda 3 F14/D21). Verifican los GUARDRAILS sin llamar al modelo:
 *  - el toolset NO contiene publicar ni efectos fuera del documento (chrome/páginas/colorAcento);
 *  - el loop corta en un máximo de pasos acotado;
 *  - sin modelo (sin API key) ⇒ error limpio sin volcar secretos;
 *  - cada tool-call de mutación pasa por el MISMO borde Zod/use case ⇒ props inválidas rechazan SIN escribir.
 */

/** Documento mínimo con un hero (para direccionar mutaciones en los tests). */
function docConHero(): PageDocument {
  return PageDocumentSchema.parse({
    schemaVersion: 1,
    root: { props: {} },
    secciones: [{ id: "sec-hero", tipo: "hero", v: 3, props: {} }],
    overlays: [],
  });
}

/** Mock in-memory del Prisma slice que usa `aplicarMutacionPagina` (findUnique/updateMany + product). */
function mockDb(draft: PageDocument) {
  let version = 1;
  let json: unknown = draft;
  return {
    getVersion: () => version,
    storefrontPage: {
      findUnique: () => Promise.resolve({ draftJson: json, version }),
      updateMany: ({ where, data }: { where: { version: number }; data: { draftJson: unknown } }) => {
        if (where.version !== version) return Promise.resolve({ count: 0 });
        version += 1;
        json = data.draftJson;
        return Promise.resolve({ count: 1 });
      },
    },
    product: { findMany: () => Promise.resolve([]) },
  };
}

describe("pagebuilder/asistente (F14) — guardrails del toolset", () => {
  // page.ai.001 — el toolset NO expone publicar ni efectos fuera del documento; loop acotado
  it("el toolset excluye publicar/chrome/páginas/colorAcento y el loop está acotado", () => {
    const prohibidos = [
      "publicar",
      "publish",
      "chrome",
      "set_chrome",
      "crear_pagina",
      "eliminar_pagina",
      "renombrar_pagina",
      "paginas",
      "color_acento",
      "set_color_acento",
    ];
    for (const nombre of NOMBRES_TOOLS_ASISTENTE) {
      expect(prohibidos).not.toContain(nombre);
    }
    // whitelist mínima presente
    expect(NOMBRES_TOOLS_ASISTENTE).toContain("agregar_seccion");
    expect(NOMBRES_TOOLS_ASISTENTE).toContain("actualizar_props");
    expect(NOMBRES_TOOLS_ASISTENTE).toContain("duplicar_seccion");
    // las tools construidas coinciden con la whitelist declarada (sin sorpresas)
    const db = mockDb(docConHero());
    const estado = { version: 1, documento: docConHero(), acciones: [] };
    const herramientas = construirHerramientas({ db: db as never, tenantId: "t1", slug: "home", estado });
    expect(Object.keys(herramientas).sort()).toEqual([...NOMBRES_TOOLS_ASISTENTE].sort());
    // loop cap razonable (no ilimitado)
    expect(MAX_PASOS_ASISTENTE).toBeGreaterThan(0);
    expect(MAX_PASOS_ASISTENTE).toBeLessThanOrEqual(20);
  });

  // page.ai.002 — sin modelo (sin API key) ⇒ error limpio sin secretos
  it("sin modelo configurado lanza un error limpio (sin volcar secretos)", async () => {
    await expect(
      asistente({
        db: mockDb(docConHero()) as never,
        tenantId: "t1",
        mensajes: [{ rol: "user", texto: "hola" }],
        modelo: null,
      }),
    ).rejects.toThrowError(/no está disponible/i);
  });
});

describe("pagebuilder/asistente (F14) — el mismo borde Zod que el editor", () => {
  // page.ai.003 — una tool-call de mutación con props inválidas RECHAZA sin escribir (version intacta)
  it("actualizar_props con props inválidas devuelve error al modelo y NO escribe", async () => {
    const db = mockDb(docConHero());
    const estado = { version: 1, documento: docConHero(), acciones: [] as string[] };
    const herramientas = construirHerramientas({ db: db as never, tenantId: "t1", slug: "home", estado });

    // `variante` fuera del enum del hero ⇒ el documento no revalida ⇒ INVALID, sin escribir.
    const malo = await herramientas.actualizar_props.execute!(
      { id: "sec-hero", props: { variante: "inventada" } },
      {} as never,
    );
    expect(malo).toMatchObject({ ok: false });
    expect((malo as { error?: string }).error).toBeTruthy();
    expect(estado.version).toBe(1); // no avanzó ⇒ no escribió
    expect(db.getVersion()).toBe(1);
    expect(estado.acciones).toHaveLength(0);

    // Una mutación VÁLIDA sí avanza el estado (control positivo).
    const bueno = await herramientas.actualizar_props.execute!(
      { id: "sec-hero", props: { variante: "centrado" } },
      {} as never,
    );
    expect(bueno).toMatchObject({ ok: true });
    expect(estado.version).toBe(2);
    expect(estado.acciones).toEqual(["Editó una sección"]);
  });
});
