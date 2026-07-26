import { z } from "zod";

import { esRedirectUriPermitida } from "~/server/mcp/redirectUris";

/**
 * Validación del Dynamic Client Registration (RFC 7591). Pura: el endpoint
 * `/api/mcp/oauth/register` genera el `client_id` y escribe la fila; la política está acá.
 *
 * El registro es PÚBLICO (no puede no serlo: el cliente todavía no tiene credenciales) y por sí
 * solo no otorga NADA — sin el consentimiento de un Organizador logueado no se emite un code.
 * Lo único que un registro define es **a dónde puede terminar un authorization code**, y eso
 * lo acota `esRedirectUriPermitida` (D9).
 */

/** Cota del nombre: se muestra en la consent page, así que no es un campo libre infinito. */
const LARGO_MAX_NOMBRE = 200;

const cuerpoRegistro = z.object({
  client_name: z.string().min(1).max(LARGO_MAX_NOMBRE).optional(),
  redirect_uris: z
    .array(z.string())
    .min(1, "Se requiere al menos un redirect_uri.")
    .refine((uris) => uris.every(esRedirectUriPermitida), {
      message:
        "redirect_uris debe ser loopback (localhost / 127.0.0.1) o un callback HTTPS permitido.",
    }),
  // Campos del RFC que v1 acepta y NO usa: el scope siempre termina en "mcp" (D10) y los grants
  // son fijos. Rechazarlos rompería clientes que los mandan de más sin ganar nada.
  scope: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
});

export type ResultadoRegistro =
  | { ok: true; clientName: string | undefined; redirectUris: string[] }
  | { ok: false; error: "invalid_client_metadata"; descripcion: string };

export function validarRegistroCliente(cuerpo: unknown): ResultadoRegistro {
  const parsed = cuerpoRegistro.safeParse(cuerpo);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_client_metadata",
      descripcion: parsed.error.issues
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; "),
    };
  }

  return {
    ok: true,
    clientName: parsed.data.client_name,
    redirectUris: parsed.data.redirect_uris,
  };
}

/** Nombre de fallback cuando el cliente no manda `client_name` (se ve en el consent). */
export function nombrePorDefecto(clientId: string): string {
  return `Cliente MCP ${clientId.slice(0, 8)}`;
}
