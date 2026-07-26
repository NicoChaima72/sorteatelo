import { env } from "~/env";
import { derivarUrlCallback } from "~/server/domain/facturacion/_urlWebhook";
import {
  crearFlowPlataformaService,
  type FlowPlataformaService,
} from "~/server/services/flowPlataforma";

/**
 * Borde de cableado de la facturación de la plataforma (F02, ADR-0026): el **único** lugar de la
 * app que construye el `FlowPlataformaService`, y la única parte que toca `~/env` (el service nunca
 * lo hace — convención de `services/`). Espeja `correo/correoDeEnv.ts` y `pago/flowDeTenant.ts`.
 *
 * Es el sostén práctico de **I1**: la factory acepta config explícita para ser testeable, pero en
 * la app no hay forma de invocarla con otras credenciales, porque `crearFlowPlataformaDeEnv()` no
 * recibe argumentos. La contracara del BYO es exacta y deliberada: allá hay UN service POR TENANT
 * (`crearFlowServiceDeTenant`, credenciales cifradas en DB); acá hay UNO SOLO para toda la
 * plataforma, con credenciales que viven exclusivamente en env (I7) y jamás en DB, logs ni
 * respuestas. Un guard de regresión (`flowPlataforma.i1.002`) se pone rojo si aparece un segundo
 * productor.
 *
 * Las env vars son OPCIONALES en `src/env.js` (la app arranca sin ellas: un repo sin cuenta Flow de
 * plataforma sigue levantando); el fail-fast ocurre al EJECUTAR una llamada, nombrando la env var
 * faltante y nunca su valor.
 */
export function crearFlowPlataformaDeEnv(): FlowPlataformaService {
  return crearFlowPlataformaService({
    apiKey: env.FLOW_PLATAFORMA_API_KEY,
    secretKey: env.FLOW_PLATAFORMA_SECRET_KEY,
    // Sandbox por DEFECTO: para cobrar de verdad hay que decirlo explícitamente
    // (`FLOW_PLATAFORMA_SANDBOX="false"`). Fallar hacia el ambiente de prueba nunca le saca plata
    // a nadie por accidente; fallar hacia producción sí.
    sandbox: env.FLOW_PLATAFORMA_SANDBOX !== "false",
  });
}

/**
 * URL del webhook de suscripciones (F04) que se registra como `urlCallback` de cada plan de Flow.
 * La PRIORIDAD vive en el núcleo puro `domain/facturacion/_urlWebhook.ts`, compartido con el script
 * CLI: acá solo se le pasan los valores de `~/env`. Fail-fast si no hay ninguna base utilizable —
 * un plan con `urlCallback` roto se descubre recién cuando el primer cobro no notifica.
 */
export function urlCallbackSuscripciones(): string {
  const url = derivarUrlCallback({
    explicita: env.FLOW_PLATAFORMA_URL_CALLBACK,
    appUrl: env.APP_URL,
    nextAuthUrl: env.NEXTAUTH_URL,
  });
  if (!url) {
    throw new Error(
      "No pude armar el urlCallback del webhook de suscripciones: define " +
        "FLOW_PLATAFORMA_URL_CALLBACK (o APP_URL / NEXTAUTH_URL) en .env (ver .env.example).",
    );
  }
  return url;
}

/** Ruta de la página del panel donde aterriza el navegador al volver del registro de tarjeta. */
export const PATH_RETORNO_PLAN = "/admin/plan/retorno";

/**
 * Ruta de retorno del CAMBIO de tarjeta (F10/D12). Es una página aparte y no un `?modo=` sobre la
 * anterior por dos razones: (1) Flow le agrega el `token` a la `url_return` y no queremos depender de
 * cómo concatena una URL que ya trae query string; (2) cada página de retorno es una máquina de fases
 * con UN solo trabajo (frontend-conventions § «Salir de la app a un proveedor externo y volver») —
 * acá el trabajo es reemplazar la tarjeta, no activar ni publicar nada.
 */
export const PATH_RETORNO_TARJETA = "/admin/plan/retorno-tarjeta";

/**
 * URL de retorno del registro de tarjeta (F03/D12). A diferencia del `urlCallback` del webhook —que
 * es de plataforma y global— esta URL es **per-tenant**: el panel corre en el subdominio de SU
 * Tienda (ADR-0022), así que el origen del request ya trae el host correcto y el Organizador vuelve
 * a su propio panel. Server-side siempre; el cliente no propone a dónde volver.
 *
 * Sin origen (no debería pasar en un request del panel) cae a la URL pública de la app: mejor
 * aterrizar en el apex que dejar a Flow sin `url_return` y perder el token del registro.
 *
 * NO se extrajo a un núcleo puro como `derivarUrlCallback` a propósito: ese vive aparte porque tiene
 * DOS consumidores que leen env de formas distintas (la app y el script CLI) y divergir era el riesgo
 * real. Acá hay un solo consumidor. Lo que sí se copia de él es el **fail-fast explícito**: si no hay
 * ninguna base utilizable, se lanza nombrando qué configurar. Hoy `NEXTAUTH_URL` es obligatoria en
 * `src/env.js` y el caso no ocurre; el guard es para el día en que deje de serlo — sin él, esto
 * reventaría con un `TypeError` de `.replace` sobre `undefined`, ilegible en un flujo de dinero.
 */
export function urlRetornoPlan(origen: string | null | undefined): string {
  return `${baseDelPanel(origen)}${PATH_RETORNO_PLAN}`;
}

/** URL de retorno del CAMBIO de tarjeta (F10). Mismo criterio per-tenant que `urlRetornoPlan`. */
export function urlRetornoCambioDeTarjeta(
  origen: string | null | undefined,
): string {
  return `${baseDelPanel(origen)}${PATH_RETORNO_TARJETA}`;
}

function baseDelPanel(origen: string | null | undefined): string {
  const base = origen ?? env.APP_URL ?? env.NEXTAUTH_URL;
  if (!base?.startsWith("http")) {
    throw new Error(
      "No pude armar la URL de retorno del registro de tarjeta: define APP_URL " +
        "(o NEXTAUTH_URL) en .env (ver .env.example).",
    );
  }
  return base.replace(/\/$/, "");
}
