import { type PrismaClient } from "@prisma/client";

import { evaluarGateVenta } from "~/server/domain/facturacion/_gateVenta";

import {
  claveRecordatorio,
  type CorreoAEncolar,
  encolarCorreos,
  identidadDeCorreo,
} from "~/server/domain/correo/ledgerCorreos";
import { destinatariosDeAvisos } from "~/server/domain/correo/preferenciasDeCorreo";
import { ventanasDeRecordatorio } from "~/server/domain/correo/ventanasDeRecordatorio";

/**
 * **El productor de los recordatorios del sorteo** (F06/C2-C3): mira qué sorteos están por cerrar y
 * encola en el ledger un `RECORDATORIO_SORTEO` por persona habilitada. Lo llama el cron horario,
 * ANTES del drenado — encolar y enviar son dos mitades separadas a propósito (ADR-0027 §1/§2).
 *
 * ── Reconciliation-based, como todo job de la casa ─────────────────────────────────────────────
 * No pregunta «¿qué toca en esta hora?» sino «¿qué está vencido y sin encolar?» (ver
 * `ventanasDeRecordatorio`). Una corrida perdida se recupera en la siguiente y una duplicada no
 * hace nada: el `@@unique([tipo, clave])` con clave `raffleId:offset:email` es el que decide, no
 * este código.
 *
 * ── Las tres puertas que tiene que pasar una persona ───────────────────────────────────────────
 * 1. Su sorteo está **ACTIVO** y su Tienda **PUBLICADA** (una Tienda despublicada no le escribe a
 *    nadie).
 * 2. Tiene al menos un ticket en ese sorteo (es participante).
 * 3. **Dio consentimiento y no se dio de baja** (I5/D5) — el filtro cruza dos tablas y vive en un
 *    solo lugar, `destinatariosDeAvisos`.
 *
 * ── Y la contracara: retirar lo que ya no corresponde ──────────────────────────────────────────
 * Bajo Resend Free (100/día) un blast se drena en DÍAS, así que entre encolar y enviar puede pasar
 * que el sorteo se cierre o la Tienda se despublique. El resolvedor fail-closea igual, pero una
 * fila que nadie puede resolver se queda PENDIENTE **para siempre** y ocupa lugar en la ventana del
 * drenado: con ≥100 así, la cola se tapa para todos (el head-of-line que F04 tuvo que arreglar, un
 * piso más abajo). Por eso el planificador también RETIRA. Ver `retirarRecordatoriosObsoletos`.
 */

/** Cuántos sorteos mira una corrida. Cota de cordura: hoy hay ~8 Raffle ACTIVO en toda la DB. */
const MAX_SORTEOS_POR_CORRIDA = 50;

/**
 * Los hechos que decide si una Tienda puede recibir avisos. **Los MISMOS tres que lee el gate de
 * venta** (`cargarGateVenta`), y a propósito: la decisión la toma `evaluarGateVenta`, que es la
 * única fuente de verdad de «¿esta Tienda puede vender AHORA?» en toda la app.
 *
 * Por qué importa acá, y no es celo: `TenantStatus` y facturación son **ejes separados** — una
 * Tienda `EN_PAUSA_POR_PAGO` sigue `PUBLICADA` y su storefront sirve la página neutral de pausa. Con
 * solo mirar `estado === "PUBLICADA"`, el T-6h le mandaría «si quieres sumar más números, todavía
 * alcanzas» con un enlace a una tienda que no puede venderle nada. Es la misma clase de promesa
 * falsa que el `frontend-reviewer` bloqueó en F04 con la notification del sorteo.
 */
export const SELECCION_GATE_DE_AVISOS = {
  estado: true,
  platformSubscription: { select: { estado: true } },
  platformExemption: { select: { exentaHasta: true } },
} as const;

/** Forma mínima del tenant que `puedeRecibirAvisos` necesita (la que produce el select de arriba). */
export interface TenantParaAvisos {
  estado: Parameters<typeof evaluarGateVenta>[0]["estadoTienda"];
  platformSubscription: { estado: Parameters<typeof evaluarGateVenta>[0]["estadoSuscripcion"] } | null;
  platformExemption: { exentaHasta: Date | null } | null;
}

/**
 * ¿La Tienda puede recibir avisos AHORA? Delega en `evaluarGateVenta` en vez de reimplementar el
 * criterio: si mañana aparece un motivo nuevo por el que una Tienda deja de vender, este camino se
 * entera solo.
 *
 * Se evalúa EN MEMORIA sobre un select batch y no con `cargarGateVenta` (que es `findUnique`)
 * porque una corrida mira decenas de sorteos y ahí serían decenas de round-trips contra el pooler.
 * Lo que se comparte es la DECISIÓN —la función pura—, que es lo que no puede divergir.
 */
export function puedeRecibirAvisos(
  tenant: TenantParaAvisos,
  ahora: Date,
): boolean {
  return evaluarGateVenta({
    estadoTienda: tenant.estado,
    estadoSuscripcion: tenant.platformSubscription?.estado ?? null,
    exencion: tenant.platformExemption,
    ahora,
  }).puedeVender;
}

export interface ResultadoPlanificacion {
  /** Filas nuevas en el ledger. Las claves ya presentes no cuentan (eso ES la idempotencia). */
  encolados: number;
  /** Recordatorios PENDIENTE retirados por quedar obsoletos (sorteo cerrado / Tienda despublicada). */
  retirados: number;
}

export async function planificarRecordatorios({
  db,
  ahora = new Date(),
}: {
  db: PrismaClient;
  ahora?: Date;
}): Promise<ResultadoPlanificacion> {
  const retirados = await retirarRecordatoriosObsoletos({ db, ahora });

  let encolados = 0;
  for (const ventana of ventanasDeRecordatorio(ahora)) {
    // Un query por ventana (2 por corrida), no uno por sorteo. El `tenant.estado` va en el WHERE y
    // no en un filtro posterior: una Tienda despublicada no tiene por qué salir de la DB siquiera.
    const sorteos = await db.raffle.findMany({
      where: {
        estado: "ACTIVO",
        fechaFin: { gt: ventana.desde, lte: ventana.hasta },
        // El eje OPERATIVO va en el WHERE (es indexable y descarta el grueso); el COMERCIAL se
        // evalúa abajo con el gate compartido. Los dos son necesarios: una Tienda puede estar
        // PUBLICADA y en pausa por pago al mismo tiempo.
        tenant: { estado: "PUBLICADA" },
      },
      orderBy: { fechaFin: "asc" },
      take: MAX_SORTEOS_POR_CORRIDA,
      select: {
        id: true,
        tenantId: true,
        tenant: { select: SELECCION_GATE_DE_AVISOS },
        // Los emails de los participantes, con repetidos (una fila por TICKET). La identidad se
        // resuelve después: `Ana@x.cl` y `ana@x.cl` son la misma persona y un solo correo.
        entries: { select: { email: true } },
      },
    });

    for (const sorteo of sorteos) {
      if (sorteo.entries.length === 0) continue;
      // Gate de venta (ADR-0026): una Tienda en pausa por pago no le escribe a nadie. Su storefront
      // está sirviendo la página neutral, así que el CTA del T-6h apuntaría a una tienda que no
      // puede venderle nada al Comprador.
      if (!puedeRecibirAvisos(sorteo.tenant, ahora)) continue;

      // El filtro de I5, en UNA llamada por sorteo: consentimiento Y no supresión. Lo que no está
      // en el mapa no recibe — la ausencia es la respuesta segura.
      const habilitados = await destinatariosDeAvisos({
        db,
        tenantId: sorteo.tenantId,
        emails: sorteo.entries.map((e) => e.email),
      });
      if (habilitados.size === 0) continue;

      // Una fila por PERSONA, no por ticket. Se recorre el mapa de habilitados (no las entries)
      // justamente para que quien compró diez veces reciba un correo y no diez.
      const correos: CorreoAEncolar[] = [];
      for (const [identidad, destinatario] of habilitados) {
        correos.push({
          tenantId: sorteo.tenantId,
          tipo: "RECORDATORIO_SORTEO",
          clave: claveRecordatorio({
            raffleId: sorteo.id,
            offsetHoras: ventana.offsetHoras,
            email: identidad,
          }),
          // Snapshot del destinatario: el correo tal como lo escribió, no la identidad normalizada.
          email: destinatario.email,
        });
      }
      encolados += await encolarCorreos({ db, correos });
    }
  }

  return { encolados, retirados };
}

/**
 * Retira (marca `FALLIDO` con su motivo) los `RECORDATORIO_SORTEO` **PENDIENTE que ya no
 * corresponde mandar**: su sorteo cerró, le pasó la fecha, o su Tienda se despublicó.
 *
 * ── Por qué retirar y no dejar que el resolvedor los saltee ────────────────────────────────────
 * El resolvedor fail-closea igual (defensa en profundidad), pero saltar deja la fila PENDIENTE
 * ocupando un lugar en la ventana del drenado **en cada corrida, para siempre**. Con ≥100 filas así
 * —perfectamente posible tras un blast que la cuota de Resend Free estiró varios días— la cola se
 * tapa y dejan de salir las confirmaciones de compra. Es el head-of-line blocking que F04 arregló a
 * nivel de TIPO, reapareciendo a nivel de FILA.
 *
 * ── Por qué `FALLIDO` y no borrar la fila ──────────────────────────────────────────────────────
 * Borrarla rompería la idempotencia: el `@@unique` es lo único que impide que la próxima corrida
 * vuelva a encolar el mismo correo, y sin la fila no hay contra qué chocar (el Organizador puede
 * mover `fechaFin` hacia adelante y reabrir la ventana). `FALLIDO` la deja fuera del drenado, la
 * conserva como llave de idempotencia y la hace VISIBLE con su motivo, que es lo que un estado
 * terminal tiene que hacer (ADR-0027 §5).
 */
async function retirarRecordatoriosObsoletos({
  db,
  ahora,
}: {
  db: PrismaClient;
  ahora: Date;
}): Promise<number> {
  const pendientes = await db.correoEnviado.findMany({
    where: { tipo: "RECORDATORIO_SORTEO", estado: "PENDIENTE" },
    select: { id: true, clave: true, tenantId: true },
  });
  if (pendientes.length === 0) return 0;

  const raffleIds = [
    ...new Set(pendientes.map((f) => f.clave.split(":")[0]!)),
  ];
  const vigentes = (
    await db.raffle.findMany({
      where: {
        id: { in: raffleIds },
        estado: "ACTIVO",
        fechaFin: { gt: ahora },
        tenant: { estado: "PUBLICADA" },
      },
      select: {
        id: true,
        tenantId: true,
        tenant: { select: SELECCION_GATE_DE_AVISOS },
      },
    })
  ).filter((r) => puedeRecibirAvisos(r.tenant, ahora));
  // La comparación lleva el `tenantId` además del `raffleId` (I1): una fila cuyo tenant no calza
  // con el del sorteo es un bug de scoping en algún productor, y lo correcto es NO mandarla.
  const vivos = new Set(vigentes.map((r) => `${r.id}:${r.tenantId}`));

  const obsoletas = pendientes
    .filter((f) => !vivos.has(`${f.clave.split(":")[0]!}:${f.tenantId}`))
    .map((f) => f.id);
  if (obsoletas.length === 0) return 0;

  const { count } = await db.correoEnviado.updateMany({
    // `estado: PENDIENTE` en el where y no solo en la lectura: entre el `findMany` y esto, el
    // drenado pudo haber enviado la fila. Pisarle el estado a un correo ya ENVIADO sería mentir.
    where: { id: { in: obsoletas }, estado: "PENDIENTE" },
    data: {
      estado: "FALLIDO",
      ultimoError:
        "Retirado: el sorteo cerró o la tienda se despublicó antes de que saliera el recordatorio.",
    },
  });
  return count;
}

/** Reexport para que el planificador y el resolvedor compartan la MISMA normalización de identidad. */
export { identidadDeCorreo };
