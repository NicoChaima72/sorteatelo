import { APP_CONFIG } from "~/config/app";
import { escaparHtml } from "~/server/domain/correo/_correoBase";

/**
 * Núcleo del endpoint público de **baja de avisos** (F05, RFC 8058 + ADR-0004) — la POLÍTICA del
 * borde, separada del cableado. Puro: recibe un `req` acotado y las dependencias inyectadas, y
 * devuelve `{ status, headers, body }`. No toca `env`, no escribe `res`, no instancia adapters
 * (mismo patrón que `manejarDescarga` y `manejarCronCorreos`).
 *
 * El wrapper Next es `src/pages/api/correo/baja/[token].ts`, y quien lo llama no es la app: es el
 * botón de «cancelar suscripción» del cliente de correo del Comprador, o el propio Comprador desde
 * el enlace del pie.
 *
 * ── Sin login, y con razón ─────────────────────────────────────────────────────────────────────
 * El Comprador NO tiene cuenta (ADR-0004): su identidad es el correo. La autoridad es el **token**
 * opaco del enlace, exactamente como en `/api/descargas/<token>`. Lo que ese token puede hacer es
 * una sola cosa y es reversible-hacia-lo-seguro: dejar de recibir avisos de UNA Tienda.
 *
 * ── Por qué GET y POST hacen cosas distintas ───────────────────────────────────────────────────
 * **POST suprime; GET solo pregunta.** No es purismo REST: los escáneres de seguridad corporativos
 * y los pre-fetchers SIGUEN los enlaces que vienen en un correo, así que un GET que diera de baja
 * sacaría gente de la lista sin que nadie hiciera click — y esa persona nunca se enteraría de por
 * qué dejó de recibir los recordatorios que pidió. Es exactamente la razón por la que RFC 8058
 * exige POST para el one-click. El GET devuelve una página con un botón que hace el POST.
 *
 * ── Neutralidad ────────────────────────────────────────────────────────────────────────────────
 * Un token desconocido responde EXACTAMENTE lo mismo que uno válido: si distinguiera, el endpoint
 * sería un oráculo para enumerar tokens ajenos. Y ninguna respuesta imprime el correo de la
 * persona — la URL viaja en un correo que puede reenviarse, y el token es la única credencial.
 */

export interface ReqBaja {
  method?: string;
  /** `query` de Next: el `[token]` del path. Puede venir ausente o repetido — no se adivina. */
  query: Record<string, unknown>;
}

export interface RespuestaBaja {
  status: number;
  headers?: Record<string, string>;
  body: string;
}

/** Lo que el token identifica: la Tienda de la que se da de baja y quién. */
export interface DestinoDeBaja {
  tenantId: string;
  nombreTienda: string;
  emailNormalizado: string;
}

const CABECERAS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  // Una URL con el token de un tercero no tiene por qué terminar en un buscador.
  "X-Robots-Tag": "noindex, nofollow",
  // La página no se cachea: su contenido depende de si el POST ya ocurrió.
  "Cache-Control": "no-store",
};

/**
 * Hex de esta página. **Misma excepción declarada que `layoutCorreo.ts`** (design.md §9): un HTML
 * que se abre desde un cliente de correo no puede leer `var(--mantine-color-*)`. Y la excepción
 * autoriza COPIAR tonos del theme, no inventarlos — por eso cada valor lleva anotado su token, para
 * que sea auditable de un vistazo y haya algo concreto que actualizar si la paleta se mueve.
 */
const COLOR = {
  /** `gray[1]` — el fondo de la página. */
  fondo: "#eef0f5",
  /** `white` — la tarjeta. */
  tarjeta: "#ffffff",
  /** `gray[9]` / `black` — tinta: el texto y el botón. */
  tinta: "#191b22",
  /** `gray[6]` — tinta-suave (`dimmed`): la firma del pie. */
  tintaSuave: "#565b68",
} as const;

/**
 * Página mínima, autocontenida y sin assets (F05). No es una página de Next a propósito: la abre un
 * cliente de correo, muchas veces en un webview sin JS, y tiene que renderizar sola. Estilos inline
 * por el mismo motivo que en los correos.
 *
 * NO se tematiza con la marca de la Tienda: acá el Comprador está ejerciendo un derecho frente a
 * esa Tienda, y vestir la pantalla con su marca sería, como poco, de mal gusto.
 */
function pagina({
  titulo,
  mensaje,
  formulario,
}: {
  titulo: string;
  mensaje: string;
  formulario?: string;
}): string {
  return (
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<meta name="robots" content="noindex" />` +
    `<title>${escaparHtml(titulo)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:${COLOR.fondo};font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;color:${COLOR.tinta};">` +
    `<div style="max-width:520px;margin:0 auto;padding:48px 20px;">` +
    `<div style="background-color:${COLOR.tarjeta};border-radius:18px;padding:28px;">` +
    `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${escaparHtml(titulo)}</h1>` +
    `<p style="margin:0;font-size:15px;line-height:1.6;">${escaparHtml(mensaje)}</p>` +
    (formulario ?? "") +
    `</div>` +
    `<p style="margin:16px 0 0;text-align:center;font-size:12px;color:${COLOR.tintaSuave};">${escaparHtml(APP_CONFIG.name)}</p>` +
    `</div></body></html>`
  );
}

/**
 * La confirmación del GET. El `<form method="post">` apunta a la MISMA URL (`action` vacío), así
 * que no hay que reconstruir el path ni conocer el token acá — y no puede quedar apuntando a otro
 * lado por un error de armado.
 */
function formularioDeConfirmacion(): string {
  return (
    `<form method="post" style="margin:20px 0 0;">` +
    `<button type="submit" style="display:inline-block;background-color:${COLOR.tinta};color:${COLOR.tarjeta};border:0;border-radius:10px;padding:12px 20px;font-size:15px;cursor:pointer;">` +
    `Sí, darme de baja</button></form>`
  );
}

export async function manejarBajaDeAvisos({
  req,
  buscarPorToken,
  suprimir,
}: {
  req: ReqBaja;
  /** Token ⇒ Tienda + persona. `null` para un token que no existe (no se distingue en la salida). */
  buscarPorToken: (token: string) => Promise<DestinoDeBaja | null>;
  /** Escribe la supresión. Idempotente por constraint: el segundo click no es un error. */
  suprimir: (input: {
    tenantId: string;
    email: string;
  }) => Promise<{ nueva: boolean }>;
}): Promise<RespuestaBaja> {
  // ── Gate antes de cualquier efecto (backend-conventions) ────────────────────
  const metodo = req.method ?? "GET";
  if (metodo !== "GET" && metodo !== "POST") {
    return {
      status: 405,
      headers: CABECERAS,
      body: pagina({
        titulo: "No podemos procesar eso",
        mensaje: "Abre el enlace desde el correo que recibiste.",
      }),
    };
  }

  // El token se lee del path y se exige `string`: un array (`?token=a&token=b`) o la ausencia son
  // requests malformados, no un token vacío que haya que ir a buscar a la DB.
  const token = req.query.token;
  if (typeof token !== "string" || token.length === 0) {
    return {
      status: 400,
      headers: CABECERAS,
      body: pagina({
        titulo: "Enlace incompleto",
        mensaje: "Abre el enlace de baja tal como viene en el correo.",
      }),
    };
  }

  const destino = await buscarPorToken(token);

  // ── GET: preguntar, no ejecutar ─────────────────────────────────────────────
  if (metodo === "GET") {
    return {
      status: 200,
      headers: CABECERAS,
      body: pagina({
        titulo: "¿Dejamos de enviarte recordatorios?",
        // Con token desconocido se muestra la MISMA pantalla, sin nombre de Tienda: el que llegó
        // con un enlace roto ve una confirmación normal y el POST no hará nada. Es la neutralidad
        // que impide usar este endpoint para adivinar tokens.
        mensaje: destino
          ? `Dejarás de recibir los recordatorios del sorteo de ${destino.nombreTienda}. Los correos de tus compras y del resultado del sorteo te siguen llegando.`
          : "Dejarás de recibir los recordatorios del sorteo. Los correos de tus compras y del resultado del sorteo te siguen llegando.",
        formulario: formularioDeConfirmacion(),
      }),
    };
  }

  // ── POST: el efecto ─────────────────────────────────────────────────────────
  // Idempotente: `suprimir` se apoya en el `@@unique([tenantId, emailNormalizado])`, así que el
  // segundo click —o el reintento del proveedor, que repite el one-click si no le respondemos
  // rápido— es un no-op. El `nueva` no cambia la respuesta: las dos veces la persona está dada de
  // baja, y decírselo distinto la haría dudar de si funcionó.
  if (destino) {
    await suprimir({ tenantId: destino.tenantId, email: destino.emailNormalizado });
  }

  return {
    status: 200,
    headers: CABECERAS,
    body: pagina({
      titulo: "Listo, no te escribimos más",
      mensaje: destino
        ? `No vas a recibir más recordatorios del sorteo de ${destino.nombreTienda}. Los correos de tus compras y del resultado del sorteo te siguen llegando.`
        : "No vas a recibir más recordatorios del sorteo. Los correos de tus compras y del resultado del sorteo te siguen llegando.",
    }),
  };
}
