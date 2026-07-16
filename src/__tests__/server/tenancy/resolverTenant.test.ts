import { describe, expect, it } from "vitest";

import {
  resolverTenantDesdeHost,
  type RepoTenants,
  type TenantPersistido,
} from "~/server/tenancy/resolverTenant";

const PLATAFORMA = { dominioRaiz: "plataforma.test" };

/**
 * Repo fake en memoria (el schema real es del carril A). Cuenta las consultas
 * para poder afirmar que las zonas sin tenant NO tocan la DB.
 */
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

const PUBLICADA: TenantPersistido = {
  id: "t_publicada",
  slug: "autora",
  estado: "PUBLICADA",
};

const EN_CONFIGURACION: TenantPersistido = {
  id: "t_config",
  slug: "en-configuracion",
  estado: "CONFIGURACION",
};

const SUSPENDIDA: TenantPersistido = {
  id: "t_susp",
  slug: "suspendida",
  estado: "SUSPENDIDA",
};

const EN_ALTA: TenantPersistido = {
  id: "t_alta",
  slug: "recien-creada",
  estado: "ALTA",
};

const TODAS = [PUBLICADA, EN_CONFIGURACION, SUSPENDIDA, EN_ALTA];

const resolverHost = (host: string | undefined | null) =>
  resolverTenantDesdeHost({
    host,
    config: PLATAFORMA,
    repo: crearRepoFake(TODAS).repo,
  });

describe("resolverTenantDesdeHost — storefront de una Tienda publicada", () => {
  it("resuelve el subdominio de una Tienda publicada a su tenant", async () => {
    const { repo } = crearRepoFake([PUBLICADA]);

    const resolucion = await resolverTenantDesdeHost({
      host: "autora.plataforma.test",
      config: PLATAFORMA,
      repo,
    });

    expect(resolucion).toEqual({
      zona: "storefront",
      tenant: { id: "t_publicada", slug: "autora" },
    });
  });

  it("consulta la DB por el slug del subdominio, nunca por otra cosa", async () => {
    const { repo, consultas } = crearRepoFake(TODAS);

    await resolverTenantDesdeHost({
      host: "autora.plataforma.test",
      config: PLATAFORMA,
      repo,
    });

    expect(consultas).toEqual(["autora"]);
  });
});

describe("resolverTenantDesdeHost — respuesta neutral (ADR-0007)", () => {
  const NEUTRAL = { zona: "sin-storefront" };

  it("una Tienda en configuración no sirve storefront", async () => {
    expect(await resolverHost("en-configuracion.plataforma.test")).toEqual(NEUTRAL);
  });

  it("una Tienda suspendida no sirve storefront", async () => {
    expect(await resolverHost("suspendida.plataforma.test")).toEqual(NEUTRAL);
  });

  it("una Tienda recién dada de alta no sirve storefront", async () => {
    expect(await resolverHost("recien-creada.plataforma.test")).toEqual(NEUTRAL);
  });

  it("un slug inexistente no sirve storefront", async () => {
    expect(await resolverHost("no-existe.plataforma.test")).toEqual(NEUTRAL);
  });

  it("un host inválido o anidado no sirve storefront", async () => {
    expect(await resolverHost("x.y.plataforma.test")).toEqual(NEUTRAL);
    expect(await resolverHost("otra-cosa.cl")).toEqual(NEUTRAL);
    expect(await resolverHost(undefined)).toEqual(NEUTRAL);
  });

  it("inexistente, en configuración y suspendida son INDISTINGUIBLES entre sí", async () => {
    // El corazón de ADR-0007: la respuesta no puede delatar que la tienda existe
    // pero está suspendida. Comparación estricta y cruzada de los tres resultados.
    const inexistente = await resolverHost("no-existe.plataforma.test");
    const enConfiguracion = await resolverHost("en-configuracion.plataforma.test");
    const suspendida = await resolverHost("suspendida.plataforma.test");

    expect(enConfiguracion).toStrictEqual(inexistente);
    expect(suspendida).toStrictEqual(inexistente);
    expect(Object.keys(suspendida)).toEqual(["zona"]);
  });

  it("no filtra el id ni el estado de una tienda que no publica", async () => {
    const serializado = JSON.stringify(
      await resolverHost("suspendida.plataforma.test"),
    );

    expect(serializado).not.toContain("t_susp");
    expect(serializado).not.toContain("SUSPENDIDA");
  });
});

describe("resolverTenantDesdeHost — zona plataforma (S4/D6)", () => {
  it("el apex es zona plataforma y NO consulta la DB", async () => {
    const { repo, consultas } = crearRepoFake(TODAS);

    const resolucion = await resolverTenantDesdeHost({
      host: "plataforma.test",
      config: PLATAFORMA,
      repo,
    });

    expect(resolucion).toEqual({ zona: "plataforma" });
    expect(consultas).toEqual([]);
  });

  it("`www` es zona plataforma y NO consulta la DB por un tenant `www`", async () => {
    const { repo, consultas } = crearRepoFake(TODAS);

    const resolucion = await resolverTenantDesdeHost({
      host: "www.plataforma.test",
      config: PLATAFORMA,
      repo,
    });

    expect(resolucion).toEqual({ zona: "plataforma" });
    expect(consultas).toEqual([]);
  });

  it("un host inválido NO es la plataforma y NO consulta la DB (fail-closed)", async () => {
    const { repo, consultas } = crearRepoFake(TODAS);

    const resolucion = await resolverTenantDesdeHost({
      host: "x.y.plataforma.test",
      config: PLATAFORMA,
      repo,
    });

    expect(resolucion).toEqual({ zona: "sin-storefront" });
    expect(consultas).toEqual([]);
  });
});
