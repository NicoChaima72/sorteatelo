import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { db } from "~/server/db";
import {
  claveConfirmacionCompra,
  claveRecordatorio,
  claveResultado,
  correosDeResultado,
  encolarCorreos,
  raffleIdDeClave,
} from "~/server/domain/correo/ledgerCorreos";

/**
 * Tests DB-backed del CLAIM del ledger de correos (F02, ADR-0027 §2). Van contra Postgres real
 * porque la propiedad que importa vive en la semántica del `@@unique([tipo, clave])` +
 * `createMany({ skipDuplicates })`: **dos corridas no pueden encolar dos veces el mismo correo**.
 * Un fake de Prisma no probaría nada acá (el que decide es el índice único de la DB).
 *
 * Fixtures con slug `test-ledger-<pid>-*`, limpiados antes y después.
 */

/**
 * Prefijo ÚNICO POR PROCESO. **No es cosmética de nombres**: en este repo es normal que dos
 * corridas de vitest peguen a la MISMA DB remota a la vez (varios carriles en paralelo, y alguno
 * corriendo la suite completa mientras otro filtra). Las dos ejecutan ESTE archivo, y con un
 * prefijo fijo el `beforeEach` de una borra los fixtures VIVOS de la otra a mitad de test —
 * reproducido 2026-07-26: la fila recién encolada desaparecía entre dos queries del mismo `it`, y
 * el `skipDuplicates` del segundo encolado no saltaba nada porque ya no había con qué chocar.
 */
const PREFIJO = `test-ledger-${process.pid}-`;
/** Prefijo de la FAMILIA: se usa SOLO para barrer huérfanos de corridas que murieron sin limpiar. */
const PREFIJO_FAMILIA = "test-ledger-";
/** Ninguna corrida viva tiene fixtures de esta edad ⇒ barrerlos no le pisa nada a nadie. */
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
  await db.correoEnviado.deleteMany({ where: { tenantId: { in: ids } } });
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

describe("domain/correo/ledgerCorreos — claim idempotente (ADR-0027 §2)", () => {
  // correo.ledger.001 — el claim por createMany({skipDuplicates}) impide que dos corridas
  // procesen la misma clave [tipo, clave]: la segunda no crea nada y lo reporta.
  it("encolar dos veces el mismo (tipo, clave) deja UNA sola fila y la segunda vez reporta 0 nuevas", async () => {
    const tenant = await crearTenant("claim");

    // La clave se deriva del cuid del tenant y NO es un literal: el `@@unique([tipo, clave])` no
    // lleva `tenantId` (schema: la clave ya viene namespaceada por un id tenant-bound), así que un
    // `"orden-abc"` es global de verdad y dos corridas simultáneas de vitest se pisan la fila —
    // con `skipDuplicates`, en silencio. Es además lo que hace producción: un `orderId` real.
    const orderId = `ord-${tenant.id}`;
    const correo = {
      tenantId: tenant.id,
      tipo: "CONFIRMACION_COMPRA" as const,
      clave: orderId,
      email: "fan@example.cl",
    };

    const primera = await encolarCorreos({ db, correos: [correo] });
    const segunda = await encolarCorreos({ db, correos: [correo] });

    expect(primera).toBe(1);
    expect(segunda).toBe(0);

    const filas = await db.correoEnviado.findMany({
      where: { tenantId: tenant.id },
      select: { estado: true, intentos: true, email: true, clave: true },
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      estado: "PENDIENTE",
      intentos: 0,
      email: "fan@example.cl",
      clave: orderId,
    });
  });

  // correo.ledger.002 — el fix #4 del schema-guardian, probado donde pega: el unique de Postgres
  // es CASE-SENSITIVE, así que si la clave no normalizara el email, "Ana@Example.CL" y
  // "ana@example.cl" serían dos filas ⇒ DOS correos a la MISMA persona (I2). Va contra la DB
  // porque la propiedad no es "el string es minúscula" sino "el índice único los ve iguales".
  it("dos variantes de mayúsculas/espacios del mismo email colapsan en UNA fila del ledger", async () => {
    const tenant = await crearTenant("normaliza");
    // Derivada del cuid por la misma razón que arriba: la clave del ledger es global.
    const raffleId = `raf-${tenant.id}`;

    const primera = await encolarCorreos({
      db,
      correos: [
        {
          tenantId: tenant.id,
          tipo: "RESULTADO_NO_GANADOR",
          clave: claveResultado({ raffleId, email: "  Ana@Example.CL " }),
          email: "Ana@Example.CL",
        },
      ],
    });
    const segunda = await encolarCorreos({
      db,
      correos: [
        {
          tenantId: tenant.id,
          tipo: "RESULTADO_NO_GANADOR",
          clave: claveResultado({ raffleId, email: "ana@example.cl" }),
          email: "ana@example.cl",
        },
      ],
    });

    expect(primera).toBe(1);
    expect(segunda).toBe(0);
    const filas = await db.correoEnviado.findMany({
      where: { tenantId: tenant.id },
      select: { clave: true },
    });
    expect(filas).toHaveLength(1);
    // El `email` snapshot conserva lo que escribió el Comprador; solo la CLAVE se normaliza.
    expect(filas[0]?.clave).toBe(`${raffleId}:ana@example.cl`);
  });
});

describe("domain/correo/ledgerCorreos — constructores de clave (ADR-0027 §1)", () => {
  // correo.ledger.003 — cada tipo tiene su clave natural y NINGUNA se puede confundir con otra:
  // el mismo raffle + el mismo email dan claves distintas para resultado y para cada recordatorio.
  it("arma la clave natural de cada tipo y distingue offsets de recordatorio", () => {
    expect(claveConfirmacionCompra({ orderId: "ord_1" })).toBe("ord_1");
    expect(claveResultado({ raffleId: "raf_1", email: "ana@x.cl" })).toBe(
      "raf_1:ana@x.cl",
    );
    expect(
      claveRecordatorio({ raffleId: "raf_1", offsetHoras: 48, email: "ana@x.cl" }),
    ).toBe("raf_1:48:ana@x.cl");
    expect(
      claveRecordatorio({ raffleId: "raf_1", offsetHoras: 6, email: "ana@x.cl" }),
    ).not.toBe(
      claveRecordatorio({ raffleId: "raf_1", offsetHoras: 48, email: "ana@x.cl" }),
    );
  });

  // correo.ledger.004 — la clave se lee de vuelta desde ACÁ y no desde el resolvedor que la
  // consume (F04): el `raffleId` sale entero incluso con emails que traen el separador alrededor.
  // Si esto se rompiera, el resolvedor buscaría un sorteo inexistente y ningún correo saldría.
  it("el raffleId se recupera de la clave de resultado y de la de recordatorio", () => {
    const raffleId = "cmr0gl4pi0001abcd";
    expect(raffleIdDeClave(claveResultado({ raffleId, email: "Ana@X.cl " }))).toBe(
      raffleId,
    );
    expect(
      raffleIdDeClave(
        claveRecordatorio({ raffleId, offsetHoras: 48, email: "ana@x.cl" }),
      ),
    ).toBe(raffleId);
  });
});

describe("domain/correo/ledgerCorreos — filas de resultado del sorteo (F04/C4-C5)", () => {
  const raffleId = "raf_9";

  // correo.ledger.005 — la forma de la tanda: 1 ganador + una por persona distinta, con el ganador
  // excluido POR CLAVE (no por string), y el `email` de cada fila conservando el snapshot original.
  it("produce 1 fila de ganador y una por persona distinta que no ganó", () => {
    const filas = correosDeResultado({
      tenantId: "t1",
      raffleId,
      ganadorEmail: "Bruno@X.cl",
      emails: [
        "ana@x.cl",
        "Ana@X.cl", // la misma persona escrita distinto
        "bruno@x.cl", // el ganador, con otro casing
        " BRUNO@x.cl ",
        "carla@x.cl",
      ],
    });

    expect(filas.map((f) => `${f.tipo} ${f.clave}`)).toEqual([
      `RESULTADO_GANADOR ${raffleId}:bruno@x.cl`,
      `RESULTADO_NO_GANADOR ${raffleId}:ana@x.cl`,
      `RESULTADO_NO_GANADOR ${raffleId}:carla@x.cl`,
    ]);
    // El snapshot del destinatario NO se normaliza: es lo que escribió el Comprador.
    expect(filas[0]!.email).toBe("Bruno@X.cl");
    expect(filas[1]!.email).toBe("ana@x.cl");
    // Y todas llevan el tenant que les pasó el use case (I1).
    expect(filas.every((f) => f.tenantId === "t1")).toBe(true);
  });

  // correo.ledger.006 — un sorteo de UNA sola persona: gana y no hay a quién avisarle que no ganó.
  it("con un solo participante encola solo la fila del ganador", () => {
    const filas = correosDeResultado({
      tenantId: "t1",
      raffleId,
      ganadorEmail: "ana@x.cl",
      emails: ["ana@x.cl", "ana@x.cl"],
    });
    expect(filas).toHaveLength(1);
    expect(filas[0]!.tipo).toBe("RESULTADO_GANADOR");
  });
});
