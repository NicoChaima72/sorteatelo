import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PageDocumentSchema } from "~/lib/pagebuilder/schema";
import { DomainError } from "~/server/domain/errors";
import {
  crearPagina,
  eliminarPagina,
  listarPaginas,
  renombrarPagina,
  setEnNav,
} from "~/server/domain/pagebuilder/paginas";
import { esSlugPaginaReservado } from "~/server/tenancy/slugTienda";

/**
 * Tests de los use cases de MULTI-PÁGINA (Tanda 3 F04/D8). Slug validado (kebab + reservados), unicidad
 * por `@@unique` (colisión ⇒ CONFLICT), `home` protegido (no crea/renombra/elimina), y el historial que
 * SIGUE a la página al renombrar (D8). Mock in-memory de Prisma (misma técnica que versionado.test.ts).
 */

interface Fila {
  tenantId: string;
  slug: string;
  draftJson: unknown;
  publishedAt: Date | null;
  enNav: boolean;
  createdAt: Date;
}
interface Version {
  tenantId: string;
  slug: string;
  revision: number;
}

/** Mock de Prisma para las páginas: store in-memory + `$transaction` que reusa el mismo store. */
function mockDb(pages: Fila[], versions: Version[] = []) {
  const store = {
    storefrontPage: {
      findMany: async ({ where }: { where: { tenantId: string } }) =>
        pages.filter((p) => p.tenantId === where.tenantId).map((p) => ({ ...p })),
      findUnique: async ({ where }: { where: { tenantId_slug: { tenantId: string; slug: string } } }) => {
        const { tenantId, slug } = where.tenantId_slug;
        const p = pages.find((x) => x.tenantId === tenantId && x.slug === slug);
        return p ? { id: `id-${p.slug}` } : null;
      },
      create: async ({ data }: { data: Fila }) => {
        if (pages.some((p) => p.tenantId === data.tenantId && p.slug === data.slug)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "5" });
        }
        pages.push({ ...data, publishedAt: null, createdAt: new Date() });
        return { id: `id-${data.slug}` };
      },
      update: async ({ where, data }: { where: { tenantId_slug: { tenantId: string; slug: string } }; data: { slug?: string } }) => {
        const p = pages.find((x) => x.tenantId === where.tenantId_slug.tenantId && x.slug === where.tenantId_slug.slug);
        if (p && data.slug !== undefined) {
          if (pages.some((x) => x !== p && x.tenantId === p.tenantId && x.slug === data.slug)) {
            throw new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "5" });
          }
          p.slug = data.slug;
        }
        return { id: "x" };
      },
      updateMany: async ({ where, data }: { where: { tenantId: string; slug: string }; data: { enNav?: boolean } }) => {
        const afectadas = pages.filter((p) => p.tenantId === where.tenantId && p.slug === where.slug);
        for (const p of afectadas) if (data.enNav !== undefined) p.enNav = data.enNav;
        return { count: afectadas.length };
      },
      delete: async ({ where }: { where: { tenantId_slug: { tenantId: string; slug: string } } }) => {
        const i = pages.findIndex((p) => p.tenantId === where.tenantId_slug.tenantId && p.slug === where.tenantId_slug.slug);
        if (i >= 0) pages.splice(i, 1);
        return { id: "x" };
      },
    },
    storefrontPageVersion: {
      updateMany: async ({ where, data }: { where: { tenantId: string; slug: string }; data: { slug: string } }) => {
        const afectadas = versions.filter((v) => v.tenantId === where.tenantId && v.slug === where.slug);
        for (const v of afectadas) v.slug = data.slug;
        return { count: afectadas.length };
      },
      deleteMany: async ({ where }: { where: { tenantId: string; slug: string } }) => {
        const antes = versions.length;
        for (let i = versions.length - 1; i >= 0; i--) {
          if (versions[i]!.tenantId === where.tenantId && versions[i]!.slug === where.slug) versions.splice(i, 1);
        }
        return { count: antes - versions.length };
      },
    },
  };
  return {
    ...store,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(store),
  } as never;
}

const fila = (slug: string, over: Partial<Fila> = {}): Fila => ({
  tenantId: "t1",
  slug,
  draftJson: {},
  publishedAt: null,
  enNav: false,
  createdAt: new Date(),
  ...over,
});

async function codigo(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
  throw new Error("se esperaba un DomainError");
}

describe("pagebuilder/paginas — reservados (F04/D7)", () => {
  // page.pag.001 — las rutas estáticas son slugs de página reservados
  it("marca las rutas estáticas + home como reservadas", () => {
    for (const s of ["home", "api", "admin", "editor", "login", "checkout", "producto", "dev-ref"]) {
      expect(esSlugPaginaReservado(s), s).toBe(true);
    }
    expect(esSlugPaginaReservado("sobre-mi")).toBe(false);
    expect(esSlugPaginaReservado("ADMIN")).toBe(true); // normaliza
  });

  // page.pag.001b — `bases` es RESERVADO (admin-bases-pdf F04/D6, ADR-0008)
  // `/bases` es la página de PLATAFORMA que muestra el PDF de bases del sorteo activo. Si un
  // Organizador pudiera crear una página con ese slug, la ruta estática la taparía (nunca se
  // serviría) y —peor— el enlace legal del footer/vitrina apuntaría a algo que él controla.
  it("marca `bases` como reservado (la página del PDF de bases es de plataforma)", () => {
    expect(esSlugPaginaReservado("bases")).toBe(true);
    expect(esSlugPaginaReservado("BASES")).toBe(true); // normaliza
    expect(esSlugPaginaReservado(" bases ")).toBe(true); // normaliza
  });
});

describe("pagebuilder/paginas — crearPagina (F04)", () => {
  // page.pag.002 — slug inválido (mayúsculas/espacios) o reservado ⇒ INVALID sin tocar la DB
  it("rechaza slug con forma inválida o reservado (INVALID, no crea)", async () => {
    const pages: Fila[] = [fila("home")];
    const db = mockDb(pages);
    expect(await codigo(() => crearPagina({ db, tenantId: "t1", slug: "Sobre Mí" }))).toBe("INVALID");
    expect(await codigo(() => crearPagina({ db, tenantId: "t1", slug: "checkout" }))).toBe("INVALID");
    expect(await codigo(() => crearPagina({ db, tenantId: "t1", slug: "home" }))).toBe("INVALID");
    expect(pages).toHaveLength(1); // nada creado
  });

  // page.pag.003 — slug válido ⇒ crea la fila con un draft que PARSEA
  it("crea una página con slug válido y un borrador válido", async () => {
    const pages: Fila[] = [fila("home")];
    const db = mockDb(pages);
    const res = await crearPagina({ db, tenantId: "t1", slug: "Sobre-Mi", nombre: "Sobre mí" });
    expect(res.slug).toBe("sobre-mi"); // normalizado
    const nueva = pages.find((p) => p.slug === "sobre-mi")!;
    expect(nueva.enNav).toBe(false);
    expect(PageDocumentSchema.safeParse(nueva.draftJson).success).toBe(true);
  });

  // page.pag.004 — colisión de slug ⇒ CONFLICT (el @@unique)
  it("una segunda página con el mismo slug ⇒ CONFLICT", async () => {
    const pages: Fila[] = [fila("home"), fila("sobre-mi")];
    const db = mockDb(pages);
    expect(await codigo(() => crearPagina({ db, tenantId: "t1", slug: "sobre-mi" }))).toBe("CONFLICT");
  });
});

describe("pagebuilder/paginas — renombrar/eliminar protegen home + historial (F04/D8)", () => {
  // page.pag.005 — home no se renombra ni elimina
  it("prohíbe renombrar o eliminar la página home (INVALID)", async () => {
    const db = mockDb([fila("home")]);
    expect(await codigo(() => renombrarPagina({ db, tenantId: "t1", slug: "home", slugNuevo: "inicio" }))).toBe("INVALID");
    expect(await codigo(() => eliminarPagina({ db, tenantId: "t1", slug: "home" }))).toBe("INVALID");
  });

  // page.pag.006 — renombrar mueve la fila Y su historial al slug nuevo (D8)
  it("renombrar mueve la página y su historial de versiones al slug nuevo", async () => {
    const pages = [fila("home"), fila("vieja")];
    const versions: Version[] = [
      { tenantId: "t1", slug: "vieja", revision: 1 },
      { tenantId: "t1", slug: "vieja", revision: 2 },
    ];
    const db = mockDb(pages, versions);
    await renombrarPagina({ db, tenantId: "t1", slug: "vieja", slugNuevo: "nueva" });
    expect(pages.find((p) => p.slug === "nueva")).toBeDefined();
    expect(pages.find((p) => p.slug === "vieja")).toBeUndefined();
    expect(versions.every((v) => v.slug === "nueva")).toBe(true); // el historial siguió a la página
  });

  // page.pag.007 — renombrar a un slug existente ⇒ CONFLICT
  it("renombrar a un slug ya tomado ⇒ CONFLICT", async () => {
    const db = mockDb([fila("home"), fila("a"), fila("b")]);
    expect(await codigo(() => renombrarPagina({ db, tenantId: "t1", slug: "a", slugNuevo: "b" }))).toBe("CONFLICT");
  });

  // page.pag.008 — eliminar borra la fila y su historial
  it("eliminar borra la página y su historial", async () => {
    const pages = [fila("home"), fila("borrar")];
    const versions: Version[] = [{ tenantId: "t1", slug: "borrar", revision: 1 }];
    const db = mockDb(pages, versions);
    await eliminarPagina({ db, tenantId: "t1", slug: "borrar" });
    expect(pages.find((p) => p.slug === "borrar")).toBeUndefined();
    expect(versions).toHaveLength(0);
  });
});

describe("pagebuilder/paginas — listar + enNav (F04/F05)", () => {
  // page.pag.009 — listar pone home primero y deriva `publicado` de publishedAt
  it("listarPaginas: home primero, publicado desde publishedAt", async () => {
    const db = mockDb([
      fila("sobre-mi", { publishedAt: new Date(), enNav: true }),
      fila("home"),
    ]);
    const lista = await listarPaginas({ db, tenantId: "t1" });
    expect(lista[0]!.slug).toBe("home"); // home primero
    expect(lista[0]!.esHome).toBe(true);
    const sobre = lista.find((p) => p.slug === "sobre-mi")!;
    expect(sobre.publicado).toBe(true);
    expect(sobre.enNav).toBe(true);
  });

  // page.pag.010 — setEnNav sobre una página inexistente ⇒ NOT_FOUND
  it("setEnNav actualiza enNav; página inexistente ⇒ NOT_FOUND", async () => {
    const pages = [fila("home"), fila("sobre-mi")];
    const db = mockDb(pages);
    await setEnNav({ db, tenantId: "t1", slug: "sobre-mi", enNav: true });
    expect(pages.find((p) => p.slug === "sobre-mi")!.enNav).toBe(true);
    expect(await codigo(() => setEnNav({ db, tenantId: "t1", slug: "no-existe", enNav: true }))).toBe("NOT_FOUND");
  });
});
