import { APP_CONFIG } from "~/config/app";

/**
 * Dirección PÚBLICA del MCP del Organizador (ADR-0025), para superficies de CLIENTE.
 *
 * El server ya tiene la suya (`getAppBaseUrl()` + `PATH_MCP_PUBLICO` en `~/server/mcp/discovery`),
 * pero arrastra `~/env` (vars server-only) ⇒ no se puede importar desde un componente. Este módulo
 * es el gemelo client-safe: puro, sin `process.env` ni `window`.
 *
 * `RUTA_MCP` es **espejo declarado** de `PATH_MCP_PUBLICO` y hay un test que ata los dos lados
 * (`guia-ia.test.ts`): si alguien mueve el endpoint, el espejo se cae en rojo en vez de dejar la
 * guía mandando a la gente a una dirección que ya no existe.
 */
export const RUTA_MCP = "/api/mcp";

/**
 * La dirección que el Organizador copia y pega en su app de IA. Sale del **dominio de la
 * plataforma** (`APP_CONFIG.dominio`, misma fuente que las URLs absolutas de la metadata de la
 * landing), nunca de un literal en el componente.
 *
 * Es la URL de PRODUCCIÓN a propósito, y no la del host actual: la guía documenta el servicio
 * público. Un `window.location` acá le mostraría `localhost:3001` a quien esté mirando el panel en
 * desarrollo — una dirección que ninguna app de IA de terceros puede alcanzar.
 */
export function urlMcpPublica(): string {
  return `https://${APP_CONFIG.dominio}${RUTA_MCP}`;
}
