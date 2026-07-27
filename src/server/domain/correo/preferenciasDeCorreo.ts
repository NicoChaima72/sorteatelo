import { randomBytes } from "node:crypto";

import { type Prisma, type PrismaClient } from "@prisma/client";

import { TEXTO_CONSENTIMIENTO_RECORDATORIOS } from "~/config/correo";
import { identidadDeCorreo } from "~/server/domain/correo/ledgerCorreos";

/**
 * **Preferencias de correo del Comprador** (F05, D5/I5): consentimiento de recordatorios y
 * supresión. Es el único módulo que sabe leer y escribir esas dos tablas.
 *
 * ── El filtro vive acá, y en UN solo lugar, a propósito ────────────────────────────────────────
 * La regla de I5 es cross-tabla y Postgres no puede expresarla: un aviso sale solo si la persona
 * **tiene consentimiento Y no tiene supresión**. Son dos consultas, y el modo de falla de olvidar
 * la segunda es escribirle a alguien que dijo BASTA — sobre un dominio de envío que es reputación
 * de TODAS las Tiendas (I2). Por eso `destinatariosDeAvisos` existe y por eso F06 no consulta esas
 * tablas por su cuenta: hay un solo camino y hace las dos preguntas.
 *
 * Corolario deliberado: **darse de baja NO borra el consentimiento**. Borrarlo destruiría la prueba
 * de que los envíos anteriores fueron lícitos, que es justamente para lo que existe el registro
 * verificable. La baja se expresa como una fila nueva en la otra tabla, y el filtro la respeta.
 *
 * ── La identidad de una persona ────────────────────────────────────────────────────────────────
 * Siempre `identidadDeCorreo` (trim + lowercase) — la MISMA función que namespacea las claves del
 * ledger. Con dos definiciones, quien compró escribiendo su correo con mayúsculas quedaría con dos
 * consentimientos, o con una baja invisible.
 */

/** Cliente Prisma o de transacción: el consentimiento se escribe DENTRO de la `$tx` del checkout. */
type ClientePreferencias = PrismaClient | Prisma.TransactionClient;

/**
 * Token opaco del enlace de baja. `randomBytes(32)` y no un cuid: acá el token ES la autoridad del
 * endpoint público (mismo patrón que `DownloadGrant.token` y los tokens del MCP). Un cuid lleva
 * timestamp y contador — adivinable de a poco, y esto da de baja a un tercero.
 */
export function nuevoTokenBaja(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Registra el consentimiento de recordatorios de UNA Tienda (D5). Se llama SOLO cuando el checkbox
 * vino marcado: la ausencia de esta llamada ES el «no».
 *
 * ── Por qué NO es un `upsert` ──────────────────────────────────────────────────────────────────
 * Corre DENTRO de la `$transaction` del checkout, y en Postgres un statement que falla **aborta la
 * transacción entera**: un `upsert` que choque con el `@@unique` (la misma persona disparando dos
 * checkouts a la vez en la misma Tienda) tiraría P2002 y se llevaría puesta **la venta**. Un
 * consentimiento de marketing no puede tener la capacidad de voltear una compra.
 *
 * `createMany({ skipDuplicates })` + `updateMany` no lanzan nunca: el primero se salta la colisión
 * en silencio, el segundo no se queja de no encontrar nada. El orden es create-primero porque el
 * caso común es la primera compra de esa persona ⇒ una sola ida a la DB (contra el pooler cada
 * operación cuesta ~0,5-1 s y esta `$tx` ya sostiene el gate de venta, los productos y la Order).
 *
 * ── Qué se refresca y qué NO ───────────────────────────────────────────────────────────────────
 * Re-consentir actualiza la prueba vigente (`otorgadoAt`/`ip`/`textoMostrado`/`orderId`/snapshot del
 * email) y **conserva el `tokenBaja`**: reescribirlo mataría el enlace «darme de baja» de todos los
 * correos YA enviados, que es exactamente lo que RFC 8058 promete que funciona.
 *
 * El `textoMostrado` lo pone el SERVER desde la constante compartida que también renderiza el
 * checkbox. Jamás llega del cliente: sería dejar que el evaluado escriba su propia prueba.
 */
export async function registrarConsentimientoRecordatorios({
  db,
  tenantId,
  orderId,
  email,
  ip,
  ahora = new Date(),
}: {
  db: ClientePreferencias;
  /** Resuelto server-side desde el subdominio (I1), jamás del input. */
  tenantId: string;
  /** La compra en la que se dio: la fila del consentimiento cuelga de ella (FK Restrict). */
  orderId: string;
  /** Tal como lo escribió el Comprador; acá se normaliza la identidad y se guarda el snapshot. */
  email: string;
  /** IP del request. `null` si el borde no la pudo derivar — no se inventa. */
  ip: string | null;
  ahora?: Date;
}): Promise<void> {
  const emailNormalizado = identidadDeCorreo(email);
  const prueba = {
    email,
    orderId,
    ip,
    textoMostrado: TEXTO_CONSENTIMIENTO_RECORDATORIOS,
    otorgadoAt: ahora,
  };

  const { count } = await db.consentimientoRecordatorios.createMany({
    data: [{ tenantId, emailNormalizado, ...prueba, tokenBaja: nuevoTokenBaja() }],
    skipDuplicates: true,
  });
  // `count === 0` ⇒ ya había consentimiento de esta persona en esta Tienda (o lo creó una compra
  // concurrente en la milésima anterior): se refresca la prueba sin tocar el token.
  if (count === 0) {
    await db.consentimientoRecordatorios.updateMany({
      where: { tenantId, emailNormalizado },
      data: prueba,
    });
  }
}

/**
 * Registra la SUPRESIÓN de avisos de una Tienda (baja one-click, RFC 8058). Idempotente **por el
 * constraint, no por lógica**: `createMany({ skipDuplicates })` sobre el `@@unique([tenantId,
 * emailNormalizado])` hace que el segundo click sea un no-op y no un error — que es lo que el
 * endpoint público necesita para poder responder «listo» siempre.
 *
 * Devuelve si la fila es NUEVA. No cambia la respuesta al Comprador (las dos veces se dio de baja,
 * y decírselo distinto sería confundirlo); sirve para no mentir en las métricas.
 */
export async function suprimirCorreoDeAvisos({
  db,
  tenantId,
  email,
}: {
  db: ClientePreferencias;
  tenantId: string;
  email: string;
}): Promise<{ nueva: boolean }> {
  const { count } = await db.supresionCorreo.createMany({
    data: [{ tenantId, emailNormalizado: identidadDeCorreo(email) }],
    skipDuplicates: true,
  });
  return { nueva: count === 1 };
}

/** Lo que un destinatario habilitado aporta al correo de aviso. */
export interface DestinatarioDeAvisos {
  /** Snapshot del correo tal como lo escribió: es el `to` real del envío. */
  email: string;
  /** Token del enlace de baja de ESTA Tienda (cabecera RFC 8058 + enlace visible). */
  tokenBaja: string;
}

/**
 * **El filtro de I5**, batch: de una lista de correos, cuáles pueden recibir AVISOS de esta Tienda.
 *
 * Devuelve un mapa `identidad normalizada → { email, tokenBaja }`. Las identidades ausentes del
 * mapa NO reciben: o nunca consintieron, o se dieron de baja. La ausencia es la respuesta segura —
 * si mañana una consulta falla y devuelve vacío, el resultado es «no se manda nada», nunca «se le
 * manda a todos».
 *
 * Dos queries pase lo que pase (no dos por persona): una corrida del cron mira hasta 100 filas y
 * contra el pooler cada round-trip cuesta ~0,6-1 s. La entrada se normaliza acá adentro, así que el
 * caller puede pasar los emails crudos de `RaffleEntry` sin acordarse de la regla.
 *
 * **Tenancy (I1)**: las dos consultas van scopeadas por el `tenantId` que recibe, que sale del
 * sorteo/orden ya resuelto server-side. Consentir en una Tienda no vale en otra, y darse de baja en
 * una no da de baja en las demás (CONTEXT § Supresión de correo).
 */
export async function destinatariosDeAvisos({
  db,
  tenantId,
  emails,
}: {
  db: PrismaClient;
  tenantId: string;
  emails: string[];
}): Promise<Map<string, DestinatarioDeAvisos>> {
  const identidades = [...new Set(emails.map(identidadDeCorreo))];
  const habilitados = new Map<string, DestinatarioDeAvisos>();
  if (identidades.length === 0) return habilitados;

  const [consentimientos, supresiones] = await Promise.all([
    db.consentimientoRecordatorios.findMany({
      where: { tenantId, emailNormalizado: { in: identidades } },
      select: { emailNormalizado: true, email: true, tokenBaja: true },
    }),
    db.supresionCorreo.findMany({
      where: { tenantId, emailNormalizado: { in: identidades } },
      select: { emailNormalizado: true },
    }),
  ]);

  const suprimidos = new Set(supresiones.map((s) => s.emailNormalizado));
  for (const c of consentimientos) {
    // La baja GANA sobre un consentimiento previo, siempre: es el orden que el plan fija («solo
    // con consentimiento y SIN supresión»). Volver a marcar el checkbox en una compra nueva
    // tampoco reactiva los avisos — hoy la baja es definitiva por Tienda. Si alguna vez se quiere
    // permitir la re-suscripción, el schema ya lo soporta (comparar `otorgadoAt` contra
    // `SupresionCorreo.createdAt`); es decisión de producto, no un olvido.
    if (suprimidos.has(c.emailNormalizado)) continue;
    habilitados.set(c.emailNormalizado, {
      email: c.email,
      tokenBaja: c.tokenBaja,
    });
  }
  return habilitados;
}

/**
 * Resuelve el token de un enlace de baja a la persona y la Tienda que representa. Token
 * desconocido ⇒ `null`, y el borde responde lo mismo que para uno válido (404 neutral / página de
 * confirmación): un endpoint que distinga «token inválido» de «token válido» es un oráculo para
 * enumerar tokens ajenos.
 */
export async function tiendaYPersonaDelTokenDeBaja({
  db,
  token,
}: {
  db: PrismaClient;
  token: string;
}): Promise<{
  tenantId: string;
  nombreTienda: string;
  emailNormalizado: string;
} | null> {
  const consentimiento = await db.consentimientoRecordatorios.findUnique({
    where: { tokenBaja: token },
    select: {
      tenantId: true,
      emailNormalizado: true,
      tenant: { select: { nombre: true } },
    },
  });
  if (!consentimiento) return null;
  return {
    tenantId: consentimiento.tenantId,
    nombreTienda: consentimiento.tenant.nombre,
    emailNormalizado: consentimiento.emailNormalizado,
  };
}
