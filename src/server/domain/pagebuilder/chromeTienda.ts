import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { ChromeSchema, chromeDefault, leerChromeParaRender, type Chrome } from "~/lib/pagebuilder/chrome";

/**
 * Use cases del CHROME global del tenant (Tanda 3 F07/D12, ADR-0021). Leer/escribir `Tenant.chromeJson`,
 * tenant-scoped SERVER-SIDE (I1). La ESCRITURA valida contra `ChromeSchema` (el borde de seguridad, I3):
 * un menú con URL no-https, HTML o campo extra ⇒ no parsea ⇒ no escribe. El chrome vive FUERA del
 * Documento de Página ⇒ el MCP NO gana tool para esto (I12/D12): solo el panel Chrome del editor.
 */

/** Devuelve el chrome del tenant para sembrar el panel del editor: null ⇒ el chrome DEFAULT (actual). */
export async function getChrome({
  db,
  tenantId,
}: {
  db: Pick<PrismaClient, "tenant">;
  tenantId: string;
}): Promise<Chrome> {
  const t = await db.tenant.findUnique({ where: { id: tenantId }, select: { chromeJson: true } });
  return leerChromeParaRender(t?.chromeJson ?? null) ?? chromeDefault();
}

/**
 * Escribe el chrome (F07). `chrome: null` ⇒ RESTABLECE al chrome default (columna a NULL ⇒ header/footer
 * actual, byte-idéntico). Un chrome presente se RE-VALIDA con `ChromeSchema` (defensa: nunca se persiste
 * un chrome inválido).
 */
export async function setChrome({
  db,
  tenantId,
  chrome,
}: {
  db: Pick<PrismaClient, "tenant">;
  tenantId: string;
  chrome: Chrome | null;
}): Promise<{ ok: true }> {
  const valor = chrome === null ? Prisma.DbNull : ChromeSchema.parse(chrome);
  await db.tenant.update({ where: { id: tenantId }, data: { chromeJson: valor } });
  return { ok: true };
}

/** Input de `setChrome`: el chrome completo (validado por ChromeSchema) o `null` para restablecer. */
export const setChromeInput = z.object({ chrome: ChromeSchema.nullable() });
export type SetChromeInput = z.infer<typeof setChromeInput>;
