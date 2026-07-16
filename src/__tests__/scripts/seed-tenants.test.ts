import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import { descifrar, parsearClave } from "~/server/services/cifrado";
import {
  type EspecificacionTenant,
  sembrarTenants,
} from "../../../scripts/seed-tenants";

/**
 * Test DB-backed del núcleo del seed multi-tenant (F01-A, paso 7). La idempotencia es
 * la propiedad clave: el seed puede correrse muchas veces sin duplicar tenants,
 * credenciales ni productos. Además verificamos que las credenciales quedan CIFRADAS
 * en DB (I5) y descifran a su plaintext (el ruteo del webhook de Carril C depende de esto).
 *
 * La clave y las specs se INYECTAN (el núcleo no toca env), así el test es reproducible
 * sin depender de secretos locales. Slugs de prueba scopeados y limpiados antes/después.
 */

const CLAVE = parsearClave(Buffer.alloc(32, 5).toString("base64"));

const SPECS: EspecificacionTenant[] = [
  {
    slug: "test-seed-a",
    nombre: "Tienda Test A",
    estado: "PUBLICADA",
    flow: { apiKey: "apikey-a-plano", secretKey: "secretkey-a-plano", sandbox: true },
    producto: {
      titulo: "Producto de prueba A",
      descripcion: "desc A",
      precio: "3000",
      pdfPath: "test-seed-a/seed/a.pdf",
    },
  },
  {
    slug: "test-seed-b",
    nombre: "Tienda Test B",
    estado: "PUBLICADA",
    flow: { apiKey: "apikey-b-plano", secretKey: "secretkey-b-plano", sandbox: true },
    producto: {
      titulo: "Producto de prueba B",
      descripcion: "desc B",
      precio: "5000",
      pdfPath: "test-seed-b/seed/b.pdf",
    },
  },
];

const SLUGS = SPECS.map((s) => s.slug);

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { in: SLUGS } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  // Orden FK-safe: hijos (Restrict hacia Tenant) antes que el Tenant.
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.payment.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.product.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } }); // cascade FlowCredential
}

beforeEach(limpiar);
afterEach(limpiar);

describe("scripts/seed-tenants — sembrarTenants (DB-backed)", () => {
  // seed.tenants.001
  it("crea cada tenant PUBLICADA con su credencial cifrada y 1 producto", async () => {
    const res = await sembrarTenants({ db, clave: CLAVE, specs: SPECS });

    expect(res).toHaveLength(2);
    expect(res.every((r) => r.tenantCreado)).toBe(true);
    expect(res.every((r) => r.credencialCreada)).toBe(true);
    expect(res.every((r) => r.productoCreado)).toBe(true);

    for (const spec of SPECS) {
      const tenant = await db.tenant.findUniqueOrThrow({
        where: { slug: spec.slug },
        include: { flowCredential: true, products: true },
      });
      expect(tenant.estado).toBe("PUBLICADA");
      expect(tenant.products).toHaveLength(1);
      expect(tenant.products[0]!.precio.toFixed(2)).toBe(
        new Prisma.Decimal(spec.producto.precio).toFixed(2),
      );
      expect(tenant.flowCredential).not.toBeNull();
      // Las credenciales descifran al plaintext original.
      expect(descifrar(tenant.flowCredential!.apiKeyCifrada, CLAVE)).toBe(
        spec.flow.apiKey,
      );
      expect(descifrar(tenant.flowCredential!.secretKeyCifrada, CLAVE)).toBe(
        spec.flow.secretKey,
      );
    }
  });

  // seed.tenants.002
  it("es idempotente: correrlo dos veces no duplica y reporta creado:false", async () => {
    const primera = await sembrarTenants({ db, clave: CLAVE, specs: SPECS });
    const segunda = await sembrarTenants({ db, clave: CLAVE, specs: SPECS });

    expect(primera.every((r) => r.tenantCreado)).toBe(true);
    expect(segunda.every((r) => r.tenantCreado)).toBe(false);
    expect(segunda.every((r) => r.credencialCreada)).toBe(false);
    expect(segunda.every((r) => r.productoCreado)).toBe(false);

    expect(await db.tenant.count({ where: { slug: { in: SLUGS } } })).toBe(2);
    const ids = (
      await db.tenant.findMany({
        where: { slug: { in: SLUGS } },
        select: { id: true },
      })
    ).map((t) => t.id);
    expect(await db.flowCredential.count({ where: { tenantId: { in: ids } } })).toBe(2);
    expect(await db.product.count({ where: { tenantId: { in: ids } } })).toBe(2);
  });

  // seed.tenants.003
  it("guarda las credenciales CIFRADAS (el ciphertext en DB no contiene el plaintext, I5)", async () => {
    await sembrarTenants({ db, clave: CLAVE, specs: SPECS });
    const cred = await db.flowCredential.findFirstOrThrow({
      where: { tenant: { slug: "test-seed-a" } },
    });
    expect(cred.apiKeyCifrada).not.toContain("apikey-a-plano");
    expect(cred.secretKeyCifrada).not.toContain("secretkey-a-plano");
  });
});
