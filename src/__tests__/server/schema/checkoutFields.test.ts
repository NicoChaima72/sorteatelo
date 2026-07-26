import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";

/**
 * Tests DB-backed del SCHEMA de Campos de checkout (F01, tasks/26-07-25-checkout-campos-configurables).
 * Se ejercen contra la DB real porque lo que se verifica vive en Postgres/Prisma, no en un use case:
 * el `@@unique([tenantId, clave])` de `CheckoutField` (una clave por Tienda, D1), los DEFAULTS de las
 * columnas nuevas, el `@@unique([orderId, clave])` de `CheckoutFieldResponse` (una respuesta por
 * campo y orden, D2) y —el punto central de D5/I4— que el hard delete de una definición deja sus
 * respuestas VIVAS con `fieldId = null` y el snapshot (clave + etiqueta + tipo + valor) intacto.
 *
 * Slugs `test-schema-checkout-*` scopeados y limpiados antes/después (FK-safe: hijos antes que padres).
 */

const PREFIJO = "test-schema-checkout-";

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: { slug: { startsWith: PREFIJO } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  await db.checkoutFieldResponse.deleteMany({ where: { tenantId: { in: ids } } });
  await db.checkoutField.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(limpiar);
afterEach(limpiar);

async function crearTenant(nombre: string) {
  return db.tenant.create({
    data: { slug: `${PREFIJO}${nombre}`, nombre, estado: "PUBLICADA" },
    select: { id: true },
  });
}

async function crearOrden(tenantId: string, email = "fan@example.cl") {
  return db.order.create({
    data: { tenantId, email, estado: "PAGADO", total: "1000" },
    select: { id: true },
  });
}

describe("schema/CheckoutField + CheckoutFieldResponse (DB-backed)", () => {
  // checkout.schema.001 — @@unique([tenantId, clave]): una clave por Tienda, pero la MISMA clave es
  //                       libre en otra Tienda (aislamiento por tenant, ADR-0005/I1). De paso fija
  //                       los defaults de las columnas nuevas.
  it("rechaza clave duplicada dentro del mismo tenant y permite la misma clave en tenants distintos", async () => {
    const a = await crearTenant("a");
    const b = await crearTenant("b");

    const campo = await db.checkoutField.create({
      data: { tenantId: a.id, clave: "telefono", etiqueta: "Teléfono", tipo: "TELEFONO" },
      select: {
        obligatorio: true,
        placeholder: true,
        textoAyuda: true,
        posicion: true,
        activo: true,
        opciones: true,
        defaultMarcado: true,
      },
    });
    // Defaults del schema: opt-in a obligatorio, nace ACTIVO, sin opciones y sin marca previa.
    expect(campo).toMatchObject({
      obligatorio: false,
      placeholder: null,
      textoAyuda: null,
      posicion: 0,
      activo: true,
      opciones: [],
      defaultMarcado: false,
    });

    // Misma clave en el MISMO tenant ⇒ viola @@unique([tenantId, clave])...
    await expect(
      db.checkoutField.create({
        data: { tenantId: a.id, clave: "telefono", etiqueta: "Otro teléfono", tipo: "TEXTO" },
      }),
    ).rejects.toThrow();

    // ...incluso si el campo original está INACTIVO: el unique alcanza a los desactivados, y por eso
    // la derivación de clave (D7) debe desambiguar contra ellos.
    await db.checkoutField.updateMany({
      where: { tenantId: a.id, clave: "telefono" },
      data: { activo: false },
    });
    await expect(
      db.checkoutField.create({
        data: { tenantId: a.id, clave: "telefono", etiqueta: "Teléfono 2", tipo: "TELEFONO" },
      }),
    ).rejects.toThrow();

    // Pero la MISMA clave en OTRA Tienda ⇒ OK (las definiciones no se pisan entre tenants).
    const enOtroTenant = await db.checkoutField.create({
      data: { tenantId: b.id, clave: "telefono", etiqueta: "Teléfono", tipo: "TELEFONO" },
      select: { clave: true, tenantId: true },
    });
    expect(enOtroTenant).toMatchObject({ clave: "telefono", tenantId: b.id });
  });

  // checkout.schema.002 — D5/I4: hard delete de la definición ⇒ `fieldId` SetNull y la respuesta
  //                       sobrevive AUTOCONTENIDA (clave + etiqueta + tipo + valor congelados),
  //                       que es lo que permite renderizar ventas (F06) y CSV (F07) sin la definición.
  it("borrar un CheckoutField deja sus CheckoutFieldResponse vivas con fieldId = null y el snapshot intacto", async () => {
    const t = await crearTenant("c");
    const orden = await crearOrden(t.id);

    const campo = await db.checkoutField.create({
      data: {
        tenantId: t.id,
        clave: "sucursal",
        etiqueta: "Sucursal de retiro",
        tipo: "SELECT",
        opciones: ["Providencia", "Ñuñoa"],
      },
      select: { id: true },
    });

    await db.checkoutFieldResponse.create({
      data: {
        tenantId: t.id,
        orderId: orden.id,
        fieldId: campo.id,
        clave: "sucursal",
        etiqueta: "Sucursal de retiro",
        tipo: "SELECT",
        valor: "Ñuñoa",
      },
    });

    // La definición se borra (D5: hard delete permitido).
    await db.checkoutField.delete({ where: { id: campo.id } });

    const respuestas = await db.checkoutFieldResponse.findMany({
      where: { orderId: orden.id },
      select: { fieldId: true, clave: true, etiqueta: true, tipo: true, valor: true },
    });
    expect(respuestas).toHaveLength(1);
    expect(respuestas[0]).toEqual({
      fieldId: null, // SetNull: la definición ya no existe...
      clave: "sucursal", // ...pero el snapshot sigue diciendo TODO lo necesario para renderizar.
      etiqueta: "Sucursal de retiro",
      tipo: "SELECT",
      valor: "Ñuñoa",
    });
  });

  // checkout.schema.003 — D2: una sola respuesta por (orden, clave); y la respuesta es parte del
  //                       agregado Order (Cascade), no un registro suelto con PII colgando.
  it("admite una sola respuesta por (orden, clave) y borra las respuestas junto con su Orden (Cascade)", async () => {
    const t = await crearTenant("d");
    const orden = await crearOrden(t.id);
    const otraOrden = await crearOrden(t.id, "otra@example.cl");

    await db.checkoutFieldResponse.create({
      data: {
        tenantId: t.id,
        orderId: orden.id,
        clave: "telefono",
        etiqueta: "Teléfono",
        tipo: "TELEFONO",
        valor: "+56912345678",
      },
    });

    // Segunda respuesta con la MISMA clave en la MISMA orden ⇒ viola @@unique([orderId, clave]).
    await expect(
      db.checkoutFieldResponse.create({
        data: {
          tenantId: t.id,
          orderId: orden.id,
          clave: "telefono",
          etiqueta: "Teléfono",
          tipo: "TELEFONO",
          valor: "+56999999999",
        },
      }),
    ).rejects.toThrow();

    // La misma clave en OTRA orden ⇒ OK (el unique es por orden, no por tenant).
    await db.checkoutFieldResponse.create({
      data: {
        tenantId: t.id,
        orderId: otraOrden.id,
        clave: "telefono",
        etiqueta: "Teléfono",
        tipo: "TELEFONO",
        valor: "+56911111111",
      },
    });
    expect(await db.checkoutFieldResponse.count({ where: { tenantId: t.id } })).toBe(2);

    // Borrar la Orden se lleva sus respuestas (Cascade): PII sin orden dueña sería lo peor de los
    // dos mundos. La respuesta de la OTRA orden queda intacta.
    await db.order.delete({ where: { id: orden.id } });
    const quedan = await db.checkoutFieldResponse.findMany({
      where: { tenantId: t.id },
      select: { orderId: true },
    });
    expect(quedan).toEqual([{ orderId: otraOrden.id }]);
  });
});
