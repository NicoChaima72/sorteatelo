import { describe, expect, it } from "vitest";

import { leerDocumentoParaRender } from "~/lib/pagebuilder/migrate";
import { SCHEMA_VERSION, TemaSchema } from "~/lib/pagebuilder/schema";
import { capaDeLuces, fondoShellConAmbiente } from "~/styles/estiloSeccion";
import { AMBIENTE_FONDO, ESQUEMAS_FONDO, heroProps } from "~/lib/pagebuilder/widgets";

/**
 * **Motor de LUCES DE AMBIENTE ANIMADAS** (storefront-focos-ambiente-animados F01/F02, D2/D3).
 *
 * `capaDeLuces` es el único productor de la capa de focos que consumen las DOS superficies del plan: el
 * shell del storefront (`TemaPagina.ambienteAnimado`) y el hero `imagen_fondo` (`luces`/`lucesAnimadas`).
 * Comparten vocabulario (el mismo enum `AMBIENTE_FONDO`) y comparten keyframes, así que comparten helper.
 *
 * Lo que se vigila acá:
 *  - **D2**: el ESTILO de movimiento se DERIVA del tipo de ambiente (focos→drift, neon→pulso,
 *    aurora→drift). No hay knobs de velocidad/intensidad que el Organizador pueda romper.
 *  - **I1**: con los flags apagados no hay capa ⇒ el render es byte-idéntico al de hoy.
 *  - **I2**: cero hex — todo color sale de la escala del tenant por CSS vars/`color-mix`.
 */

describe("luces de ambiente — movimiento derivado del tipo (F01/D2)", () => {
  // luces.helper.001 — el movimiento NO es configurable: sale del tipo de ambiente. Los focos (marca,
  // acento) y la aurora hacen DRIFT (deriva lenta); el neon PULSA (es un glow de recital, no deriva).
  it("deriva drift para focos/aurora y pulso para neon", () => {
    expect(capaDeLuces("focos_marca", true)?.movimiento).toBe("drift");
    expect(capaDeLuces("focos_acento", true)?.movimiento).toBe("drift");
    expect(capaDeLuces("aurora", true)?.movimiento).toBe("drift");
    expect(capaDeLuces("neon", true)?.movimiento).toBe("pulso");
  });

  // luces.helper.002 — el hero pinta la capa TAMBIÉN sin animar (`lucesAnimadas:false`): ahí la capa ES
  // la luz (no hay ambiente estático debajo como en el shell). Sin animar ⇒ `movimiento: null`, capa igual.
  it("sin animar la capa existe igual, pero sin movimiento", () => {
    const capa = capaDeLuces("focos_marca", false);
    expect(capa).not.toBeNull();
    expect(capa?.movimiento).toBeNull();
  });
});

describe("luces de ambiente — colores de la escala del tenant (F01/I2)", () => {
  // luces.helper.003 — cero hex (I2): cada capa es un radial-gradient de CSS vars de la escala del
  // tenant. Recorre TODO el enum para que un ambiente nuevo no pueda colar un color literal.
  it("emite las custom properties --amb-* como radial-gradients de tokens, sin un solo hex", () => {
    for (const ambiente of AMBIENTE_FONDO) {
      const capa = capaDeLuces(ambiente, true);
      if (!capa) continue; // `ninguno` no tiene capa (ver luces.helper.004)

      const claves = Object.keys(capa.vars);
      expect(claves.length).toBe(capa.total);
      expect(capa.total).toBeGreaterThan(0);

      for (const [clave, valor] of Object.entries(capa.vars)) {
        expect(clave).toMatch(/^--amb-\d+$/);
        expect(valor).toContain("radial-gradient");
        expect(valor).toContain("var(--mantine-");
        expect(valor).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      }
    }
  });
});

describe("luces de ambiente — sin ambiente no hay capa (F01/I1)", () => {
  // luces.helper.004 — `ninguno` ⇒ null aunque el flag de animación esté PRENDIDO. Los dos flags son
  // ortogonales, así que la combinación "animado sobre nada" existe y tiene que resolver a nada: sin
  // esto el shell montaría un div vacío y dejaría de ser byte-idéntico (I1).
  it("ambiente 'ninguno' no produce capa, ni siquiera con el flag de animación prendido", () => {
    expect(capaDeLuces("ninguno", true)).toBeNull();
    expect(capaDeLuces("ninguno", false)).toBeNull();
  });
});

describe("luces de ambiente — flag del shell `ambienteAnimado` (F01/I1)", () => {
  // luces.schema.001 — el campo nace en `false` y ES el default: un documento publicado que no lo tiene
  // parsea igual, y `TemaSchema.parse({})` lo rellena apagado. Es la mitad "schema" del no-op.
  it("ambienteAnimado default false, acepta boolean y rechaza cualquier otra cosa", () => {
    expect(TemaSchema.parse({}).ambienteAnimado).toBe(false);
    expect(TemaSchema.safeParse({ ambienteAnimado: true }).success).toBe(true);
    expect(TemaSchema.safeParse({ ambienteAnimado: "si" }).success).toBe(false);
  });

  // luces.schema.002 — la mitad "render" del no-op (I1): con el flag APAGADO, `fondoShellConAmbiente`
  // devuelve exactamente lo que devolvía antes de esta feature, para TODO el producto cartesiano de
  // esquemas × ambientes. La firma ganó un parámetro con default, así que las 7 tiendas de hoy (que ni
  // saben del flag) no pueden cambiar ni un byte.
  it("con el flag apagado el fondo del shell es idéntico al de antes de la feature", () => {
    for (const esquema of ESQUEMAS_FONDO) {
      for (const ambiente of AMBIENTE_FONDO) {
        expect(fondoShellConAmbiente(esquema, ambiente, false)).toEqual(
          fondoShellConAmbiente(esquema, ambiente),
        );
      }
    }
  });

  // luces.schema.003 — el bug que este diseño evita: con el flag PRENDIDO los gradientes se MUDAN a la
  // capa animada, NO se suman a ella. Si el shell conservara su `background` de stage-lights, la luz se
  // pintaría dos veces (fondo + capa) y la tienda saldría al doble de intensidad. El shell queda con el
  // color sólido y la capa se lleva los radiales.
  it("con el flag prendido el shell suelta los gradientes (la capa se los lleva, sin duplicar la luz)", () => {
    const conFlag = fondoShellConAmbiente("tinta_profunda", "neon", true);
    expect(conFlag.background).not.toContain("radial-gradient");
    // Exactamente el mismo sólido que una tienda sin ambiente ⇒ la única luz visible es la de la capa.
    expect(conFlag).toEqual(fondoShellConAmbiente("tinta_profunda", "ninguno"));
  });
});

describe("luces de ambiente — focos del hero `imagen_fondo` (F02/I1)", () => {
  // luces.hero.001 — la otra mitad del no-op (schema no-op 2/2). Las props nacen apagadas y son
  // ADITIVAS: un `hero` v3 ya publicado (como el de iselk) que no las trae parsea igual y NO necesita
  // v-bump. Es lo que garantiza que deployar F02 no toque el hero de ninguna tienda viva.
  it("luces/lucesAnimadas nacen apagadas y un hero v3 sin ellas parsea sin v-bump", () => {
    const props = heroProps.parse({ variante: "imagen_fondo", overlayOscuridad: 50 });
    expect(props.luces).toBe("ninguno");
    expect(props.lucesAnimadas).toBe(false);

    // Apagadas ⇒ no hay capa que montar ⇒ el hero rinde exactamente como hoy.
    expect(capaDeLuces(props.luces, props.lucesAnimadas)).toBeNull();

    // El nodo publicado sigue siendo v3: nada que migrar. El precedente correcto es `visual` (Tanda 2),
    // que entró aditiva en la MISMA v2 sin bump — NO `variante`/`overlayOscuridad`, que sí bumpearon
    // v1→v2. La regla que separa los dos casos: se bumpea cuando `migrate.ts` tiene que TRANSFORMAR la
    // forma (el `string → RichTexto` de v3), no cuando alcanza con que Zod rellene un `.default()`.
    const doc = leerDocumentoParaRender({
      schemaVersion: SCHEMA_VERSION,
      root: { props: {} },
      secciones: [
        { id: "sec-hero", tipo: "hero", v: 3, props: { variante: "imagen_fondo", overlayOscuridad: 50 } },
      ],
      overlays: [],
    });
    const hero = doc.secciones[0];
    expect(hero?.v).toBe(3);
    expect(hero?.tipo === "hero" && hero.props.luces).toBe("ninguno");
  });

  // luces.hero.002 — el vocabulario NO se duplica (D2): `luces` acepta exactamente el mismo enum que el
  // `ambiente` del tema. Un valor inventado se rechaza en el borde, como cualquier otro enum del builder.
  it("luces usa el MISMO vocabulario que el ambiente del tema y rechaza lo que no esté en él", () => {
    for (const ambiente of AMBIENTE_FONDO) {
      expect(heroProps.safeParse({ luces: ambiente }).success).toBe(true);
    }
    expect(heroProps.safeParse({ luces: "disco" }).success).toBe(false);
    expect(heroProps.safeParse({ lucesAnimadas: "si" }).success).toBe(false);
  });
});

describe("luces de ambiente — migrate LOSSLESS de documentos publicados (F01)", () => {
  // luces.migrate.001 — los 7 documentos ya publicados no tienen el campo nuevo. Leerlos para el render
  // no puede alterarlos: mismo `schemaVersion` (sin bump), mismas secciones, y el campo nuevo aparece
  // APAGADO. Es la garantía de que deployar esta feature no mueve un píxel en ninguna tienda viva (I1).
  it("un documento publicado SIN el campo nuevo se lee intacto y con las luces apagadas", () => {
    const publicado = {
      schemaVersion: SCHEMA_VERSION,
      root: { props: { modo: "oscuro", fondoPagina: "tinta_profunda", ambiente: "neon" } },
      secciones: [
        {
          id: "sec-hero",
          tipo: "hero",
          v: 3,
          props: { variante: "imagen_fondo", overlayOscuridad: 50 },
        },
      ],
      overlays: [],
    };

    const doc = leerDocumentoParaRender(publicado);

    expect(doc.schemaVersion).toBe(SCHEMA_VERSION); // sin bump: el campo es aditivo con default
    expect(doc.root.props.ambiente).toBe("neon"); // lo que ya elegía la tienda, intacto
    expect(doc.root.props.ambienteAnimado).toBe(false); // el campo nuevo nace apagado
    expect(doc.secciones).toHaveLength(1); // la sección no se descarta por props nuevas ausentes
    // Y el shell que sale de ese documento es el `background` de siempre (la mitad que se ve).
    expect(fondoShellConAmbiente(doc.root.props.fondoPagina, doc.root.props.ambiente, doc.root.props.ambienteAnimado))
      .toEqual(fondoShellConAmbiente("tinta_profunda", "neon"));
  });
});
