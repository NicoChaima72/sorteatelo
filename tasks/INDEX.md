# INDEX de tareas

Índice autoritativo de qué está activo. Lo mantienen los agentes del tridente
(`planner` appendea al crear el task file; `feature-tester` mueve a Cerradas al cerrar).
Una fila = una línea corta. El detalle vive en la **Bitácora** de cada `tasks/<slug>.md`.

## Activas

| slug | agente / estado |
|------|-----------------|
| saas-roadmap | implementing — F01 DONE (validada 82/82 + E2E D1 verde, commit 6d5a766). F02 y F05 en planning paralelo (task files propios). Siguientes bloqueos externos: identidad visual (F06), decisiones #3/#4/#5/#6. |
| panel-auth-organizadores | testing — fase F05 del roadmap. **feature-tester 2026-07-17**: `vitest run` COMPLETO verde (28 archivos / 145 tests, 0 fallos); 23 checkboxes Vitest del task file marcados `[x]`. E2E `panel.auth.membresia.001` ✅ (login Google real + membresía en DB); quedan `[ ]` (por instrucción, no por fallo): redirect/productos-CRUD/ventas/config con sesión (no cubiertos en vivo) y `panel.sorteo.ejecutar.001` PARCIAL (sorteo activo + participaciones visto en vivo; ejecución RESERVADA para el usuario — irreversible). **AWAITING USER** para `state`/`status` (+ pendientes previos: shadcn/Mantine, D8 ya cerrado en Tenant.basesSorteo). |
| efectos-post-pago-tenant | testing — F02 del roadmap (`26-07-16-pago-efectos-post-pago-tenant.md`). **feature-tester 2026-07-17**: Vitest 12/12 verde (seed-raffles 3 + aplicarEfectosPostPago 9, dentro de la corrida completa 145/145). E2E backend-only verificado por evidencia DB read-only (order `cmrogl4pi…` PAGADO/`autora`, 1 DownloadGrant + 1 RaffleEntry del mismo tenant, una vez; 1 Raffle ACTIVO por tenant seed) ⇒ ambos checkboxes E2E `[x]`. Schema Raffle/RaffleEntry LANDEADO ⇒ desbloquea el Sorteo de F05. **AWAITING USER** para `state`/`status`. |

## En pausa

| slug | razón |
|------|-------|

## Cerradas recientes

| slug | cierre |
|------|--------|
| mvp-roadmap | superseded 2026-07-16 por pivote SaaS → `26-07-16-saas-roadmap.md` (trabajo parcial F01 se rescata en la Fase 1 nueva, ver S8) |
| auth-admin-google | superseded 2026-07-16 por pivote SaaS → `26-07-16-saas-roadmap.md` F05 (se rescatan OAuth/authPolicy/guard; muere la allowlist mono-usuario) |
| efectos-post-pago | superseded 2026-07-16 por pivote SaaS → `26-07-16-saas-roadmap.md` F02 (contrato del hook post-pago sigue válido, re-scopeado por tenant) |
