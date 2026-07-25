import { describe, expect, it } from "vitest";

import {
  leerDocumentoParaRender,
  migrarDocumento,
  parsearDocumento,
} from "~/lib/pagebuilder/migrate";
import {
  MARCAS_RUN,
  RichTextoSchema,
  runsDeTexto,
  textoRicoProps,
} from "~/lib/pagebuilder/widgets";

/** Texto visible de un bloque de texto_rico v2 (concatena los `t` de los runs). */
function textoVisible(bloque: { rico?: { children: { t: string }[] } }): string {
  return (bloque.rico?.children ?? []).map((r) => r.t).join("");
}

/** Un Documento con UNA sección texto_rico v1 (bloques con `texto` string, pre-runs). */
function docTextoRicoV1(textoParrafo: string) {
  return {
    schemaVersion: 1,
    root: { props: {} },
    secciones: [
      {
        id: "sec-tr",
        tipo: "texto_rico",
        v: 1,
        props: {
          bloques: [
            { tipo: "subtitulo", texto: "Mi historia" },
            { tipo: "parrafo", texto: textoParrafo },
            { tipo: "cita", texto: "Una frase.", autor: "Yo" },
            { tipo: "lista", estilo: "vinetas", items: ["uno", "dos"] },
          ],
        },
      },
    ],
    overlays: [],
  };
}

/**
 * Tests del MOTOR DE RUNS (Tanda 3 F01/D1, evolución B). `RichTexto = { children: Run[], markDefs? }`
 * con marcas de un enum CERRADO + links tipados discriminados (ancla|pagina|url https). Es MÁS seguro
 * que HTML (I-U1): `t` es texto plano, las marcas/destinos son enums/uniones cerradas, `.strict()`
 * rechaza todo lo demás. Puro Zod, sin DB, sin render.
 */

/** Un RichTexto mínimo válido: dos runs, uno con marcas, uno con link a un markDef. */
const richValido = () => ({
  children: [
    { t: "Compra el " },
    { t: "libro", m: ["acento", "fuerte"] },
    { t: " y participa", link: "l1" },
  ],
  markDefs: [{ id: "l1", destino: { tipo: "ancla", ancla: "catalogo" } }],
});

describe("pagebuilder/runs — RichTextoSchema (F01/D1)", () => {
  // page.runs.001 — un RichTexto válido con marcas del enum + link por markDef parsea
  it("parsea runs con marcas del enum y un link resuelto por markDef", () => {
    expect(RichTextoSchema.safeParse(richValido()).success).toBe(true);
  });

  // page.runs.002 — marca fuera del enum ⇒ rechazo (enum cerrado, I-A)
  it("rechaza una marca fuera del enum cerrado", () => {
    const doc = richValido();
    doc.children[1]!.m = ["subrayado"]; // no está en MARCAS_RUN
    expect(RichTextoSchema.safeParse(doc).success).toBe(false);
  });

  // page.runs.003 — marcas duplicadas o más de 4 ⇒ rechazo
  it("rechaza marcas duplicadas y más de 4 marcas por run", () => {
    const dup = richValido();
    dup.children[1]!.m = ["acento", "acento"];
    expect(RichTextoSchema.safeParse(dup).success).toBe(false);
    const cinco = richValido();
    cinco.children[1]!.m = ["fuerte", "enfasis", "acento", "resaltado", "escala_lg"];
    expect(RichTextoSchema.safeParse(cinco).success).toBe(false);
  });

  // page.runs.004 — campo extra en un run o en el envelope ⇒ rechazo (.strict, ADR-0018)
  it("rechaza campos extra en el run y en el envelope (.strict)", () => {
    const runExtra = richValido();
    (runExtra.children[0] as Record<string, unknown>).html = "<b>x</b>";
    expect(RichTextoSchema.safeParse(runExtra).success).toBe(false);
    const envExtra = { ...richValido(), estilo: "libre" };
    expect(RichTextoSchema.safeParse(envExtra).success).toBe(false);
  });

  // page.runs.005 — un run.link que apunta a un markDef inexistente (dangling) ⇒ rechazo
  it("rechaza un link que referencia un markDef inexistente (huérfano/dangling)", () => {
    const doc = richValido();
    doc.children[2]!.link = "no-existe";
    expect(RichTextoSchema.safeParse(doc).success).toBe(false);
  });

  // page.runs.006 — markDefs con id duplicado ⇒ rechazo
  it("rechaza markDefs con id duplicado", () => {
    const doc = richValido();
    doc.markDefs = [
      { id: "l1", destino: { tipo: "ancla", ancla: "catalogo" } },
      { id: "l1", destino: { tipo: "ancla", ancla: "sorteo" } },
    ];
    expect(RichTextoSchema.safeParse(doc).success).toBe(false);
  });

  // page.runs.007 — un markDef que ningún run referencia (orphan) ⇒ rechazo (modelo limpio)
  it("rechaza un markDef que ningún run referencia (orphan)", () => {
    const doc = {
      children: [{ t: "Sin links aquí" }],
      markDefs: [{ id: "l1", destino: { tipo: "ancla", ancla: "catalogo" } }],
    };
    expect(RichTextoSchema.safeParse(doc).success).toBe(false);
  });

  // page.runs.008 — link url: solo https; javascript:/http/mailto ⇒ rechazo
  it("acepta un link url https y rechaza javascript:/http/mailto", () => {
    const https = {
      children: [{ t: "sitio", link: "l1" }],
      markDefs: [{ id: "l1", destino: { tipo: "url", url: "https://ejemplo.cl/x" } }],
    };
    expect(RichTextoSchema.safeParse(https).success).toBe(true);
    for (const url of ["javascript:alert(1)", "http://ejemplo.cl", "mailto:a@b.cl"]) {
      const doc = {
        children: [{ t: "x", link: "l1" }],
        markDefs: [{ id: "l1", destino: { tipo: "url", url } }],
      };
      expect(RichTextoSchema.safeParse(doc).success, url).toBe(false);
    }
  });

  // page.runs.009 — link pagina: slug kebab válido; slug con mayúscula/espacio ⇒ rechazo
  it("acepta un link a página con slug kebab y rechaza slug inválido", () => {
    const ok = {
      children: [{ t: "sobre mí", link: "l1" }],
      markDefs: [{ id: "l1", destino: { tipo: "pagina", slug: "sobre-mi" } }],
    };
    expect(RichTextoSchema.safeParse(ok).success).toBe(true);
    const malo = {
      children: [{ t: "x", link: "l1" }],
      markDefs: [{ id: "l1", destino: { tipo: "pagina", slug: "Sobre Mí" } }],
    };
    expect(RichTextoSchema.safeParse(malo).success).toBe(false);
  });

  // page.runs.010 — límites: children 1–50, t 1–1000, markDefs 0–10; vacío ⇒ rechazo
  it("respeta los límites de children/t/markDefs", () => {
    expect(RichTextoSchema.safeParse({ children: [] }).success).toBe(false);
    expect(
      RichTextoSchema.safeParse({ children: [{ t: "x".repeat(1001) }] }).success,
    ).toBe(false);
    // children solo (sin markDefs) es válido — texto plano enriquecido sin links
    expect(RichTextoSchema.safeParse({ children: [{ t: "hola" }] }).success).toBe(true);
  });

  // page.runs.011 — MARCAS_RUN es el enum cerrado esperado (incluye marca/gradiente aditivos F02/D4)
  it("MARCAS_RUN expone las marcas del sistema (incluye marca/gradiente para absorber tituloAcento)", () => {
    expect([...MARCAS_RUN]).toEqual([
      "fuerte",
      "enfasis",
      "acento",
      "resaltado",
      "marca",
      "gradiente",
      "escala_lg",
      "escala_xl",
    ]);
  });

  // page.runs.012 — texto_rico v2: un bloque parrafo/subtitulo/cita lleva `rico` (RichTexto)
  it("texto_rico v2 acepta bloques con `rico` (RichTexto) y rechaza el `texto` string viejo", () => {
    const v2 = {
      bloques: [
        { tipo: "parrafo", rico: { children: [{ t: "Un párrafo " }, { t: "enriquecido", m: ["acento"] }] } },
      ],
    };
    expect(textoRicoProps.safeParse(v2).success).toBe(true);
    // el shape v1 (`texto` string) ya NO parsea contra el schema v2 (se migra ANTES, on-read)
    const v1 = { bloques: [{ tipo: "parrafo", texto: "plano" }] };
    expect(textoRicoProps.safeParse(v1).success).toBe(false);
  });

  // page.runs.013 — runsDeTexto es lossless y trocea strings largos en runs de ≤1000
  it("runsDeTexto reproduce el texto exacto y trocea strings >1000 en varios runs", () => {
    const corto = runsDeTexto("hola mundo");
    expect(corto.children).toHaveLength(1);
    expect(corto.children[0]!.t).toBe("hola mundo");
    const largo = "x".repeat(2500);
    const rico = runsDeTexto(largo);
    expect(rico.children).toHaveLength(3); // 1000 + 1000 + 500
    expect(rico.children.map((r) => r.t).join("")).toBe(largo); // lossless
    expect(RichTextoSchema.safeParse(rico).success).toBe(true); // cada run ≤1000
  });
});

describe("pagebuilder/runs — migrate texto_rico v1→v2 LOSSLESS (F01/D3)", () => {
  // page.runs.migrate.001 — un texto_rico v1 migra on-read a v2: mismo texto visible, sin escribir a DB
  it("migra un texto_rico v1 (texto string) a v2 (runs) conservando el texto visible exacto", () => {
    const raw = docTextoRicoV1("Escribí esto hace tiempo. Sigue igual.");
    const copia = structuredClone(raw);
    const doc = parsearDocumento(raw);
    const seccion = doc.secciones[0]!;
    expect(seccion.v).toBe(2);
    expect(seccion.tipo).toBe("texto_rico");
    const bloques = (seccion.props as { bloques: { tipo: string }[] }).bloques as Array<{
      tipo: string;
      rico?: { children: { t: string }[] };
      autor?: string;
      items?: string[];
    }>;
    // subtitulo/parrafo/cita ⇒ runs con el mismo texto visible
    expect(textoVisible(bloques[0]!)).toBe("Mi historia");
    expect(textoVisible(bloques[1]!)).toBe("Escribí esto hace tiempo. Sigue igual.");
    expect(textoVisible(bloques[2]!)).toBe("Una frase.");
    expect(bloques[2]!.autor).toBe("Yo"); // autor string se conserva (D3)
    // lista: items string intactos (D3, sin runs)
    expect(bloques[3]!.items).toEqual(["uno", "dos"]);
    // PURO: la entrada no se mutó (migrate-on-read no escribe a DB)
    expect(raw).toEqual(copia);
  });

  // page.runs.migrate.002 — un parrafo v1 LARGO (>1000) migra lossless (troceado en runs)
  it("migra un parrafo v1 largo a runs troceados sin perder contenido", () => {
    const largo = "palabra ".repeat(200).trim(); // ~1400 chars
    const doc = parsearDocumento(docTextoRicoV1(largo));
    const bloques = (doc.secciones[0]!.props as { bloques: unknown[] }).bloques as Array<{
      rico?: { children: { t: string }[] };
    }>;
    expect(textoVisible(bloques[1]!)).toBe(largo); // lossless pese al troceo
  });

  // page.runs.migrate.003 — leerDocumentoParaRender migra un v1 y produce un doc renderizable
  it("la lectura tolerante migra el texto_rico v1 y lo deja renderizable", () => {
    const doc = leerDocumentoParaRender(docTextoRicoV1("Contenido viejo."));
    expect(doc.secciones.map((s) => s.tipo)).toEqual(["texto_rico"]);
    expect(doc.secciones[0]!.v).toBe(2);
  });

  // page.runs.migrate.004 — un texto_rico v2 con runs INVÁLIDOS (link dangling) se descarta tolerante
  it("descarta una sección texto_rico con runs inválidos y no tumba la página (I9/I-U8)", () => {
    const conRunMalo = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [
        {
          id: "sec-tr",
          tipo: "texto_rico",
          v: 2,
          props: {
            bloques: [
              // link a un markDef inexistente ⇒ RichTexto inválido ⇒ sección omitida
              { tipo: "parrafo", rico: { children: [{ t: "roto", link: "no-existe" }] } },
            ],
          },
        },
        { id: "sec-sep", tipo: "separador", v: 1, props: {} },
      ],
      overlays: [],
    };
    const doc = leerDocumentoParaRender(conRunMalo);
    expect(doc.secciones.map((s) => s.tipo)).toEqual(["separador"]); // el texto_rico podrido desapareció
  });

  // page.runs.migrate.005 — migrar es IDEMPOTENTE: un doc ya v2 pasa igual (no re-envuelve los runs)
  it("re-migrar un texto_rico ya v2 no lo cambia (idempotente)", () => {
    const v2 = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [
        {
          id: "sec-tr",
          tipo: "texto_rico",
          v: 2,
          props: { bloques: [{ tipo: "parrafo", rico: { children: [{ t: "ya v2" }] } }] },
        },
      ],
      overlays: [],
    };
    const migrado = migrarDocumento(v2) as typeof v2;
    expect(migrado.secciones[0]!.props.bloques[0]!.rico.children[0]!.t).toBe("ya v2");
    expect(() => parsearDocumento(v2)).not.toThrow();
  });
});

/** Un Documento con UN hero v2 (titulo string + tituloAcento opcional), pre-runs. */
function docHeroV2(titulo: string, tituloAcento?: { palabra: string; estilo: string }) {
  return {
    schemaVersion: 1,
    root: { props: {} },
    secciones: [
      {
        id: "sec-hero",
        tipo: "hero",
        v: 2,
        props: {
          variante: "split",
          titulo,
          subtitulo: "Un subtítulo cualquiera.",
          ...(tituloAcento ? { tituloAcento } : {}),
        },
      },
    ],
    overlays: [],
  };
}

describe("pagebuilder/runs — migrate hero v2→v3 absorbe tituloAcento (F02/D4)", () => {
  // page.runs.hero.001 — hero con tituloAcento acento: la palabra migra a un run con marca "acento"
  it("absorbe tituloAcento estilo acento en un run con la marca equivalente (lossless)", () => {
    const doc = parsearDocumento(docHeroV2("Cómo Enriquecer a tu Artista", { palabra: "Enriquecer", estilo: "acento" }));
    const hero = doc.secciones[0]!;
    expect(hero.v).toBe(3);
    if (hero.tipo !== "hero") throw new Error("no es hero");
    expect("tituloAcento" in hero.props).toBe(false); // el campo se fue
    const titulo = hero.props.titulo!;
    // texto visible EXACTO (lossless)
    expect(titulo.children.map((r) => r.t).join("")).toBe("Cómo Enriquecer a tu Artista");
    // la palabra queda en su propio run con la marca "acento"
    const runAcento = titulo.children.find((r) => r.m?.includes("acento"));
    expect(runAcento?.t).toBe("Enriquecer");
    // subtitulo string → RichTexto plano
    expect(hero.props.subtitulo?.children.map((r) => r.t).join("")).toBe("Un subtítulo cualquiera.");
  });

  // page.runs.hero.002 — estilos marca/gradiente mapean a sus marcas equivalentes (multi-palabra OK)
  it("mapea estilos marca y gradiente (palabra multi-word) a sus marcas de run", () => {
    const marca = parsearDocumento(docHeroV2("Anda a ver a BTS", { palabra: "BTS", estilo: "marca" }));
    const hMarca = marca.secciones[0]!;
    if (hMarca.tipo === "hero") {
      expect(hMarca.props.titulo?.children.find((r) => r.m?.includes("marca"))?.t).toBe("BTS");
    }
    const grad = parsearDocumento(docHeroV2("Compra el libro. Anda a ver a BTS", { palabra: "Anda a ver a BTS", estilo: "gradiente" }));
    const hGrad = grad.secciones[0]!;
    if (hGrad.tipo === "hero") {
      const run = hGrad.props.titulo?.children.find((r) => r.m?.includes("gradiente"));
      expect(run?.t).toBe("Anda a ver a BTS"); // la frase multi-palabra en un solo run
      expect(hGrad.props.titulo?.children.map((r) => r.t).join("")).toBe("Compra el libro. Anda a ver a BTS");
    }
  });

  // page.runs.hero.003 — hero sin tituloAcento migra a titulo runs PLANO (sin marcas)
  it("hero sin tituloAcento migra el titulo a runs plano (sin marcas)", () => {
    const doc = parsearDocumento(docHeroV2("Un título simple"));
    const hero = doc.secciones[0]!;
    if (hero.tipo === "hero") {
      expect(hero.props.titulo?.children).toEqual([{ t: "Un título simple" }]);
    }
  });

  // page.runs.hero.004 — lectura tolerante migra un hero v2 y lo deja renderizable
  it("leerDocumentoParaRender migra el hero v2 y lo mantiene en la página", () => {
    const doc = leerDocumentoParaRender(docHeroV2("Hola", { palabra: "Hola", estilo: "resaltado" }));
    expect(doc.secciones.map((s) => s.tipo)).toEqual(["hero"]);
    expect(doc.secciones[0]!.v).toBe(3);
  });
});

describe("pagebuilder/runs — migrate perfil_autora v1→v2 (bio string→runs, F02/D5)", () => {
  // page.runs.perfil.001 — bio string migra a RichTexto lossless; sin bio pasa igual
  it("migra bio string a RichTexto (lossless) y deja un perfil sin bio intacto", () => {
    const conBio = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [{ id: "p1", tipo: "perfil_autora", v: 1, props: { nombre: "Ana", bio: "Escribo desde 2020." } }],
      overlays: [],
    };
    const doc = parsearDocumento(conBio);
    const perfil = doc.secciones[0]!;
    expect(perfil.v).toBe(2);
    if (perfil.tipo === "perfil_autora") {
      expect(perfil.props.bio?.children.map((r) => r.t).join("")).toBe("Escribo desde 2020.");
    }
    const sinBio = {
      schemaVersion: 1,
      root: { props: {} },
      secciones: [{ id: "p2", tipo: "perfil_autora", v: 1, props: { nombre: "Sin bio" } }],
      overlays: [],
    };
    expect(() => parsearDocumento(sinBio)).not.toThrow();
  });
});
