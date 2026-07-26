import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel } from "~/server/authPolicy";
import { DomainError } from "~/server/domain/errors";
import { validarAccessToken } from "~/server/mcp/tokens";
import {
  cargarMembresiasCanonicas,
  type MembresiaCanonica,
} from "~/server/panel/membresias";

/**
 * Contexto de una llamada MCP y la política de selección de Tienda (ADR-0025, D4/D5/I1).
 *
 * El MCP es un **borde hermano de `panelProcedure`**: donde el panel resuelve la Tienda desde el
 * SUBDOMINIO (server-authored, ADR-0022), el MCP la resuelve desde un **argumento de la tool**,
 * porque vive en el apex con un token per-usuario que cruza tiendas ("crear otra Tienda" no
 * puede colgar del host de una).
 *
 * Ese argumento es justo el patrón que hay que tratar con pinzas — un input del cliente eligiendo
 * tenant fue el bug H1 de datawalt-app. La regla es **selecciona-jamás-autoriza**:
 *
 * - La AUTORIZACIÓN sale de `TenantMembership`, cargada server-side desde el `userId` que trae el
 *   token, en CADA llamada (sin cache: revocar una membresía corta el acceso en la request
 *   siguiente).
 * - El slug solo elige DENTRO de esa lista. Un slug ajeno no es un error de "no existe": es
 *   `FORBIDDEN`, y el mensaje no distingue ambos casos.
 * - El `AccesoPanel` resultante es el MISMO tipo que arma `panelProcedure`, así que los use cases
 *   de `src/server/domain/` se invocan sin cambios y **vuelven a autorizar** con
 *   `resolverTenantDelPanel` (defensa en profundidad, I4: cero lógica de dominio en este borde).
 */

export interface ContextoMcp {
  db: PrismaClient;
  /** Identidad del token: `User.id` de NextAuth (D2). */
  userId: string;
  /** Snapshot del correo para auditoría (ADR-0004); puede faltar en un User sin email. */
  email: string | null;
  /** Conexión MCP que hizo la llamada (para el audit de F10). */
  clientId: string;
  scopes: string[];
  /** Membresías vivas en el ORDEN CANÓNICO (ADR-0022), recargadas en cada request. */
  membresias: MembresiaCanonica[];
}

export type ResultadoAutenticacionMcp =
  | { estado: "ok"; ctx: ContextoMcp }
  | { estado: "invalido" }
  | { estado: "revocado" }
  | { estado: "vencido" };

/**
 * Valida el bearer y arma el contexto de la llamada. Las membresías se recargan SIEMPRE (no se
 * guardan en el token): el token dice QUIÉN es, nunca QUÉ puede.
 */
export async function autenticarLlamadaMcp({
  db,
  rawToken,
}: {
  db: PrismaClient;
  rawToken: string;
}): Promise<ResultadoAutenticacionMcp> {
  const validacion = await validarAccessToken({ db, rawToken });
  if (validacion.estado !== "ok") return { estado: validacion.estado };

  // El User pudo borrarse después de emitir el token (el Cascade se lleva los tokens, pero una
  // request en vuelo puede cruzarse). Sin fila de User no hay identidad: token inválido.
  const usuario = await db.user.findUnique({
    where: { id: validacion.userId },
    select: { email: true },
  });
  if (!usuario) return { estado: "invalido" };

  const membresias = await cargarMembresiasCanonicas({
    db,
    userId: validacion.userId,
  });

  return {
    estado: "ok",
    ctx: {
      db,
      userId: validacion.userId,
      email: usuario.email,
      clientId: validacion.clientId,
      scopes: validacion.scopes,
      membresias,
    },
  };
}

/**
 * Acceso para una tool que opera UNA Tienda. El `slugTienda` viene del argumento de la tool y
 * solo selecciona; si no está entre las membresías del dueño del token ⇒ `FORBIDDEN`.
 */
export function accesoParaTienda(
  ctx: ContextoMcp,
  slugTienda: string,
): AccesoPanel {
  const membresia = ctx.membresias.find((m) => m.slug === slugTienda);
  if (!membresia) {
    // Un slug ajeno y un slug inexistente dan el MISMO error: el MCP no es un directorio de
    // tiendas de otros. Para saber cuáles son suyas, el usuario tiene `mis_tiendas`.
    throw new DomainError(
      "FORBIDDEN",
      `No tienes acceso a una tienda con la dirección «${slugTienda}». Usa "mis_tiendas" para ver las tuyas.`,
    );
  }

  return {
    userId: ctx.userId,
    email: ctx.email,
    // Las membresías COMPLETAS: son la autorización que el use case va a re-verificar.
    tenantIds: ctx.membresias.map((m) => m.tenantId),
    tenantIdDelHost: membresia.tenantId,
  };
}

/**
 * Acceso para tools de CUENTA (crear Tienda), que preceden a cualquier membresía. Deja
 * `tenantIdDelHost` en `null` a propósito: es el mismo estado que el panel en el apex, así que
 * cualquier use case que exija Tienda falla fail-closed en vez de agarrar una al azar.
 */
export function accesoSinTienda(ctx: ContextoMcp): AccesoPanel {
  return {
    userId: ctx.userId,
    email: ctx.email,
    tenantIds: ctx.membresias.map((m) => m.tenantId),
    tenantIdDelHost: null,
  };
}

/**
 * Desafío del 401 (RFC 6750 §3 + RFC 9728). El `resource_metadata` es lo que permite al cliente
 * descubrir el AS y arrancar el dance solo, sin que nadie configure una URL a mano.
 */
export function desafioWwwAuthenticate(
  base: string,
  error: string,
  descripcion: string,
): string {
  return [
    `Bearer realm="mcp"`,
    `error="${error}"`,
    `error_description="${descripcion}"`,
    `resource_metadata="${base}/.well-known/oauth-protected-resource"`,
  ].join(", ");
}
