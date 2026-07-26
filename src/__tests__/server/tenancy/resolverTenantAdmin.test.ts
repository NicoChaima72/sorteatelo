import { describe, expect, it } from "vitest";

import {
  resolverTenantAdminDesdeHost,
  type ResolucionAdmin,
} from "~/server/tenancy/resolverTenantAdmin";
import {
  resolverTenantDesdeHost,
  type RepoTenants,
  type TenantPersistido,
} from "~/server/tenancy/resolverTenant";

/**
 * Tests de la resolución host → Tienda del ADMIN (admin-multi-tienda F02/D2, ADR-0022).
 *
 * Es la GEMELA de `resolverTenantDesdeHost` con una diferencia deliberada: NO exige `PUBLICADA`. El
 * storefront solo existe si la tienda está publicada (ADR-0007), pero el PANEL tiene que existir
 * antes —una tienda en CONFIGURACION se administra justamente para poder publicarse— y después —una
 * SUSPENDIDA apaga la vitrina, no la administración—. Los mismos tests fijan la no-regresión del
 * storefront (I3): sobre los MISMOS datos, la resolución pública sigue siendo neutral.
 */

const PLATAFORMA = { dominioRaiz: "plataforma.test" };

function crearRepoFake(tenants: TenantPersistido[]) {
  const consultas: string[] = [];
  const repo: RepoTenants = {
    findTenantBySlug: (slug) => {
      consultas.push(slug);
      return Promise.resolve(tenants.find((t) => t.slug === slug) ?? null);
    },
  };
  return { repo, consultas };
}

const TODAS: TenantPersistido[] = [
  { id: "t_pub", slug: "autora", estado: "PUBLICADA" },
  { id: "t_config", slug: "en-configuracion", estado: "CONFIGURACION" },
  { id: "t_susp", slug: "suspendida", estado: "SUSPENDIDA" },
  { id: "t_alta", slug: "recien-creada", estado: "ALTA" },
];

const resolverAdmin = (host: string | undefined | null): Promise<ResolucionAdmin> =>
  resolverTenantAdminDesdeHost({
    host,
    config: PLATAFORMA,
    repo: crearRepoFake(TODAS).repo,
  });

const resolverStorefront = (host: string) =>
  resolverTenantDesdeHost({
    host,
    config: PLATAFORMA,
    repo: crearRepoFake(TODAS).repo,
  });

describe("resolverTenantAdminDesdeHost — el panel no exige tienda publicada", () => {
  // panel.resol.001 — CONFIGURACION: el panel existe ANTES de publicar
  it("resuelve una tienda en CONFIGURACION (y el storefront la sigue negando)", async () => {
    expect(await resolverAdmin("en-configuracion.plataforma.test")).toEqual({
      zona: "tienda",
      tenant: { id: "t_config", slug: "en-configuracion" },
    });
    // No-regresión del storefront (I3): sigue siendo la respuesta neutral.
    expect(
      await resolverStorefront("en-configuracion.plataforma.test"),
    ).toEqual({ zona: "sin-storefront" });
  });

  // panel.resol.002 — SUSPENDIDA: la suspensión apaga la vitrina, no la administración
  it("resuelve una tienda SUSPENDIDA (y el storefront la sigue negando)", async () => {
    expect(await resolverAdmin("suspendida.plataforma.test")).toEqual({
      zona: "tienda",
      tenant: { id: "t_susp", slug: "suspendida" },
    });
    expect(await resolverStorefront("suspendida.plataforma.test")).toEqual({
      zona: "sin-storefront",
    });
  });

  // panel.resol.003 — PUBLICADA resuelve igual en ambos mundos
  it("resuelve una tienda PUBLICADA igual que el storefront", async () => {
    expect(await resolverAdmin("autora.plataforma.test")).toEqual({
      zona: "tienda",
      tenant: { id: "t_pub", slug: "autora" },
    });
    expect(await resolverStorefront("autora.plataforma.test")).toEqual({
      zona: "storefront",
      tenant: { id: "t_pub", slug: "autora" },
    });
  });

  // panel.resol.004 — slug inexistente ⇒ sin tienda (el guard lo traduce a 404 neutral)
  it("un slug inexistente no resuelve tienda", async () => {
    expect(await resolverAdmin("fantasma.plataforma.test")).toEqual({
      zona: "sin-tienda",
    });
  });

  // panel.resol.005 — el apex es la PUERTA del panel, no una tienda
  it("el apex resuelve como plataforma (la puerta del panel), no como tienda", async () => {
    expect(await resolverAdmin("plataforma.test")).toEqual({
      zona: "plataforma",
    });
    expect(await resolverAdmin("www.plataforma.test")).toEqual({
      zona: "plataforma",
    });
  });

  // panel.resol.006 — host ajeno/ininteligible ⇒ fail-closed, sin tocar la DB
  it("un host ajeno o vacío es fail-closed y no consulta la DB", async () => {
    const { repo, consultas } = crearRepoFake(TODAS);
    expect(
      await resolverTenantAdminDesdeHost({
        host: "evil.example.com",
        config: PLATAFORMA,
        repo,
      }),
    ).toEqual({ zona: "sin-tienda" });
    expect(
      await resolverTenantAdminDesdeHost({
        host: undefined,
        config: PLATAFORMA,
        repo,
      }),
    ).toEqual({ zona: "sin-tienda" });
    expect(consultas).toEqual([]);
  });
});
