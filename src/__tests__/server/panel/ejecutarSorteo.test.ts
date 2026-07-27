import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { type AccesoPanel } from "~/server/authPolicy";
import { ejecutarSorteo } from "~/server/domain/panel/ejecutarSorteo";

/**
 * Tests del use case `ejecutarSorteo` (F05 interna) con `db` FAKE STATEFUL. La ejecución es
 * AUDITABLE e IDEMPOTENTE: marca ganador UNA sola vez, registra quién (email) y cuándo, y
 * transiciona ACTIVO→CERRADO. Re-ejecutar NO vuelve a sortear: devuelve el ganador guardado.
 * Scopeado por tenant; sin participantes ⇒ INVALID; raffle ajeno/inexistente ⇒ NOT_FOUND.
 */

const acceso = (tenantIds: string[], email?: string): AccesoPanel => ({
  userId: "u1",
  email: email ?? "org@x.cl",
  tenantIds,
  // ADR-0022: el panel opera la tienda del HOST. Por defecto, el subdominio es el de la
  // tienda del usuario; sin membresía, un host AJENO (el escenario real del fail-closed).
  tenantIdDelHost: tenantIds[0] ?? "AJENO",
});

interface RaffleState {
  id: string;
  tenantId: string;
  estado: string;
  ejecutadoAt: Date | null;
  ganadorEmail: string | null;
  /** Número del sorteo GANADOR (ADR-0024 §5): snapshot hermano de `ganadorEmail`. */
  ganadorNumero: number | null;
  ejecutadoPor: string | null;
}

/** Fila del ledger de correos tal como la escribe `encolarCorreos` (F04/C4-C5). */
interface FilaLedger {
  tenantId: string;
  tipo: string;
  clave: string;
  email: string;
}

/**
 * Entries del fake. `numero` (el Número del sorteo, ADR-0024) es OBLIGATORIO como en la DB: el
 * ticket ganador se identifica por él. Se autonumeran 1..N si el test no le da importancia.
 */
function fakeDb(
  raffle: RaffleState,
  entriesInput: Array<{
    raffleId: string;
    tenantId: string;
    email: string;
    numero?: number;
  }>,
) {
  const entries = entriesInput.map((e, i) => ({ ...e, numero: e.numero ?? i + 1 }));
  /**
   * Ledger de correos del fake (F04). `skipDuplicates` se emula con el MISMO unique de la DB
   * (`[tipo, clave]`) para que "no encola duplicados" signifique acá lo mismo que en Postgres.
   */
  const ledger: FilaLedger[] = [];
  const tx = {
    correoEnviado: {
      createMany: async ({
        data,
        skipDuplicates,
      }: {
        data: FilaLedger[];
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const fila of data) {
          const repetida = ledger.some(
            (f) => f.tipo === fila.tipo && f.clave === fila.clave,
          );
          if (repetida && skipDuplicates) continue;
          ledger.push(fila);
          count++;
        }
        return { count };
      },
    },
    raffle: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === raffle.id && where.tenantId === raffle.tenantId
          ? { ...raffle }
          : null,
      findFirstOrThrow: async () => ({ ...raffle }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; tenantId: string; ejecutadoAt: null };
        data: Partial<RaffleState>;
      }) => {
        // guard atómico: solo si sigue sin ejecutar
        if (where.ejecutadoAt === null && raffle.ejecutadoAt !== null) {
          return { count: 0 };
        }
        Object.assign(raffle, data);
        return { count: 1 };
      },
    },
    raffleEntry: {
      findMany: async ({ where }: { where: { raffleId: string; tenantId: string } }) =>
        entries.filter(
          (e) => e.raffleId === where.raffleId && e.tenantId === where.tenantId,
        ),
    },
  };
  const db = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaClient;
  return { db, raffle, ledger };
}

const AHORA = new Date("2026-02-15T12:00:00Z");

describe("domain/panel/ejecutarSorteo (fake db stateful, auditable + idempotente)", () => {
  // panel.sorteo.ejecutar.001 — ejecuta: elige ganador, marca quién/cuándo, cierra
  it("ejecuta el sorteo: ganador elegido, ejecutadoAt/ejecutadoPor registrados, estado CERRADO", async () => {
    const { db, raffle } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [
        { raffleId: "r1", tenantId: "A", email: "a@x.cl" },
        { raffleId: "r1", tenantId: "A", email: "b@x.cl" },
        { raffleId: "r1", tenantId: "A", email: "c@x.cl" },
      ],
    );
    const res = await ejecutarSorteo({
      db,
      acceso: acceso(["A"], "org@x.cl"),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: () => 1, // elige el 2º (b@x.cl)
    });
    expect(res.ganadorEmail).toBe("b@x.cl");
    expect(res.yaEjecutado).toBe(false);
    expect(res.ejecutadoAt).toEqual(AHORA);
    // persistido en el raffle
    expect(raffle.ganadorEmail).toBe("b@x.cl");
    expect(raffle.ejecutadoAt).toEqual(AHORA);
    expect(raffle.ejecutadoPor).toBe("org@x.cl"); // snapshot del email del ejecutor
    expect(raffle.estado).toBe("CERRADO");
  });

  // panel.sorteo.ejecutar.008 — registra el NÚMERO DEL SORTEO ganador junto al correo (ADR-0024
  //                              §5): "salió el 1057" tiene que ser un hecho auditable, no una
  //                              deducción. Los dos snapshots se escriben en el MISMO update.
  it("registra el Número del sorteo ganador además del correo (tupla auditable en un solo update)", async () => {
    const { db, raffle } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [
        { raffleId: "r1", tenantId: "A", email: "a@x.cl", numero: 1041 },
        { raffleId: "r1", tenantId: "A", email: "b@x.cl", numero: 1057 },
        { raffleId: "r1", tenantId: "A", email: "a@x.cl", numero: 1092 },
      ],
    );
    const res = await ejecutarSorteo({
      db,
      acceso: acceso(["A"], "org@x.cl"),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: () => 1, // el TICKET 1057 (de b@x.cl)
    });

    expect(res.ganadorEmail).toBe("b@x.cl");
    expect(res.ganadorNumero).toBe(1057);
    // Persistido: el ganador es un TICKET concreto, no solo un correo.
    expect(raffle.ganadorEmail).toBe("b@x.cl");
    expect(raffle.ganadorNumero).toBe(1057);
    expect(raffle.ejecutadoAt).toEqual(AHORA);
  });

  // panel.sorteo.ejecutar.009 — el ganador es el TICKET sorteado, no "algún ticket del correo":
  //                             con dos tickets del mismo correo, el número es el de la fila elegida
  it("con dos tickets del MISMO correo registra el número del ticket sorteado, no el primero del correo", async () => {
    const { db, raffle } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [
        { raffleId: "r1", tenantId: "A", email: "a@x.cl", numero: 7 },
        { raffleId: "r1", tenantId: "A", email: "a@x.cl", numero: 8 },
      ],
    );
    await ejecutarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: () => 1, // la SEGUNDA fila de a@x.cl
    });
    expect(raffle.ganadorEmail).toBe("a@x.cl");
    expect(raffle.ganadorNumero).toBe(8);
  });

  // panel.sorteo.ejecutar.002 — IDEMPOTENTE: re-ejecutar NO vuelve a sortear
  it("re-ejecutar devuelve el MISMO ganador sin volver a sortear (idempotente)", async () => {
    const { db } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [
        { raffleId: "r1", tenantId: "A", email: "a@x.cl" },
        { raffleId: "r1", tenantId: "A", email: "b@x.cl" },
      ],
    );
    const elegir = vi.fn<(n: number) => number>().mockReturnValueOnce(0).mockReturnValue(1);

    const primera = await ejecutarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: elegir,
    });
    const segunda = await ejecutarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      ahora: new Date("2027-01-01"),
      elegirIndice: elegir,
    });

    expect(primera.ganadorEmail).toBe("a@x.cl");
    expect(segunda.ganadorEmail).toBe("a@x.cl"); // NO cambió aunque elegir devolvería 1
    expect(segunda.yaEjecutado).toBe(true);
    expect(segunda.ejecutadoAt).toEqual(AHORA); // la fecha original, no la segunda
  });

  // panel.sorteo.ejecutar.007 — draw entre TICKETS (ADR-0012): 3 entries de A + 1 de B ⇒ pool de 4,
  //                             A ocupa 3 de las 4 filas (3× chance); el algoritmo NO cambia
  it("sortea entre TICKETS: con 3 entries de A y 1 de B el pool es de 4 y A puede ganar en 3 de las 4 filas", async () => {
    const entries = [
      { raffleId: "r1", tenantId: "A", email: "a@x.cl" },
      { raffleId: "r1", tenantId: "A", email: "a@x.cl" },
      { raffleId: "r1", tenantId: "A", email: "a@x.cl" },
      { raffleId: "r1", tenantId: "A", email: "b@x.cl" },
    ];
    const nuevoDb = () =>
      fakeDb(
        { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
        entries,
      ).db;

    let pool = 0;
    const ganadorEn = async (idx: number) =>
      (
        await ejecutarSorteo({
          db: nuevoDb(),
          acceso: acceso(["A"]),
          input: { raffleId: "r1" },
          ahora: AHORA,
          elegirIndice: (n) => {
            pool = n;
            return idx;
          },
        })
      ).ganadorEmail;

    // El pool es 4 (los TICKETS), no 2 (los correos distintos): A pesa 3×.
    expect(await ganadorEn(0)).toBe("a@x.cl");
    expect(pool).toBe(4);
    expect(await ganadorEn(2)).toBe("a@x.cl"); // A ocupa las filas 0,1,2
    expect(await ganadorEn(3)).toBe("b@x.cl"); // B, la 4ª fila
  });

  // panel.sorteo.ejecutar.006 — carrera concurrente: el guard atómico pierde (count 0) ⇒
  // devuelve el ganador AUTORITATIVO re-leído, sin re-sortear (idempotencia bajo carrera real)
  it("bajo carrera (updateMany count 0) devuelve el ganador re-leído, descartando su propio sorteo", async () => {
    const ganadorConcurrente = {
      ganadorEmail: "concurrente@x.cl",
      ganadorNumero: 4242,
      ejecutadoAt: new Date("2026-02-10T00:00:00Z"),
      ejecutadoPor: "otro@x.cl",
    };
    // findFirst ve ejecutadoAt:null (pasa el chequeo temprano), pero updateMany devuelve
    // count 0 (otra transacción ganó la carrera entre findFirst y updateMany).
    const tx = {
      raffle: {
        findFirst: async () => ({
          id: "r1",
          ejecutadoAt: null,
          ganadorEmail: null,
          ganadorNumero: null,
          ejecutadoPor: null,
        }),
        updateMany: async () => ({ count: 0 }),
        findFirstOrThrow: async () => ganadorConcurrente,
      },
      raffleEntry: {
        findMany: async () => [
          { email: "a@x.cl", numero: 1 },
          { email: "b@x.cl", numero: 2 },
        ],
      },
    };
    const db = {
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
    } as unknown as PrismaClient;

    const elegir = vi.fn<(n: number) => number>().mockReturnValue(0); // habría elegido a@x.cl
    const res = await ejecutarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: elegir,
    });

    // devuelve el ganador guardado por la ejecución que ganó la carrera, NO su propio pick
    expect(res.ganadorEmail).toBe("concurrente@x.cl");
    expect(res.ganadorNumero).toBe(4242); // también el Número: la tupla auditable viaja entera
    expect(res.yaEjecutado).toBe(true);
    expect(res.ejecutadoAt).toEqual(ganadorConcurrente.ejecutadoAt);
  });

  // panel.sorteo.ejecutar.010 — F04/C4-C5: ejecutar encola los correos de RESULTADO en el ledger,
  //                              DENTRO de la misma $transaction. 1 GANADOR + N NO_GANADOR (un
  //                              email distinto por fila, el ganador excluido de los N).
  it("encola 1 correo de GANADOR y N de NO_GANADOR (emails deduplicados, ganador excluido)", async () => {
    const { db, ledger } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [
        { raffleId: "r1", tenantId: "A", email: "ana@x.cl", numero: 1 },
        { raffleId: "r1", tenantId: "A", email: "bruno@x.cl", numero: 2 },
        // Segundo ticket de ana: es UNA persona, no dos destinatarios.
        { raffleId: "r1", tenantId: "A", email: "ana@x.cl", numero: 3 },
        { raffleId: "r1", tenantId: "A", email: "carla@x.cl", numero: 4 },
      ],
    );

    await ejecutarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: () => 1, // gana el ticket 2 (bruno)
    });

    const ganadores = ledger.filter((f) => f.tipo === "RESULTADO_GANADOR");
    const perdedores = ledger.filter((f) => f.tipo === "RESULTADO_NO_GANADOR");

    expect(ganadores).toHaveLength(1);
    expect(ganadores[0]).toMatchObject({
      tenantId: "A", // el tenant resuelto server-side, jamás un input (I1)
      clave: "r1:bruno@x.cl", // `claveResultado` = raffleId:email normalizado
      email: "bruno@x.cl", // snapshot del destinatario
    });

    // Dos no ganadores DISTINTOS: ana con sus dos tickets recibe UN solo correo.
    expect(perdedores.map((f) => f.email).sort()).toEqual(["ana@x.cl", "carla@x.cl"]);
    // Y el ganador no aparece entre ellos: nadie recibe "ganaste" y "no ganaste" a la vez.
    expect(perdedores.map((f) => f.email)).not.toContain("bruno@x.cl");
  });

  // panel.sorteo.ejecutar.011 — la dedup es por IDENTIDAD (la clave), no por el string del email:
  //                              el mismo comprador escrito con otro casing es UNA persona. Sin
  //                              esto, el ganador recibiría además el "no ganaste" (las claves sin
  //                              normalizar son distintas y el unique es [tipo, clave]).
  it("dos casings del mismo correo son UNA persona: el ganador no recibe además el de no ganador", async () => {
    const { db, ledger } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [
        { raffleId: "r1", tenantId: "A", email: "Ana@X.cl", numero: 1 },
        { raffleId: "r1", tenantId: "A", email: "ana@x.cl", numero: 2 },
        { raffleId: "r1", tenantId: "A", email: " BRUNO@x.cl ", numero: 3 },
        { raffleId: "r1", tenantId: "A", email: "bruno@x.cl", numero: 4 },
      ],
    );

    await ejecutarSorteo({
      db,
      acceso: acceso(["A"]),
      input: { raffleId: "r1" },
      ahora: AHORA,
      elegirIndice: () => 0, // gana el ticket 1, de `Ana@X.cl`
    });

    const ganadores = ledger.filter((f) => f.tipo === "RESULTADO_GANADOR");
    const perdedores = ledger.filter((f) => f.tipo === "RESULTADO_NO_GANADOR");

    expect(ganadores).toHaveLength(1);
    // El snapshot conserva lo que escribió el Comprador; lo que se normaliza es la CLAVE.
    expect(ganadores[0]!.email).toBe("Ana@X.cl");
    expect(ganadores[0]!.clave).toBe("r1:ana@x.cl");

    // Bruno, con sus dos escrituras, es UN destinatario. Y ana no está: ya es la ganadora.
    expect(perdedores).toHaveLength(1);
    expect(perdedores[0]!.clave).toBe("r1:bruno@x.cl");
  });

  // panel.sorteo.ejecutar.012 — re-ejecutar (o el replay de un doble click) NO encola una segunda
  //                             tanda: el correo de resultado sale UNA vez por sorteo (I2).
  it("re-ejecutar el sorteo no encola una segunda tanda de correos", async () => {
    const { db, ledger } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [
        { raffleId: "r1", tenantId: "A", email: "ana@x.cl", numero: 1 },
        { raffleId: "r1", tenantId: "A", email: "bruno@x.cl", numero: 2 },
      ],
    );
    const ejecutar = () =>
      ejecutarSorteo({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "r1" },
        ahora: AHORA,
        elegirIndice: () => 0,
      });

    await ejecutar();
    const despuesDeLaPrimera = [...ledger];
    await ejecutar();
    await ejecutar();

    expect(ledger).toEqual(despuesDeLaPrimera);
    expect(ledger).toHaveLength(2); // 1 ganador + 1 no ganador, no 3 tandas
  });

  // panel.sorteo.ejecutar.003 — sin participantes ⇒ INVALID (no se puede sortear)
  it("un sorteo sin participantes ⇒ INVALID", async () => {
    const { db } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [],
    );
    await expect(
      ejecutarSorteo({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "r1" },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  // panel.sorteo.ejecutar.004 — raffle de OTRA Tienda ⇒ NOT_FOUND
  it("un raffle de otra Tienda ⇒ NOT_FOUND", async () => {
    const { db } = fakeDb(
      { id: "rB", tenantId: "B", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [{ raffleId: "rB", tenantId: "B", email: "x@x.cl" }],
    );
    await expect(
      ejecutarSorteo({
        db,
        acceso: acceso(["A"]),
        input: { raffleId: "rB" },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // panel.sorteo.ejecutar.005 — sin membresía ⇒ FORBIDDEN
  it("sin membresía ⇒ FORBIDDEN", async () => {
    const { db } = fakeDb(
      { id: "r1", tenantId: "A", estado: "ACTIVO", ejecutadoAt: null, ganadorEmail: null, ganadorNumero: null, ejecutadoPor: null },
      [{ raffleId: "r1", tenantId: "A", email: "a@x.cl" }],
    );
    await expect(
      ejecutarSorteo({
        db,
        acceso: acceso([]),
        input: { raffleId: "r1" },
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
