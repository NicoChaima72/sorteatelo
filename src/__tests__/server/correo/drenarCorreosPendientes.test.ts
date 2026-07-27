import { type CorreoEnviadoType } from "@prisma/client";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { db } from "~/server/db";
import {
  drenarCorreosPendientes,
  type FilaPendiente,
  type ResolvedorDeCorreos,
} from "~/server/domain/correo/drenarCorreosPendientes";
import { encolarCorreos } from "~/server/domain/correo/ledgerCorreos";
import { CorreoError, type CorreoInput } from "~/server/services/correo";

/**
 * Tests DB-backed del DRENADO del ledger (F02, ADR-0027 §2/§5). Van contra Postgres real porque
 * todo lo que importa acá es transiciones de estado de una fila bajo fallas: el claim CAS sobre
 * `intentos`, la devolución del intento cuando la cuota se agota (I9) y la degradación a FALLIDO
 * al tercer fallo REAL. Un fake de Prisma probaría la aritmética del use case, no el protocolo.
 *
 * Fixtures con slug `test-drenado-<pid>-*`, limpiados antes y después.
 *
 * **Presupuesto de tiempo**: cada operación de Prisma contra el pooler remoto cuesta ~0,6 s
 * medidos (Chile → Supabase, con el BEGIN/COMMIT por statement del modo pooled). Una corrida del
 * drenado son 3-4 operaciones, y los tests que ejercen el presupuesto de reintentos hacen 3 o 4
 * corridas SEGUIDAS más sus lecturas: ~25 operaciones ≈ 17 s en el mejor caso, y el doble cuando
 * hay otros archivos golpeando el mismo pooler en paralelo. El default de 30 s del
 * `vitest.config.ts` (pensado para tests DB-backed normales) los deja justo en el filo — se
 * reprodujo el timeout. Se sube ACÁ, no en la config global, y sin tocar una sola aserción: lo
 * lento es la red, no el use case.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

/**
 * Prefijo ÚNICO POR PROCESO. **No es cosmética de nombres**: en este repo es normal que dos
 * corridas de vitest peguen a la MISMA DB remota a la vez (varios carriles en paralelo, y alguno
 * corriendo la suite completa mientras otro filtra). Las dos ejecutan ESTE archivo, y con un
 * prefijo fijo el `beforeEach` de una borra los fixtures VIVOS de la otra a mitad de test —
 * reproducido 2026-07-26: `filas` del tenant volvía vacío después de un drenado que sí había
 * funcionado.
 */
const PREFIJO = `test-drenado-${process.pid}-`;
/** Prefijo de la FAMILIA: se usa SOLO para barrer huérfanos de corridas que murieron sin limpiar. */
const PREFIJO_FAMILIA = "test-drenado-";
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

/**
 * Raffle falso de un fixture. **Se deriva del `tenantId` (un cuid) y no es un literal**: el
 * `@@unique([tipo, clave])` del ledger NO lleva `tenantId` a propósito (schema: la clave ya viene
 * namespaceada por un id tenant-bound), así que una clave literal como `raf_x:fan0@example.cl` es
 * global de verdad. Dos corridas de vitest a la vez contra la misma DB —lo normal acá— chocaban en
 * esa clave y el `createMany({ skipDuplicates })` del fixture se saltaba TODO en silencio: el test
 * no fallaba por una fila borrada sino por filas que nunca se crearon. Derivarla del cuid es
 * además lo que hace producción (`raffleId`/`orderId` reales).
 */
function raffleDe(tenantId: string): string {
  return `raf-${tenantId}`;
}

/** Encola N correos de resultado (claves distintas) y devuelve las filas creadas, en orden. */
async function encolarN(tenantId: string, n: number) {
  await encolarCorreos({
    db,
    correos: Array.from({ length: n }, (_v, i) => ({
      tenantId,
      tipo: "RESULTADO_NO_GANADOR" as const,
      clave: `${raffleDe(tenantId)}:fan${i}@example.cl`,
      email: `fan${i}@example.cl`,
    })),
  });
  return db.correoEnviado.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/**
 * Resolvedor acotado al tenant del test. **No es cosmética de aislamiento: es la única forma
 * correcta de testear este use case.** El drenado es un job de PLATAFORMA y mira la cola ENTERA
 * (así debe ser en producción); vitest corre los archivos en paralelo contra la MISMA DB remota,
 * así que sin esto un test de acá reclamaría y marcaría ENVIADO las filas de `ledgerCorreos.test`
 * —o de cualquier archivo futuro que encole, como el de `aplicarEfectosPostPago` en F03— y los
 * pondría rojos por turnos. Filtrando en el resolvedor, las filas ajenas se saltan INTACTAS, que
 * es exactamente lo que hace un resolvedor real con un tipo que no le compete.
 *
 * Declara `tipos` como cualquier resolvedor real (F04): son el filtro que el drenado aplica ANTES
 * del `take`. Los fixtures de este archivo encolan `RESULTADO_NO_GANADOR`.
 */
function resolverSoloDe(
  tenantId: string,
  tipos: readonly CorreoEnviadoType[] = ["RESULTADO_NO_GANADOR"],
): ResolvedorDeCorreos {
  return {
    tipos,
    armar: async (filas: FilaPendiente[]) =>
      new Map<string, CorreoInput>(
        filas
          .filter((f) => f.tenantId === tenantId)
          .map((f) => [
            f.id,
            {
              from: "Tienda · vía Sortéatelo <no-reply@sorteatelo.cl>",
              to: f.email,
              subject: "s",
              text: "t",
            },
          ]),
      ),
  };
}

/**
 * Ventana amplia a propósito: la cola es FIFO global y el fixture es lo MÁS NUEVO. Con el default
 * de 100, filas ajenas más viejas podrían llenar la ventana y dejar el fixture fuera de la corrida.
 */
const VENTANA = 1_000;

/**
 * El drenado tiene un **lease por edad**: no vuelve a tocar una fila ya reclamada hasta que el
 * reclamo esté viejo (si no, una corrida solapada la reenviaría — `correo.drenado.009`). Los tests
 * que ejercen corridas SUCESIVAS son, por definición, corridas de horas distintas: en vez de
 * dormir, le pasan un `ahora` adelantado. Es más fiel que un fake de reloj — el cron es horario.
 */
function horaDeCorrida(n: number): Date {
  return new Date(Date.now() + n * 60 * 60 * 1000);
}

/** Adapter de correo fake: devuelve ids sintéticos y registra cada lote con sus opciones. */
function correoFake() {
  const lotes: CorreoInput[][] = [];
  const claves: (string | undefined)[] = [];
  return {
    lotes,
    claves,
    enviarLote: async (
      inputs: CorreoInput[],
      opciones?: { idempotencyKey?: string },
    ) => {
      lotes.push(inputs);
      claves.push(opciones?.idempotencyKey);
      return { ids: inputs.map((_i, n) => `resend-${lotes.length}-${n}`) };
    },
  };
}

describe("domain/correo/drenarCorreosPendientes — claim → send → confirm", () => {
  // correo.drenado.001 — el camino feliz completo: la fila PENDIENTE sale y queda ENVIADO con el
  // id del proveedor. Lo que se verifica es el ESTADO FINAL en la DB, no que se haya llamado a un
  // mock: es lo único que sobrevive a un rediseño del use case.
  it("envía las filas PENDIENTE y las deja ENVIADO con proveedorId y enviadoAt", async () => {
    const tenant = await crearTenant("feliz");
    await encolarN(tenant.id, 3);
    const correo = correoFake();

    const res = await drenarCorreosPendientes({
      db,
      correo,
      resolvedor: resolverSoloDe(tenant.id),
      limite: VENTANA,
    });

    expect(res.enviados).toBe(3);
    // Un solo lote: el motivo de existir del batch (3 llamadas para 250, no 250).
    expect(correo.lotes).toHaveLength(1);
    expect(correo.lotes[0]).toHaveLength(3);

    const filas = await db.correoEnviado.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(filas.map((f) => f.estado)).toEqual([
      "ENVIADO",
      "ENVIADO",
      "ENVIADO",
    ]);
    expect(filas.map((f) => f.proveedorId)).toEqual([
      "resend-1-0",
      "resend-1-1",
      "resend-1-2",
    ]);
    for (const fila of filas) {
      expect(fila.enviadoAt).toBeInstanceOf(Date);
      // El intento se consume al reclamar: una fila ENVIADA gastó exactamente uno.
      expect(fila.intentos).toBe(1);
    }
  });

  // correo.drenado.009 — **la propiedad central de I2, y la que el CAS solo NO sostiene**: dos
  // drenados SOLAPADOS sobre la misma fila mandan UN correo, no dos. El CAS compara `intentos`, así
  // que solo frena a la corrida que leyó ANTES del claim; una que lee DESPUÉS del claim y antes del
  // confirm (la fila sigue PENDIENTE durante todo el envío, que puede tardar segundos de red) gana
  // el CAS legítimamente y reenvía. No es teórico: es exactamente lo que pasa cuando el `waitUntil`
  // post-pago de F03 drena mientras corre el cron, o cuando Vercel duplica una invocación.
  it("dos corridas solapadas sobre la misma fila envían UNA sola vez", async () => {
    const tenant = await crearTenant("solapado");
    await encolarN(tenant.id, 1);

    // La corrida A se queda "en la red" hasta que el test la libera: es la ventana donde la fila
    // ya está reclamada pero todavía no confirmada.
    let liberar!: () => void;
    const enVuelo = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    const lotesA: CorreoInput[][] = [];
    const correoA = {
      enviarLote: async (inputs: CorreoInput[]) => {
        lotesA.push(inputs);
        await enVuelo;
        return { ids: ["resend-a"] };
      },
    };

    const corridaA = drenarCorreosPendientes({
      db,
      correo: correoA,
      resolvedor: resolverSoloDe(tenant.id),
      limite: VENTANA,
    });
    // Esperar a que A haya reclamado y esté efectivamente enviando.
    while (lotesA.length === 0) await new Promise((r) => setTimeout(r, 50));

    // B entra con la fila reclamada-pero-PENDIENTE. No debe mandar nada.
    const correoB = correoFake();
    await drenarCorreosPendientes({
      db,
      correo: correoB,
      resolvedor: resolverSoloDe(tenant.id),
      limite: VENTANA,
    });

    liberar();
    await corridaA;

    expect(correoB.lotes).toHaveLength(0);
    const filas = await db.correoEnviado.findMany({ where: { tenantId: tenant.id } });
    expect(filas).toHaveLength(1);
    // Un solo envío ⇒ un solo intento gastado y el id del proveedor de A.
    expect(filas[0]?.estado).toBe("ENVIADO");
    expect(filas[0]?.intentos).toBe(1);
    expect(filas[0]?.proveedorId).toBe("resend-a");
  });

  // correo.drenado.002 — la corrida siguiente no tiene nada que hacer: una fila ENVIADO jamás
  // vuelve a salir (I2). Sin esto, el cron horario reenviaría todo el historial cada hora.
  it("una segunda corrida no reenvía lo ya ENVIADO", async () => {
    const tenant = await crearTenant("idempotente");
    await encolarN(tenant.id, 2);

    await drenarCorreosPendientes({
      db,
      correo: correoFake(),
      resolvedor: resolverSoloDe(tenant.id),
      limite: VENTANA,
    });
    const segundo = correoFake();
    const res = await drenarCorreosPendientes({
      db,
      correo: segundo,
      resolvedor: resolverSoloDe(tenant.id),
      limite: VENTANA,
    });

    expect(res.enviados).toBe(0);
    expect(segundo.lotes).toHaveLength(0);
  });
});

describe("domain/correo/drenarCorreosPendientes — cuota agotada (I9 / ADR-0027 §5)", () => {
  // correo.drenado.003 — EL test de I9. Con Resend Free (100/día) un blast se corta a la mitad, y
  // eso NO es un fallo del correo: las filas que no salieron tienen que quedar PENDIENTE **con el
  // intento devuelto**. Si consumieran intento, tres días de cuota agotada dejarían FALLIDO a
  // correos perfectamente sanos. Y las que SÍ salieron se confirman: reenviarlas sería duplicar (I2).
  it("un 429 a mitad de lote confirma lo enviado y devuelve el intento de lo que quedó", async () => {
    const tenant = await crearTenant("cuota");
    await encolarN(tenant.id, 5);

    const correo = {
      // Los 2 primeros salieron; el proveedor cortó por cuota antes del resto.
      enviarLote: (): Promise<{ ids: string[] }> =>
        Promise.reject(
          new CorreoError("Resend respondió 429: Daily quota exceeded.", {
            status: 429,
            idsParciales: ["resend-a", "resend-b"],
          }),
        ),
    };

    const res = await drenarCorreosPendientes({
      db,
      correo,
      resolvedor: resolverSoloDe(tenant.id),
      limite: VENTANA,
    });

    expect(res.detenidoPorCuota).toBe(true);
    expect(res.enviados).toBe(2);

    const filas = await db.correoEnviado.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(filas.slice(0, 2).map((f) => f.estado)).toEqual([
      "ENVIADO",
      "ENVIADO",
    ]);
    expect(filas.slice(0, 2).map((f) => f.proveedorId)).toEqual([
      "resend-a",
      "resend-b",
    ]);

    const esperando = filas.slice(2);
    expect(esperando.map((f) => f.estado)).toEqual([
      "PENDIENTE",
      "PENDIENTE",
      "PENDIENTE",
    ]);
    // El corazón de I9: presupuesto INTACTO. Mañana se drenan sin haber gastado nada.
    expect(esperando.map((f) => f.intentos)).toEqual([0, 0, 0]);
    expect(esperando[0]?.ultimoError).toMatch(/429/);
  });

  // correo.drenado.004 — la consecuencia acumulada: tres corridas seguidas contra la cuota no
  // degradan NADA a FALLIDO. Es la garantía que I9 promete y que un `intentos--` mal puesto
  // rompería en silencio.
  it("tres corridas con cuota agotada no degradan ninguna fila a FALLIDO", async () => {
    const tenant = await crearTenant("cuota-repetida");
    await encolarN(tenant.id, 2);

    const correo = {
      enviarLote: (): Promise<{ ids: string[] }> =>
        Promise.reject(
          new CorreoError("Resend respondió 429: Too many requests.", {
            status: 429,
          }),
        ),
    };

    for (let i = 0; i < 3; i++) {
      await drenarCorreosPendientes({
        db,
        correo,
        resolvedor: resolverSoloDe(tenant.id),
        limite: VENTANA,
        ahora: horaDeCorrida(i),
      });
    }

    const filas = await db.correoEnviado.findMany({
      where: { tenantId: tenant.id },
    });
    expect(filas.map((f) => f.estado)).toEqual(["PENDIENTE", "PENDIENTE"]);
    expect(filas.map((f) => f.intentos)).toEqual([0, 0]);
  });
});

describe("domain/correo/drenarCorreosPendientes — fallo real y sweeper (ADR-0027 §5)", () => {
  // correo.drenado.005 — un fallo REAL sí gasta presupuesto, y al tercero la fila queda FALLIDO
  // y VISIBLE con su último error. El contraste con `drenado.004` es el punto: mismo número de
  // corridas, resultado opuesto, porque 429 y 500 no son lo mismo.
  it("un fallo real se reintenta hasta 3 veces y recién ahí degrada a FALLIDO con ultimoError", async () => {
    const tenant = await crearTenant("fallo");
    await encolarN(tenant.id, 1);

    const correo = {
      enviarLote: (): Promise<{ ids: string[] }> =>
        Promise.reject(
          new CorreoError("Resend respondió 500: Internal error.", {
            status: 500,
          }),
        ),
    };

    const estados: string[] = [];
    for (let i = 0; i < 3; i++) {
      await drenarCorreosPendientes({
        db,
        correo,
        resolvedor: resolverSoloDe(tenant.id),
        limite: VENTANA,
        ahora: horaDeCorrida(i),
      });
      const fila = await db.correoEnviado.findFirstOrThrow({
        where: { tenantId: tenant.id },
      });
      estados.push(`${fila.estado}:${fila.intentos}`);
    }

    // Las dos primeras corridas dejan la fila viva; la tercera agota el presupuesto.
    expect(estados).toEqual([
      "PENDIENTE:1",
      "PENDIENTE:2",
      "FALLIDO:3",
    ]);

    const fila = await db.correoEnviado.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    expect(fila.ultimoError).toMatch(/500/);
    expect(fila.enviadoAt).toBeNull();

    // Una corrida más ya no la toca: FALLIDO es terminal para el cron (lo retoma un humano).
    const cuarto = correoFake();
    await drenarCorreosPendientes({
      db,
      correo: cuarto,
      resolvedor: resolverSoloDe(tenant.id),
      limite: VENTANA,
      ahora: horaDeCorrida(3),
    });
    expect(cuarto.lotes).toHaveLength(0);
  });

  // correo.drenado.008 — la SEGUNDA línea de defensa de ADR-0027 §6. El ledger no cubre una
  // ventana: si el proceso muere DESPUÉS de que Resend aceptó y ANTES del confirm, la fila queda
  // PENDIENTE y la corrida siguiente la reenvía. La `Idempotency-Key` de Resend (24 h) tapa eso —
  // pero solo si el reintento del MISMO conjunto de filas usa la MISMA clave. Por eso se deriva
  // del contenido (los ids de las filas reclamadas) y no de la hora ni de un contador.
  it("reintentar el mismo conjunto de filas usa la misma Idempotency-Key; un conjunto distinto, otra", async () => {
    const tenant = await crearTenant("idem-key");
    await encolarN(tenant.id, 2);

    // Dos corridas que fallan: las filas vuelven a PENDIENTE con el intento gastado, así que la
    // segunda corrida ve EL MISMO conjunto.
    const claves: (string | undefined)[] = [];
    for (let i = 0; i < 2; i++) {
      const correo = {
        enviarLote: (
          _inputs: CorreoInput[],
          opciones?: { idempotencyKey?: string },
        ): Promise<{ ids: string[] }> => {
          claves.push(opciones?.idempotencyKey);
          return Promise.reject(
            new CorreoError("Resend respondió 500: Internal error.", {
              status: 500,
            }),
          );
        },
      };
      await drenarCorreosPendientes({
        db,
        correo,
        resolvedor: resolverSoloDe(tenant.id),
        limite: VENTANA,
        ahora: horaDeCorrida(i),
      });
    }

    expect(claves[0]).toBeTruthy();
    expect(claves[1]).toBe(claves[0]);

    // Una fila más ⇒ conjunto distinto ⇒ clave distinta (si no, Resend devolvería la respuesta
    // cacheada del conjunto viejo y el correo nuevo no saldría nunca).
    await encolarCorreos({
      db,
      correos: [
        {
          tenantId: tenant.id,
          tipo: "RESULTADO_NO_GANADOR",
          clave: `${raffleDe(tenant.id)}:nuevo@example.cl`,
          email: "nuevo@example.cl",
        },
      ],
    });
    const tercero = correoFake();
    await drenarCorreosPendientes({
      db,
      correo: tercero,
      resolvedor: resolverSoloDe(tenant.id),
      limite: VENTANA,
      ahora: horaDeCorrida(2),
    });
    expect(tercero.claves[0]).not.toBe(claves[0]);
  });

  // correo.drenado.007 — defensa en profundidad del mismo agujero que el `backend-reviewer`
  // encontró en el adapter: un `enviarLote` que RESUELVE con menos ids que inputs (contrato roto,
  // sin lanzar). El drenado no puede dejar el resto PENDIENTE en silencio y sin error, porque eso
  // es exactamente lo que produce un reenvío a la corrida siguiente. Hoy el adapter garantiza el
  // contrato, pero el use case no depende de esa buena fe.
  it("si el adapter devuelve menos ids que correos, el resto queda con ultimoError y gasta el intento", async () => {
    const tenant = await crearTenant("ids-cortos");
    await encolarN(tenant.id, 3);

    const correo = {
      // Contrato violado a propósito: 3 correos, 1 solo id, sin lanzar.
      enviarLote: async () => ({ ids: ["resend-unico"] }),
    };

    await drenarCorreosPendientes({
      db,
      correo,
      resolvedor: resolverSoloDe(tenant.id),
      limite: VENTANA,
    });

    const filas = await db.correoEnviado.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(filas[0]?.estado).toBe("ENVIADO");
    const resto = filas.slice(1);
    expect(resto.map((f) => f.estado)).toEqual(["PENDIENTE", "PENDIENTE"]);
    // Con error escrito y el intento consumido: la anomalía es VISIBLE y tiene presupuesto
    // acotado, en vez de reintentarse callada para siempre.
    expect(resto.map((f) => f.intentos)).toEqual([1, 1]);
    for (const fila of resto) {
      expect(fila.ultimoError).toBeTruthy();
    }
  });

  // correo.drenado.006 — el resolvedor es un SEAM: en F02 todavía no hay plantillas. Una fila que
  // nadie sabe armar se SALTA sin tocar (ni intento ni FALLIDO): la falla segura de ADR-0027 §3 es
  // "el correo no sale y queda recuperable", y marcarla FALLIDO mentiría (nunca hubo envío).
  it("una fila sin resolvedor queda intacta y no consume intentos", async () => {
    const tenant = await crearTenant("sin-resolver");
    await encolarN(tenant.id, 2);
    const correo = correoFake();

    const res = await drenarCorreosPendientes({
      db,
      correo,
      // Resolvedor que DECLARA el tipo del fixture y aun así no sabe armarlo: es el estado en que
      // queda una fila cuyo contenido no se pudo derivar (sorteo borrado, guard de tenancy).
      resolvedor: {
        tipos: ["RESULTADO_NO_GANADOR"],
        armar: async () => new Map<string, CorreoInput>(),
      },
      limite: VENTANA,
    });

    // `>=` y no `===`: la cola es global, así que el contador incluye filas ajenas en vuelo de
    // otros archivos de test. Lo exacto —y lo que importa— son las 2 filas del fixture, abajo.
    expect(res.sinResolver).toBeGreaterThanOrEqual(2);
    expect(correo.lotes).toHaveLength(0);
    const filas = await db.correoEnviado.findMany({
      where: { tenantId: tenant.id },
    });
    expect(filas.map((f) => `${f.estado}:${f.intentos}`)).toEqual([
      "PENDIENTE:0",
      "PENDIENTE:0",
    ]);
  });

  // correo.drenado.010 — **head-of-line blocking**, el defecto que F04 activa y que hasta acá no
  // tenía dueño. La ventana de una corrida son las N filas MÁS VIEJAS: si se llena de filas de un
  // tipo que ningún resolvedor sabe armar (un `RECORDATORIO_SORTEO` encolado antes de que F06
  // exista), las que sí tienen plantilla no entran NUNCA y el Comprador no recibe su confirmación.
  // El filtro por `tipo` va en el WHERE, ANTES del `take`, y eso es lo que este test fija.
  it("filas viejas de un tipo sin resolvedor no bloquean la ventana de las que sí tienen", async () => {
    const tenant = await crearTenant("head-of-line");
    // Primero (más viejas) 3 filas de un tipo sin resolvedor.
    await encolarCorreos({
      db,
      correos: Array.from({ length: 3 }, (_v, i) => ({
        tenantId: tenant.id,
        tipo: "RECORDATORIO_SORTEO" as const,
        clave: `${raffleDe(tenant.id)}:48:sin-plantilla${i}@example.cl`,
        email: `sin-plantilla${i}@example.cl`,
      })),
    });
    // Después, la que sí se puede armar.
    await encolarCorreos({
      db,
      correos: [
        {
          tenantId: tenant.id,
          tipo: "RESULTADO_NO_GANADOR",
          clave: `${raffleDe(tenant.id)}:tarde@example.cl`,
          email: "tarde@example.cl",
        },
      ],
    });

    const correo = correoFake();
    // Ventana de 3: sin el filtro por tipo se llenaría con las 3 viejas y la 4ª no saldría jamás.
    const res = await drenarCorreosPendientes({
      db,
      correo,
      resolvedor: resolverSoloDe(tenant.id),
      limite: 3,
    });

    expect(res.enviados).toBe(1);
    expect(correo.lotes[0]?.map((c) => c.to)).toEqual(["tarde@example.cl"]);
    // Las bloqueantes siguen intactas: ni intento consumido ni FALLIDO (falla segura ADR-0027 §3).
    const bloqueantes = await db.correoEnviado.findMany({
      where: { tenantId: tenant.id, tipo: "RECORDATORIO_SORTEO" },
    });
    expect(bloqueantes.map((f) => `${f.estado}:${f.intentos}`)).toEqual([
      "PENDIENTE:0",
      "PENDIENTE:0",
      "PENDIENTE:0",
    ]);
  });
});
