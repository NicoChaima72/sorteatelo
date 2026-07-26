import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { crearTienda } from "~/server/domain/tenants/crearTienda";

/**
 * Tests del use case `crearTienda` (alta self-service, F08/F01) con `db` FAKE STATEFUL.
 * Claves: el Tenant nace en CONFIGURACION (D1) + su TenantMembership se crea en la MISMA
 * $transaction (sin membresía huérfana si algo falla); el `userId` sale del `acceso`
 * server-side, NUNCA del input (I1); slug validado con `esSlugValido` reusado + reservados
 * (D7); un usuario que ya tiene membresía no puede crear otra (D8, CONFLICT).
 */

const acceso = (
  tenantIds: string[],
  userId = "u1",
  email = "org@x.cl",
): AccesoPanel => ({
  userId,
  email,
  tenantIds,
  // `crearTienda` es el alta: corre en el APEX, donde todavía no hay subdominio de tienda.
  tenantIdDelHost: null,
});

interface CreadoTenant {
  data: Record<string, unknown>;
  id: string;
}

/**
 * Fake stateful: mantiene los slugs ya existentes y captura lo creado. Emula el
 * `$transaction(fn)` ejecutando el callback con el mismo objeto (como ejecutarSorteo.test).
 */
function fakeDb(slugsExistentes: string[] = [], membresiasExistentes = 0) {
  const slugs = new Set(slugsExistentes);
  let tenantCreado: CreadoTenant | null = null;
  let membershipCreada: { userId: string; tenantId: string } | null = null;
  let pageCreada: { data: Record<string, unknown> } | null = null;

  const tx = {
    tenant: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        slugs.has(where.slug) ? { id: `existente-${where.slug}` } : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = "tenant-nuevo";
        tenantCreado = { data, id };
        slugs.add(data.slug as string);
        return { id, slug: data.slug };
      },
    },
    tenantMembership: {
      // Guard autoritativo de D8 DENTRO de la tx (recuento server-side, no el snapshot pre-tx).
      count: async () => membresiasExistentes,
      create: async ({
        data,
      }: {
        data: { userId: string; tenantId: string };
      }) => {
        membershipCreada = data;
        return { id: "membership-nueva", ...data };
      },
    },
    // Page builder (R5): la Tienda nace con su StorefrontPage en la misma $transaction.
    storefrontPage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        pageCreada = { data };
        return { id: "page-nueva", ...data };
      },
    },
  };

  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;

  return {
    db,
    getTenantCreado: () => tenantCreado,
    getMembershipCreada: () => membershipCreada,
    getPageCreada: () => pageCreada,
  };
}

describe("domain/tenants/crearTienda (fake db stateful, alta self-service)", () => {
  // tenants.alta.001 — slug válido y libre: Tenant CONFIGURACION + membership en $transaction
  it("crea el Tenant en CONFIGURACION y su TenantMembership en una sola transacción", async () => {
    const { db, getTenantCreado, getMembershipCreada } = fakeDb();
    const res = await crearTienda({
      db,
      acceso: acceso([], "u1"),
      input: { slug: "mi-tienda", nombre: "Mi Tienda" },
    });

    expect(res.slug).toBe("mi-tienda");
    const tenant = getTenantCreado()!;
    expect(tenant.data.slug).toBe("mi-tienda");
    expect(tenant.data.nombre).toBe("Mi Tienda");
    expect(tenant.data.estado).toBe("CONFIGURACION"); // D1: NO ALTA
    const membership = getMembershipCreada()!;
    expect(membership.userId).toBe("u1"); // del acceso server-side (I1)
    expect(membership.tenantId).toBe(tenant.id); // liga a la Tienda recién creada
  });

  // tenants.alta.005 — R5: la Tienda nace con su StorefrontPage (draft=published=documentoInicial)
  it("crea la StorefrontPage inicial en la misma transacción (draft = published = documento inicial)", async () => {
    const { db, getPageCreada, getTenantCreado } = fakeDb();
    await crearTienda({
      db,
      acceso: acceso([], "u1"),
      input: { slug: "mi-tienda", nombre: "Mi Tienda" },
    });
    const page = getPageCreada()!;
    expect(page).not.toBeNull();
    expect(page.data.tenantId).toBe(getTenantCreado()!.id); // liga a la Tienda recién creada
    // draft y published son el MISMO documento inicial (se publica de una, F05/R5).
    expect(page.data.draftJson).toEqual(page.data.publishedJson);
    const doc = page.data.draftJson as { schemaVersion: number; secciones: { tipo: string }[] };
    expect(doc.schemaVersion).toBe(1);
    expect(doc.secciones.map((s) => s.tipo)).toEqual([
      "hero",
      "catalogo",
      "sorteo_vitrina",
      "como_funciona",
    ]);
    expect(page.data.publishedAt).toBeInstanceOf(Date);
  });

  // tenants.alta.002a — slug con formato inválido ⇒ INVALID (no toca la DB)
  it("un slug con formato inválido ⇒ INVALID sin crear nada", async () => {
    const { db, getTenantCreado } = fakeDb();
    await expect(
      crearTienda({
        db,
        acceso: acceso([]),
        input: { slug: "-malformado-", nombre: "X" },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getTenantCreado()).toBeNull();
  });

  // tenants.alta.002b — slug reservado (www/api/admin…) ⇒ rechazo (INVALID)
  it("un slug reservado de plataforma ⇒ INVALID sin crear nada", async () => {
    const { db, getTenantCreado } = fakeDb();
    await expect(
      crearTienda({
        db,
        acceso: acceso([]),
        input: { slug: "admin", nombre: "X" },
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
    expect(getTenantCreado()).toBeNull();
  });

  // tenants.alta.002c — slug ya existente ⇒ CONFLICT sin membresía huérfana
  it("un slug ya tomado ⇒ CONFLICT y NO crea una membresía huérfana", async () => {
    const { db, getTenantCreado, getMembershipCreada } = fakeDb(["tomado"]);
    await expect(
      crearTienda({
        db,
        acceso: acceso([]),
        input: { slug: "tomado", nombre: "X" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getTenantCreado()).toBeNull();
    expect(getMembershipCreada()).toBeNull();
  });

  // tenants.alta.003 — usuario que ya tiene una membresía ⇒ CONFLICT (D8, una tienda por dueño)
  it("un usuario que ya administra una Tienda no puede crear otra ⇒ CONFLICT", async () => {
    const { db, getTenantCreado } = fakeDb();
    await expect(
      crearTienda({
        db,
        acceso: acceso(["ya-tengo"]),
        input: { slug: "otra", nombre: "Otra" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getTenantCreado()).toBeNull();
  });

  // tenants.alta.003b — D8 autoritativo: aunque el snapshot acceso.tenantIds esté vacío (stale),
  // el recuento DENTRO de la tx detecta una membresía ya creada ⇒ CONFLICT (cierra la carrera)
  it("con snapshot vacío pero una membresía recién creada (carrera), el recuento en la tx rechaza ⇒ CONFLICT", async () => {
    const { db, getTenantCreado } = fakeDb([], 1); // acceso.tenantIds=[] pero count=1 en la tx
    await expect(
      crearTienda({
        db,
        acceso: acceso([]),
        input: { slug: "tienda", nombre: "Tienda" },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(getTenantCreado()).toBeNull();
  });

  // tenants.alta.004 — el userId de la membresía sale del acceso, jamás del input
  it("liga la membresía al userId del acceso (el input NO trae userId ni tenantId)", async () => {
    const { db, getMembershipCreada } = fakeDb();
    await crearTienda({
      db,
      acceso: acceso([], "usuario-real"),
      input: { slug: "tienda", nombre: "Tienda" },
    });
    expect(getMembershipCreada()!.userId).toBe("usuario-real");
  });
});
