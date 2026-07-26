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

> **Resueltas el 2026-07-17**: **#4 dominio de la plataforma → `sorteatelo.cl`**, comprado en
> NIC Chile por el usuario ([ADR-0014](adr/0014-dominio-plataforma-sorteatelo-cl.md));
> **#5 hosting → Vercel + Supabase** ([ADR-0015](adr/0015-hosting-vercel-db-supabase.md)),
> con nameservers delegados a Vercel y wildcard `*.sorteatelo.cl` cubierto. Solo queda abierta la #6.

## 3. Modelo LLM por defecto para Hermes — RETIRADA (2026-07-17)

**Hermes salió del producto por decisión del usuario** — la decisión de modelo LLM ya no aplica.
El ADR-0003 queda como registro histórico. Texto original:

## ~~3. Modelo LLM por defecto para Hermes~~ — histórica

Detrás de la interfaz de [ADR-0003](adr/0003-hermes-llm-agnostico.md). Candidatos por costo/calidad: Google Gemini (plan gratis), Claude Haiku (~6 pesos/post, alta calidad), DeepSeek / Kimi (muy baratos). Requiere API de pago por uso. Costo absorbido por la mantención; marginal al volumen. _Nota pivote SaaS_: Hermes pasa a ser feature **por-tenant** — al elegir modelo, decidir también quién absorbe el costo por tenant (¿incluido? ¿limitado?).

## ~~4. Nombre de dominio~~ — RESUELTA (2026-07-17)

**→ `sorteatelo.cl`**, promovida a [ADR-0014](adr/0014-dominio-plataforma-sorteatelo-cl.md). Lo que
bloqueaba (buzones, verificación de Resend, `NEXTAUTH_URL`) queda ahora gated solo por la #5
(delegación de DNS al hosting elegido).

## ~~5. Hosting / despliegue~~ — RESUELTA (2026-07-17)

**→ Vercel (app) + Supabase (PostgreSQL)**, promovida a [ADR-0015](adr/0015-hosting-vercel-db-supabase.md). Wildcard `*.sorteatelo.cl` cubierto vía nameservers de Vercel. Transitorios anotados en el ADR: plan Hobby (no comercial — subir a Pro antes de vender) y DB dev = DB prod (separar antes de F10).

## 6. Marca de agua en los archivos entregados (sí/no) — ABIERTA, y AMPLIADA (2026-07-26)

Recomendada en [ADR-0002](adr/0002-entrega-pdf-storage-privado-url-firmada.md) para desincentivar redistribución (embeber correo/identificador del comprador). Decidir si entra y cuándo.

**Ampliada por `tasks/26-07-26-productos-tipos-digitales.md` (D11).** La pregunta estaba formulada
**PDF-only**; desde que el [[Archivo de producto]] admite una allowlist de tipos (PDF, EPUB, imagen
PNG/JPEG/WebP, audio MP3/M4A/WAV, ZIP), "marca de agua" ya no es UNA decisión sino una por familia,
y cada una tiene técnica, costo y efecto distintos:

- **PDF** — lo original: estampar correo/identificador del Comprador en el documento.
- **Imagen** — admite **watermark VISIBLE**, y acá el trade-off es el más caro del set: si el
  producto ES la imagen (un sticker, una photocard), la marca degrada justamente lo que se vendió.
- **Audio** — la técnica es otra (tono/marca inaudible o *audio fingerprinting*), no es "poner un
  texto encima"; complejidad y dependencias fuera de lo que hoy tiene el repo.
- **ZIP** — **ninguna** aplica al contenedor; habría que marcar cada archivo de adentro, o nada.
- **EPUB** — sin evaluar.

Consecuencia operativa: si se decide "sí", habrá que decidir **para cuáles** y qué pasa con los tipos
donde no aplica (¿se entregan sin marca? ¿se prohíben?). Nada del código de tipos de producto la
precierra ni asume un watermark futuro (invariante I6 de ese plan): la marca de agua entraría en el
pipeline de entrega/confirmación sin rediseñar nada de lo construido.

**Sigue ABIERTA y es del usuario** — no cerrarla por cuenta propia.
