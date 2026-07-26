import type { NextApiRequest, NextApiResponse } from "next";

/**
 * CORS de los endpoints OAuth + discovery + MCP. Los clientes de IA (Claude Code, Claude
 * Desktop, claude.ai) llaman desde un origen distinto al de la app, así que sin esto el dance
 * no arranca.
 *
 * Abrir a `*` es seguro ACÁ y solo acá porque estos endpoints **no usan cookies**: la
 * credencial viaja en el header `Authorization: Bearer`, nunca en la sesión. Por eso tampoco se
 * manda `Access-Control-Allow-Credentials`. El resto de la app (tRPC del panel, que SÍ va por
 * cookie de sesión wildcard, ADR-0019) no comparte esta política.
 */
export function aplicarCorsOauth(_req: NextApiRequest, res: NextApiResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // `DELETE` incluido porque el handler MCP lo acepta (terminación de sesión del transporte): si
  // el preflight no lo anuncia, un cliente browser-based (claude.ai, D9) lo vería bloqueado antes
  // de llegar al handler. Los métodos anunciados espejan los que el handler realmente atiende.
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
  res.setHeader("Access-Control-Max-Age", "86400");
}

/**
 * Responde el preflight OPTIONS con 204. Devuelve `true` si era preflight — el caller DEBE
 * cortar ahí.
 */
export function manejarPreflight(
  req: NextApiRequest,
  res: NextApiResponse,
): boolean {
  if (req.method === "OPTIONS") {
    aplicarCorsOauth(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}
