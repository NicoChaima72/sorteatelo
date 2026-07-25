import { createGateway } from "@ai-sdk/gateway";
import { type LanguageModel } from "ai";

import { env } from "~/env";

/**
 * Composition root del asistente de IA del editor (Tanda 3 F14/D21). El `AI_GATEWAY_API_KEY` (env
 * SERVER-SIDE, ADR-0006/I-U6) se inyecta acá y SOLO acá — los módulos de dominio reciben el `LanguageModel`
 * ya construido, nunca leen la env ni ven la key (patrón FlowCredential). Sin key ⇒ `null` ⇒ el panel no
 * aparece (fail-soft, cero degradación fea). El gateway de Vercel rutea por string `"provider/model"`.
 */

/** Modelo por defecto del asistente (D21, REVISABLE): Haiku 4.5 vía el gateway — barato y suficiente. */
export const MODELO_ASISTENTE = "anthropic/claude-haiku-4-5";

/** `true` sii el asistente está configurado (hay API key). Lo consulta el cliente para mostrar el panel. */
export function asistenteDisponible(): boolean {
  return typeof env.AI_GATEWAY_API_KEY === "string" && env.AI_GATEWAY_API_KEY.length > 0;
}

/**
 * Construye el `LanguageModel` del asistente desde la env, o `null` si no hay API key. NUNCA loguea la key.
 * El caller (router) lo inyecta al use case; el use case es puro respecto de la env.
 */
export function crearModeloAsistente(): LanguageModel | null {
  if (!asistenteDisponible()) return null;
  const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
  return gateway.languageModel(MODELO_ASISTENTE);
}
