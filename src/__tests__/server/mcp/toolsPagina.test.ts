import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import { TOOLS } from "~/server/mcp/tools/registro";
import { db } from "~/server/db";

/**
 * Tools de PÁGINA (F07) contra DB real. Lo que se prueba acá es la propiedad que justifica que el
 * MCP pueda tocar la página a pesar de ADR-0018: **el agente edita el Borrador y nada más**.
 *
 * El storefront público lee `publishedJson`. Mientras esa columna no se mueva, ninguna cantidad de
 * mutaciones por chat puede cambiar lo que ve un comprador — publicar sigue siendo un acto humano
 * en el panel (y no hay tool que lo haga, verificado en `inventarioTools.test.ts`).
 *
 * La segunda propiedad es que el **Registro de widgets es el gate**: un tipo inventado o una prop
 * que no existe no llegan a la DB. Un LLM inventa nombres de campos; el documento entero se
 * revalida contra el registro en cada mutación, así que inventar cuesta un INVALID, no un
 * documento corrupto.
 */

const PREFIJO = "test-mcp-pagina-";

async function limpiar() {
  await db.storefrontPage.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.tenantMembership.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.tenant.deleteMany({ where: { slug: { startsWith: PREFIJO } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFIJO } } });
}

beforeEach(limpiar);
afterEach(limpiar);

function tool(nombre: string) {
  const t = TOOLS.find((x) => x.nombre === nombre);
  if (!t) throw new Error(`La tool "${nombre}" no está en el registro.`);
  return t;
}

async function montarEscenario() {
  const user = await db.user.create({
    data: { email: `${PREFIJO}org@example.cl`, name: "Org" },
    select: { id: true, email: true },
  });
  const doc = documentoInicial({});
  const tenant = await db.tenant.create({
    data: {
      slug: `${PREFIJO}tienda`,
      nombre: "Tienda de prueba",
      memberships: { create: { userId: user.id } },
      // La Tienda nace con su página publicada (igual que `crearTienda`): así el test puede
      // comprobar que el publicado NO se mueve, que es el punto de la feature.
      storefrontPages: {
        create: { draftJson: doc, publishedJson: doc, publishedAt: new Date() },
      },
    },
    select: { id: true, slug: true },
  });

  const ctx: ContextoMcp = {
    db,
    userId: user.id,
    email: user.email,
    clientId: `${PREFIJO}cli`,
    scopes: ["mcp"],
    membresias: [{ tenantId: tenant.id, slug: tenant.slug }],
  };
  return { ctx, tenant, doc };
}

/** El borrador y el publicado tal como están en la DB (sin pasar por ningún use case). */
async function columnas(tenantId: string) {
  const page = await db.storefrontPage.findUniqueOrThrow({
    where: { tenantId_slug: { tenantId, slug: "home" } },
    select: { draftJson: true, publishedJson: true, version: true },
  });
  return page;
}

interface RespuestaPagina {
  version: number;
  secciones: string;
}

describe("mcp/tools de página (DB-backed)", () => {
  // mcp.tools.050 — el ciclo completo de edición toca SOLO el borrador, y el lock optimista
  // impide pisar un cambio hecho en paralelo desde el panel
  it("agrega, edita, mueve y quita secciones del borrador sin tocar el publicado", async () => {
    const { ctx, tenant } = await montarEscenario();
    const publicadoInicial = JSON.stringify((await columnas(tenant.id)).publishedJson);

    const leida = (await tool("ver_pagina").manejar(
      { tienda: tenant.slug },
      ctx,
    )) as RespuestaPagina;
    expect(leida.version).toBe(1);

    // 1) Agregar. El esquema devuelto trae los ids: de ahí sale el de la sección nueva.
    const agregada = (await tool("agregar_seccion").manejar(
      { tienda: tenant.slug, tipo: "faq", version: leida.version },
      ctx,
    )) as RespuestaPagina;
    expect(agregada.version).toBe(2);
    expect(agregada.secciones).toContain("faq");

    const idFaq = /^\d+\. faq · id=(.+)$/m.exec(agregada.secciones)?.[1];
    expect(idFaq).toBeTruthy();

    // 2) Editar props (merge shallow: lo que no se manda no se pierde).
    const editada = (await tool("editar_seccion").manejar(
      {
        tienda: tenant.slug,
        id: idFaq,
        props: { titulo: "Dudas frecuentes" },
        version: agregada.version,
      },
      ctx,
    )) as RespuestaPagina;
    expect(editada.version).toBe(3);

    // 3) Mover al principio.
    const movida = (await tool("mover_seccion").manejar(
      { tienda: tenant.slug, id: idFaq, aPosicion: 0, version: editada.version },
      ctx,
    )) as RespuestaPagina;
    expect(movida.version).toBe(4);
    expect(movida.secciones.startsWith("0. faq")).toBe(true);

    // El borrador tiene los cambios…
    const trasEditar = await columnas(tenant.id);
    expect(JSON.stringify(trasEditar.draftJson)).toContain("Dudas frecuentes");
    // …y el publicado sigue byte a byte como estaba. Esto es ADR-0018 en un assert.
    expect(JSON.stringify(trasEditar.publishedJson)).toBe(publicadoInicial);

    // 4) El lock optimista: reintentar con una versión vieja NO escribe.
    await expect(
      tool("quitar_seccion").manejar(
        { tienda: tenant.slug, id: idFaq, version: leida.version },
        ctx,
      ),
    ).rejects.toThrow();
    expect((await columnas(tenant.id)).version).toBe(4);

    // 5) Quitar con la versión correcta sí.
    const quitada = (await tool("quitar_seccion").manejar(
      { tienda: tenant.slug, id: idFaq, version: movida.version },
      ctx,
    )) as RespuestaPagina;
    expect(quitada.version).toBe(5);
    expect(quitada.secciones).not.toContain("faq");
    expect(JSON.stringify((await columnas(tenant.id)).publishedJson)).toBe(
      publicadoInicial,
    );
  });

  // mcp.tools.051 — el Registro de widgets es el gate: lo que no reconoce, no se guarda
  it("rechaza tipos y props que el registro no reconoce, sin escribir nada", async () => {
    const { ctx, tenant } = await montarEscenario();

    // Un tipo inventado por el modelo.
    await expect(
      tool("agregar_seccion").manejar(
        { tienda: tenant.slug, tipo: "seccion_alucinada", version: 1 },
        ctx,
      ),
    ).rejects.toThrow();

    // Una prop que no existe en el widget: `.strict()` la rechaza. Es el borde que impide inyectar
    // HTML/JS por una prop libre (ADR-0018).
    await expect(
      tool("agregar_seccion").manejar(
        {
          tienda: tenant.slug,
          tipo: "faq",
          props: { htmlLibre: "<script>alert(1)</script>" },
          version: 1,
        },
        ctx,
      ),
    ).rejects.toThrow();

    // Ninguna de las dos escribió: el documento sigue en la versión 1.
    expect((await columnas(tenant.id)).version).toBe(1);

    // Un valor de tema fuera del enum tampoco pasa…
    await expect(
      tool("cambiar_tema_pagina").manejar(
        { tienda: tenant.slug, tema: { vibe: "psicodelico" }, version: 1 },
        ctx,
      ),
    ).rejects.toThrow();

    // …y uno válido sí, MERGEADO sobre el tema actual (cambiar el vibe no resetea lo demás).
    await tool("cambiar_tema_pagina").manejar(
      { tienda: tenant.slug, tema: { modo: "oscuro" }, version: 1 },
      ctx,
    );
    await tool("cambiar_tema_pagina").manejar(
      { tienda: tenant.slug, tema: { vibe: "editorial" }, version: 2 },
      ctx,
    );
    const tema = (
      (await columnas(tenant.id)).draftJson as {
        root: { props: { modo: string; vibe: string } };
      }
    ).root.props;
    expect(tema.vibe).toBe("editorial");
    expect(tema.modo).toBe("oscuro"); // no se perdió con el segundo cambio

    // El catálogo que el agente lee para no inventar: sale del registro, no de una lista a mano.
    const catalogo = (await tool("ver_catalogo_de_secciones").manejar(
      {},
      ctx,
    )) as { secciones: { tipo: string }[]; estiloDeSeccion: unknown };
    const tipos = catalogo.secciones.map((s) => s.tipo);
    expect(tipos).toContain("faq");
    expect(tipos).not.toContain("seccion_alucinada");
    expect(catalogo.estiloDeSeccion).toBeTruthy();
  });
});
