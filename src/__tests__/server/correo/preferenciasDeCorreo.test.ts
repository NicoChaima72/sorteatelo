import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "~/server/db";
import {
  destinatariosDeAvisos,
  registrarConsentimientoRecordatorios,
  suprimirCorreoDeAvisos,
  tiendaYPersonaDelTokenDeBaja,
} from "~/server/domain/correo/preferenciasDeCorreo";

/**
 * Tests DB-backed de las **preferencias de correo** (F05/D5/I5): consentimiento y supresión.
 *
 * Van contra Postgres real y no contra un fake porque las tres propiedades que importan viven en la
 * DB y no en el código: los `@@unique([tenantId, emailNormalizado])` (que son la idempotencia del
 * endpoint público y la unicidad por PERSONA), el hecho de que el unique sea **case-sensitive**
 * —de ahí que la identidad se normalice— y que el filtro cruce DOS tablas.
 *
 * Fixtures con slug `test-prefs-<pid>-*`, limpiados antes y después (mismo patrón y misma razón
 * que `ledgerCorreos.test.ts`: en este repo dos corridas de vitest pegan a la MISMA DB remota).
 */

const PREFIJO = `test-prefs-${process.pid}-`;
const PREFIJO_FAMILIA = "test-prefs-";
const EDAD_HUERFANO_MS = 60 * 60 * 1000;

async function limpiar() {
  const tenants = await db.tenant.findMany({
    where: {
      OR: [
        { slug: { startsWith: PREFIJO } },
        {
          slug: { startsWith: PREFIJO_FAMILIA },
          createdAt: { lt: new Date(Date.now() - EDAD_HUERFANO_MS) },
        },
      ],
    },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return;
  // Orden forzado por el schema: casi todo apunta al Tenant con `onDelete: Restrict`.
  await db.consentimientoRecordatorios.deleteMany({
    where: { tenantId: { in: ids } },
  });
  await db.supresionCorreo.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.payment.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.product.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(limpiar);
afterEach(limpiar);

/** Tienda + una Order suya (el consentimiento cuelga de una compra: FK Restrict). */
async function crearTiendaConOrden(nombre: string) {
  const tenant = await db.tenant.create({
    data: { slug: `${PREFIJO}${nombre}`, nombre, estado: "PUBLICADA" },
    select: { id: true },
  });
  const order = await db.order.create({
    data: {
      tenantId: tenant.id,
      email: "fan@example.cl",
      estado: "PENDIENTE",
      total: new Prisma.Decimal("1000"),
    },
    select: { id: true },
  });
  return { tenantId: tenant.id, orderId: order.id };
}

describe("domain/correo/preferenciasDeCorreo — consentimiento (D5)", () => {
  // correo.prefs.001 — dos casings del MISMO correo son UNA persona. El unique de Postgres es
  // case-sensitive, así que sin normalizar la identidad quedarían dos consentimientos y —lo que de
  // verdad duele— una supresión sobre uno de los dos no taparía al otro: la persona se da de baja
  // y le sigue llegando. Es DB-backed a propósito: un test de strings pasaría con el bug puesto.
  it("dos casings del mismo correo son UNA sola fila, y la segunda vez conserva el token", async () => {
    const { tenantId, orderId } = await crearTiendaConOrden("casing");

    await registrarConsentimientoRecordatorios({
      db,
      tenantId,
      orderId,
      email: "Fan@Example.CL",
      ip: "200.1.2.3",
    });
    const primera = await db.consentimientoRecordatorios.findFirstOrThrow({
      where: { tenantId },
      select: { tokenBaja: true, email: true, ip: true },
    });

    await registrarConsentimientoRecordatorios({
      db,
      tenantId,
      orderId,
      email: "  fan@example.cl  ",
      ip: "190.9.9.9",
    });

    const filas = await db.consentimientoRecordatorios.findMany({
      where: { tenantId },
      select: { emailNormalizado: true, email: true, ip: true, tokenBaja: true },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]!.emailNormalizado).toBe("fan@example.cl");
    // La prueba VIGENTE se refresca (otra IP, otro snapshot del correo tipeado)…
    expect(filas[0]!.ip).toBe("190.9.9.9");
    expect(filas[0]!.email).not.toBe(primera.email);
    // …pero el token de baja NO: si cambiara, moriría el enlace de todos los correos ya enviados.
    expect(filas[0]!.tokenBaja).toBe(primera.tokenBaja);
  });

  // correo.prefs.002 — el consentimiento es POR TIENDA (CONTEXT § Consentimiento de recordatorios):
  // la misma persona puede haber dicho que sí en una y nunca en la otra, y cada Tienda tiene su
  // propio token de baja. Sin `tenantId` en el unique, consentir en una valdría en todas.
  it("el consentimiento y su token son por Tienda, no globales", async () => {
    const a = await crearTiendaConOrden("tienda-a");
    const b = await crearTiendaConOrden("tienda-b");

    for (const t of [a, b]) {
      await registrarConsentimientoRecordatorios({
        db,
        tenantId: t.tenantId,
        orderId: t.orderId,
        email: "fan@example.cl",
        ip: null,
      });
    }

    const filas = await db.consentimientoRecordatorios.findMany({
      where: { tenantId: { in: [a.tenantId, b.tenantId] } },
      select: { tenantId: true, tokenBaja: true },
    });
    expect(filas).toHaveLength(2);
    expect(filas[0]!.tokenBaja).not.toBe(filas[1]!.tokenBaja);
  });
});

describe("domain/correo/preferenciasDeCorreo — supresión y filtro (I5)", () => {
  // correo.prefs.003 — EL filtro de I5, con los cuatro estados posibles en la misma corrida. La
  // ausencia del mapa es la respuesta segura: quien nunca consintió y quien se dio de baja quedan
  // los dos afuera, y por el mismo camino.
  it("solo pasan los que tienen consentimiento Y no tienen supresión", async () => {
    const { tenantId, orderId } = await crearTiendaConOrden("filtro");

    // (a) consintió y sigue suscrita; (b) consintió y se dio de baja; (c) nunca consintió;
    // (d) nunca consintió y además está suprimida (el caso raro: baja de quien no era).
    for (const email of ["a@example.cl", "b@example.cl"]) {
      await registrarConsentimientoRecordatorios({
        db,
        tenantId,
        orderId,
        email,
        ip: null,
      });
    }
    for (const email of ["b@example.cl", "d@example.cl"]) {
      await suprimirCorreoDeAvisos({ db, tenantId, email });
    }

    const habilitados = await destinatariosDeAvisos({
      db,
      tenantId,
      emails: [
        "A@example.cl", // el casing crudo de `RaffleEntry`: el filtro normaliza por su cuenta
        "b@example.cl",
        "c@example.cl",
        "d@example.cl",
      ],
    });

    expect([...habilitados.keys()]).toEqual(["a@example.cl"]);
    expect(habilitados.get("a@example.cl")!.tokenBaja.length).toBeGreaterThan(
      20,
    );
  });

  // correo.prefs.004 — la baja NO borra el consentimiento. Borrarlo destruiría la prueba de que
  // los envíos anteriores fueron lícitos, que es justo para lo que existe el registro verificable.
  // La baja se expresa como una fila en la OTRA tabla, y el filtro la respeta.
  it("darse de baja no borra la prueba del consentimiento", async () => {
    const { tenantId, orderId } = await crearTiendaConOrden("prueba");

    await registrarConsentimientoRecordatorios({
      db,
      tenantId,
      orderId,
      email: "fan@example.cl",
      ip: "200.1.2.3",
    });
    await suprimirCorreoDeAvisos({ db, tenantId, email: "fan@example.cl" });

    const consentimiento = await db.consentimientoRecordatorios.findFirst({
      where: { tenantId },
      select: { ip: true, textoMostrado: true, otorgadoAt: true },
    });
    expect(consentimiento).not.toBeNull();
    expect(consentimiento!.textoMostrado.length).toBeGreaterThan(0);

    // Y sin embargo no recibe.
    const habilitados = await destinatariosDeAvisos({
      db,
      tenantId,
      emails: ["fan@example.cl"],
    });
    expect(habilitados.size).toBe(0);
  });

  // correo.prefs.005 — idempotencia de la supresión POR CONSTRAINT, no por lógica: es lo que deja
  // al endpoint público responder «listo» las dos veces sin un `if` que alguien pueda borrar.
  it("suprimir dos veces deja UNA fila y lo reporta", async () => {
    const { tenantId } = await crearTiendaConOrden("idem");

    const primera = await suprimirCorreoDeAvisos({
      db,
      tenantId,
      email: "Fan@Example.CL",
    });
    const segunda = await suprimirCorreoDeAvisos({
      db,
      tenantId,
      email: "fan@example.cl", // otro casing: la MISMA persona
    });

    expect(primera).toEqual({ nueva: true });
    expect(segunda).toEqual({ nueva: false });
    expect(
      await db.supresionCorreo.count({ where: { tenantId } }),
    ).toBe(1);
  });

  // correo.prefs.006 — la supresión es POR TIENDA: darse de baja en una NO da de baja en las
  // otras (CONTEXT § Supresión de correo). Es la diferencia entre «no me escribas más» y «bórrame
  // de la plataforma», y el Comprador solo pidió lo primero.
  it("la baja en una Tienda no afecta a otra", async () => {
    const a = await crearTiendaConOrden("baja-a");
    const b = await crearTiendaConOrden("baja-b");
    for (const t of [a, b]) {
      await registrarConsentimientoRecordatorios({
        db,
        tenantId: t.tenantId,
        orderId: t.orderId,
        email: "fan@example.cl",
        ip: null,
      });
    }

    await suprimirCorreoDeAvisos({
      db,
      tenantId: a.tenantId,
      email: "fan@example.cl",
    });

    expect(
      (
        await destinatariosDeAvisos({
          db,
          tenantId: a.tenantId,
          emails: ["fan@example.cl"],
        })
      ).size,
    ).toBe(0);
    expect(
      (
        await destinatariosDeAvisos({
          db,
          tenantId: b.tenantId,
          emails: ["fan@example.cl"],
        })
      ).size,
    ).toBe(1);
  });

  // correo.prefs.007 — el token resuelve a SU Tienda y a SU persona (es lo que hace que el
  // endpoint público pueda suprimir sin login); uno inventado da `null` y el borde responde neutral.
  it("el token de baja resuelve la Tienda y la persona; uno inválido da null", async () => {
    const { tenantId, orderId } = await crearTiendaConOrden("token");
    await registrarConsentimientoRecordatorios({
      db,
      tenantId,
      orderId,
      email: "Fan@Example.CL",
      ip: null,
    });
    const { tokenBaja } = await db.consentimientoRecordatorios.findFirstOrThrow({
      where: { tenantId },
      select: { tokenBaja: true },
    });

    expect(await tiendaYPersonaDelTokenDeBaja({ db, token: tokenBaja })).toEqual(
      {
        tenantId,
        nombreTienda: "token",
        // La identidad NORMALIZADA: es la que el endpoint le pasa a `suprimirCorreoDeAvisos`.
        emailNormalizado: "fan@example.cl",
      },
    );
    expect(
      await tiendaYPersonaDelTokenDeBaja({ db, token: "no-existe" }),
    ).toBeNull();
  });
});
