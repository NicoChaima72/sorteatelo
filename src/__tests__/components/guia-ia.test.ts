import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  APPS_IA,
  APP_DE_LA_CAPSULA,
  CAPTURAS_PENDIENTES,
  LIMITES,
  PROMPTS_EJEMPLO,
  comandoClaudeCode,
  guionDe,
} from "~/components/admin/guia-ia/guion";
import { APP_CONFIG } from "~/config/app";
import { RUTA_MCP, urlMcpPublica } from "~/lib/urlMcp";
import { PATH_MCP_PUBLICO } from "~/server/mcp/discovery";
import { TOOLS } from "~/server/mcp/tools/registro";

/**
 * Guía «Conecta tu IA» (tasks/26-07-26-onboarding-guia-conecta-tu-ia.md).
 *
 * Lo que se testea es lo que un test PUEDE sostener de una guía: que la dirección que le pedimos
 * copiar al Organizador sale de la config y no de un string tipeado a mano, y que el guion tiene la
 * forma que la cápsula de video va a consumir.
 */
describe("guia-ia · dirección de conexión", () => {
  it("deriva la URL del MCP de la config de la plataforma [guia.ia.url.001]", () => {
    expect(urlMcpPublica()).toBe(`https://${APP_CONFIG.dominio}${RUTA_MCP}`);
  });

  it("en producción resuelve a la dirección real del MCP [guia.ia.url.002]", () => {
    expect(urlMcpPublica()).toBe("https://sorteatelo.cl/api/mcp");
  });

  it("la ruta client-safe es el espejo declarado de la del server [guia.ia.url.003]", () => {
    expect(RUTA_MCP).toBe(PATH_MCP_PUBLICO);
  });
});

describe("guia-ia · guion del carril Claude", () => {
  it("son 6 beats numerados 1..6, todos con título y cuerpo [guia.ia.guion.001]", () => {
    const beats = guionDe("claude");

    expect(beats.map((b) => b.n)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const beat of beats) {
      expect(beat.titulo.trim()).not.toBe("");
      expect(beat.cuerpo.trim()).not.toBe("");
    }
  });

  it("el carril de la cápsula de video es uno de los carriles vivos [guia.ia.guion.002]", () => {
    expect(APPS_IA.map((a) => a.id)).toContain(APP_DE_LA_CAPSULA);
  });
});

describe("guia-ia · los dos carriles (D9)", () => {
  it("ChatGPT tiene guion propio de 6 beats, no un stub [guia.ia.carriles.001]", () => {
    const beats = guionDe("chatgpt");

    expect(beats.map((b) => b.n)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const beat of beats) {
      expect(beat.titulo.trim()).not.toBe("");
      expect(beat.cuerpo.trim()).not.toBe("");
    }
  });

  it("cada app declara sus requisitos de plan o modo [guia.ia.carriles.002]", () => {
    expect(APPS_IA.length).toBeGreaterThanOrEqual(2);
    for (const app of APPS_IA) {
      expect(app.requisitos.length).toBeGreaterThan(0);
      expect(app.fuente.trim()).not.toBe("");
    }
  });

  it("difieren exactamente en los beats marcados como propios del carril [guia.ia.carriles.003]", () => {
    const claude = guionDe("claude");
    const chatgpt = guionDe("chatgpt");

    for (let i = 0; i < claude.length; i++) {
      const unLado = claude[i]!;
      const otroLado = chatgpt[i]!;

      if (unLado.variaPorApp ?? otroLado.variaPorApp) {
        // Marcado como propio del carril ⇒ tiene que decir algo distinto de verdad.
        expect(unLado).not.toEqual(otroLado);
      } else {
        // Sin marcar ⇒ es copy COMÚN: una edición en un carril no puede quedarse a medias.
        expect(unLado).toEqual(otroLado);
      }
    }
  });

  it("los pasos de una UI ajena no van sueltos: el beat que varía trae pasos literales [guia.ia.carriles.004]", () => {
    for (const app of APPS_IA) {
      const beatAgregar = guionDe(app.id).find((b) => b.n === 3)!;
      expect(beatAgregar.pasos?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("guia-ia · lo que la guía promete", () => {
  it("cada prompt de ejemplo llama a una tool que EXISTE en la whitelist [guia.ia.prompts.001]", () => {
    const disponibles = new Set(TOOLS.map((t) => t.nombre));

    for (const prompt of PROMPTS_EJEMPLO) {
      expect(
        disponibles.has(prompt.tool),
        `«${prompt.texto}» promete la tool "${prompt.tool}", que no está en el registro del MCP`,
      ).toBe(true);
    }
  });

  it("son 5 ejemplos y ninguno promete algo que el MCP tenga prohibido [guia.ia.prompts.002]", () => {
    expect(PROMPTS_EJEMPLO).toHaveLength(5);

    const prohibido = /publica|sortea|borra|elimina|credencial/i;
    for (const prompt of PROMPTS_EJEMPLO) {
      expect(prohibido.test(prompt.texto)).toBe(false);
    }
  });

  it("los límites que cuenta la guía son los que el MCP no tiene tool para hacer [guia.ia.prompts.003]", () => {
    const nombres = TOOLS.map((t) => t.nombre).join(" ");

    expect(LIMITES.length).toBeGreaterThanOrEqual(4);
    // Si algún día aparece una tool para publicar, sortear o borrar, este bloque de la guía pasa a
    // ser mentira: mejor que se caiga acá y no en la cara de un Organizador.
    expect(nombres).not.toMatch(/publicar|ejecutar_sorteo|borrar|eliminar/);
  });

  it("el comando de Claude Code lleva la dirección derivada, no una tipeada [guia.ia.prompts.004]", () => {
    expect(comandoClaudeCode()).toContain(urlMcpPublica());
  });

  it("los límites dicen EXACTAMENTE lo mismo que la pantalla de consentimiento [guia.ia.prompts.005]", () => {
    // Los dos textos son copias manuales (I5 del plan prohíbe tocar el consent, así que no se
    // extrajeron a un módulo común). Lo que impide que se desincronicen es este test: si alguien
    // edita una lista y no la otra, la guía y el consent le prometerían cosas distintas a la misma
    // persona sobre el mismo permiso — y el consent es una pantalla de decisión de seguridad.
    const fuente = fs.readFileSync(
      path.resolve(process.cwd(), "src/pages/mcp-consent.tsx"),
      "utf8",
    );
    const bloque = /const NO_PUEDE = \[([\s\S]*?)\];/.exec(fuente)?.[1];
    expect(bloque, "no encontré el array NO_PUEDE en mcp-consent.tsx").toBeDefined();

    const noPuede = [...bloque!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(noPuede).toEqual([...LIMITES]);
  });
});

describe("guia-ia · capturas", () => {
  const dirCapturas = path.resolve(process.cwd(), "public/guia-ia");

  const declaradas = APPS_IA.flatMap((app) =>
    guionDe(app.id).flatMap((beat) => beat.capturas),
  );

  it("toda captura declarada existe en /public/guia-ia [guia.ia.capturas.001]", () => {
    for (const captura of declaradas) {
      expect(
        fs.existsSync(path.join(dirCapturas, captura.archivo)),
        `el guion declara ${captura.archivo} y el archivo no está en public/guia-ia`,
      ).toBe(true);
    }
  });

  it("toda captura declarada es WebP y describe lo que se ve [guia.ia.capturas.002]", () => {
    for (const captura of declaradas) {
      expect(captura.archivo.endsWith(".webp")).toBe(true);
      expect(captura.alt.trim()).not.toBe("");
      expect(captura.ancho).toBeGreaterThan(0);
      expect(captura.alto).toBeGreaterThan(0);
    }
  });

  it("una captura pendiente NO se declara en un beat [guia.ia.capturas.003]", () => {
    const archivosDeclarados = new Set(declaradas.map((c) => c.archivo));

    for (const pendiente of CAPTURAS_PENDIENTES) {
      expect(
        archivosDeclarados.has(pendiente.archivo),
        `${pendiente.archivo} figura como pendiente y a la vez declarada: o existe o está pendiente`,
      ).toBe(false);
      expect(pendiente.queCapturar.trim()).not.toBe("");
    }
  });
});

describe("guia-ia · la dirección no se tipea a mano", () => {
  it("ni el guion ni el modal llevan el dominio literal [guia.ia.url.004]", () => {
    const archivos = [
      "src/components/admin/guia-ia/guion.ts",
      "src/components/admin/guia-ia/guia-conecta-ia.tsx",
    ];

    for (const archivo of archivos) {
      const fuente = fs.readFileSync(path.resolve(process.cwd(), archivo), "utf8");
      expect(
        fuente.includes(APP_CONFIG.dominio),
        `${archivo} escribe el dominio a mano en vez de derivarlo de la config (I2)`,
      ).toBe(false);
    }
  });
});
