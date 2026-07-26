import { type Prisma, type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { esActiva } from "~/server/domain/facturacion/_estadoSuscripcion";
import {
  evaluarCanje,
  MENSAJE_CUPON_INVALIDO,
  normalizarCodigo,
} from "~/server/domain/facturacion/_cupones";
import { exencionVigente } from "~/server/domain/facturacion/_gateVenta";
import { DomainError } from "~/server/domain/errors";
import { type FlowPlataformaService } from "~/server/services/flowPlataforma";

/**
 * Use case del panel (F03, D12): arranca el paso «Activa tu plan». Resuelve (o crea) el customer de
 * Flow del **Pagador**, reserva el [[Cupón de plataforma]] si vino un código, y devuelve la URL de
 * `customer/register` a la que hay que redirigir para que ingrese su tarjeta.
 *
 * Quien activa el plan ES el Pagador de esa Tienda (D12): el customer se crea contra `acceso.userId`
 * y su `externalId` en Flow es ese mismo id — es lo que liga la cuenta de Flow con nuestra DB.
 *
 * Scopeado por el `tenantId` server-side (I1/ADR-0005); sin membresía ⇒ `FORBIDDEN`. NO crea la
 * suscripción: eso pasa recién al VOLVER del redirect, con el registro confirmado server-side
 * (`activarPlanTrasRegistro`, I3). Acá todavía no hay tarjeta.
 */
export async function iniciarRegistroTarjeta({
  db,
  acceso,
  flow,
  input,
  urlRetorno,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  flow: FlowPlataformaService;
  input: { codigo?: string };
  /** URL del panel a la que Flow devuelve el navegador con el token del registro. */
  urlRetorno: string;
  ahora?: Date;
}): Promise<{ redirectUrl: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  // No se carga el Tenant: el customer de Flow es del PAGADOR (una persona), no de la Tienda — su
  // `name`/`email` salen de la sesión. Y la existencia del tenant ya la garantiza la membresía.
  const [exencion, suscripcion] = await Promise.all([
    db.platformExemption.findUnique({
      where: { tenantId },
      select: { exentaHasta: true },
    }),
    db.platformSubscription.findUnique({
      where: { tenantId },
      select: { estado: true },
    }),
  ]);

  // Una tienda de cortesía no tiene tarjeta ni suscripción Flow (D8): pedirle los datos sería
  // cobrarle a quien la plataforma decidió no cobrarle.
  if (exencionVigente(exencion, ahora)) {
    throw new DomainError(
      "INVALID",
      "Tu tienda tiene plan cortesía: no necesitas registrar una tarjeta.",
    );
  }

  // Guard contra el DOBLE COBRO: con un plan vivo, volver a registrar crearía una segunda
  // suscripción en Flow para la misma Tienda (el `@unique` de DB lo frena, pero para entonces ya
  // le habríamos creado el cobro en Flow).
  if (suscripcion !== null && esActiva(suscripcion.estado)) {
    throw new DomainError(
      "CONFLICT",
      "Tu tienda ya tiene un plan activo. Puedes revisarlo en la página Plan.",
    );
  }

  const pagador = await resolverPagador({ db, acceso, flow });

  // El cupón se valida y RESERVA antes del redirect: el código tiene que sobrevivir el viaje a Flow
  // y volver, y la reserva es lo que lo transporta (la fila queda con `subscriptionId: null` hasta
  // que la suscripción exista). Ver `PlatformCouponRedemption` en el schema.
  if (input.codigo?.trim()) {
    await reservarCupon({
      db,
      codigo: input.codigo,
      tenantId,
      pagadorId: pagador.id,
      ahora,
    });
  } else {
    // Sin código: se libera cualquier reserva de un intento anterior abandonado (ver más abajo).
    // En su propia `$transaction`: la liberación toca DOS tablas (borra la reserva y le devuelve el
    // cupo al cupón) y no puede quedar a medias — sin la tx, morir en el medio dejaría un cupo
    // consumido para siempre por un intento que nadie completó.
    await db.$transaction((tx) => liberarReservas({ tx, tenantId }));
  }

  const registro = await flow.registrarTarjeta({
    customerId: pagador.flowCustomerId,
    urlReturn: urlRetorno,
  });

  return { redirectUrl: registro.url };
}

/**
 * El [[Pagador]] de esta activación: su `PlatformBillingCustomer`, creado contra Flow la primera vez.
 * Idempotente por el `@unique` de `userId` — un Organizador con varias tiendas tiene UN solo customer
 * de Flow (es lo que hace posible el pricing «segunda tienda a mitad de precio», que es relativo a él).
 */
async function resolverPagador({
  db,
  acceso,
  flow,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  flow: FlowPlataformaService;
}): Promise<{ id: string; flowCustomerId: string }> {
  const existente = await db.platformBillingCustomer.findUnique({
    where: { userId: acceso.userId },
    select: { id: true, flowCustomerId: true },
  });
  if (existente) return existente;

  // Sin correo no hay Pagador posible: es lo que Flow exige para crear el customer Y el receptor
  // ÚNICO de los 7 correos de facturación (D10). Antes que crear un cobro cuyo comprobante no
  // llegaría a nadie, se falla acá. En la práctica no pasa (el login es Google OAuth), pero el tipo
  // de la sesión lo admite y el dinero no se maneja con optimismo.
  const email = acceso.email;
  if (!email) {
    throw new DomainError(
      "INVALID",
      "Tu cuenta no tiene un correo asociado. Necesitamos uno para enviarte los comprobantes de tu plan.",
    );
  }

  const creado = await flow.crearCustomer({
    name: email,
    email,
    // Liga el customer de Flow con NUESTRO User. Es el `userId`, no el email: el email puede
    // cambiar (otra cuenta Google) y el vínculo tiene que sobrevivir.
    externalId: acceso.userId,
  });

  return db.platformBillingCustomer.create({
    data: {
      userId: acceso.userId,
      flowCustomerId: creado.customerId,
      // Snapshot del correo con el que se creó el customer en Flow: ES el receptor de los
      // correos de facturación, y `User.email` puede divergir después (otra cuenta Google).
      email,
    },
    select: { id: true, flowCustomerId: true },
  });
}

/**
 * Valida y RESERVA el canje, atómicamente. El guard de la carrera es el `updateMany` condicional
 * (`canjes < maxCanjes` en el mismo statement): bajo READ COMMITTED, Postgres re-evalúa el `WHERE`
 * tras liberar el row-lock, así que dos tiendas pidiendo el último canje del mismo código dejan
 * `count: 1` y `count: 0` — nunca dos. Precedente: `Raffle.ultimoNumero`.
 *
 * Antes de reservar libera cualquier reserva SIN LIGAR de esta Tienda: el Organizador pudo abandonar
 * el redirect de Flow y volver a entrar con otro código (o con el mismo). Sin esa limpieza, el primer
 * intento abandonado le habría consumido un canje al cupón para siempre.
 */
async function reservarCupon({
  db,
  codigo,
  tenantId,
  pagadorId,
  ahora,
}: {
  db: PrismaClient;
  codigo: string;
  tenantId: string;
  pagadorId: string;
  ahora: Date;
}): Promise<void> {
  const normalizado = normalizarCodigo(codigo);

  await db.$transaction(async (tx) => {
    await liberarReservas({ tx, tenantId });

    const cupon = await tx.platformCoupon.findUnique({
      where: { codigo: normalizado },
      select: {
        id: true,
        activo: true,
        expiraAt: true,
        maxCanjes: true,
        canjes: true,
      },
    });

    // Un canje YA LIGADO de esta Tienda al mismo cupón (no una reserva) sí es un rechazo real.
    const yaLigado =
      cupon === null
        ? null
        : await tx.platformCouponRedemption.findFirst({
            where: {
              couponId: cupon.id,
              tenantId,
              subscriptionId: { not: null },
            },
            select: { id: true },
          });

    const elegible = evaluarCanje({
      cupon,
      ahora,
      yaCanjeadoPorLaTienda: yaLigado !== null,
    });

    if (!elegible.ok) {
      // El motivo real solo al log (soporte); al Organizador, un mensaje NEUTRAL: distinguir
      // «no existe» de «ya se usó» volvería el input un oráculo para adivinar códigos ajenos.
      console.warn("[facturacion] canje de cupón rechazado", {
        tenantId,
        motivo: elegible.motivo,
      });
      throw new DomainError("INVALID", MENSAJE_CUPON_INVALIDO);
    }

    // Guard ATÓMICO del cupo. `activo` va en el mismo `where` para que sea un solo statement.
    const reservado = await tx.platformCoupon.updateMany({
      where:
        cupon!.maxCanjes === null
          ? { id: cupon!.id, activo: true }
          : { id: cupon!.id, activo: true, canjes: { lt: cupon!.maxCanjes } },
      data: { canjes: { increment: 1 } },
    });
    if (reservado.count !== 1) {
      // Alguien se llevó el último canje entre la lectura y el update.
      throw new DomainError("INVALID", MENSAJE_CUPON_INVALIDO);
    }

    await tx.platformCouponRedemption.create({
      data: {
        couponId: cupon!.id,
        tenantId,
        pagadorId,
        // Snapshot del código tal como se canjeó: la fila se lee sola aunque el cupón cambie.
        codigo: normalizado,
        // Reservado, todavía sin suscripción: la liga `activarPlanTrasRegistro`.
        subscriptionId: null,
      },
    });
  });
}

/**
 * Libera las reservas de canje SIN LIGAR de una Tienda, devolviéndole el cupo al cupón. Es la
 * contracara de reservar antes del redirect: un intento abandonado no puede quemar un canje.
 *
 * **Corre siempre dentro de una `$transaction`** (de ahí el `Prisma.TransactionClient`): borrar la
 * reserva y devolverle el cupo al cupón son un solo hecho.
 *
 * El orden importa y es BORRAR PRIMERO, condicionado a que la fila siga sin ligar. El `DELETE` toma
 * el row-lock, así que de dos liberaciones concurrentes de la misma reserva una obtiene `count: 1` y
 * la otra `count: 0` — el decremento lo hace SOLO la que ganó el borrado. Al revés (decrementar y
 * después borrar) las dos decrementarían el mismo cupo y el cupón terminaría regalando MÁS canjes
 * que su `maxCanjes`: en un dominio con plata, el error tiene que caer del lado de dar un canje de
 * menos, nunca uno de más.
 */
async function liberarReservas({
  tx,
  tenantId,
}: {
  tx: Prisma.TransactionClient;
  tenantId: string;
}): Promise<void> {
  const reservas = await tx.platformCouponRedemption.findMany({
    where: { tenantId, subscriptionId: null },
    select: { id: true, couponId: true },
  });

  for (const r of reservas) {
    const borrada = await tx.platformCouponRedemption.deleteMany({
      where: { id: r.id, subscriptionId: null },
    });
    // Otra liberación concurrente se la llevó: el cupo ya se lo devolvió ELLA.
    if (borrada.count !== 1) continue;

    await tx.platformCoupon.updateMany({
      where: { id: r.couponId },
      data: { canjes: { decrement: 1 } },
    });
  }
}
