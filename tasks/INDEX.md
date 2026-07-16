# INDEX de tareas

Índice autoritativo de qué está activo. Lo mantienen los agentes del tridente
(`planner` appendea al crear el task file; `feature-tester` mueve a Cerradas al cerrar).
Una fila = una línea corta. El detalle vive en la **Bitácora** de cada `tasks/<slug>.md`.

## Activas

| slug | agente / estado |
|------|-----------------|
| saas-roadmap | **testing** — F01 integrada 2026-07-16 [F01-INT]: los 3 carriles cableados (repoTenants real, ctx.flow global retirado, NEXT_PUBLIC_PLATFORM_DOMAIN, seeds por-tenant, dev page tenant-aware), **Vitest 82/82 + tsc + eslint verdes** (Supabase despausado, tests DB-backed incluidos), middleware + aislamiento por subdominio verificados en vivo. Falta feature-tester + E2E manual: AWAITING USER (2 cuentas Flow sandbox + túnel público — ver Bitácora). |

## En pausa

| slug | razón |
|------|-------|

## Cerradas recientes

| slug | cierre |
|------|--------|
| mvp-roadmap | superseded 2026-07-16 por pivote SaaS → `26-07-16-saas-roadmap.md` (trabajo parcial F01 se rescata en la Fase 1 nueva, ver S8) |
| auth-admin-google | superseded 2026-07-16 por pivote SaaS → `26-07-16-saas-roadmap.md` F05 (se rescatan OAuth/authPolicy/guard; muere la allowlist mono-usuario) |
| efectos-post-pago | superseded 2026-07-16 por pivote SaaS → `26-07-16-saas-roadmap.md` F02 (contrato del hook post-pago sigue válido, re-scopeado por tenant) |
