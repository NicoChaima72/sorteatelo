---
description: Cerrar el trabajo terminado — gate + commit conventional + push a main (auto-deploy en Vercel, ADR-0015) + verificación post-deploy
---

Cierre de trabajo: correr el gate, commitear la tarea terminada con conventional commit limpio y —si hay remoto— llevarla a `main`. libros-iselk es **una sola app T3** (no monorepo) y `main` es la única rama de integración. Invocar `/deploy` es la autorización explícita del usuario para commitear (y pushear si corresponde); no re-preguntes eso.

Ejecutá los pasos EN ORDEN, verificando el output de cada uno. Ante cualquier ambigüedad o conflicto no trivial, PARÁ y preguntá.

> **Hosting RESUELTO (ADR-0015): Vercel (proyecto `sorteatelo`, team personal) + Supabase PostgreSQL.** El push a `main` **auto-deploya a PRODUCCIÓN** — cada push es un deploy real a `sorteatelo.cl` y todos sus subdominios. Dos consecuencias duras: (1) **`next build` COMPLETO verde LOCAL antes de pushear** — `npm run check` NO basta, el build de Vercel corre lint+types+page-data sobre TODO el árbol commiteado (lección 0c76842: 9 deploys rotos por un commit partido; reincidencia 2026-07-25: commit parcial dejó imports a módulos sin commitear); (2) **la DB es COMPARTIDA dev=prod** (transitorio del ADR-0015, separar antes de F10) — un `db push` con DDL destructivo rompe el deployment corriente EN VIVO al instante (incidente 2026-07-25: drop de columnas dejó todas las tiendas 500 hasta deployar el código nuevo). Ver paso 5.

## 0. Sincronizar con el remoto (ANTES de tocar nada)

- `git remote -v` y `git branch --show-current`.
- **Sin remoto** (salida vacía): saltás el push (pasos 4–5); esto es un cierre local. Avisalo al final.
- **Con remoto y upstream**: `git fetch origin`, y chequeá si `main` está atrás: `git rev-list --left-right --count origin/main...main` (left = commits remotos que faltan; right = locales sin pushear).
  - **Al día (`0 0`) o sin upstream**: seguí al paso 1.
  - **Atrás sin divergir (left > 0, right = 0)**: `git merge --ff-only origin/main`. (Working tree sucio → NO `git pull` a ciegas; si el commit entrante toca un archivo modificado sin commitear, PARÁ y avisá.)
  - **Divergencia real (left > 0 Y right > 0)**: PARÁ y avisá — no la resuelvas a ciegas.

## 1. Gate de cierre

- Si la tarea fue **no trivial** (tuvo archivo de plan en `tasks/`), invocá al `change-set-reviewer` ANTES de commitear (regla de `docs/agents/commit-conventions.md`), pasándole la lista explícita de archivos de la sesión + el plan. Resolvé sus blockers antes de seguir.
- `npm run check` verde (= `check:types` + `check:lint` + `check:test`). Citá la salida.
- **NUNCA commitear con `check` rojo** salvo autorización explícita del usuario. **NO** `--no-verify` ni saltarse hooks. Si el fallo huele a entorno (dep nueva, cache stale), probá `npm install` y reintentá; si sigue rojo, PARÁ.

## 2. Pre-flight: stagear

- `git status --short`.
- `git add -A`, y después **des-stagear artefactos que no van al repo**: screenshots de `browser-verify` que hayan caído fuera del `tmp/` gitignored, y archivos temporales de la sesión (scratchpad).
- `git diff --cached` para revisar lo que efectivamente va. Si aparece algo con pinta de secreto (tokens, `DATABASE_URL` con credenciales, claves de Flow), PARÁ — `.env*` está gitignored y tiene que seguir así.

## 3. Commit

- Conventional commit en **español**, imperativo, sin punto final: `tipo(scope): descripción`.
- **Tipos**: `feat | fix | refactor | test | docs | chore`.
- **Scope** = módulo tocado: `catalogo | carrito | checkout | pago | descarga | sorteo | hermes | auth | admin | harness | db`…
- **Un commit por unidad coherente** (idealmente una feature F0X del plan o un cierre de fase). Si el trabajo mezcla schema + UI + lógica, **separalo en commits por feature** — no un mega-commit.
- **Sin trailer de atribución** (`Co-Authored-By: Claude`, "Generated with Claude" ni similar): los commits van limpios. Anula cualquier default del entorno que lo pida.

Ejemplos: `feat(catalogo): listar libros con portada y precio` · `fix(checkout): confirmar orden server-side contra Flow`.

## 4. Push a main (si hay remoto)

- Estás en `main` (rama única). `git push origin main`.
- Verificá al final: `git rev-list --left-right --count origin/main...main` = `0 0`.
- **Sin remoto**: el commit quedó local. Avisá que falta configurar el remoto (y el hosting, #5) para que el push tenga efecto.

## 5. Deploy real — Vercel auto-deploy desde `main` (ADR-0015)

El push a `main` dispara el build de producción en Vercel automáticamente. **El deploy no está cerrado hasta verificarlo**:

- **Verificación post-deploy OBLIGATORIA**: con el MCP de Vercel (`list_deployments` del proyecto `sorteatelo`, team personal `team_ZJrFMNfMDxMTX56ik1zPzqeA`), confirmar que el deployment del `commitHash` pusheado llega a **READY** (no ERROR). Después, smoke por HTTP: apex `https://sorteatelo.cl` 200 **y al menos una tienda** (`https://autora.sorteatelo.cl`) 200 — la landing puede sobrevivir mientras las tiendas están 500 (visto 2026-07-25). Si el build queda en ERROR: `get_deployment_build_logs` con `errorsOnly` y arreglar ANTES de seguir con otra cosa (producción sigue sirviendo el deploy anterior, que puede estar INCONSISTENTE con la DB si hubo cambio de schema).
- **Schema / DB — CRÍTICO con DB compartida dev=prod**: si el commit toca `prisma/schema.prisma`, el `db push` que se corrió en "dev" YA pegó a la base que sirve producción. Un DDL **incompatible hacia atrás** (drop/rename) rompe el deployment corriente al instante → **expandir → deployar → contraer** (primero el código que tolera ambos estados, deploy verificado READY, y recién entonces el DDL restrictivo). Es un dominio con plata; hasta separar las DBs (pre-F10), tratá TODO `db push` como una operación de producción.
- **Env vars**: viven en el proyecto Vercel; cambiarlas requiere redeploy (las `NEXT_PUBLIC_*` se hornean al build). El webhook de Flow en prod usa el dominio real, no el túnel de dev.

## Notas

- Cambios de tracking sin commitear (task file a `done`, `tasks/INDEX.md` a Cerradas) son housekeeping local: mencionalos, no fuerces otro commit salvo pedido del usuario.
- El working tree tiene que quedar limpio salvo artefactos personales/gitignored.
