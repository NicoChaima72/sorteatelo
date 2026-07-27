import { type CorreoEnviadoType } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~/server/db";
import { type AccesoPanel } from "~/server/authPolicy";
import { claveConfirmacionCompra } from "~/server/domain/correo/ledgerCorreos";
import { resolvedorDeCorreos } from "~/server/domain/correo/resolvedorDeCorreos";
import { armarCorreosDeResultado } from "~/server/domain/correo/resultadoDelSorteo";
import { ejecutarSorteo } from "~/server/domain/panel/ejecutarSorteo";

/**
 * Tests DB-backed del **resultado del sorteo** (F04/C4-C5), de punta a punta y por el camino real:
 * se ejecuta el sorteo con el use case de verdad —que encola las filas dentro de su
 * `$transaction`— y se le pide a la derivación que arme los correos con esas filas.
 *
 * Van contra Postgres real y no contra un fake porque lo que importa acá no es aritmética: es que el
 * `@@unique([tipo, clave])` sea quien impide la segunda tanda, que el `select` traiga de verdad la
 * marca del tenant y los Números, y que el guard de tenancy (I1) corte con datos reales.
 *
 * Fixtures con slug `test-resultado-<pid>-*`. El pid NO es cosmética: dos corridas de vitest contra
 * la misma DB remota es lo normal en este repo, y con prefijo fijo el `beforeEach` de una borra los
 * fixtures vivos de la otra (lección de F02). Las claves del ledger salen de cuids reales, nunca de
 * literales — el unique es GLOBAL a propósito.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const PREFIJO = `test-resultado-${process.pid}-`;
const PREFIJO_FAMILIA = "test-resultado-";
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
  // Orden FK-safe: todo el dominio apunta al Tenant con Restrict.
  await db.correoEnviado.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenantMembership.deleteMany({ where: { tenantId: { in: ids } } });
  await db.downloadGrant.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffleEntry.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffle.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.product.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
  await db.user.deleteMany({ where: { email: { contains: PREFIJO } } });
}

beforeEach(limpiar);
afterEach(limpiar);

const AHORA = new Date("2026-08-30T21:00:00Z");

const acceso = (tenantId: string): AccesoPanel => ({
  userId: "u1",
  email: "organizadora@x.cl",
  tenantIds: [tenantId],
  tenantIdDelHost: tenantId,
});

async function crearTenant(
  nombre: string,
  extra: { prefijoTicket?: string; colorPrimario?: string; contactoEmail?: string } = {},
) {
  return db.tenant.create({
    data: {
      slug: `${PREFIJO}${nombre}`,
      nombre,
      estado: "PUBLICADA",
      ...extra,
    },
    select: { id: true },
  });
}

/** Sorteo ACTIVO listo para ejecutarse, con premio y bases conocidos. */
async function crearRaffle(tenantId: string, nombre: string) {
  return db.raffle.create({
    data: {
      tenantId,
      nombre,
      premio: "Photobook firmado",
      estado: "ACTIVO",
      fechaInicio: new Date("2026-01-01T00:00:00Z"),
      fechaFin: new Date("2026-08-30T21:00:00Z"),
      basesPdfUrl: "https://cdn.test/bases.pdf",
    },
    select: { id: true },
  });
}

/**
 * Tickets de una persona: una orden + sus `RaffleEntry` con Números explícitos (ADR-0024). La orden
 * existe porque `RaffleEntry.orderId` es FK — el sorteo es entre TICKETS de compras reales.
 */
async function crearTickets(
  tenantId: string,
  raffleId: string,
  email: string,
  numeros: number[],
) {
  const order = await db.order.create({
    data: { tenantId, email, estado: "PAGADO", total: "1000" },
    select: { id: true },
  });
  await db.raffleEntry.createMany({
    data: numeros.map((numero, ordinal) => ({
      tenantId,
      raffleId,
      orderId: order.id,
      email,
      ordinal,
      numero,
    })),
  });
}

/** Orden PAGADA con su `DownloadGrant` — lo que necesita el resolvedor de C1 para armar su correo. */
async function crearOrdenConGrant(tenantId: string, email: string) {
  const producto = await db.product.create({
    data: {
      tenantId,
      titulo: "Guía",
      descripcion: "desc",
      precio: "1000",
      pdfPath: `${tenantId}/guia.pdf`,
    },
    select: { id: true },
  });
  const order = await db.order.create({
    data: {
      tenantId,
      email,
      estado: "PAGADO",
      total: "1000",
      items: { create: [{ tenantId, productId: producto.id, precio: "1000" }] },
      downloadGrants: {
        create: [
          {
            tenantId,
            productId: producto.id,
            token: `tok-${tenantId}`,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        ],
      },
    },
    select: { id: true },
  });
  return order.id;
}

async function crearMembresia(tenantId: string, email: string, createdAt: Date) {
  const user = await db.user.create({ data: { email }, select: { id: true } });
  await db.tenantMembership.create({
    data: { tenantId, userId: user.id, createdAt },
  });
}

/** Las filas del ledger del tenant, en el orden FIFO del drenado. */
function filasDelLedger(tenantId: string) {
  return db.correoEnviado.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      tenantId: true,
      tipo: true,
      clave: true,
      email: true,
      intentos: true,
      updatedAt: true,
    },
  });
}

describe("domain/correo/resultadoDelSorteo — camino real (ejecutar ⇒ ledger ⇒ correos)", () => {
  // correo.resolver.001 — el circuito entero contra Postgres: ejecutar el sorteo deja las filas y la
  //                       derivación arma UN correo por fila, con el contenido que manda D4.
  it("ejecutar el sorteo deja 1 fila de ganador + N de no ganador y la derivación arma cada correo", async () => {
    const tenant = await crearTenant("armi", {
      prefijoTicket: "ARMY",
      colorPrimario: "#e11d48",
    });
    const raffle = await crearRaffle(tenant.id, "Photobook firmado por el grupo");
    await crearMembresia(tenant.id, `orga@${PREFIJO}x.cl`, new Date("2026-01-01"));
    await crearTickets(tenant.id, raffle.id, "ana@fan.cl", [1043, 1044, 1045]);
    await crearTickets(tenant.id, raffle.id, "bruno@fan.cl", [1046]);
    await crearTickets(tenant.id, raffle.id, "carla@fan.cl", [1047, 1048]);

    // Gana el ticket 1046 (bruno): índice 3 del pool ordenado por inserción.
    const ejecucion = await ejecutarSorteo({
      db,
      acceso: acceso(tenant.id),
      input: { raffleId: raffle.id },
      ahora: AHORA,
      elegirIndice: () => 3,
    });
    expect(ejecucion.ganadorEmail).toBe("bruno@fan.cl");
    expect(ejecucion.ganadorNumero).toBe(1046);

    const filas = await filasDelLedger(tenant.id);
    expect(filas.filter((f) => f.tipo === "RESULTADO_GANADOR")).toHaveLength(1);
    // ana y carla; bruno NO recibe el de no ganador (D4: nadie recibe los dos).
    expect(
      filas
        .filter((f) => f.tipo === "RESULTADO_NO_GANADOR")
        .map((f) => f.email)
        .sort(),
    ).toEqual(["ana@fan.cl", "carla@fan.cl"]);

    const correos = await armarCorreosDeResultado({ db, filas });
    expect(correos.size).toBe(3);

    const porEmail = new Map(
      [...correos.values()].map((c) => [c.to, c] as const),
    );

    // ── El ganador ──────────────────────────────────────────────────────────
    const ganador = porEmail.get("bruno@fan.cl")!;
    expect(ganador.subject).toContain("Photobook firmado por el grupo"); // I10
    expect(ganador.text).toContain("ARMY-1046"); // su número, con el prefijo del tenant (D12)
    expect(ganador.text).toContain("Photobook firmado"); // el premio
    expect(ganador.replyTo).toBe(`orga@${PREFIJO}x.cl`); // T6
    expect(ganador.tags).toEqual([
      { name: "tipo", value: "RESULTADO_GANADOR" },
      { name: "tenant", value: tenant.id },
    ]);

    // ── Una que no ganó ─────────────────────────────────────────────────────
    const ana = porEmail.get("ana@fan.cl")!;
    expect(ana.subject).toContain("Photobook firmado por el grupo"); // I10
    expect(ana.text).toContain("ARMY-1046"); // el número ganador
    expect(ana.text).toContain("ARMY-1043–1045"); // SUS números, plegados (D8)
    expect(ana.text).not.toContain("1047"); // ni los de carla
    // D4 contra datos reales: el número del ganador sí, su identidad jamás.
    expect(ana.text).not.toContain("bruno");
    expect(ana.html).not.toContain("bruno");
  });

  // correo.resolver.002 — I1: una fila cuyo `tenantId` NO es el del sorteo se salta INTACTA. Es el
  //                       mismo guard que el resolvedor de C1: antes que mandarle a alguien el
  //                       resultado de otra Tienda, no se manda nada (fail-closed).
  it("una fila cuyo tenant no es el del sorteo no se arma (I1)", async () => {
    const tenant = await crearTenant("propia");
    const ajeno = await crearTenant("ajena");
    const raffle = await crearRaffle(tenant.id, "Sorteo propio");
    await crearTickets(tenant.id, raffle.id, "ana@fan.cl", [1]);
    await crearTickets(tenant.id, raffle.id, "bruno@fan.cl", [2]);
    await ejecutarSorteo({
      db,
      acceso: acceso(tenant.id),
      input: { raffleId: raffle.id },
      ahora: AHORA,
      elegirIndice: () => 0,
    });

    const filas = await filasDelLedger(tenant.id);
    expect(filas).toHaveLength(2);

    // Se falsea el tenant de las filas, como lo haría un bug de scoping en un productor.
    const conTenantAjeno = filas.map((f) => ({ ...f, tenantId: ajeno.id }));
    const correos = await armarCorreosDeResultado({ db, filas: conTenantAjeno });
    expect(correos.size).toBe(0);
  });

  // correo.resolver.003 — un sorteo SIN ejecutar no tiene resultado del que hablar: la fila se salta
  //                       intacta en vez de mandar un correo con el ganador en blanco.
  it("un sorteo sin ejecutar no arma ningún correo", async () => {
    const tenant = await crearTenant("pendiente");
    const raffle = await crearRaffle(tenant.id, "Sorteo sin ejecutar");
    await crearTickets(tenant.id, raffle.id, "ana@fan.cl", [1]);

    const correos = await armarCorreosDeResultado({
      db,
      filas: [
        {
          id: "fila-1",
          tenantId: tenant.id,
          tipo: "RESULTADO_NO_GANADOR",
          clave: `${raffle.id}:ana@fan.cl`,
          email: "ana@fan.cl",
        },
      ],
    });
    expect(correos.size).toBe(0);
  });

  // correo.resolver.004 — T6: el reply-to es el contacto PÚBLICO de la Tienda cuando existe, y la
  //                       membresía más antigua cuando no. El correo personal del Organizador NUNCA
  //                       se imprime en el cuerpo; el público sí puede ofrecerse como alternativa.
  it("el reply-to sale del contacto público de la Tienda y, sin él, de la membresía más antigua", async () => {
    const conContacto = await crearTenant("conContacto", {
      contactoEmail: `hola@${PREFIJO}tienda.cl`,
    });
    await crearMembresia(conContacto.id, `personal@${PREFIJO}gmail.cl`, new Date("2026-01-01"));
    const rConContacto = await crearRaffle(conContacto.id, "Sorteo A");
    await crearTickets(conContacto.id, rConContacto.id, "ana@fan.cl", [1]);
    await ejecutarSorteo({
      db,
      acceso: acceso(conContacto.id),
      input: { raffleId: rConContacto.id },
      ahora: AHORA,
      elegirIndice: () => 0,
    });

    const sinContacto = await crearTenant("sinContacto");
    await crearMembresia(sinContacto.id, `vieja@${PREFIJO}x.cl`, new Date("2026-01-01"));
    await crearMembresia(sinContacto.id, `nueva@${PREFIJO}x.cl`, new Date("2026-06-01"));
    const rSinContacto = await crearRaffle(sinContacto.id, "Sorteo B");
    await crearTickets(sinContacto.id, rSinContacto.id, "bruno@fan.cl", [1]);
    await ejecutarSorteo({
      db,
      acceso: acceso(sinContacto.id),
      input: { raffleId: rSinContacto.id },
      ahora: AHORA,
      elegirIndice: () => 0,
    });

    const filas = [
      ...(await filasDelLedger(conContacto.id)),
      ...(await filasDelLedger(sinContacto.id)),
    ];
    const correos = await armarCorreosDeResultado({ db, filas });
    const porDestino = new Map([...correos.values()].map((c) => [c.to, c] as const));

    const ganadoraA = porDestino.get("ana@fan.cl")!;
    expect(ganadoraA.replyTo).toBe(`hola@${PREFIJO}tienda.cl`); // el público gana
    // Y como es público, el cuerpo puede ofrecerlo.
    expect(ganadoraA.text).toContain(`hola@${PREFIJO}tienda.cl`);

    const ganadorB = porDestino.get("bruno@fan.cl")!;
    expect(ganadorB.replyTo).toBe(`vieja@${PREFIJO}x.cl`); // la membresía MÁS ANTIGUA
    // El correo personal del Organizador viaja en la cabecera y NO en el cuerpo.
    expect(ganadorB.text).not.toContain(`vieja@${PREFIJO}x.cl`);
    expect(ganadorB.html).not.toContain(`vieja@${PREFIJO}x.cl`);
  });
});

describe("domain/correo/resolvedorDeCorreos — el registro que usa el cron", () => {
  // correo.resolver.005 — el seam REAL, no un fake: el mismo objeto que `pages/api/cron/correos.ts`
  //                       le pasa al drenado resuelve un lote MIXTO (confirmación + los dos tipos de
  //                       resultado). Es el único punto donde se integran los dos resolvedores, y su
  //                       modo de falla es silencioso: una sección mal ruteada no duplica un correo
  //                       —deja filas PENDIENTE para siempre, sin aparecer siquiera en `sinResolver`.
  it("resuelve en un mismo lote la confirmación de compra y los dos correos de resultado", async () => {
    const tenant = await crearTenant("mixto", { prefijoTicket: "ARMY" });
    const raffle = await crearRaffle(tenant.id, "Sorteo mixto");
    await crearTickets(tenant.id, raffle.id, "ana@fan.cl", [1]);
    await crearTickets(tenant.id, raffle.id, "bruno@fan.cl", [2]);
    await ejecutarSorteo({
      db,
      acceso: acceso(tenant.id),
      input: { raffleId: raffle.id },
      ahora: AHORA,
      elegirIndice: () => 0, // gana ana
    });
    const orderId = await crearOrdenConGrant(tenant.id, "carla@fan.cl");

    const filas = [
      ...(await filasDelLedger(tenant.id)),
      // La fila de C1 se arma a mano con el MISMO constructor de clave que usa la $tx post-pago.
      {
        id: "fila-c1",
        tenantId: tenant.id,
        tipo: "CONFIRMACION_COMPRA" as const,
        clave: claveConfirmacionCompra({ orderId }),
        email: "carla@fan.cl",
        intentos: 0,
        updatedAt: new Date(),
      },
    ];

    const resolvedor = resolvedorDeCorreos({ db, baseUrl: "https://app.test" });
    const mensajes = await resolvedor.armar(filas);

    expect(mensajes.size).toBe(3);
    const porDestino = new Map(
      [...mensajes.values()].map((c) => [c.to, c] as const),
    );
    expect(porDestino.get("ana@fan.cl")!.subject).toContain("Ganaste"); // C4
    expect(porDestino.get("bruno@fan.cl")!.subject).toContain("Resultado"); // C5
    expect(porDestino.get("carla@fan.cl")!.text).toContain("app.test/entrega/"); // C1
  });

  // correo.resolver.006 — guard ESTRUCTURAL del filtro que evita el head-of-line blocking: todo tipo
  //                       que `armar` sepa resolver TIENE que estar declarado en `tipos`, porque el
  //                       drenado filtra por esa lista ANTES del `take`. Un tipo resuelto pero no
  //                       declarado sería un correo que nunca sale y que nadie ve como pendiente.
  it("no resuelve ningún tipo que no haya declarado en `tipos`", async () => {
    const resolvedor = resolvedorDeCorreos({ db, baseUrl: "https://app.test" });
    const todos: CorreoEnviadoType[] = [
      "CONFIRMACION_COMPRA",
      "RECORDATORIO_SORTEO",
      "RESULTADO_GANADOR",
      "RESULTADO_NO_GANADOR",
    ];
    const noDeclarados = todos.filter((t) => !resolvedor.tipos.includes(t));
    // Hoy es solo RECORDATORIO_SORTEO (F06); cuando F06 lo declare, esta lista queda vacía y el
    // test sigue siendo válido (no asume cuáles son).
    expect(resolvedor.tipos).toContain("CONFIRMACION_COMPRA");
    expect(resolvedor.tipos).toContain("RESULTADO_GANADOR");
    expect(resolvedor.tipos).toContain("RESULTADO_NO_GANADOR");

    for (const tipo of noDeclarados) {
      const mensajes = await resolvedor.armar([
        {
          id: `fila-${tipo}`,
          tenantId: "t-inexistente",
          tipo,
          clave: "raf_x:48:ana@x.cl",
          email: "ana@x.cl",
          intentos: 0,
          updatedAt: new Date(),
        },
      ]);
      expect(mensajes.size).toBe(0);
    }
  });
});
