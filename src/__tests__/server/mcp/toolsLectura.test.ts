import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { documentoInicial } from "~/lib/pagebuilder/factory";
import { type ContextoMcp } from "~/server/mcp/contextoMcp";
import { TOOLS } from "~/server/mcp/tools/registro";
import { db } from "~/server/db";

/**
 * Las tools de lectura ejercidas por su nombre desde el REGISTRO real (F04), contra DB real y con
 * dos organizadoras distintas. Que se invoquen por nombre importa: verifica de paso que están
 * registradas con el nombre que la description de las otras tools menciona.
 *
 * El caso que decide el archivo es `estado_flow`: ADR-0006 dice que la plataforma jamás expone
 * credenciales de Flow, y este es el borde donde un descuido las mandaría al contexto de un LLM
 * —un lugar del que la información no vuelve—. Así que no se testea "devuelve `configurada`":
 * se testea que en TODA la respuesta serializada no aparezca ni un byte del material cifrado.
 */

const PREFIJO = "test-mcp-lectura-";

/** Marcadores reconocibles en el lugar del ciphertext: si se filtran, el test los ve. */
const APIKEY_CIFRADA = `${PREFIJO}CIPHERTEXT-APIKEY-NO-DEBE-SALIR`;
const SECRET_CIFRADA = `${PREFIJO}CIPHERTEXT-SECRET-NO-DEBE-SALIR`;

async function limpiar() {
  await db.storefrontPage.deleteMany({
    where: { tenant: { slug: { startsWith: PREFIJO } } },
  });
  await db.flowCredential.deleteMany({
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

function toolPorNombre(nombre: string) {
  const tool = TOOLS.find((t) => t.nombre === nombre);
  if (!tool) throw new Error(`La tool "${nombre}" no está en el registro.`);
  return tool;
}

describe("mcp/tools de lectura (DB-backed)", () => {
  // mcp.tools.010 — aislamiento y silencio sobre los secretos, en el registro real
  it("lista solo las tiendas propias, bloquea la ajena y nunca revela la credencial de Flow", async () => {
    const [ana, bea] = await Promise.all([
      db.user.create({
        data: { email: `${PREFIJO}ana@example.cl`, name: "Ana" },
        select: { id: true, email: true },
      }),
      db.user.create({
        data: { email: `${PREFIJO}bea@example.cl`, name: "Bea" },
        select: { id: true },
      }),
    ]);

    const tiendaDeAna = await db.tenant.create({
      data: {
        slug: `${PREFIJO}ana`,
        nombre: "Tienda de Ana",
        memberships: { create: { userId: ana.id } },
        // Credencial "cifrada" con marcadores reconocibles (el cifrado real es AES-256-GCM;
        // acá lo que importa es que estos bytes NO salgan por ninguna tool).
        flowCredential: {
          create: {
            apiKeyCifrada: APIKEY_CIFRADA,
            secretKeyCifrada: SECRET_CIFRADA,
            sandbox: true,
          },
        },
      },
      select: { id: true, slug: true },
    });
    const tiendaDeBea = await db.tenant.create({
      data: {
        slug: `${PREFIJO}bea`,
        nombre: "Tienda de Bea",
        memberships: { create: { userId: bea.id } },
      },
      select: { slug: true },
    });

    const ctxDeAna: ContextoMcp = {
      db,
      userId: ana.id,
      email: ana.email,
      clientId: `${PREFIJO}cli`,
      scopes: ["mcp"],
      membresias: [{ tenantId: tiendaDeAna.id, slug: tiendaDeAna.slug }],
    };

    // `mis_tiendas`: solo las suyas, y por DIRECCIÓN (nunca el cuid interno).
    const tiendas = await toolPorNombre("mis_tiendas").manejar({}, ctxDeAna);
    expect(tiendas).toEqual({
      tiendas: [{ direccion: tiendaDeAna.slug, nombre: "Tienda de Ana" }],
    });
    expect(JSON.stringify(tiendas)).not.toContain(tiendaDeAna.id);

    // `estado_flow`: dice que está configurada, en qué ambiente y desde cuándo…
    const estadoFlow = await toolPorNombre("estado_flow").manejar(
      { tienda: tiendaDeAna.slug },
      ctxDeAna,
    );
    expect(estadoFlow).toMatchObject({ configurada: true, sandbox: true });

    // …y NADA más. Ni el ciphertext, ni los nombres de las columnas cifradas.
    const serializado = JSON.stringify(estadoFlow);
    expect(serializado).not.toContain(APIKEY_CIFRADA);
    expect(serializado).not.toContain(SECRET_CIFRADA);
    expect(serializado).not.toContain("apiKey");
    expect(serializado).not.toContain("secretKey");

    // `ver_pagina`: el reshape propio de esta tool (outline + version + páginas) no lo cubre
    // ningún use case, así que se ejerce acá con una página real sembrada.
    await db.storefrontPage.create({
      data: { tenantId: tiendaDeAna.id, draftJson: documentoInicial({}) },
    });
    const pagina = (await toolPorNombre("ver_pagina").manejar(
      { tienda: tiendaDeAna.slug },
      ctxDeAna,
    )) as {
      pagina: string;
      secciones: string;
      version: number;
      publicadaAlgunaVez: boolean;
      paginasDeLaTienda: Array<{ pagina: string; esInicio: boolean }>;
    };

    expect(pagina.pagina).toBe("home");
    expect(pagina.publicadaAlgunaVez).toBe(false); // borrador sin publicar
    expect(typeof pagina.version).toBe("number");
    // Outline numerado, no el JSON crudo del documento.
    expect(pagina.secciones).toMatch(/^0\. \w+ · id=/);
    expect(pagina.paginasDeLaTienda).toEqual([
      { pagina: "home", esInicio: true, enMenu: false, publicada: false },
    ]);

    // La tienda de Bea existe y sigue siendo inalcanzable con el contexto de Ana. Se prueban
    // TODAS las tools de tienda: alcanza con que una sola se olvide de autorizar.
    for (const tool of TOOLS.filter((t) => t.ambito === "tienda")) {
      await expect(
        tool.manejar({ tienda: tiendaDeBea.slug }, ctxDeAna),
        `la tool "${tool.nombre}" debería rechazar una tienda ajena`,
      ).rejects.toThrow(/FORBIDDEN|No tienes acceso/);
    }
  });
});
