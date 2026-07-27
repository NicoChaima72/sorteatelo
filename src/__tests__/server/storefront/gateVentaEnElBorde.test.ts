import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards ESTRUCTURALES del gate de venta en los bordes (F05, D4/I5).
 *
 * El gate por facturación tiene dos maneras de salir mal, y las dos son invisibles a un test de
 * comportamiento del núcleo:
 *
 * 1. **Que llegue donde NO debe** (I5): si `evaluarGateVenta` se cuela en el borde de descargas, un
 *    Comprador que ya pagó pierde su PDF porque el Organizador no pagó su mensualidad. Es el peor
 *    resultado posible de esta feature y el nit que el `backend-reviewer` dejó abierto en F01.
 * 2. **Que falte donde SÍ debe**: si una página de venta del storefront se apoya en el helper de
 *    ENTREGA (el que no gatea), la tienda en pausa sigue vendiendo sin que nada se ponga rojo.
 *
 * Los dos se vigilan a nivel de IMPORTS, no de texto libre: qué módulo entra a qué archivo es estable
 * ante refactors y es exactamente el invariante que importa. Lo que estos tests NO cubren es que el
 * cuerpo de un helper gateado conserve su llamada al gate — eso lo cubre el E2E de F05 (visitar el
 * subdominio de una tienda en pausa), no un parseo frágil de cuerpos de función.
 */

const SRC = fileURLToPath(new URL("../../../", import.meta.url)); // src/

const leer = (rel: string) => readFileSync(SRC + rel, "utf8");

/** Los módulos que importa un archivo (no su texto suelto: los docstrings nombran lo prohibido). */
function modulosImportados(rel: string): string[] {
  return [...leer(rel).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
}

/** Nombres importados desde un módulo puntual (`import { a, b } from "…"`). */
function nombresImportadosDe(rel: string, modulo: string): string[] {
  const fuente = leer(rel);
  const re = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*"${modulo}"`, "g");
  return [...fuente.matchAll(re)].flatMap((m) =>
    m[1]!
      .split(",")
      .map((n) => n.replace(/\btype\b/, "").trim())
      .filter(Boolean),
  );
}

/** Todos los `.ts`/`.tsx` bajo un directorio de `src/`, en rutas con `/`. */
function archivosBajo(dir: string): string[] {
  return readdirSync(SRC + dir, { recursive: true, encoding: "utf8" })
    .map((f) => `${dir}/${f.split("\\").join("/")}`)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
}

const MODULO_GATE = "~/server/domain/facturacion/_gateVenta";
const MODULO_LECTOR = "~/server/domain/facturacion/cargarGateVenta";
const MODULO_PROPS = "~/server/storefront/getStorefrontProps";

describe("gate de venta en los bordes (F05)", () => {
  // facturacion.gate.borde.001 — I5: la entrega al Comprador JAMÁS pasa por el gate de facturación
  it("ni las descargas por Entitlement ni su borde HTTP conocen el gate de facturación", () => {
    const bordesDeEntrega = [
      ...archivosBajo("server/descargas"),
      ...archivosBajo("pages/api/descargas"),
      // El resolutor de archivos entregables del producto, que es lo que la descarga presigna.
      "server/productos/archivosDeProducto.ts",
    ];

    for (const archivo of bordesDeEntrega) {
      const modulos = modulosImportados(archivo);
      // El Comprador ya compró: su descarga no depende de que el Organizador esté al día (I5).
      expect(modulos, `${archivo} no debe conocer el gate de facturación`).not.toContain(
        MODULO_GATE,
      );
      expect(modulos, `${archivo} no debe conocer el gate de facturación`).not.toContain(
        MODULO_LECTOR,
      );
    }
  });

  // facturacion.gate.borde.002 — el helper SIN gate tiene un solo cliente, y es post-compra
  it("el helper de ENTREGA lo usa únicamente la página de retorno del checkout", () => {
    const usuarios = archivosBajo("pages").filter((f) =>
      nombresImportadosDe(f, MODULO_PROPS).includes("getPropsPaginaEntrega"),
    );

    // `/checkout/retorno` es donde el Comprador ve su compra y su enlace de descarga: es superficie de
    // ENTREGA, no de venta. Gatearla sería dejar sin comprobante a alguien que acaba de pagar (I5).
    // Cualquier página NUEVA que se cuelgue de este helper aparece acá y hay que justificarla.
    expect(usuarios).toEqual(["pages/checkout/retorno.tsx"]);
  });

  // facturacion.gate.borde.005 — la página de entrega NO entra por NINGÚN helper de branding por
  // host, y eso es un requisito de funcionamiento, no una preferencia (productos-tipos-digitales F09)
  it("la página de entrega es host-agnóstica: no resuelve branding por host", () => {
    const importados = nombresImportadosDe(
      "pages/entrega/[token].tsx",
      MODULO_PROPS,
    );

    // El enlace que el Comprador recibe por correo apunta al APEX de la plataforma (el correo no
    // conoce subdominios). Los helpers que resuelven por HOST exigen `zona === "storefront"` vía
    // `resolverBrandingSSR`, así que usar cualquiera de ellos acá haría que esa página diera 404 en
    // la ÚNICA puerta que el Comprador tiene para llegar a lo que compró. La marca sale del tenant
    // del GRANT (server-authored desde el token), no del host — por eso los ÚNICOS imports
    // permitidos de este módulo son los parametrizados por `tenantSlug` (el follow-up del navbar
    // le dio a la entrega el chrome/nav de la Tienda alimentados por el slug del grant, 2026-07-27).
    // Cualquier import nuevo aparece acá y hay que justificar que NO lee el host.
    expect(importados.sort()).toEqual(["resolverChrome", "resolverNavPaginas"]);
  });

  // facturacion.gate.borde.003 — las superficies de VENTA entran por un helper gateado
  it("las páginas de venta del storefront entran por un helper que gatea la facturación", () => {
    const GATEADOS = [
      "getPropsHome", // `/`
      "getPropsPaginaTienda", // `/[slug]`
      "getPropsCheckout", // `/checkout`
    ];

    // `/producto/[id]` salió de esta lista al RETIRARSE (productos-tipos-digitales v2, E2/F13): hoy es
    // un redirect incondicional a `/` que no lee dato alguno ⇒ no necesita gate ni branding.
    const esperado: Record<string, string> = {
      "pages/index.tsx": "getPropsHome",
      "pages/[slug].tsx": "getPropsPaginaTienda",
      "pages/checkout/index.tsx": "getPropsCheckout",
    };

    for (const [pagina, helper] of Object.entries(esperado)) {
      const nombres = nombresImportadosDe(pagina, MODULO_PROPS);
      expect(nombres, `${pagina} debe entrar por ${helper}`).toContain(helper);
      // Y no puede además tomar el atajo sin gate.
      expect(nombres).not.toContain("getPropsPaginaEntrega");
    }

    expect(GATEADOS).not.toContain("getPropsPaginaEntrega"); // el enum de arriba, explícito
  });
});
