import { createHash } from "crypto";

import {
  type CorreoEnviadoType,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  CorreoError,
  type CorreoInput,
  type CorreoService,
  LOTE_MAX,
} from "~/server/services/correo";

import { MAX_INTENTOS } from "./ledgerCorreos";

/**
 * Ledger de correos — el DRENADO (F02, ADR-0027 §2/§5). La mitad CONSUMIDORA de la máquina: lee
 * las filas `PENDIENTE`, las envía en lote y confirma. La mitad productora (el claim que crea las
 * filas) vive en `ledgerCorreos.ts`.
 *
 * Es un **job reconciliation-based**: no pregunta "¿qué toca justo ahora?" sino "¿qué está vencido
 * y sin enviar?". Por eso una corrida perdida del cron se recupera sola a la hora siguiente y una
 * duplicada no hace daño. Lo invoca `/api/cron/correos`, horario (ADR-0027 §4).
 *
 * Protocolo por fila, en este orden y no otro:
 *
 * 1. **CLAIM** — `updateMany({ where: { id, estado: PENDIENTE, intentos: n }, data: { intentos:
 *    n+1 } })`. Es un compare-and-swap: si otra corrida (o el `waitUntil` post-pago de F03) ya se
 *    llevó la fila, el `count` vuelve 0 y esta corrida la suelta. Los N CAS de una corrida viajan
 *    en UN batch, no en N round trips (ver el comentario del claim). Todo camino que envíe un
 *    correo del ledger DEBE pasar por acá.
 *
 *    **El CAS solo NO alcanza**, y esto costó un blocker: compara `intentos`, así que frena a la
 *    corrida que leyó ANTES del claim… pero la fila sigue `PENDIENTE` durante todo el envío, y una
 *    corrida que la lee DESPUÉS del claim ve `intentos: n+1`, gana su propio CAS legítimamente y
 *    manda el correo de nuevo. Por eso el claim va acompañado de un **lease por edad**
 *    (`GRACIA_RECLAMO_MS`): una fila ya reclamada no se vuelve a tocar hasta que su reclamo esté
 *    viejo. Sin eso, dos crones solapados —o el `waitUntil` post-pago de F03 corriendo junto al
 *    cron— duplican correos en silencio (probado en `correo.drenado.009`).
 * 2. **SEND** — un solo `enviarLote` para todas las filas reclamadas (chunkeado de a 100 por el
 *    adapter).
 * 3. **CONFIRM** — `ENVIADO` + `proveedorId` + `enviadoAt`.
 *
 * Si el proceso muere entre 1 y 2, la fila queda `PENDIENTE` con un intento gastado y el correo NO
 * sale: falla segura y recuperable (ADR-0027 §3). El modo de falla opuesto —enviar y registrar
 * después— produce duplicados, que son irrecuperables y queman la reputación del dominio
 * compartido por todas las Tiendas (I2).
 *
 * **Cuota ≠ fallo (I9)**: un 429 de Resend (Free = 100/día) devuelve el intento y deja la fila
 * `PENDIENTE`. Un blast > 100/día se termina de drenar en los días siguientes en vez de degradar
 * correos sanos a `FALLIDO`.
 *
 * **Tenancy (I1)**: el job es de PLATAFORMA y procesa filas de todos los tenants; el `tenantId` de
 * cada fila lo escribió el productor server-side. El resolvedor de mensajes DEBE scopear sus
 * queries por el `tenantId` que recibe en la fila, jamás por otra cosa.
 */

/**
 * Cuántas filas mira una corrida. **DERIVADO de `LOTE_MAX` del adapter, no un 100 repetido**: que
 * la corrida entre en UN chunk es lo que hace estable la `Idempotency-Key` (ver `claveDeLote`), y
 * dos literales independientes en dos archivos se desincronizan sin que nada avise. Coincide
 * además con el techo diario de Resend Free.
 */
export const LOTE_POR_CORRIDA = LOTE_MAX;

/** Techo del `ultimoError` que se persiste (patrón `sanitizarArgs` de `mcp/audit.ts`). */
const LIMITE_ULTIMO_ERROR = 500;

/**
 * **Lease por edad** — cuánto se respeta un reclamo ajeno antes de dar la fila por abandonada.
 * Es la mitad del claim que el CAS no puede cubrir: entre el claim y el confirm la fila sigue
 * `PENDIENTE`, así que sin esto una corrida solapada la reclamaría de nuevo (su CAS sobre
 * `intentos: n+1` es válido) y mandaría el correo dos veces.
 *
 * 10 minutos es holgadamente más que el peor envío posible (`TIMEOUT_MS` de 8 s por request, por
 * la cantidad de chunks de una corrida) y holgadamente menos que la hora que hay entre crones. El
 * costo: una corrida que muere DE VERDAD entre claim y send deja su fila esperando 10 min en vez
 * de reintentarla en el acto — que es exactamente el trade-off que ADR-0027 §3 ya eligió (falla
 * segura = el correo tarda, nunca sale dos veces).
 *
 * Se aplica SOLO a filas con `intentos > 0`: una fila nunca reclamada no puede estar en vuelo, así
 * que el camino feliz no pierde un segundo.
 *
 * **Exportada** desde F03: el envío post-commit de la confirmación (`enviarConfirmacionDeCompra`)
 * reclama filas del MISMO ledger y tiene que respetar el mismo lease. Dos constantes con el mismo
 * nombre en dos archivos se desincronizan sin que nada avise, y el precio de que se desincronicen
 * es un correo duplicado.
 */
export const GRACIA_RECLAMO_MS = 10 * 60 * 1000;

/** Lo que el resolvedor necesita saber de una fila para armar su correo. */
export interface FilaPendiente {
  id: string;
  tenantId: string;
  tipo: CorreoEnviadoType;
  clave: string;
  email: string;
  intentos: number;
  /** Último toque de la máquina de estados. Es el reloj del lease (ver `GRACIA_RECLAMO_MS`). */
  updatedAt: Date;
}

/**
 * Seam de contenido: traduce filas del ledger a correos concretos. Devuelve un mapa `id de fila →
 * CorreoInput` con **solo lo que supo armar**; las filas ausentes se saltan intactas.
 *
 * En F02 no hay plantillas todavía y el resolvedor real es vacío. F03–F06 lo llenan (uno por tipo:
 * confirmación, resultado, recordatorios). Es batch a propósito: resolver 100 filas tiene que
 * poder ser una query, no 100.
 */
export type ResolverMensajes = (
  filas: FilaPendiente[],
) => Promise<Map<string, CorreoInput>>;

export interface ResultadoDrenado {
  /** Filas que salieron y quedaron ENVIADO en esta corrida. */
  enviados: number;
  /** Filas degradadas a FALLIDO por agotar el presupuesto de intentos. */
  fallidos: number;
  /** Filas que ningún resolvedor supo armar (quedan PENDIENTE intactas). */
  sinResolver: number;
  /** La corrida se cortó por cuota del proveedor: el resto espera al próximo ciclo (I9). */
  detenidoPorCuota: boolean;
}

/**
 * `Idempotency-Key` del lote — la SEGUNDA línea de defensa de ADR-0027 §6 (la primera y definitiva
 * es el ledger). Tapa la única ventana que el ledger no cubre: si el proceso muere DESPUÉS de que
 * Resend aceptó y ANTES del confirm, la fila queda PENDIENTE y la corrida siguiente la reenvía;
 * con la misma clave, Resend devuelve la respuesta original (ventana 24 h) en vez de mandar el
 * correo de nuevo.
 *
 * Se deriva del CONTENIDO —los ids de las filas reclamadas, en orden— y no de la hora ni de un
 * contador: solo así el reintento del mismo conjunto reusa la clave. Y por eso mismo un conjunto
 * distinto produce una clave distinta, que es lo que evita que un lote nuevo se coma la respuesta
 * cacheada de uno viejo. Depende de que la corrida entre en UN chunk — por eso `LOTE_POR_CORRIDA`
 * se deriva de `LOTE_MAX` y no es un literal aparte: con más de un chunk, el índice que el adapter
 * le agrega a la clave (`clave/0`, `clave/1`, …) se correría entre corridas.
 */
function claveDeLote(filas: FilaPendiente[]): string {
  const huella = createHash("sha256")
    .update(filas.map((f) => f.id).join(","))
    .digest("hex")
    .slice(0, 32);
  return `drenado/${huella}`;
}

function recortar(mensaje: string): string {
  return mensaje.length > LIMITE_ULTIMO_ERROR
    ? `${mensaje.slice(0, LIMITE_ULTIMO_ERROR)}…(recortado)`
    : mensaje;
}

export async function drenarCorreosPendientes({
  db,
  correo,
  resolverMensajes,
  ahora = new Date(),
  limite = LOTE_POR_CORRIDA,
}: {
  db: PrismaClient;
  /** Solo el envío en lote: el drenado nunca manda de a uno. */
  correo: Pick<CorreoService, "enviarLote">;
  resolverMensajes: ResolverMensajes;
  ahora?: Date;
  limite?: number;
}): Promise<ResultadoDrenado> {
  // Ruta del índice `[estado, createdAt]`: FIFO por antigüedad. El `intentos < MAX` se filtra
  // sobre el resultado y no en el WHERE — un predicado de rango antes de la clave de orden
  // rompería el ordenamiento del índice (nota de `schema-guardian` en el schema). Son ≤100 filas,
  // y el barrido del final de esta misma corrida garantiza que casi nunca haya agotadas acá.
  //
  // El `id` desempata y NO es decorativo: las N filas de un mismo blast nacen del mismo
  // `createMany` y comparten `createdAt` al milisegundo (misma lección que el arrastre de F01).
  // Sin orden TOTAL, dos lecturas devuelven las filas en orden distinto y el mapeo
  // "los primeros `ids.length` inputs salieron" deja de significar nada.
  const candidatas: FilaPendiente[] = await db.correoEnviado.findMany({
    where: { estado: "PENDIENTE" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limite,
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

  // Dos filtros, no uno: presupuesto de intentos Y lease. El segundo saca de la corrida las filas
  // que otra corrida reclamó recién y probablemente esté enviando ahora mismo — reclamarlas nos
  // daría un CAS válido y un correo duplicado (I2). Una fila con `intentos: 0` nunca fue
  // reclamada, así que jamás está en vuelo.
  const vencidoElLease = ahora.getTime() - GRACIA_RECLAMO_MS;
  const vivas = candidatas.filter(
    (f) =>
      f.intentos < MAX_INTENTOS &&
      (f.intentos === 0 || f.updatedAt.getTime() <= vencidoElLease),
  );
  const resultado: ResultadoDrenado = {
    enviados: 0,
    fallidos: 0,
    sinResolver: 0,
    detenidoPorCuota: false,
  };

  if (vivas.length > 0) {
    const mensajes = await resolverMensajes(vivas);
    resultado.sinResolver = vivas.filter((f) => !mensajes.has(f.id)).length;

    // ── CLAIM ────────────────────────────────────────────────────────────────
    // Solo compiten por el claim las filas que ALGÚN resolvedor supo armar: reclamar una fila que
    // después no se puede enviar gastaría un intento sin que hubiera envío.
    const aReclamar = vivas.filter((f) => mensajes.has(f.id));

    // Los N CAS viajan en UN solo `$transaction` array (Prisma lo manda como un batch y devuelve
    // los `count` EN ORDEN), no en N idas y vueltas. **No es micro-optimización**: contra el
    // pooler remoto cada operación de Prisma cuesta ~0,6 s medidos, así que una corrida llena
    // —100 filas, que es justo el tope diario de Resend Free— tardaría más de un minuto SOLO en
    // reclamar y la función del cron se moriría antes de enviar el primer correo. Es la misma
    // razón por la que `resolverMensajes` es batch.
    //
    // El CAS por fila queda idéntico (`where` con el `intentos` leído): lo que cambia es el
    // transporte, no el protocolo. Y como todas las corridas leen con el MISMO orden total
    // (`createdAt`, `id`), dos crones concurrentes toman las filas en el mismo orden ⇒ no hay
    // ciclo de espera posible entre sus transacciones.
    const claims =
      aReclamar.length > 0
        ? await db.$transaction(
            aReclamar.map((fila) =>
              db.correoEnviado.updateMany({
                where: {
                  id: fila.id,
                  estado: "PENDIENTE",
                  intentos: fila.intentos,
                },
                data: { intentos: { increment: 1 } },
              }),
            ),
          )
        : [];

    const reclamadas: FilaPendiente[] = [];
    const inputs: CorreoInput[] = [];
    aReclamar.forEach((fila, i) => {
      const mensaje = mensajes.get(fila.id);
      // count 0 = otra corrida ganó la carrera por esta fila. Se suelta sin tocarla.
      if (!mensaje || claims[i]?.count !== 1) return;
      reclamadas.push(fila);
      inputs.push(mensaje);
    });

    // ── SEND + CONFIRM ───────────────────────────────────────────────────────
    if (reclamadas.length > 0) {
      let ids: string[] = [];
      let fallo: CorreoError | undefined;
      try {
        ({ ids } = await correo.enviarLote(inputs, {
          idempotencyKey: claveDeLote(reclamadas),
        }));
      } catch (e) {
        // Un error que no sea nuestro se trata como fallo real sin envíos parciales: es lo
        // conservador (a lo sumo un correo tarde; nunca uno repetido).
        fallo =
          e instanceof CorreoError
            ? e
            : new CorreoError(
                e instanceof Error ? e.message : "Error desconocido al enviar.",
              );
        ids = fallo.idsParciales;
      }

      // Más ids que correos: el alineamiento posicional ya no significa nada, así que confirmar
      // por prefijo sería escribirle a una fila el id de otra. Se descarta el lote entero y se
      // trata como anomalía (el caso simétrico —menos ids— cae solo en el bloque `sinSalir`).
      if (ids.length > reclamadas.length) {
        fallo = new CorreoError(
          `El proveedor devolvió ${ids.length} ids para ${reclamadas.length} correos: el lote no se puede alinear.`,
        );
        ids = [];
      }

      // Los ids llegan alineados con los inputs: las primeras `ids.length` filas SÍ salieron,
      // incluso si el lote murió después. Confirmarlas es lo que impide reenviarlas (I2).
      const confirmaciones: Prisma.PrismaPromise<unknown>[] = [];
      ids.forEach((proveedorId, i) => {
        const fila = reclamadas[i];
        if (!fila) return;
        confirmaciones.push(
          db.correoEnviado.update({
            where: { id: fila.id },
            data: { estado: "ENVIADO", proveedorId, enviadoAt: ahora },
          }),
        );
      });
      if (confirmaciones.length > 0) await db.$transaction(confirmaciones);
      resultado.enviados = confirmaciones.length;

      // Las que quedaron sin salir. Ojo: NO se condiciona a que haya habido `fallo`. Un adapter
      // que resuelve con menos ids que inputs (contrato roto sin lanzar) dejaría filas PENDIENTE
      // sin error, y la corrida siguiente las reenviaría — el mismo agujero de I2 por el otro
      // lado del seam. Acá se trata como anomalía: intento consumido y error visible.
      const sinSalir = reclamadas.slice(ids.length).map((f) => f.id);
      if (sinSalir.length > 0) {
        const motivo =
          fallo ??
          new CorreoError(
            `El proveedor devolvió ${ids.length} ids para ${reclamadas.length} correos: el resto no se puede dar por enviado.`,
          );
        resultado.detenidoPorCuota = motivo.esCuota;
        await db.correoEnviado.updateMany({
          // `estado: PENDIENTE` no es decorativo: si una corrida solapada ya confirmó la fila
          // (ENVIADO) o el sweeper la degradó (FALLIDO), esto le devolvería un intento y le
          // pisaría el error a una fila que ya no está en juego — I9 al revés.
          where: { id: { in: sinSalir }, estado: "PENDIENTE" },
          data: {
            // I9: la cuota DEVUELVE el intento — no es un fallo del correo, es el proveedor
            // diciendo "hoy no". Cualquier otro error sí lo consume.
            ...(motivo.esCuota ? { intentos: { decrement: 1 } } : {}),
            ultimoError: recortar(motivo.message),
          },
        });
      }
    }
  }

  // ── SWEEPER ────────────────────────────────────────────────────────────────
  // Al final y no al principio: así una fila que agotó su presupuesto en ESTA corrida queda
  // FALLIDO ya mismo, en vez de esperar una hora para volverse visible en el panel.
  const { count } = await db.correoEnviado.updateMany({
    where: { estado: "PENDIENTE", intentos: { gte: MAX_INTENTOS } },
    data: { estado: "FALLIDO" },
  });
  resultado.fallidos = count;

  return resultado;
}
