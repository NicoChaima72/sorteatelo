import { type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { normalizarCodigo } from "~/server/domain/facturacion/_cupones";
import { type FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Núcleo TESTEABLE del CLI de [[Cupón de plataforma]] (F08, D9, ADR-0026).
 *
 * Un cupón vive en DOS lados: el **descuento** en la cuenta Flow de la plataforma (`coupon/create`)
 * y el **código repartible** —con su expiración, su tope de canjes y su trazabilidad— en nuestra DB.
 * Flow no tiene el concepto de «código canjeable», así que las dos mitades son necesarias y este
 * módulo es lo único que las crea juntas, en la misma corrida.
 *
 * Sin superficie de UI (D9/ADR-0023): los cupones los crea el Operador por CLI y punto.
 */

/** Input del subcomando `crear`, ya parseado desde argv por el wrapper. */
export const crearCuponInput = z
  .object({
    /** Repartible. Se normaliza a MAYÚSCULAS sin espacios en los dos extremos (crear y canjear). */
    codigo: z.string().min(3),
    tipo: z.enum(["PORCENTAJE", "MONTO"]),
    /** Solo PORCENTAJE: 1..100. */
    porcentaje: z.number().int().min(1).max(100).optional(),
    /**
     * Solo MONTO: descuento bruto en CLP, como string (I2 — jamás un float). Entero sin ceros a la
     * izquierda, distinto de 0 (un descuento de $0 no es un cupón) y con techo: `Decimal(15,2)`
     * revienta más arriba, y ese error llegaría DESPUÉS de haber creado el cupón en Flow.
     */
    montoDescuento: z
      .string()
      .regex(/^[1-9]\d{0,7}$/, "El monto tiene que ser un entero de CLP entre 1 y 99999999.")
      .optional(),
    /** Cuántos períodos dura el descuento; omitido = para siempre. `1` = una sola mensualidad. */
    duracionMeses: z.number().int().min(1).optional(),
    /** Hasta cuándo se puede CANJEAR (distinto de cuánto DURA el descuento). */
    expiraAt: z.date().optional(),
    /** Tope de canjes; omitido = ilimitado. `1` modela el código personal (D9). */
    maxCanjes: z.number().int().min(1).optional(),
    nota: z.string().optional(),
  })
  // El tipo manda cuál de los dos montos va: un cupón PORCENTAJE con `montoDescuento` sería una fila
  // que dice dos cosas distintas, y la que aplicaría es la que Flow entienda — no la que se quiso.
  .refine((v) => (v.tipo === "PORCENTAJE") === (v.porcentaje !== undefined), {
    message: "Un cupón PORCENTAJE necesita --porcentaje (1..100), y solo ese.",
  })
  .refine((v) => (v.tipo === "MONTO") === (v.montoDescuento !== undefined), {
    message: "Un cupón MONTO necesita --monto (CLP entero), y solo ese.",
  });

export type CrearCuponInput = z.infer<typeof crearCuponInput>;

/**
 * `AAAA-MM-DD` → el instante FINAL de ese día en UTC. Vive acá y no en el wrapper porque es
 * POLÍTICA, no cableado de argv: «vence el 31» significa que se puede canjear TODO el 31.
 *
 * Sellarlo al fin del día (y no a las 00:00 del siguiente) es además lo que hace que el
 * `toISOString().slice(0, 10)` que viaja a Flow devuelva ESE mismo día y no uno de más.
 */
export function finDelDiaUTC(fecha: string): Date {
  return new Date(`${fecha}T23:59:59.999Z`);
}

export interface CuponCreado {
  codigo: string;
  flowCouponId: string;
}

/**
 * Crea el cupón en Flow y su fila local. **Orden deliberado: Flow PRIMERO, DB después** — al revés
 * de lo que pide el precedente del checkout, y por una razón concreta:
 *
 * - Si Flow falla, no queda nada local y el Operador reintenta: cero consecuencias.
 * - Si la escritura local falla después de Flow, queda un cupón **inerte** en Flow: nadie lo puede
 *   canjear, porque el canje entra por el CÓDIGO y el código es la fila que no se escribió.
 * - Al revés sería peor: una fila local apuntando a un `flowCouponId` inexistente hace fallar el
 *   `subscription/create` de un Organizador que está activando su plan de verdad. El daño se lo
 *   comería alguien que no tiene nada que ver con el cupón.
 *
 * Además el `flowCouponId` es NOT NULL: sin la respuesta de Flow no hay fila que escribir.
 *
 * El chequeo previo del código duplicado es para no dejar cupones inertes en Flow por un error de
 * tipeo; la garantía DURA sigue siendo el `@unique` de `codigo`, que se lee del `P2002`.
 */
export async function crearCuponDePlataforma({
  db,
  flow,
  input,
  ahora = new Date(),
}: {
  db: Pick<PrismaClient, "platformCoupon">;
  flow: FlowPlataformaService;
  input: CrearCuponInput;
  ahora?: Date;
}): Promise<CuponCreado> {
  const codigo = normalizarCodigo(input.codigo);

  if (input.expiraAt && input.expiraAt.getTime() <= ahora.getTime()) {
    throw new Error(
      `La fecha de expiración (${input.expiraAt.toISOString().slice(0, 10)}) ya pasó: el cupón nacería muerto.`,
    );
  }

  const existente = await db.platformCoupon.findUnique({
    where: { codigo },
    select: { id: true },
  });
  if (existente) {
    throw new Error(
      `Ya existe un cupón con el código ${codigo}. Los códigos son únicos; elegí otro.`,
    );
  }

  const cuponFlow = await flow.crearCupon({
    // El `name` de Flow lleva NUESTRO código: es lo único que permite reconocer en el panel de Flow
    // a cuál cupón repartido corresponde cada descuento.
    name: codigo,
    percentOff: input.porcentaje,
    amount: input.montoDescuento,
    duracionPeriodos: input.duracionMeses,
    // Flow espera `YYYY-MM-DD`.
    expira: input.expiraAt?.toISOString().slice(0, 10),
    maxRedemptions: input.maxCanjes,
  });

  // El service castea la respuesta de Flow sin validarla, así que un 200 raro (sin `id`) escribiría
  // `flowCouponId: "undefined"`: un código local VIVO y canjeable que le haría reventar el
  // `subscription/create` a un Organizador que está activando su plan y no tiene nada que ver con el
  // cupón. Es justo el daño que el orden Flow-primero evita, entrando por la FORMA de la respuesta
  // en vez de por el orden. Sin id no hay fila.
  const flowCouponId = String(cuponFlow.id ?? "").trim();
  if (flowCouponId === "") {
    throw new Error(
      `Flow aceptó el cupón ${codigo} pero no devolvió un id. No se escribió la fila local; revisá el panel de Flow antes de reintentar (puede haber quedado un cupón suelto).`,
    );
  }

  try {
    await db.platformCoupon.create({
      data: {
        codigo,
        flowCouponId,
        tipo: input.tipo,
        porcentaje: input.porcentaje ?? null,
        montoDescuento: input.montoDescuento ?? null,
        duracionMeses: input.duracionMeses ?? null,
        expiraAt: input.expiraAt ?? null,
        maxCanjes: input.maxCanjes ?? null,
        nota: input.nota ?? null,
      },
      select: { id: true },
    });
  } catch (e) {
    // CUALQUIER fallo de la escritura local deja un cupón inerte en Flow, y el `flowCouponId` es el
    // único dato con el que se limpia a mano: se nombra siempre, no solo en la carrera. La rama
    // P2002 es de hecho la MENOS probable (exige dos corridas manuales simultáneas); las probables
    // —DB caída, un valor que la columna rechaza— son las que se perderían callándolas.
    const porQue = esCodigoPrisma(e, "P2002")
      ? `otra corrida creó el código ${codigo} primero`
      : `falló la escritura local del código ${codigo}`;
    throw new Error(
      `Cupón creado en Flow (id ${flowCouponId}) pero ${porQue}. Nadie puede canjearlo —el canje entra por el código, que no se escribió—, pero conviene borrarlo desde el panel de Flow.`,
      { cause: e },
    );
  }

  return { codigo, flowCouponId };
}

/** Una fila del listado, con sus canjes reales. */
export interface CuponListado {
  codigo: string;
  flowCouponId: string;
  descuento: string;
  duracion: string;
  activo: boolean;
  expiraAt: Date | null;
  maxCanjes: number | null;
  /** Canjes CONSUMADOS: los que quedaron ligados a una suscripción (ver más abajo). */
  canjes: number;
  /**
   * Reservas en curso: alguien tipeó el código y todavía no volvió de Flow. Ocupan cupo pero pueden
   * liberarse solas, así que se cuentan aparte — si se sumaran a `canjes`, un `maxCanjes: 1`
   * abandonado se leería como «quemado» cuando sigue perfectamente canjeable.
   */
  reservasEnCurso: number;
  /** Quién entró por este código: tenant + Pagador + fecha, en orden de canje. */
  redenciones: {
    tenantId: string;
    tenantNombre: string | null;
    /** El «quién» de D9: dos tiendas del mismo Pagador son la misma persona. */
    pagadorEmail: string | null;
    createdAt: Date;
    /** `false` = reserva en curso, todavía sin suscripción. */
    consumado: boolean;
  }[];
}

/**
 * Lista los cupones con su trazabilidad de canjes (D9: «quién / cuándo / qué tienda / qué código»).
 *
 * Los canjes se cuentan sobre **`PlatformCouponRedemption`, no sobre `PlatformCoupon.canjes`**. El
 * contador existe únicamente para el guard atómico de la carrera y puede DIVERGIR (así está escrito
 * en el schema); la fuente de verdad del reporte son las filas de canje, que son las que dicen quién
 * lo usó. Reportar el contador sería reportar el número que se usa para cerrar la puerta, no el de
 * las personas que entraron.
 *
 * Y dentro de esas filas se distingue **consumado vs. reserva en curso** (`subscriptionId`): la
 * reserva se escribe ANTES del redirect a Flow, así que un Organizador que tipea el código y abandona
 * deja una fila que NO es un canje —`liberarReservas` le devuelve el cupo en cuanto reintente—. Sin
 * esa distinción, este CLI —que es la ÚNICA superficie de los cupones— le diría al Operador que su
 * código personal se quemó cuando sigue disponible.
 */
export async function listarCuponesDePlataforma({
  db,
}: {
  db: Pick<PrismaClient, "platformCoupon">;
}): Promise<CuponListado[]> {
  const cupones = await db.platformCoupon.findMany({
    orderBy: { createdAt: "desc" }, // el último creado primero: es el que el Operador acaba de repartir
    select: {
      codigo: true,
      flowCouponId: true,
      tipo: true,
      porcentaje: true,
      montoDescuento: true,
      duracionMeses: true,
      expiraAt: true,
      maxCanjes: true,
      activo: true,
      redemptions: {
        orderBy: { createdAt: "asc" },
        select: {
          tenantId: true,
          createdAt: true,
          // Distingue el canje consumado de la reserva en curso; no se expone el id, solo si hay.
          subscriptionId: true,
          tenant: { select: { nombre: true } },
          // El «quién» de D9. El email del Pagador es dato de la PLATAFORMA sobre su propio cliente,
          // y esta salida la lee el Operador en su terminal — no viaja a ninguna respuesta HTTP.
          pagador: { select: { email: true } },
        },
      },
    },
  });

  return cupones.map((c) => ({
    codigo: c.codigo,
    flowCouponId: c.flowCouponId,
    descuento:
      c.tipo === "PORCENTAJE"
        ? `${c.porcentaje ?? "?"}%`
        : `$${c.montoDescuento?.toFixed(0) ?? "?"}`,
    duracion:
      c.duracionMeses === null
        ? "siempre"
        : c.duracionMeses === 1
          ? "1 mes"
          : `${c.duracionMeses} meses`,
    activo: c.activo,
    expiraAt: c.expiraAt,
    maxCanjes: c.maxCanjes,
    canjes: c.redemptions.filter((r) => r.subscriptionId !== null).length,
    reservasEnCurso: c.redemptions.filter((r) => r.subscriptionId === null).length,
    redenciones: c.redemptions.map((r) => ({
      tenantId: r.tenantId,
      tenantNombre: r.tenant?.nombre ?? null,
      pagadorEmail: r.pagador?.email ?? null,
      createdAt: r.createdAt,
      consumado: r.subscriptionId !== null,
    })),
  }));
}

/** `true` si el error trae ese `code` de Prisma (mismo criterio que el resto de los scripts). */
function esCodigoPrisma(e: unknown, code: string): boolean {
  if (typeof e !== "object" || e === null) return false;
  return (e as { code?: string }).code === code;
}
