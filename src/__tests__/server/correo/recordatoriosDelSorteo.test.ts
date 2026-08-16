import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { claveRecordatorio } from "~/server/domain/correo/ledgerCorreos";
import { planificarRecordatorios } from "~/server/domain/correo/planificarRecordatorios";
import { registrarConsentimientoRecordatorios, suprimirCorreoDeAvisos } from "~/server/domain/correo/preferenciasDeCorreo";
import { armarRecordatoriosDeSorteo } from "~/server/domain/correo/recordatorioDelSorteo";
import { resolvedorDeCorreos } from "~/server/domain/correo/resolvedorDeCorreos";
import { db } from "~/server/db";

/**
 * Tests DB-backed de los **recordatorios del sorteo** (F06/C2-C3): el planificador que los encola y
 * el resolvedor que los arma.
 *
 * Contra Postgres real y no contra un fake porque las propiedades que importan son de la DB: la
 * idempotencia la decide el `@@unique([tipo, clave])`, el filtro de I5 cruza dos tablas, y el
 * agrupado por persona depende de que el unique sea case-sensitive.
 *
 * **La DB de dev ES la de producción** (verificado en la corrida de F04) y el cron de Vercel drena
 * ESTE ledger: por eso los fixtures usan tenants desechables con prefijo por PID, direcciones que
 * nunca se envían de verdad, y limpian antes y después. Ninguna fila de acá puede quedar viva.
 */

/**
 * Presupuesto medido, no elegido a ojo: cada caso siembra una Tienda + un sorteo + participantes y
 * corre el planificador varias veces contra el pooler remoto, donde cada operación de Prisma cuesta
 * ~0,6-1 s (medido en la Bitácora de este plan). El default de 30 s de vitest deja el archivo al
 * filo y el síntoma NO se parece a lentitud: el test que se pasa arrastra fallas en cascada al
 * `beforeEach` del siguiente, porque su loop sigue escribiendo mientras el otro limpia.
 */
vi.setConfig({ testTimeout: 180_000 });

const PREFIJO = `test-recordatorio-${process.pid}-`;
const PREFIJO_FAMILIA = "test-recordatorio-";
const EDAD_HUERFANO_MS = 60 * 60 * 1000;

const AHORA = new Date("2026-08-01T12:00:00.000Z");
const HORA = 60 * 60 * 1000;

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
  await db.consentimientoRecordatorios.deleteMany({
    where: { tenantId: { in: ids } },
  });
  await db.supresionCorreo.deleteMany({ where: { tenantId: { in: ids } } });
  await db.platformExemption.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffleEntry.deleteMany({ where: { tenantId: { in: ids } } });
  await db.raffle.deleteMany({ where: { tenantId: { in: ids } } });
  await db.orderItem.deleteMany({ where: { tenantId: { in: ids } } });
  await db.payment.deleteMany({ where: { tenantId: { in: ids } } });
  await db.order.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(limpiar);
afterEach(limpiar);

/**
 * Tienda PUBLICADA + sorteo ACTIVO que cierra dentro de `horasAlCierre`, con sus participantes.
 * Cada participante trae su lista de Números y si consintió recibir recordatorios.
 */
async function sembrar({
  nombre,
  horasAlCierre,
  participantes,
  estadoTienda = "PUBLICADA",
  estadoSorteo = "ACTIVO",
  suscripcion = "AL_DIA",
  ahora = AHORA,
}: {
  nombre: string;
  horasAlCierre: number;
  participantes: { email: string; numeros: number[]; consiente: boolean }[];
  estadoTienda?: "PUBLICADA" | "CONFIGURACION";
  estadoSorteo?: "ACTIVO" | "CERRADO";
  /**
   * Estado de la suscripción de PLATAFORMA (ADR-0026). El default `AL_DIA` es la Tienda normal, así
   * que los casos que no hablan de facturación no cambian. `null` = sin plan; `EN_PAUSA_POR_PAGO` =
   * el caso que importa acá, porque **sigue PUBLICADA** y su storefront sirve la página neutral.
   */
  suscripcion?: "AL_DIA" | "EN_PAUSA_POR_PAGO" | null;
  /**
   * Reloj de referencia de las fechas sembradas. El default `AHORA` (fijo) sirve a los casos que
   * inyectan ese mismo reloj al armado; el caso del REGISTRO real del cron (014) debe sembrar
   * relativo al reloj DE PARED, porque el cableado de producción no recibe `ahora` y un fixture
   * con fecha fija se vence solo (bomba de tiempo: este archivo estuvo verde hasta que el reloj
   * real pasó `2026-08-01T18:30Z` y el fail-closed `fechaFin > ahora` empezó a descartar el sorteo).
   */
  ahora?: Date;
}) {
  const tenant = await db.tenant.create({
    data: {
      slug: `${PREFIJO}${nombre}`,
      nombre: `Tienda ${nombre}`,
      estado: estadoTienda,
      prefijoTicket: "ARMY",
      identidadLegal: "Comercializadora de prueba EIRL",
      // El eje COMERCIAL del gate (ADR-0026) se siembra con una EXENCIÓN y no con una
      // `PlatformSubscription`: la suscripción real exige un Pagador y un plan de Flow, y lo que
      // este archivo necesita probar es la DECISIÓN del gate, no el modelo de cobro.
      //   `AL_DIA`            ⇒ exención perpetua  ⇒ puedeVender
      //   `EN_PAUSA_POR_PAGO` ⇒ exención VENCIDA   ⇒ no puedeVender, pero sigue PUBLICADA
      //   `null`              ⇒ sin exención       ⇒ no puedeVender (SIN_PLAN)
      ...(suscripcion === null
        ? {}
        : {
            platformExemption: {
              create: {
                motivo: "GRANDFATHER" as const,
                exentaHasta:
                  suscripcion === "AL_DIA"
                    ? null
                    : new Date(ahora.getTime() - 24 * HORA),
              },
            },
          }),
    },
    select: { id: true },
  });
  const raffle = await db.raffle.create({
    data: {
      tenantId: tenant.id,
      nombre: `Sorteo ${nombre}`,
      premio: "Un photobook firmado",
      estado: estadoSorteo,
      fechaInicio: new Date(ahora.getTime() - 30 * 24 * HORA),
      fechaFin: new Date(ahora.getTime() + horasAlCierre * HORA),
      ultimoNumero: 0,
      basesPdfUrl: "https://pub.r2.dev/t/sorteo/bases.pdf",
    },
    select: { id: true },
  });

  for (const p of participantes) {
    const order = await db.order.create({
      data: {
        tenantId: tenant.id,
        email: p.email,
        estado: "PAGADO",
        total: new Prisma.Decimal("1000"),
      },
      select: { id: true },
    });
    await db.raffleEntry.createMany({
      data: p.numeros.map((numero, i) => ({
        tenantId: tenant.id,
        raffleId: raffle.id,
        orderId: order.id,
        email: p.email,
        ordinal: i,
        numero,
      })),
    });
    if (p.consiente) {
      await registrarConsentimientoRecordatorios({
        db,
        tenantId: tenant.id,
        orderId: order.id,
        email: p.email,
        ip: "200.1.2.3",
      });
    }
  }
  return { tenantId: tenant.id, raffleId: raffle.id };
}

/** Las filas de recordatorio del ledger de ESTE tenant, para no mirar nunca las de otro carril. */
async function recordatorios(tenantId: string) {
  return db.correoEnviado.findMany({
    where: { tenantId, tipo: "RECORDATORIO_SORTEO" },
    orderBy: { clave: "asc" },
    select: { id: true, clave: true, email: true, estado: true, tenantId: true, tipo: true },
  });
}

describe("domain/correo/planificarRecordatorios — encolado (F06/C2-C3)", () => {
  // correo.planificar.001 — la puerta de I5 en el camino real: solo el que consintió y no se dio de
  // baja entra al ledger. Los otros tres estados posibles quedan fuera POR EL MISMO CAMINO.
  it("encola solo para los que tienen consentimiento y no tienen supresión", async () => {
    const { tenantId } = await sembrar({
      nombre: "filtro",
      horasAlCierre: 48.5, // ventana nominal del T-48h
      participantes: [
        { email: "ana@fan.cl", numeros: [1], consiente: true },
        { email: "bruno@fan.cl", numeros: [2], consiente: true }, // se da de baja abajo
        { email: "carla@fan.cl", numeros: [3], consiente: false },
      ],
    });
    await suprimirCorreoDeAvisos({ db, tenantId, email: "bruno@fan.cl" });

    const res = await planificarRecordatorios({ db, ahora: AHORA });

    expect(res.encolados).toBe(1);
    const filas = await recordatorios(tenantId);
    expect(filas.map((f) => f.email)).toEqual(["ana@fan.cl"]);
    expect(filas[0]!.clave).toContain(":48:");
  });

  // correo.planificar.002 — UN correo por PERSONA, no por ticket. Quien compró tres veces —y una de
  // ellas escribiendo su correo con otro casing— es una sola persona y recibe un solo recordatorio.
  it("agrupa por identidad: varias compras y varios casings son UN solo correo", async () => {
    const { tenantId } = await sembrar({
      nombre: "identidad",
      horasAlCierre: 48.5,
      participantes: [
        { email: "Ana@Fan.CL", numeros: [1, 2], consiente: true },
        { email: "ana@fan.cl", numeros: [3], consiente: true },
      ],
    });

    const res = await planificarRecordatorios({ db, ahora: AHORA });

    expect(res.encolados).toBe(1);
    expect(await recordatorios(tenantId)).toHaveLength(1);
  });

  // correo.planificar.003 — IDEMPOTENCIA: la corrida siguiente no duplica. Es lo que hace que un
  // cron que se dispara dos veces (Vercel Cron lo admite) sea inofensivo. Y lo que decide es el
  // `@@unique([tipo, clave])` de Postgres, no un `if` de este código.
  it("dos corridas seguidas no duplican el recordatorio", async () => {
    const { tenantId } = await sembrar({
      nombre: "idem",
      horasAlCierre: 48.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
    });

    const primera = await planificarRecordatorios({ db, ahora: AHORA });
    const segunda = await planificarRecordatorios({ db, ahora: AHORA });

    expect(primera.encolados).toBe(1);
    expect(segunda.encolados).toBe(0);
    expect(await recordatorios(tenantId)).toHaveLength(1);
  });

  // correo.planificar.004 — **corrida perdida recuperada**: si el cron no corrió en la hora
  // nominal, la corrida siguiente igual encola el T-48h. Sin esto, una corrida saltada perdería el
  // correo para siempre — y Vercel Cron es best-effort por contrato (ADR-0027 §4).
  it("recupera un T-48h que la corrida nominal se perdió, y sigue sin duplicar", async () => {
    const { tenantId } = await sembrar({
      nombre: "recupera",
      horasAlCierre: 30, // ya pasó la ventana nominal de 48-49 h: nadie lo mandó
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
    });

    expect((await planificarRecordatorios({ db, ahora: AHORA })).encolados).toBe(
      1,
    );
    const filas = await recordatorios(tenantId);
    expect(filas[0]!.clave).toContain(":48:");
    // Y cuando llegue de verdad a las 6 h, sale el otro — pero el de 48 no se repite.
    const masTarde = new Date(AHORA.getTime() + 24.5 * HORA);
    expect(
      (await planificarRecordatorios({ db, ahora: masTarde })).encolados,
    ).toBe(1);
    expect(await recordatorios(tenantId)).toHaveLength(2);
  });

  // correo.planificar.005 — el TECHO por sorteo por comprador, ejercido en el tiempo: se corre el
  // planificador hora por hora sobre toda la vida del sorteo y no salen más de dos correos. No es un
  // contador: es la clave con offset + el unique del ledger.
  it("un comprador recibe a lo sumo 2 recordatorios en toda la vida del sorteo (techo 3)", async () => {
    const { tenantId } = await sembrar({
      nombre: "techo",
      horasAlCierre: 72,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
    });

    // Se MUESTREA la línea de tiempo en vez de correr las 74 horas: cada corrida son varias idas al
    // pooler (~0,6-1 s cada una) y el barrido completo tardaba más que el test entero. Las horas
    // elegidas no son al azar — cubren los dos bordes y los tramos entre medio, que es donde una
    // regresión aparecería: antes de toda ventana (0, 22), la corrida nominal del T-48h (23), su
    // tramo de recuperación (30, 50, 64), la nominal del T-6h (65), su recuperación (68, 71) y
    // después del cierre (72, 73).
    for (const h of [0, 22, 23, 30, 50, 64, 65, 68, 71, 72, 73]) {
      await planificarRecordatorios({
        db,
        ahora: new Date(AHORA.getTime() + h * HORA),
      });
    }

    const filas = await recordatorios(tenantId);
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.clave.split(":")[1]).sort()).toEqual(["48", "6"]);
  });

  // correo.planificar.006 — un sorteo CERRADO o de una Tienda despublicada no genera nada. Es la
  // mitad «no se envía» del checkbox del plan, en el productor.
  it("no encola para sorteos cerrados ni para Tiendas despublicadas", async () => {
    const cerrado = await sembrar({
      nombre: "cerrado",
      horasAlCierre: 48.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
      estadoSorteo: "CERRADO",
    });
    const despublicada = await sembrar({
      nombre: "despublicada",
      horasAlCierre: 48.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
      estadoTienda: "CONFIGURACION",
    });

    await planificarRecordatorios({ db, ahora: AHORA });

    expect(await recordatorios(cerrado.tenantId)).toEqual([]);
    expect(await recordatorios(despublicada.tenantId)).toEqual([]);
  });

  // correo.planificar.008 — **BLOCKER que cazó el `backend-reviewer`**: `TenantStatus` y facturación
  // son ejes SEPARADOS (ADR-0026), así que una Tienda `EN_PAUSA_POR_PAGO` sigue `PUBLICADA` — y
  // filtrando solo por `estado` le mandaríamos un T-6h diciendo «todavía alcanzas a comprar» con un
  // enlace a un storefront que en ese momento sirve la página neutral de pausa. La decisión la toma
  // `evaluarGateVenta`, el MISMO gate que usa el checkout.
  it("no encola para una Tienda en pausa por pago, aunque siga PUBLICADA", async () => {
    const enPausa = await sembrar({
      nombre: "pausa",
      horasAlCierre: 6.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
      suscripcion: "EN_PAUSA_POR_PAGO",
    });
    const alDia = await sembrar({
      nombre: "al-dia",
      horasAlCierre: 6.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
    });

    await planificarRecordatorios({ db, ahora: AHORA });

    expect(await recordatorios(enPausa.tenantId)).toEqual([]);
    // …y la de al lado, que sí puede vender, recibe normal: el gate no apagó la feature entera.
    expect(await recordatorios(alDia.tenantId)).toHaveLength(1);
  });

  // correo.planificar.007 — **retiro de obsoletos**. Con la cuota de Resend Free un blast se drena
  // en días, así que un recordatorio encolado puede quedar sin sentido antes de salir. Si se
  // quedara PENDIENTE ocuparía lugar en la ventana del drenado PARA SIEMPRE: con ≥100 así, dejan de
  // salir las confirmaciones de compra (el head-of-line de F04, un piso más abajo).
  it("retira los recordatorios cuyo sorteo se cerró antes de que salieran", async () => {
    const { tenantId, raffleId } = await sembrar({
      nombre: "retiro",
      horasAlCierre: 6.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
    });
    await planificarRecordatorios({ db, ahora: AHORA });
    expect((await recordatorios(tenantId))[0]!.estado).toBe("PENDIENTE");

    // El Organizador ejecuta el sorteo antes de que el cron alcance a drenar.
    await db.raffle.update({
      where: { id: raffleId },
      data: { estado: "CERRADO" },
    });
    const res = await planificarRecordatorios({ db, ahora: AHORA });

    expect(res.retirados).toBe(1);
    const filas = await recordatorios(tenantId);
    // FALLIDO y no borrada: la fila SIGUE siendo la llave de idempotencia (si se borrara, mover
    // `fechaFin` hacia adelante volvería a encolar el mismo correo) y queda visible con su motivo.
    expect(filas).toHaveLength(1);
    expect(filas[0]!.estado).toBe("FALLIDO");
  });
});

describe("domain/correo/recordatorioDelSorteo — armado del correo (F06)", () => {
  // correo.recordatorio.010 — el camino completo: planificar ⇒ resolver. El correo trae los números
  // de ESA persona (todos, de todas sus compras), el sorteo nombrado y su enlace de baja propio.
  it("arma el correo con los números de la persona y su enlace de baja", async () => {
    const { tenantId } = await sembrar({
      nombre: "armado",
      horasAlCierre: 48.5,
      participantes: [
        { email: "Ana@Fan.CL", numeros: [1043, 1044], consiente: true },
        { email: "ana@fan.cl", numeros: [1045], consiente: true },
        { email: "bruno@fan.cl", numeros: [1046], consiente: true },
      ],
    });
    await planificarRecordatorios({ db, ahora: AHORA });

    const correos = await armarRecordatoriosDeSorteo({
      db,
      filas: await recordatorios(tenantId),
      baseUrl: "https://app.test",
      ahora: AHORA,
    });

    expect(correos.size).toBe(2);
    const porDestino = new Map(
      [...correos.values()].map((c) => [c.to.toLowerCase(), c] as const),
    );
    const deAna = porDestino.get("ana@fan.cl")!;
    // Los TRES números de ana, de sus dos compras y sus dos casings, plegados en un solo bloque.
    expect(deAna.text).toContain("ARMY-1043–1045");
    // …y ninguno de bruno.
    expect(deAna.text).not.toContain("ARMY-1046");
    expect(deAna.subject).toContain("Sorteo armado");
    // Su enlace de baja, distinto del de bruno (el token es por persona y por Tienda).
    expect(deAna.headers?.["List-Unsubscribe"]).toContain(
      "https://app.test/api/correo/baja/",
    );
    expect(deAna.headers?.["List-Unsubscribe"]).not.toBe(
      porDestino.get("bruno@fan.cl")!.headers?.["List-Unsubscribe"],
    );
  });

  // correo.recordatorio.011 — **el filtro se re-pregunta al ENVIAR**, no solo al encolar. Bajo la
  // cuota de Resend Free una fila puede esperar días: quien se dio de baja el martes no puede
  // recibir el correo que se encoló el lunes. Es la mitad de I5 que un test del planificador solo
  // jamás vería.
  it("no arma el correo de alguien que se dio de baja DESPUÉS de encolarse", async () => {
    const { tenantId } = await sembrar({
      nombre: "baja-tardia",
      horasAlCierre: 48.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
    });
    await planificarRecordatorios({ db, ahora: AHORA });
    const filas = await recordatorios(tenantId);
    expect(filas).toHaveLength(1);

    await suprimirCorreoDeAvisos({ db, tenantId, email: "ana@fan.cl" });

    const correos = await armarRecordatoriosDeSorteo({
      db,
      filas,
      baseUrl: "https://app.test",
      ahora: AHORA,
    });
    expect(correos.size).toBe(0);
  });

  // correo.recordatorio.012 — fail-closed de tenancy (I1): una fila con el `tenantId` falseado no
  // arma nada. Antes que mandarle a alguien el sorteo de otra Tienda, no se manda nada.
  it("una fila cuyo tenant no es el del sorteo no se arma (I1)", async () => {
    const { tenantId } = await sembrar({
      nombre: "tenancy",
      horasAlCierre: 48.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
    });
    const otro = await sembrar({
      nombre: "tenancy-otro",
      horasAlCierre: 48.5,
      participantes: [],
    });
    await planificarRecordatorios({ db, ahora: AHORA });
    const filas = await recordatorios(tenantId);

    const correos = await armarRecordatoriosDeSorteo({
      db,
      filas: filas.map((f) => ({ ...f, tenantId: otro.tenantId })),
      baseUrl: "https://app.test",
      ahora: AHORA,
    });
    expect(correos.size).toBe(0);
  });

  // correo.recordatorio.013 — sorteo cerrado ANTES del envío ⇒ no sale, aunque la fila siga
  // PENDIENTE. Es la segunda línea de defensa: el planificador ya la habría retirado, pero el
  // resolvedor no puede depender de que eso haya corrido.
  it("no arma el correo si el sorteo se cerró o la Tienda se despublicó antes del envío", async () => {
    const { tenantId, raffleId } = await sembrar({
      nombre: "cerrado-antes",
      horasAlCierre: 6.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
    });
    await planificarRecordatorios({ db, ahora: AHORA });
    const filas = await recordatorios(tenantId);

    for (const cambio of [
      () => db.raffle.update({ where: { id: raffleId }, data: { estado: "CERRADO" } }),
      () =>
        db.raffle.update({
          where: { id: raffleId },
          data: { estado: "ACTIVO" },
        }),
      () =>
        db.tenant.update({
          where: { id: tenantId },
          data: { estado: "CONFIGURACION" },
        }),
    ]) {
      await cambio();
    }

    const correos = await armarRecordatoriosDeSorteo({
      db,
      filas,
      baseUrl: "https://app.test",
      ahora: AHORA,
    });
    expect(correos.size).toBe(0);
  });

  // correo.recordatorio.014 — el registro que instancia el cron declara el tipo Y lo sabe resolver.
  // El modo de falla que cubre es MUDO: un tipo resuelto pero no declarado queda encolado para
  // siempre y ni siquiera aparece en el contador de «sin resolver» (el filtro lo saca antes).
  it("el resolvedor REAL del cron declara y resuelve RECORDATORIO_SORTEO", async () => {
    // El registro del cron NO recibe `ahora`: resuelve con el reloj DE PARED, que es lo que corre
    // en Vercel. Por eso este caso —y solo este— siembra relativo al ahora real: con la fecha fija
    // del resto del archivo el sorteo nace vencido y el fail-closed de `fechaFin > ahora` lo
    // descarta (bomba de tiempo diagnosticada 2026-08-16: rojo desde que el reloj real pasó
    // 2026-08-01T18:30Z).
    const ahora = new Date();
    const { tenantId } = await sembrar({
      nombre: "registro",
      horasAlCierre: 6.5,
      participantes: [{ email: "ana@fan.cl", numeros: [1], consiente: true }],
      ahora,
    });
    await planificarRecordatorios({ db, ahora });

    const resolvedor = resolvedorDeCorreos({ db, baseUrl: "https://app.test" });
    expect(resolvedor.tipos).toContain("RECORDATORIO_SORTEO");

    const mensajes = await resolvedor.armar(
      (await recordatorios(tenantId)).map((f) => ({
        ...f,
        intentos: 0,
        updatedAt: new Date(),
      })),
    );
    expect(mensajes.size).toBe(1);
    // Y es el T-6h: lleva el CTA a la tienda del tenant.
    expect([...mensajes.values()][0]!.text).toContain(".app.test/");
  });

  // correo.recordatorio.015 — la clave de un recordatorio inventada a mano con el constructor
  // oficial resuelve igual: es la garantía de que el formato tiene UN dueño y de que el resolvedor
  // no depende de haber sido él quien encoló.
  it("resuelve una fila cuya clave se armó con el constructor oficial", async () => {
    const { tenantId, raffleId } = await sembrar({
      nombre: "clave",
      horasAlCierre: 48.5,
      participantes: [{ email: "ana@fan.cl", numeros: [7], consiente: true }],
    });

    const correos = await armarRecordatoriosDeSorteo({
      db,
      filas: [
        {
          id: "fila-a-mano",
          tenantId,
          tipo: "RECORDATORIO_SORTEO",
          clave: claveRecordatorio({
            raffleId,
            offsetHoras: 48,
            email: "ana@fan.cl",
          }),
          email: "ana@fan.cl",
        },
      ],
      baseUrl: "https://app.test",
      ahora: AHORA,
    });

    expect(correos.get("fila-a-mano")!.text).toContain("ARMY-7");
  });
});
