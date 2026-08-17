import { type PrismaClient } from "@prisma/client";

import { replyToDeTenants } from "~/server/domain/correo/_contactoDelOrganizador";
import {
  armarCorreoConfirmacionCompra,
  type SorteoDeLaCompra,
} from "~/server/domain/correo/plantillaConfirmacionCompra";
import { type CorreoInput } from "~/server/services/correo";

/**
 * Derivación server-side del correo **C1 — confirmación de compra** (F03). Es el puente entre las
 * filas de la DB y la plantilla pura: carga lo que una orden necesita para su correo y devuelve el
 * `CorreoInput` listo para el adapter.
 *
 * ── Por qué es BATCH ───────────────────────────────────────────────────────────────────────────
 * Tiene DOS consumidores y los dos tienen que producir el MISMO correo, byte por byte:
 *
 * 1. El envío post-commit del webhook (`enviarConfirmacionDeCompra`), con UNA orden.
 * 2. El resolvedor del cron (`drenarCorreosPendientes`), con hasta 100 filas del ledger.
 *
 * Si cada uno derivara el contenido por su cuenta, el correo del camino feliz y el del reintento se
 * irían separando sin que ningún test lo note (los dos "mandan un correo"). Por eso hay UNA función
 * y es batch: el seam `ResolverMensajes` de ADR-0027 pide explícitamente que resolver 100 filas sea
 * una query y no 100 — contra el pooler cada roundtrip cuesta ~660 ms y una corrida llena del cron
 * no cabría en la función.
 *
 * Son **dos** queries pase lo que pase (órdenes + membresías), no dos por orden.
 *
 * ── Tenancy (I1) ───────────────────────────────────────────────────────────────────────────────
 * Todo el contenido —destino, Tienda, branding, títulos, tokens, números— sale de la ORDEN cargada
 * acá, jamás de un parámetro. Se devuelve además el `tenantId` de cada orden para que el resolvedor
 * del cron pueda contrastarlo con el de la fila del ledger antes de mandar nada.
 */

/** Lo que produce esta derivación para una orden: su correo + el tenant al que pertenece. */
export interface ConfirmacionArmada {
  /** `Order.tenantId` leído de la DB — el caller lo contrasta contra el de su fila del ledger. */
  tenantId: string;
  correo: CorreoInput;
  /** Cuántos enlaces de entrega lleva el correo. Lo muestra el panel al reenviar. */
  items: number;
}

/**
 * `Idempotency-Key` de la confirmación de una orden (ADR-0027 §6). Es por MENSAJE y no por lote, y
 * eso es a propósito: la clave sale del `orderId`, así que vale igual la mande el `waitUntil`
 * post-pago o el cron tres horas después. Una clave derivada del lote (como la del drenado) solo
 * protege si el reintento arma exactamente el mismo lote, cosa que no se puede garantizar.
 */
export function claveIdempotenciaConfirmacion(orderId: string): string {
  return `confirmacion-compra/${orderId}`;
}

/**
 * Con qué intención se manda este correo. NO es un detalle de transporte: decide si Resend puede
 * responder con el resultado CACHEADO de un envío anterior en vez de mandar el correo de nuevo.
 *
 * - `"automatica"` — lleva la `Idempotency-Key` del mensaje. La usan los DOS caminos automáticos
 *   (el `waitUntil` post-pago y el cron), que compiten por la MISMA fila del ledger: si los dos
 *   llegan a Resend, la clave es la última red para que al Comprador le llegue UN correo (I2).
 *
 * - `"reenvio-manual"` — **sin clave**. El botón «Reenviar» del panel es un «mandalo de nuevo»
 *   explícito del Organizador, y casi siempre lo aprieta porque el primero NO llegó. La clave
 *   automática es estable para siempre, así que un reenvío dentro de la ventana de 24 h de Resend
 *   se trataría como reintento del envío original: el proveedor devuelve la respuesta cacheada, el
 *   panel muestra «reenviado» y el buzón sigue vacío. Es exactamente el mismo motivo por el que el
 *   reenvío tampoco pasa por el claim del ledger (ver `enviarCorreoDescargaDeOrden`), un piso más
 *   arriba: contra la intención deliberada de un humano, la protección anti-duplicado estorba.
 *
 * Es un parámetro OBLIGATORIO y no un opcional con default: un caller nuevo que se olvide del tema
 * no compila, en vez de heredar en silencio la semántica equivocada (mismo criterio que el prefijo
 * de ticket en `~/lib/numerosDelSorteo`).
 */
export type ModoIdempotencia = "automatica" | "reenvio-manual";

/**
 * Elige de qué sorteo habla el correo cuando la orden tiene tickets en MÁS DE UNO.
 *
 * No es hipotético: el arrastre D13 (`crearSorteo`) COPIA los tickets de un sorteo al siguiente
 * —crea entries nuevas y deja las viejas—, así que una orden vieja puede tener números en dos
 * sorteos. En el camino normal esto no pasa nunca (el correo sale minutos después del pago, cuando
 * hay un solo sorteo en juego); se alcanza al REENVIAR desde el panel una compra cuyos tickets ya
 * fueron arrastrados.
 *
 * Regla: **el ACTIVO manda**; si ninguno lo está, el más nuevo. Es lo que I10 asume («una Tienda
 * tiene n sorteos y solo uno activo») y lo que le sirve a quien lee: sus números vivos son los del
 * sorteo que todavía corre, con la numeración que el panel también muestra. Nombrar el sorteo viejo
 * sería mandarle números que ya no compiten.
 *
 * La otra lectura posible —«C1 confirma LA COMPRA, así que va el sorteo al que entró»— es defendible
 * y quedó anotada en la Bitácora para que el usuario pueda darla vuelta: es este `sort` y nada más.
 */
function sorteoDelCorreo<
  T extends { estado: string; createdAt: Date },
>(candidatos: T[]): T | undefined {
  return [...candidatos].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === "ACTIVO" ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  })[0];
}

export async function armarConfirmacionesDeCompra({
  db,
  orderIds,
  baseUrl,
  idempotencia,
}: {
  db: PrismaClient;
  orderIds: string[];
  /** Base absoluta de los enlaces de entrega. La lee el borde de `env`, nunca este módulo. */
  baseUrl: string;
  /** Envío automático (con clave) vs. reenvío deliberado del Organizador (sin ella). */
  idempotencia: ModoIdempotencia;
}): Promise<Map<string, ConfirmacionArmada>> {
  const armadas = new Map<string, ConfirmacionArmada>();
  if (orderIds.length === 0) return armadas;

  const ordenes = await db.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      email: true,
      tenantId: true,
      total: true,
      createdAt: true,
      // Branding + identidad de la Tienda: el correo habla en SU voz (D1/D9-rev) y muestra sus
      // números con SU prefijo (D12). Todo dato del `Tenant`, nada hardcodeado.
      tenant: {
        select: {
          nombre: true,
          logoUrl: true,
          colorPrimario: true,
          // Pie legal (F05/D6): quién responde por la venta y el sorteo (ADR-0008).
          identidadLegal: true,
          prefijoTicket: true,
          // Primer escalón del reply-to (T6): el contacto PÚBLICO que el Organizador configuró.
          contactoEmail: true,
        },
      },
      // Un ítem del correo por grant. Solo el token (autoridad del enlace) y el título — NUNCA
      // `pdfPath` ni keys del bucket (ADR-0002).
      downloadGrants: {
        select: { token: true, product: { select: { titulo: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      // Para el resumen: cuántas unidades se llevó en total.
      items: { select: { cantidad: true } },
      // Los Números del sorteo de ESTA orden (ADR-0024) + el sorteo al que pertenecen.
      raffleEntries: {
        select: {
          numero: true,
          raffleId: true,
          raffle: {
            select: {
              nombre: true,
              fechaFin: true,
              basesPdfUrl: true,
              estado: true,
              createdAt: true,
            },
          },
        },
        orderBy: { numero: "asc" },
      },
    },
  });

  if (ordenes.length === 0) return armadas;

  // Reply-to del Organizador (T6/D7), derivado por el helper compartido: contacto público de la
  // Tienda y, si no lo configuró, membresía más antigua. Sigue siendo UNA query para todo el lote
  // (cero si todos tienen contacto público). Estaba escrito acá a mano hasta F04, que es cuando T6
  // pedía centralizarlo: «antes de multiplicar plantillas».
  const replyTos = await replyToDeTenants({
    db,
    tenants: [
      ...new Map(
        ordenes.map((o) => [
          o.tenantId,
          { id: o.tenantId, contactoEmail: o.tenant.contactoEmail },
        ]),
      ).values(),
    ],
  });

  const base = baseUrl.replace(/\/+$/, ""); // sin barra final (evita `//entrega/...`)

  for (const orden of ordenes) {
    // ── Sorteo de la compra (si lo hay) ──────────────────────────────────────
    // Se agrupa por sorteo y se elige uno; los números que viajan son SOLO los de ese sorteo, no
    // todos los de la orden. Mezclarlos daría un rango que no existe en ninguna parte.
    const porSorteo = new Map<string, { numeros: number[] } & typeof orden.raffleEntries[number]["raffle"]>();
    for (const e of orden.raffleEntries) {
      const previo = porSorteo.get(e.raffleId);
      if (previo) previo.numeros.push(e.numero);
      else porSorteo.set(e.raffleId, { ...e.raffle, numeros: [e.numero] });
    }
    const elegido = sorteoDelCorreo([...porSorteo.values()]);

    const sorteo: SorteoDeLaCompra | undefined = elegido
      ? {
          nombre: elegido.nombre,
          fechaFin: elegido.fechaFin,
          numeros: elegido.numeros,
          prefijoTicket: orden.tenant.prefijoTicket,
          basesUrl: elegido.basesPdfUrl,
        }
      : undefined;

    // D5 (productos-tipos-digitales F09): el enlace lleva a la PÁGINA DE ENTREGA de la orden, no al
    // endpoint que baja UN archivo — lo comprado puede ser un sobre de N archivos sorteados.
    const items = orden.downloadGrants.map((g) => ({
      titulo: g.product.titulo,
      enlace: `${base}/entrega/${g.token}`,
    }));

    const { from, subject, text, html } = armarCorreoConfirmacionCompra({
      nombreTienda: orden.tenant.nombre,
      logoUrl: orden.tenant.logoUrl,
      colorPrimario: orden.tenant.colorPrimario,
      identidadLegal: orden.tenant.identidadLegal,
      items,
      orden: {
        numeroDeOrden: orden.id,
        fecha: orden.createdAt,
        // `Decimal` → string. La plantilla solo FORMATEA (CLAUDE.md § Regla de oro): en ningún
        // punto de este camino el dinero pasa por un `number`.
        totalClp: orden.total.toFixed(2),
        articulos: orden.items.reduce((acc, i) => acc + i.cantidad, 0),
      },
      ...(sorteo ? { sorteo } : {}),
    });

    armadas.set(orden.id, {
      tenantId: orden.tenantId,
      items: items.length,
      correo: {
        from,
        to: orden.email,
        ...(replyTos.has(orden.tenantId)
          ? { replyTo: replyTos.get(orden.tenantId)! }
          : {}),
        subject,
        text,
        html,
        // La clave SOLO en los caminos automáticos: en el reenvío manual haría que Resend
        // devuelva la respuesta cacheada y el correo nunca salga (ver `ModoIdempotencia`).
        ...(idempotencia === "automatica"
          ? { idempotencyKey: claveIdempotenciaConfirmacion(orden.id) }
          : {}),
        // Etiquetas de Resend para segmentar métricas. SOLO ASCII alfanumérico + `_`/`-` (un tag
        // con el nombre de la Tienda daría 422 de TODO el lote): tipo y tenant son cuids/enums.
        tags: [
          { name: "tipo", value: "CONFIRMACION_COMPRA" },
          { name: "tenant", value: orden.tenantId },
        ],
      },
    });
  }

  return armadas;
}
