import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { otorgarMembresia } from "../../../scripts/otorgar-membresia";

/**
 * Test del núcleo del CLI `otorgar-membresia` con un `db` FAKE (sin DB). El bootstrap de
 * membresías (D11): recibe email + slug de Tienda, busca el `User` (debe haber hecho login
 * al menos una vez — NO lo inventa) y el `Tenant`, y crea la membresía de forma idempotente.
 */

interface EstadoFake {
  users: Array<{ id: string; email: string }>;
  tenants: Array<{ id: string; slug: string }>;
  memberships: Array<{ id: string; userId: string; tenantId: string }>;
}

function fakeDb(estado: EstadoFake) {
  let seq = 0;
  return {
    db: {
      user: {
        findUnique: async ({ where }: { where: { email: string } }) =>
          estado.users.find((u) => u.email === where.email) ?? null,
      },
      tenant: {
        findUnique: async ({ where }: { where: { slug: string } }) =>
          estado.tenants.find((t) => t.slug === where.slug) ?? null,
      },
      tenantMembership: {
        findUnique: async ({
          where,
        }: {
          where: { userId_tenantId: { userId: string; tenantId: string } };
        }) =>
          estado.memberships.find(
            (m) =>
              m.userId === where.userId_tenantId.userId &&
              m.tenantId === where.userId_tenantId.tenantId,
          ) ?? null,
        create: async ({
          data,
        }: {
          data: { userId: string; tenantId: string };
        }) => {
          const row = { id: `mem-${++seq}`, ...data };
          estado.memberships.push(row);
          return row;
        },
      },
    } as unknown as PrismaClient,
    estado,
  };
}

describe("scripts/otorgar-membresia — otorgarMembresia (fake db)", () => {
  // otorgar.membresia.001 — crea la membresía por email + slug
  it("crea la membresía cuando el User y el Tenant existen", async () => {
    const { db, estado } = fakeDb({
      users: [{ id: "u1", email: "org@x.cl" }],
      tenants: [{ id: "t1", slug: "autora" }],
      memberships: [],
    });
    const res = await otorgarMembresia({ db, email: "org@x.cl", slug: "autora" });
    expect(res).toMatchObject({
      userId: "u1",
      tenantId: "t1",
      creada: true,
    });
    expect(estado.memberships).toHaveLength(1);
    expect(estado.memberships[0]).toMatchObject({ userId: "u1", tenantId: "t1" });
  });

  // otorgar.membresia.002 — idempotente: re-correr no duplica y reporta creada:false
  it("es idempotente: correrlo dos veces no duplica la membresía", async () => {
    const { db, estado } = fakeDb({
      users: [{ id: "u1", email: "org@x.cl" }],
      tenants: [{ id: "t1", slug: "autora" }],
      memberships: [],
    });
    const primera = await otorgarMembresia({ db, email: "org@x.cl", slug: "autora" });
    const segunda = await otorgarMembresia({ db, email: "org@x.cl", slug: "autora" });
    expect(primera.creada).toBe(true);
    expect(segunda.creada).toBe(false);
    expect(estado.memberships).toHaveLength(1);
  });

  // otorgar.membresia.003 — normaliza el email (trim + lowercase) antes de buscar
  it("normaliza el email (trim + lowercase) antes de buscar el User", async () => {
    const { db } = fakeDb({
      users: [{ id: "u1", email: "org@x.cl" }],
      tenants: [{ id: "t1", slug: "autora" }],
      memberships: [],
    });
    const res = await otorgarMembresia({
      db,
      email: "  ORG@X.cl ",
      slug: "autora",
    });
    expect(res.userId).toBe("u1");
  });

  // otorgar.membresia.004 — falla claro si el User no existe (no lo inventa)
  it("lanza un error claro si el User no hizo login todavía (no lo crea)", async () => {
    const { db, estado } = fakeDb({
      users: [],
      tenants: [{ id: "t1", slug: "autora" }],
      memberships: [],
    });
    await expect(
      otorgarMembresia({ db, email: "nuevo@x.cl", slug: "autora" }),
    ).rejects.toThrow(/sesión/i);
    expect(estado.memberships).toHaveLength(0);
  });

  // otorgar.membresia.005 — falla claro si la Tienda (slug) no existe
  it("lanza un error claro si la Tienda no existe", async () => {
    const { db } = fakeDb({
      users: [{ id: "u1", email: "org@x.cl" }],
      tenants: [],
      memberships: [],
    });
    await expect(
      otorgarMembresia({ db, email: "org@x.cl", slug: "inexistente" }),
    ).rejects.toThrow(/tienda/i);
  });
});
