import { construirUrlApex, construirUrlSubdominio } from "~/lib/urlApex";
import { type MembresiaCanonica } from "~/server/panel/membresias";

/**
 * DECISIÓN PURA del guard del panel de administración (admin-multi-tienda F02/D1/D2, ADR-0022).
 *
 * Con el panel scopeado por subdominio, entrar a `/admin` deja de ser "¿hay sesión?" y pasa a ser una
 * MATRIZ: qué host es (apex vs. subdominio de una Tienda), quién sos (sesión, membresías, Operador) y
 * qué tienda administra ese host. Toda esa política vive acá, pura: sin DB, sin NextAuth, sin request
 * — el borde (`guardPaginaAdmin`) resuelve los hechos y traduce el resultado a la forma que pide
 * `getServerSideProps`.
 *
 * Reglas (D1/D2):
 * - Host que no resuelve a una Tienda ⇒ **404 neutral** (ADR-0007: no delata si el slug no existe).
 * - Subdominio + sin sesión ⇒ login DEL APEX (ahí vive el OAuth dance, ADR-0019) con `callbackUrl`
 *   de vuelta a la URL pedida del subdominio.
 * - Subdominio + miembro ⇒ panel de ESA tienda.
 * - Subdominio + logueado sin membresía ⇒ **storefront `/` del mismo subdominio** (I4: nunca ve
 *   chrome de admin ajeno; no una pantalla de "sin permiso", que ya sería contarle que la tienda
 *   existe).
 * - Apex + sesión + membresías ⇒ redirect a la PRIMERA tienda (orden canónico, D5) PRESERVANDO la
 *   subruta (D8: un bookmark a `/admin/productos` no se pierde en la migración).
 * - Apex + sesión sin membresías ⇒ `alta` (el layout muestra el alta de Tienda). Es la única
 *   pantalla de contenido que queda viva en el apex.
 * - Apex + sin sesión ⇒ login relativo (mismo host) preservando la ruta en el `callbackUrl`.
 *
 * **D11 (2026-07-25) — el Operador de plataforma NO es excepción.** El diseño original le daba
 * acceso al panel de CUALQUIER tienda (con un badge de aviso en el chrome); el usuario lo rechazó:
 * "tiene que haber admin por empresas, yo no puedo ver todas las empresas". El panel de Organizador
 * se administra por MEMBRESÍA y nada más, así que un Operador no miembro rebota al storefront igual
 * que cualquier logueado. Por eso la entrada de esta decisión ni siquiera declara el flag: la
 * excepción no se puede reintroducir por descuido. La vista cross-tienda del Operador sigue viva en
 * su propio panel (`/admin/operador` + `operadorProcedure`), que es otra superficie; un eventual
 * "superadmin" sería una tercera, no una puerta de servicio en esta.
 */

/** Zona que administra el host del request, ya resuelta contra la DB por el borde. */
export type ZonaAdmin =
  | { tipo: "apex" }
  | { tipo: "tienda"; tenantId: string; slug: string }
  /** Host que no es el apex ni resuelve a una Tienda existente ⇒ 404 neutral. */
  | { tipo: "sin-tienda" };

/** De dónde llega el request, en las piezas que se necesitan para construir destinos absolutos. */
export interface OrigenAdmin {
  /** Con los dos puntos, como `window.location.protocol` (`https:`). */
  protocolo: string;
  /** Dominio raíz de la plataforma, PELADO (sin subdominio, sin puerto). */
  apex: string;
  /** Puerto del request, si lo hay (dev: `3001`). */
  puerto?: string;
}

export interface EntradaAdmin {
  zona: ZonaAdmin;
  /** Hay sesión NextAuth. Es IDENTIDAD, no autorización (ADR-0019). */
  haySesion: boolean;
  /**
   * Membresías del usuario en ORDEN CANÓNICO (D5). Vacío si no hay sesión.
   *
   * Es la ÚNICA fuente de autorización de esta decisión (D11): no hay un flag de rol acá a
   * propósito — ver el bloque de arriba.
   */
  membresias: MembresiaCanonica[];
  /** Ruta pedida dentro del panel (`/admin`, `/admin/productos`). */
  ruta: string;
  origen: OrigenAdmin;
}

export type DecisionAdmin =
  /** Renderiza el panel de la tienda del host (siempre una tienda de la que el usuario es miembro). */
  | { tipo: "panel"; tenantId: string; slug: string }
  /** Renderiza la puerta del apex: alta de Tienda (o el empty state del Operador). */
  | { tipo: "alta" }
  | { tipo: "redirect"; destino: string }
  /** Respuesta neutral de ADR-0007: ni confirma ni desmiente que la tienda exista. */
  | { tipo: "no-encontrado" };

export function decidirAccesoAdmin(entrada: EntradaAdmin): DecisionAdmin {
  const { zona } = entrada;

  // Host ininteligible o slug que no existe ⇒ neutral, ANTES de mirar la sesión (que exista o no
  // una sesión no debe cambiar lo que se le cuenta al que sondea slugs).
  if (zona.tipo === "sin-tienda") return { tipo: "no-encontrado" };

  if (zona.tipo === "apex") return decidirEnApex(entrada);

  return decidirEnTienda(entrada, zona);
}

/** El apex es una PUERTA (D1): no sirve contenido del panel, solo empuja a la tienda que corresponde. */
function decidirEnApex(entrada: EntradaAdmin): DecisionAdmin {
  if (!entrada.haySesion) {
    // Mismo host ⇒ `callbackUrl` RELATIVO (lo ancla `validarCallbackUrl` al baseUrl). Conserva la
    // subruta: tras loguearse, el apex vuelve a decidir y redirige a la tienda con esa misma subruta.
    return {
      tipo: "redirect",
      destino: `/login?callbackUrl=${encodeURIComponent(entrada.ruta)}`,
    };
  }

  const primera = entrada.membresias[0];
  if (!primera) return { tipo: "alta" };

  return {
    tipo: "redirect",
    destino: construirUrlSubdominio({
      protocol: entrada.origen.protocolo,
      apex: entrada.origen.apex,
      puerto: entrada.origen.puerto,
      slug: primera.slug,
      path: entrada.ruta, // D8: preserva la subruta del bookmark
    }),
  };
}

/** La matriz del subdominio (D2). El tenant activo es el del HOST — nunca una elección del cliente. */
function decidirEnTienda(
  entrada: EntradaAdmin,
  zona: Extract<ZonaAdmin, { tipo: "tienda" }>,
): DecisionAdmin {
  const urlPedida = construirUrlSubdominio({
    protocol: entrada.origen.protocolo,
    apex: entrada.origen.apex,
    puerto: entrada.origen.puerto,
    slug: zona.slug,
    path: entrada.ruta,
  });

  if (!entrada.haySesion) {
    return {
      tipo: "redirect",
      // El OAuth dance vive SIEMPRE en el apex (ADR-0019: `NEXTAUTH_URL` fijo, un solo redirect URI
      // en Google), así que el login es cross-host aunque el panel esté en el subdominio.
      destino: construirUrlApex({
        protocol: entrada.origen.protocolo,
        apex: entrada.origen.apex,
        puerto: entrada.origen.puerto,
        path: "/login",
        callbackUrl: urlPedida,
      }),
    };
  }

  const esMiembro = entrada.membresias.some((m) => m.tenantId === zona.tenantId);
  if (esMiembro) {
    return { tipo: "panel", tenantId: zona.tenantId, slug: zona.slug };
  }

  // Logueado sin membresía en ESTA tienda: a la tienda como visitante (I4). Relativo ⇒ mismo
  // subdominio. Sin excepciones por rol de plataforma (D11).
  return { tipo: "redirect", destino: "/" };
}

/**
 * Deriva el `OrigenAdmin` del request (puro). El apex NO se toma del host —que en el panel ya es
 * `<tienda>.<apex>`— sino de la config de plataforma, que es la autoridad de "cuál es el dominio
 * raíz" (ADR-0007); del host solo se rescata el PUERTO, que la config no conoce (dev: `:3001`).
 *
 * Protocolo: `x-forwarded-proto` manda cuando hay proxy delante (Vercel, túnel cloudflared con https
 * sobre `NODE_ENV=development`). Sin él, un host con puerto explícito es desarrollo local ⇒ `http`.
 * Esa regla cubre `localhost:3001` Y `lvh.me:3001` (el host de dev cross-subdominio de ADR-0019, que
 * no termina en `.localhost` y con la heurística de dominios se leería como producción).
 */
export function origenDeHostAdmin({
  host,
  forwardedProto,
  dominioRaiz,
}: {
  host: string | undefined | null;
  forwardedProto?: string | string[] | undefined | null;
  dominioRaiz: string;
}): OrigenAdmin {
  const normalizado = (host ?? "").trim().toLowerCase();
  const puerto = /:(\d+)$/.exec(normalizado)?.[1];

  const crudo = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const declarado = crudo?.split(",")[0]?.trim().toLowerCase();

  const protocolo = declarado
    ? `${declarado}:`
    : puerto || normalizado === "localhost"
      ? "http:"
      : "https:";

  return { protocolo, apex: dominioRaiz, puerto };
}
