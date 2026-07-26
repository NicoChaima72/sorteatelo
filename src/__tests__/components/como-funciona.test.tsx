import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ComoFunciona } from "~/components/storefront/como-funciona";
import { comoFuncionaProps } from "~/lib/pagebuilder/widgets";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * Render de `como_funciona` — foco en el estilo NUEVO `dreamy` (builder-dreamy-secciones F01/D4) y en el
 * GUARD NO-OP de los dos estilos previos (I2). `renderToStaticMarkup` como en `estadisticas.test.tsx`.
 * La receta dreamy sale del prototipo `dev-ref/variant-dreamy` L171-179: card translúcida con ring blanco,
 * CÍRCULO RELLENO en el primario con el NÚMERO del paso, texto a la izquierda y SIN el ícono Tabler.
 */

const PASOS = [
  { icono: "compra", titulo: "Compra tu libro", desc: "Elige y paga con tarjeta." },
  { icono: "descarga", titulo: "Recibe la descarga", desc: "Te llega al correo al instante." },
];

/** Renderiza la sección a partir de props CRUDAS (las parsea el schema, igual que el storefront). */
const render = (raw: unknown) => {
  const nodo = {
    id: "cf",
    tipo: "como_funciona",
    v: 1,
    props: comoFuncionaProps.parse(raw),
  } as Extract<SeccionNode, { tipo: "como_funciona" }>;
  return renderToStaticMarkup(
    createElement(MantineProvider, null, createElement(ComoFunciona, { nodo })),
  );
};

/** `true` sii el string contiene un hex de color — PROHIBIDO en el componente (I1). */
function tieneHex(s: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(s);
}

describe("como_funciona — estiloTarjeta dreamy (F01)", () => {
  const base = { titulo: "Comprar es participar", pasos: PASOS };

  // cf.dreamy.render.001 — card aireada (ring blanco, sin borde gris) + círculo RELLENO del primario con
  // el número del paso + texto a la IZQUIERDA (no centrado) + cero hex.
  it("dreamy pinta card translúcida con ring blanco y círculo primario numerado", () => {
    const html = render({ ...base, estiloTarjeta: "dreamy" });

    // círculo RELLENO en el color primario, uno por paso, con el número dentro
    const numeros = html.match(/st-paso-dreamy-num/g) ?? [];
    expect(numeros).toHaveLength(PASOS.length);
    expect(html).toContain("--mantine-primary-color-filled");
    const idxPrimerNum = html.indexOf("st-paso-dreamy-num");
    expect(html.slice(idxPrimerNum, idxPrimerNum + 400)).toContain(">1<");

    // card AIREADA: ring blanco (light-dark) y NADA del borde gris del default
    expect(html).toContain("st-paso-dreamy");
    expect(html).toContain("--mantine-color-white");
    expect(html).not.toContain("--mantine-color-default-border");

    // texto a la IZQUIERDA (D4: el prototipo NO centra) y cero hex (I1)
    expect(html).not.toContain("text-align:center");
    expect(tieneHex(html)).toBe(false);
  });

  // cf.dreamy.render.002 — el círculo numerado REEMPLAZA al ícono del paso (D4): en dreamy no se pinta
  // ningún svg de Tabler, aunque el schema siga exigiendo `icono` (sin cambio de shape, I5).
  it("dreamy NO pinta el ícono Tabler del paso (el círculo numerado lo reemplaza)", () => {
    const html = render({ ...base, estiloTarjeta: "dreamy" });
    expect(html).not.toContain("tabler-icon");
    // el contenido del paso sí está completo
    expect(html).toContain("Compra tu libro");
    expect(html).toContain("Te llega al correo al instante.");
  });

  // cf.dreamy.noop.001 — GUARD I2: un documento PREVIO (sin la prop) renderea EXACTAMENTE igual que el
  // `solida` explícito; ni `solida` ni `contorno` adoptan nada de la rama nueva.
  it("guard no-op: doc sin la prop == solida, y solida/contorno conservan su render", () => {
    expect(render(base)).toBe(render({ ...base, estiloTarjeta: "solida" }));

    const solida = render({ ...base, estiloTarjeta: "solida" });
    const contorno = render({ ...base, estiloTarjeta: "contorno" });
    for (const html of [solida, contorno]) {
      expect(html).not.toContain("st-paso-dreamy");
      expect(html).toContain("tabler-icon"); // siguen con el ícono en caja
    }
    // `contorno` conserva su card transparente con borde sutil (el diff que dreamy NO tocó)
    expect(contorno).toContain("background:transparent");
    expect(contorno).toContain("currentColor 18%");
  });

  // cf.dreamy.noop.002 — dreamy aplica SOLO al layout `tarjetas` (out of scope: el layout `lista`)
  it("con layout lista, dreamy no cambia nada (byte-idéntico a la lista de siempre)", () => {
    const lista = render({ ...base, layout: "lista" });
    const listaDreamy = render({ ...base, layout: "lista", estiloTarjeta: "dreamy" });
    expect(listaDreamy).toBe(lista);
  });
});
