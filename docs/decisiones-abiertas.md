# Decisiones abiertas

Decisiones que el brief dejó **sin cerrar** y **requieren confirmación del cliente** antes de
implementar lo que dependa de ellas. No las cierres por tu cuenta: si una feature en curso choca
con una de estas, parar y preguntar. Cuando una se resuelva y sea load-bearing, promoverla a un
ADR en `docs/adr/` y sacarla de esta lista.

> La decisión #1 del brief (stack) ya quedó **resuelta**: T3 (Next.js 14 pages router + tRPC +
> Prisma + NextAuth + Tailwind + shadcn/ui).

> **Pivote SaaS multi-tenant (2026-07-16, ADR-0005)**: criterios endurecidos por el pivote anotados
> en cada decisión.

> **Resueltas el 2026-07-16** (confirmadas por el usuario, promovidas a ADR y fuera de esta lista):
> **#1 storage de PDFs → Cloudflare R2** ([ADR-0009](adr/0009-storage-pdfs-cloudflare-r2.md));
> **#2 correo transaccional → Resend** ([ADR-0010](adr/0010-correo-transaccional-resend.md)) — la
> parte "buzones del dominio" de la antigua #2 quedó absorbida en la #4 (dominio).
> La numeración de las restantes se conserva (#3–#6) porque ADRs y roadmap la referencian.

## 3. Modelo LLM por defecto para Hermes — RETIRADA (2026-07-17)

**Hermes salió del producto por decisión del usuario** — la decisión de modelo LLM ya no aplica.
El ADR-0003 queda como registro histórico. Texto original:

## ~~3. Modelo LLM por defecto para Hermes~~ — histórica

Detrás de la interfaz de [ADR-0003](adr/0003-hermes-llm-agnostico.md). Candidatos por costo/calidad: Google Gemini (plan gratis), Claude Haiku (~6 pesos/post, alta calidad), DeepSeek / Kimi (muy baratos). Requiere API de pago por uso. Costo absorbido por la mantención; marginal al volumen. _Nota pivote SaaS_: Hermes pasa a ser feature **por-tenant** — al elegir modelo, decidir también quién absorbe el costo por tenant (¿incluido? ¿limitado?).

## 4. Nombre de dominio — ABIERTA

`.cl` o `.com`. Nombre por definir. Bloquea: buzones del dominio (`contacto@...` — herencia de la antigua #2), verificación del remitente de Resend ([ADR-0010](adr/0010-correo-transaccional-resend.md)), branding (`docs/design.md`), config de NextAuth (`NEXTAUTH_URL`). _Nota pivote SaaS_: ahora es el **dominio de la Plataforma** (ya no lo compra la autora — ella opera en un subdominio como tenant piloto) y **debe soportar wildcard subdomains** `*.dominio` con certificado wildcard ([ADR-0007](adr/0007-resolucion-de-tenant-por-subdominio.md)). El nombre es de la plataforma, no del fandom.

## 5. Hosting / despliegue — ABIERTA

Criterio: plan barato o gratuito acorde al bajo volumen. La mantención (~$40.000/mes) debe cubrirlo con holgura. (Nota: el stack T3 encaja bien con Vercel, pero no está decidido.) _Nota pivote SaaS_: el hosting **debe soportar wildcard subdomains + certificados wildcard** ([ADR-0007](adr/0007-resolucion-de-tenant-por-subdominio.md)) y middleware por host; verificar límites/costos de dominios wildcard en el plan elegido.

## 6. Marca de agua en los PDFs (MVP sí/no) — ABIERTA

Recomendada en [ADR-0002](adr/0002-entrega-pdf-storage-privado-url-firmada.md) para desincentivar redistribución (embeber correo/identificador del comprador). Decidir si entra en el MVP o se difiere.
