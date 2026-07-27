import { type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { bloquesDeNumerosDelSorteo } from "~/lib/numerosDelSorteo";
import { verificarTickets } from "~/server/domain/checkout/verificarTickets";

/**
 * Tests del use case `verificarTickets` (verificador-tickets F01): el Comprador ingresa SU correo en
 * `/verificar` y recibe los **Números del sorteo ACTIVO** de esa Tienda (ADR-0024). Sin cuenta
 * (ADR-0004), tenant-scoped por el contexto (I1) y con cero PII en la respuesta (I2/D1).
 *
 * Fake db (mismo criterio que `getEstadoOrden.test.ts`): modela lo que de verdad importa demostrar —
 * el filtro por tenant, el filtro por `estado: ACTIVO` y el matching insensible del correo — y falla
 * ruidosamente si el use case consulta algo que no debía.
 */

interface EntryFake {
  tenantId: string;
  raffleId: string;
  /** Correo tal cual quedó snapshoteado al pagar (puede venir con mayúsculas/espacios). */
  email: string;
  numero: number;
}

interface RaffleFake {
  id: string;
  tenantId: string;
  nombre: string;
  estado: "ACTIVO" | "CERRADO";
  prefijoTicket: string | null;
  createdAt: number;
}

interface Llamadas {
  raffle: number;
  entries: number;
}

/** Fake db + el registro de llamadas, para poder afirmar «no consultó entries». */
function fakeDb(raffles: RaffleFake[], entries: EntryFake[]): { db: PrismaClient; llamadas: Llamadas } {
  const llamadas: Llamadas = { raffle: 0, entries: 0 };
  const db = {
    raffle: {
      findFirst: async ({
        where,
      }: {
        where: { tenantId: string; estado: string };
      }) => {
        llamadas.raffle += 1;
        const encontrados = raffles
          .filter((r) => r.tenantId === where.tenantId && r.estado === where.estado)
          .sort((a, b) => b.createdAt - a.createdAt);
        const r = encontrados[0];
        if (!r) return null;
        // Proyección: el use case pide id + nombre + el prefijo por la relación con el tenant.
        return { id: r.id, nombre: r.nombre, tenant: { prefijoTicket: r.prefijoTicket } };
      },
    },
    raffleEntry: {
      findMany: async ({
        where,
      }: {
        where: {
          raffleId: string;
          tenantId: string;
          email: { equals: string; mode: "insensitive" };
        };
      }) => {
        llamadas.entries += 1;
        // El fake exige `mode: "insensitive"` explícito: si el use case lo perdiera, el matching
        // pasaría a ser sensible a mayúsculas contra Postgres y este fake lo delata (D6).
        expect(where.email.mode).toBe("insensitive");
        const buscado = where.email.equals.toLowerCase();
        return entries
          .filter(
            (e) =>
              e.raffleId === where.raffleId &&
              e.tenantId === where.tenantId &&
              // Solo plegado de mayúsculas, SIN trim del lado almacenado: es exactamente lo que hace
              // `mode:"insensitive"` en Postgres. Un fake que además trimeara sería más permisivo que
              // la DB real y taparía el día que el snapshot guardado traiga espacios (blocker
              // potencial cazado por el backend-reviewer).
              e.email.toLowerCase() === buscado,
          )
          .map((e) => ({ numero: e.numero }))
          .sort((a, b) => a.numero - b.numero);
      },
    },
  } as unknown as PrismaClient;
  return { db, llamadas };
}

const TENANT_A = "tenant-A";

/** Gate del limitador siempre abierto: el caso «cuota agotada» tiene su propio test. */
const sinLimite = () => true;

/** El sorteo ACTIVO por defecto de la Tienda del test. */
const raffleActivo = (over: Partial<RaffleFake>): RaffleFake => ({
  id: "r-activo",
  tenantId: TENANT_A,
  nombre: "Sorteo de lanzamiento",
  estado: "ACTIVO",
  prefijoTicket: null,
  createdAt: 2,
  ...over,
});

describe("domain/checkout/verificarTickets (sorteo ACTIVO, tenant-scoped, sin PII)", () => {
  // verificar.001 — el caso central: un correo con tickets de VARIAS órdenes recibe TODOS sus
  // números del sorteo activo, con el prefijo de la Tienda y el nombre del sorteo (D1/D12).
  it("devuelve todos los Números del sorteo activo de ese correo, con prefijo y nombre del sorteo", async () => {
    const { db } = fakeDb(
      [
        {
          id: "r-activo",
          tenantId: TENANT_A,
          nombre: "Sorteo de lanzamiento",
          estado: "ACTIVO",
          prefijoTicket: "ARMY",
          createdAt: 2,
        },
      ],
      [
        // Dos órdenes distintas del mismo correo ⇒ dos tramos de números.
        { tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 7 },
        { tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 8 },
        { tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 15 },
        // Otro comprador del MISMO sorteo: no debe aparecer.
        { tenantId: TENANT_A, raffleId: "r-activo", email: "otro@ejemplo.cl", numero: 9 },
      ],
    );

    const res = await verificarTickets({
      db,
      tenantId: TENANT_A,
      email: "ana@ejemplo.cl",
      permitirIntento: sinLimite,
    });

    expect(res).toEqual({
      sorteo: { nombre: "Sorteo de lanzamiento" },
      numeros: [7, 8, 15],
      prefijo: "ARMY",
    });
  });

  // verificar.002 — D6: el matching ignora las MAYÚSCULAS del correo guardado y los ESPACIOS de lo
  // que se tipea. Quien compró con `Ana@Gmail.com` y pega `  ana@gmail.com  ` encuentra sus tickets.
  //
  // La asimetría es a propósito y hay que leerla literal: `mode:"insensitive"` de Postgres pliega
  // mayúsculas y NADA MÁS — no trimea el valor almacenado. El trim solo corre sobre lo tipeado (en
  // el schema Zod y otra vez en el use case). No hace falta más: `iniciarCheckoutInput` valida el
  // correo con Zod antes de que se snapshotee en `Order.email` → `RaffleEntry.email`, así que una
  // entry con espacios colgando no puede existir. Si algún día pudiera, este test tiene que
  // volverse rojo — por eso el fake db NO trimea el lado almacenado.
  it("encuentra los tickets aunque cambien las mayúsculas del correo guardado y sobren espacios en lo tipeado", async () => {
    const { db } = fakeDb(
      [raffleActivo({ prefijoTicket: "ARMY" })],
      [{ tenantId: TENANT_A, raffleId: "r-activo", email: "Ana@Gmail.com", numero: 42 }],
    );

    const res = await verificarTickets({
      db,
      tenantId: TENANT_A,
      email: "  ana@gmail.com  ",
      permitirIntento: sinLimite,
    });

    expect(res.numeros).toEqual([42]);
  });

  // verificar.003 — D4 (anti-enumeración): un correo sin tickets devuelve la MISMA forma con
  // `numeros: []`. No hay ninguna señal que distinga «nunca compró» de «compró sin tickets»: las
  // dos respuestas son byte-idénticas, que es justo lo que impide usar la página como oráculo.
  it("un correo sin tickets devuelve la misma forma con numeros vacío", async () => {
    const { db } = fakeDb(
      [raffleActivo({ prefijoTicket: "ARMY" })],
      [{ tenantId: TENANT_A, raffleId: "r-activo", email: "otra@ejemplo.cl", numero: 3 }],
    );

    const jamasCompro = await verificarTickets({
      db,
      tenantId: TENANT_A,
      email: "desconocida@ejemplo.cl",
      permitirIntento: sinLimite,
    });
    const comproSinTickets = await verificarTickets({
      db,
      tenantId: TENANT_A,
      email: "compro.pero.sin.tickets@ejemplo.cl",
      permitirIntento: sinLimite,
    });

    expect(jamasCompro).toEqual({
      sorteo: { nombre: "Sorteo de lanzamiento" },
      numeros: [],
      prefijo: "ARMY",
    });
    expect(comproSinTickets).toEqual(jamasCompro);
  });

  // verificar.004 — D2: sin sorteo ACTIVO no hay nada que verificar Y la query de entries NO corre.
  // Que no corra es parte de la decisión, no una optimización: la página sin sorteo no ofrece
  // búsqueda, así que el use case tampoco debe ir a buscar.
  it("sin sorteo ACTIVO devuelve sorteo null y numeros vacío, sin consultar entries", async () => {
    const { db, llamadas } = fakeDb(
      [{ ...raffleActivo({}), estado: "CERRADO" }],
      [{ tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 7 }],
    );

    const res = await verificarTickets({
      db,
      tenantId: TENANT_A,
      email: "ana@ejemplo.cl",
      permitirIntento: sinLimite,
    });

    expect(res).toEqual({ sorteo: null, numeros: [], prefijo: null });
    expect(llamadas.entries).toBe(0);
  });

  // verificar.005 — I1 (tenancy): el MISMO correo con tickets en otra Tienda no cruza. El tenant
  // sale del contexto (subdominio), no del input; acá se demuestra con dos Tiendas y un solo correo.
  it("el mismo correo con tickets en OTRA Tienda no aparece", async () => {
    const { db } = fakeDb(
      [
        raffleActivo({ prefijoTicket: "ARMY" }),
        {
          id: "r-otra",
          tenantId: "tenant-B",
          nombre: "Sorteo ajeno",
          estado: "ACTIVO",
          prefijoTicket: "BTS",
          createdAt: 2,
        },
      ],
      [
        { tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 5 },
        { tenantId: "tenant-B", raffleId: "r-otra", email: "ana@ejemplo.cl", numero: 900 },
      ],
    );

    const res = await verificarTickets({
      db,
      tenantId: TENANT_A,
      email: "ana@ejemplo.cl",
      permitirIntento: sinLimite,
    });

    expect(res.numeros).toEqual([5]);
    expect(res.sorteo).toEqual({ nombre: "Sorteo de lanzamiento" });
    expect(res.prefijo).toBe("ARMY");
  });

  // verificar.006 — I4/D11: los tickets de un sorteo CERRADO de la MISMA Tienda no salen por acá.
  // El histórico y el «ganaste» están fuera de alcance a propósito: esta superficie corre bajo el
  // sorteo activo y nada más.
  it("los tickets de un sorteo CERRADO de la misma Tienda no aparecen", async () => {
    const { db } = fakeDb(
      [
        raffleActivo({ prefijoTicket: "ARMY" }),
        {
          id: "r-viejo",
          tenantId: TENANT_A,
          nombre: "Sorteo del año pasado",
          estado: "CERRADO",
          prefijoTicket: "ARMY",
          createdAt: 1,
        },
      ],
      [
        { tenantId: TENANT_A, raffleId: "r-viejo", email: "ana@ejemplo.cl", numero: 300 },
        { tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 4 },
      ],
    );

    const res = await verificarTickets({
      db,
      tenantId: TENANT_A,
      email: "ana@ejemplo.cl",
      permitirIntento: sinLimite,
    });

    expect(res.numeros).toEqual([4]);
    expect(res.sorteo).toEqual({ nombre: "Sorteo de lanzamiento" });
  });

  // verificar.007 — I2: la respuesta es EXACTAMENTE `{sorteo, numeros, prefijo}`. Ni el correo
  // buscado se ecoa desde el server (que sería el único dato personal que podría colarse "por
  // comodidad"), ni hay dónde meter nada de un tercero.
  it("la respuesta es exactamente { sorteo, numeros, prefijo } — cero PII, ni el correo buscado", async () => {
    const { db } = fakeDb(
      [raffleActivo({ prefijoTicket: "ARMY" })],
      [{ tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 12 }],
    );

    const res = await verificarTickets({
      db,
      tenantId: TENANT_A,
      email: "ana@ejemplo.cl",
      permitirIntento: sinLimite,
    });

    expect(Object.keys(res).sort()).toEqual(["numeros", "prefijo", "sorteo"]);
    expect(Object.keys(res.sorteo ?? {})).toEqual(["nombre"]);
    expect(JSON.stringify(res)).not.toContain("@"); // ningún correo, tampoco el propio
  });

  // verificar.008 — D5: con la cuota agotada el use case corta ANTES de la DB. Que no toque la DB
  // es la mitad del valor del gate (si igual consultara, el rate limit no protegería nada).
  it("con la cuota agotada lanza TOO_MANY_REQUESTS sin tocar la DB", async () => {
    const { db, llamadas } = fakeDb(
      [raffleActivo({ prefijoTicket: "ARMY" })],
      [{ tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 7 }],
    );

    await expect(
      verificarTickets({
        db,
        tenantId: TENANT_A,
        email: "ana@ejemplo.cl",
        permitirIntento: () => false,
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    expect(llamadas).toEqual({ raffle: 0, entries: 0 });
  });

  // verificar.009 — una Tienda sin prefijo configurado devuelve `prefijo: null`, y el par
  // (números, prefijo) pasado por el punto ÚNICO de presentación (I3) da los números desnudos:
  // exactamente lo mismo que ya dicen el correo de confirmación y el retorno post-pago.
  it("una Tienda sin prefijo devuelve prefijo null y sus números se presentan desnudos", async () => {
    const { db } = fakeDb(
      [raffleActivo({ prefijoTicket: null })],
      [
        { tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 8 },
        { tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 7 },
        { tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 9 },
        { tenantId: TENANT_A, raffleId: "r-activo", email: "ana@ejemplo.cl", numero: 15 },
      ],
    );

    const res = await verificarTickets({
      db,
      tenantId: TENANT_A,
      email: "ana@ejemplo.cl",
      permitirIntento: sinLimite,
    });

    expect(res.prefijo).toBeNull();
    expect(bloquesDeNumerosDelSorteo(res.numeros, res.prefijo)).toEqual(["7–9", "15"]);
  });
});
