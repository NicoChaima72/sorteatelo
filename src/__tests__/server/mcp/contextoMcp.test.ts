import { describe, expect, it } from "vitest";

import { resolverTenantDelPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import {
  accesoParaTienda,
  accesoSinTienda,
  desafioWwwAuthenticate,
  type ContextoMcp,
} from "~/server/mcp/contextoMcp";

/**
 * El corazón de D4/I1 — **selecciona-jamás-autoriza** — en el borde MCP.
 *
 * El MCP vive en el apex y sus tools reciben el slug de la Tienda como ARGUMENTO (el token es
 * per-usuario y cruza tiendas). Eso lo vuelve el caso peligroso: un argumento del cliente
 * eligiendo tenant es exactamente el bug H1 de datawalt-app. La defensa es que el slug solo
 * SELECCIONA dentro de las membresías ya cargadas server-side desde la identidad del token, y
 * el `AccesoPanel` resultante vuelve a pasar por `resolverTenantDelPanel` dentro de cada use
 * case (defensa en profundidad).
 *
 * Por eso el test ejerce las DOS puertas juntas: no alcanza con que `accesoParaTienda` devuelva
 * algo, tiene que devolver un acceso que la política del dominio también acepte.
 */

const CTX: ContextoMcp = {
  db: {} as ContextoMcp["db"],
  userId: "user-1",
  email: "organizadora@example.cl",
  clientId: "cliente-1",
  scopes: ["mcp"],
  membresias: [
    { tenantId: "tenant-a", slug: "mi-tienda" },
    { tenantId: "tenant-b", slug: "la-otra" },
  ],
};

describe("mcp/contextoMcp — selecciona-jamás-autoriza", () => {
  // mcp.transporte.001 — el slug SELECCIONA entre lo que la membresía ya autorizó
  it("resuelve el acceso de una tienda propia y la política del dominio lo confirma", () => {
    const acceso = accesoParaTienda(CTX, "la-otra");

    expect(acceso).toEqual({
      userId: "user-1",
      email: "organizadora@example.cl",
      // Las DOS membresías viajan en el acceso: son la autorización, no la selección.
      tenantIds: ["tenant-a", "tenant-b"],
      tenantIdDelHost: "tenant-b",
    });

    // Segunda puerta: el use case volverá a preguntar, y tiene que dar el mismo tenant.
    expect(resolverTenantDelPanel(acceso)).toBe("tenant-b");
  });

  // mcp.transporte.002 — un slug ajeno NO abre nada, aunque la tienda exista
  it("rechaza con FORBIDDEN un slug fuera de la membresía del dueño del token", () => {
    expect(() => accesoParaTienda(CTX, "tienda-ajena")).toThrow(DomainError);

    try {
      accesoParaTienda(CTX, "tienda-ajena");
      throw new Error("debería haber lanzado");
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).code).toBe("FORBIDDEN");
      // El mensaje no confirma si la tienda existe: para el dueño del token es lo mismo
      // "no existe" que "no es tuya".
      expect((e as DomainError).message).not.toContain("tenant-");
    }
  });

  // mcp.transporte.003 — usuario SIN ninguna membresía: el toolset de cuenta funciona,
  // toda tool de tienda muere fail-closed
  it("un usuario sin tiendas puede operar a nivel cuenta pero ninguna tienda", () => {
    const sinTiendas: ContextoMcp = { ...CTX, membresias: [] };

    // Tools de cuenta (crear tienda): acceso válido con tenant nulo, igual que en el apex.
    const acceso = accesoSinTienda(sinTiendas);
    expect(acceso).toEqual({
      userId: "user-1",
      email: "organizadora@example.cl",
      tenantIds: [],
      tenantIdDelHost: null,
    });

    // Y cualquier use case que exija tienda falla fail-closed (misma regla que el apex).
    expect(() => resolverTenantDelPanel(acceso)).toThrow(DomainError);

    // Pedir cualquier tienda por slug también muere.
    expect(() => accesoParaTienda(sinTiendas, "mi-tienda")).toThrow(DomainError);
  });

  // mcp.transporte.004 — `accesoSinTienda` no puede convertirse en un bypass
  it("el acceso de cuenta nunca trae tienda seleccionada, aunque el usuario tenga varias", () => {
    const acceso = accesoSinTienda(CTX);
    expect(acceso.tenantIdDelHost).toBeNull();
    expect(() => resolverTenantDelPanel(acceso)).toThrow(DomainError);
  });

  // mcp.transporte.005 — el desafío 401 le dice al cliente CÓMO autenticarse (RFC 6750 + 9728)
  it("el desafío WWW-Authenticate apunta al discovery del recurso protegido", () => {
    const desafio = desafioWwwAuthenticate(
      "https://sorteatelo.cl",
      "invalid_token",
      "token vencido",
    );

    expect(desafio).toContain('Bearer realm="mcp"');
    expect(desafio).toContain('error="invalid_token"');
    expect(desafio).toContain(
      'resource_metadata="https://sorteatelo.cl/.well-known/oauth-protected-resource"',
    );
  });
});
