import { createHash, randomBytes } from "node:crypto";
import { type PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * Tokens MCP (CONTEXT § Token MCP) — ÚNICO módulo del código que toca `McpAccessToken` y
 * `McpRefreshToken`. Emite, valida, refresca y revoca (ADR-0025, D2/I2).
 *
 * **Hash, no cifrado.** Un Token MCP es nuestro y solo se COMPARA contra lo guardado ⇒ SHA-256
 * irreversible. Es la diferencia exacta con `FlowCredential`, que va CIFRADA (reversible) porque
 * hay que recuperarla para llamar a Flow (ADR-0006). Guardar un token de API cifrado sería
 * darse la capacidad de leerlo sin necesitarla. El token plano existe una sola vez: en la
 * respuesta del token endpoint.
 *
 * La identidad que viaja adentro es el `User.id` de NextAuth. **No es una capacidad**: qué
 * Tiendas puede tocar se recalcula contra `TenantMembership` en CADA llamada de tool (D4/I1).
 * Revocar una membresía corta el acceso al instante sin tocar el token.
 *
 * TTLs en código (no en env): access 1 h, refresh 30 d. Son parámetros de seguridad, no de
 * deploy — cambiarlos es un cambio revisado.
 */

const TTL_ACCESS_MS = 60 * 60 * 1000; // 1 hora
const TTL_REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

function hashearToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generarTokenRaw(): string {
  // 32 bytes = 256 bits de entropía; base64url ≈ 43 chars. Opaco: no codifica nada adentro.
  return randomBytes(32).toString("base64url");
}

export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

/**
 * Emite un par access+refresh. Los dos INSERT van en una `$transaction`: un refresh huérfano
 * (sin su access) o al revés dejaría al cliente en un estado que no sabe resolver.
 *
 * Devuelve los tokens EN CLARO — es la única vez que existen fuera del cliente. Quien llame no
 * debe loguearlos (I2).
 */
export async function emitirParDeTokens({
  db,
  userId,
  clientId,
  scopes = "mcp",
}: {
  db: PrismaClient;
  userId: string;
  clientId: string;
  scopes?: string;
}): Promise<ParDeTokens> {
  const ahora = new Date();
  const accessRaw = generarTokenRaw();
  const refreshRaw = generarTokenRaw();
  const accessExpiresAt = new Date(ahora.getTime() + TTL_ACCESS_MS);
  const refreshExpiresAt = new Date(ahora.getTime() + TTL_REFRESH_MS);

  await db.$transaction([
    db.mcpAccessToken.create({
      data: {
        tokenHash: hashearToken(accessRaw),
        clientId,
        userId,
        scopes,
        expiresAt: accessExpiresAt,
      },
    }),
    db.mcpRefreshToken.create({
      data: {
        tokenHash: hashearToken(refreshRaw),
        clientId,
        userId,
        scopes,
        expiresAt: refreshExpiresAt,
      },
    }),
  ]);

  return { accessToken: accessRaw, refreshToken: refreshRaw, accessExpiresAt, refreshExpiresAt };
}

export type ValidacionAccessToken =
  | { estado: "ok"; userId: string; clientId: string; scopes: string[] }
  | { estado: "invalido" }
  | { estado: "revocado" }
  | { estado: "vencido" };

/**
 * Valida el bearer de CADA request al handler MCP. Los tres motivos de rechazo se distinguen
 * para poder responder un `WWW-Authenticate` honesto (RFC 6750) y para el audit; hacia afuera
 * los tres son 401.
 *
 * `revokedAt` y `expiresAt` se chequean acá, en cada llamada (I5): sin cache, revocar desde el
 * panel corta el acceso en la request siguiente.
 */
export async function validarAccessToken({
  db,
  rawToken,
}: {
  db: PrismaClient;
  rawToken: string;
}): Promise<ValidacionAccessToken> {
  if (!rawToken) return { estado: "invalido" };

  const token = await db.mcpAccessToken.findUnique({
    where: { tokenHash: hashearToken(rawToken) },
    select: {
      id: true,
      userId: true,
      clientId: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!token) return { estado: "invalido" };
  if (token.revokedAt !== null) return { estado: "revocado" };
  if (token.expiresAt.getTime() <= Date.now()) return { estado: "vencido" };

  // `lastUsedAt` alimenta la columna "último uso" del panel Conexiones IA (F09). Es MÉTRICA:
  // se dispara sin esperar y se traga el error — que la escritura falle no puede tumbar una
  // llamada de tool válida.
  void db.mcpAccessToken
    .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      /* silencioso a propósito */
    });

  return {
    estado: "ok",
    userId: token.userId,
    clientId: token.clientId,
    scopes: token.scopes.split(" ").filter(Boolean),
  };
}

export type ResultadoRefresh =
  | ({ estado: "ok"; scopes: string } & ParDeTokens)
  | { estado: "invalido" }
  | { estado: "revocado" }
  | { estado: "vencido" };

/**
 * Canjea un refresh por un par nuevo (OAuth 2.1 §4.3.1). El par nuevo hereda el scope del
 * original: refrescar nunca amplía permisos.
 */
export async function refrescarParDeTokens({
  db,
  rawRefreshToken,
}: {
  db: PrismaClient;
  rawRefreshToken: string;
}): Promise<ResultadoRefresh> {
  if (!rawRefreshToken) return { estado: "invalido" };

  const token = await db.mcpRefreshToken.findUnique({
    where: { tokenHash: hashearToken(rawRefreshToken) },
    select: {
      userId: true,
      clientId: true,
      scopes: true,
      expiresAt: true,
      revokedAt: true,
    },
  });

  if (!token) return { estado: "invalido" };
  if (token.revokedAt !== null) return { estado: "revocado" };
  if (token.expiresAt.getTime() <= Date.now()) return { estado: "vencido" };

  const par = await emitirParDeTokens({
    db,
    userId: token.userId,
    clientId: token.clientId,
    scopes: token.scopes,
  });

  return { estado: "ok", scopes: token.scopes, ...par };
}

/** Revoca un access token puntual (RFC 7009). No-op silencioso si no existe. */
export async function revocarAccessToken({
  db,
  rawToken,
}: {
  db: PrismaClient;
  rawToken: string;
}): Promise<void> {
  if (!rawToken) return;
  await db.mcpAccessToken.updateMany({
    where: { tokenHash: hashearToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoca un refresh token y —por defecto— TODOS los access vivos del mismo (userId, clientId).
 * Sin la cascada, revocar el refresh dejaría al cliente operando hasta una hora con su access
 * actual: no es lo que espera quien aprieta "revocar".
 */
export async function revocarRefreshToken({
  db,
  rawRefreshToken,
  cascadearAccess = true,
}: {
  db: PrismaClient;
  rawRefreshToken: string;
  cascadearAccess?: boolean;
}): Promise<void> {
  if (!rawRefreshToken) return;
  const tokenHash = hashearToken(rawRefreshToken);
  const refresh = await db.mcpRefreshToken.findUnique({
    where: { tokenHash },
    select: { userId: true, clientId: true },
  });
  if (!refresh) return;

  const ahora = new Date();
  await db.$transaction([
    db.mcpRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: ahora },
    }),
    ...(cascadearAccess
      ? [
          db.mcpAccessToken.updateMany({
            where: {
              userId: refresh.userId,
              clientId: refresh.clientId,
              revokedAt: null,
            },
            data: { revokedAt: ahora },
          }),
        ]
      : []),
  ]);
}

/**
 * Una **Conexión MCP** (CONTEXT § Conexión MCP) tal como la ve el Organizador en el panel: el par
 * (usuario, cliente de IA), no un token. Sin `tokenHash` ni nada derivable de él (I2).
 */
export interface ConexionMcp {
  /** `clientId` público de la Conexión: es lo que el botón "Revocar" del panel manda de vuelta. */
  clientId: string;
  /**
   * Nombre que el cliente declaró en el registro dinámico (DCR). **Dato NO confiable**: lo elige
   * quien registra, así que la UI lo trata como texto ajeno (escapado y acotado).
   */
  nombre: string;
  conectadaEl: Date;
  /** Última vez que un token de la Conexión se usó para llamar al MCP; `null` si nunca. */
  ultimoUso: Date | null;
  /** ¿Puede llamar AHORA? (algún token sin revocar y sin vencer). */
  activa: boolean;
}

/**
 * Conexiones MCP del usuario de la sesión, para el panel «Conexiones IA» (F09).
 *
 * **Agrupa por cliente, no lista tokens.** Un cliente conectado renueva su access token cada hora:
 * listar tokens le mostraría al Organizador cientos de filas idénticas en un mes y volvería
 * ilegible la única pantalla donde puede cortar el acceso. La unidad que él reconoce ("Claude
 * Desktop") es la Conexión, y es la que el botón revoca.
 *
 * El `userId` lo pone SIEMPRE el borde desde la sesión, nunca el input.
 *
 * `activa` mira revocación Y vencimiento: decir "activa" de una conexión que ya no puede llamar le
 * haría tomar la decisión (revocar o no) sobre un dato falso.
 */
export async function listarConexionesDeUsuario({
  db,
  userId,
}: {
  db: PrismaClient;
  userId: string;
}): Promise<ConexionMcp[]> {
  const seleccion = {
    clientId: true,
    createdAt: true,
    expiresAt: true,
    revokedAt: true,
    client: { select: { clientName: true } },
  } as const;

  const [access, refresh] = await Promise.all([
    db.mcpAccessToken.findMany({
      where: { userId },
      select: { ...seleccion, lastUsedAt: true },
    }),
    // Los refresh cuentan para `activa`: mientras uno viva, el cliente puede emitirse un access
    // nuevo — una conexión con el access vencido pero el refresh vivo sigue estando abierta.
    db.mcpRefreshToken.findMany({ where: { userId }, select: seleccion }),
  ]);

  const ahora = Date.now();
  const porCliente = new Map<string, ConexionMcp>();

  // Los dos tipos de token se aplanan a una fila común ANTES de agrupar (los refresh no llevan
  // `lastUsedAt`): así el fold de abajo no tiene que saber de qué tabla salió cada fila.
  const filas = [
    ...access.map((t) => ({ ...t, lastUsedAt: t.lastUsedAt })),
    ...refresh.map((t) => ({ ...t, lastUsedAt: null as Date | null })),
  ];

  for (const token of filas) {
    const vivo = token.revokedAt === null && token.expiresAt.getTime() > ahora;
    const ultimoUso = token.lastUsedAt;
    const previa = porCliente.get(token.clientId);

    porCliente.set(token.clientId, {
      clientId: token.clientId,
      nombre: token.client.clientName,
      // La conexión "empezó" con el primer token que se emitió, no con el último refresh.
      conectadaEl:
        previa && previa.conectadaEl < token.createdAt
          ? previa.conectadaEl
          : token.createdAt,
      ultimoUso: masReciente(previa?.ultimoUso ?? null, ultimoUso),
      activa: (previa?.activa ?? false) || vivo,
    });
  }

  return [...porCliente.values()].sort(
    (a, b) =>
      (b.ultimoUso ?? b.conectadaEl).getTime() -
      (a.ultimoUso ?? a.conectadaEl).getTime(),
  );
}

function masReciente(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

/**
 * Input del botón "Revocar" del panel. Solo el `clientId`: el `userId` sale de la sesión, así que
 * no hay forma de expresar "revocá la conexión de otro" ni equivocándose.
 */
export const revocarConexionInput = z.object({
  clientId: z.string().min(1),
});
export type RevocarConexionInput = z.infer<typeof revocarConexionInput>;

/**
 * Revoca la Conexión MCP entera: todos los tokens vivos del par (userId, clientId). Es lo que
 * ejecuta el botón "Revocar" del panel Conexiones IA (F09).
 *
 * El `userId` lo pone SIEMPRE el borde desde la sesión —nunca el input— para que nadie revoque
 * la conexión de otro.
 */
export async function revocarConexion({
  db,
  userId,
  clientId,
}: {
  db: PrismaClient;
  userId: string;
  clientId: string;
}): Promise<void> {
  const ahora = new Date();
  await db.$transaction([
    db.mcpAccessToken.updateMany({
      where: { userId, clientId, revokedAt: null },
      data: { revokedAt: ahora },
    }),
    db.mcpRefreshToken.updateMany({
      where: { userId, clientId, revokedAt: null },
      data: { revokedAt: ahora },
    }),
  ]);
}
