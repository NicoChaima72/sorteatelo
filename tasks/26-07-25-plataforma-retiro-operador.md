---
slug: plataforma-retiro-operador
status: implementing
owner: nicolas
created: 2026-07-25
related_adrs: [ADR-0016, ADR-0019, ADR-0022]
related_context: [Operador, Tenant, TenantMembership, FlowCredential]

features:
  - id: F01
    behavior: "El MCP muere entero (/api/mcp + server/mcp + MCP_OPERADOR_TOKEN); los 3 helpers que consume el asistente IA se reubican en domain/pagebuilder y el asistente sigue verde"
    state: active

  - id: F02
    behavior: "Muere el borde backend del Operador: operadorProcedure, router operador (y su registro en root), src/server/domain/operador/ completo"
    state: not_started

  - id: F03
    behavior: "El editor visual autoriza SOLO por membresía: muere la rama god-mode de puedoEditar, exigirEditor, el procedure puedoEditar y getEditorProps"
    state: not_started

  - id: F04
    behavior: "authPolicy sin rol Operador: mueren esOperador/parsearAllowlist/emailEnLista, el flag esOperador de AccesoPanel/getAccesoActual y el param esOperador de resolverTenantAutorizado; PLATFORM_OPERATOR_EMAILS se borra del env schema y .env"
    state: not_started

  - id: F05
    behavior: "Mueren las superficies del panel (pagina /admin/operador, item rail, Spotlight, badge MenuCuenta, SinTiendaOperador) y el copy de suspension deja de nombrar al rol (los guards de SUSPENDIDA quedan intactos)"
    state: not_started

  - id: F06
    behavior: "Registro documental: ADR nuevo 'retiro del rol Operador de plataforma' (con el MCP futuro como decision DIFERIDA), addendums en ADR-0016/ADR-0022, limpieza de CONTEXT.md y backend-conventions.md"
    state: not_started
---

# Retiro completo del rol Operador de plataforma

## Contexto

El rol **Operador de plataforma** (allowlist `PLATFORM_OPERATOR_EMAILS`, god-mode cross-tienda) nació en F08 del roadmap como superficie de supervision (panel `/admin/operador` con suspender/reactivar) y se extendio con el editor MCP god-mode (`MCP_OPERADOR_TOKEN`, ADR-0016). El 2026-07-25, ADR-0022 D11 ya le nego el acceso cross-tienda en el panel de Organizador (`resolverTenantDelPanel` pasa `esOperador: false` hardcodeado): el rol quedo reducido a un borde propio que el usuario decidio **extirpar entero**. La supervision de plataforma sera un **superadmin futuro** (cosa aparte, D11) y el MCP renacera con otro modelo de auth (tokens per-usuario scoped a membresia + un MCP de plataforma aparte) — ambas cosas DIFERIDAS y documentadas, no construidas aqui.

Esto es un refactor de REMOCION: cero features nuevas, cero cambios de schema Prisma. `Tenant.estado = SUSPENDIDA` y sus guards quedan intactos (suspender = DB directa hasta el superadmin). Inventario completo verificado por grep en la Bitacora (arranque del grill + verificacion pre-plan): 78 archivos mencionan al rol; la mayoria son comentarios o factorias de test con `esOperador: false`.

## Decisiones

Todas cerradas con el usuario el 2026-07-25 (ver Bitacora Q1/Q2 + defaults confirmados):

- **D1 (alcance)**: extirpar el rol completo — panel, procedure, router, dominio, authPolicy, env, docs. Razon: tras D11/ADR-0022 el rol solo autorizaba su propio borde; mantenerlo es superficie de ataque y vocabulario muerto.
- **D2 (MCP — Q1 opcion c)**: el MCP actual muere ENTERO: `src/app/api/mcp/[transport]/route.ts`, las 12 tools (`src/server/mcp/`), `verificarBearer`, `MCP_OPERADOR_TOKEN` (env schema + `.env`). Razon: su auth es un token god-mode compartido, incompatible con el modelo futuro. El modelo futuro (tokens per-usuario scoped a membresia — "una persona tiene un token y ese token le permite configurar su tienda y tambien crear otra" — + un MCP de plataforma aparte para el usuario, junto al superadmin de D11) queda como decision **DIFERIDA fuera de alcance**, registrada en el ADR nuevo (F06).
- **D3 (snapshots)**: los `StorefrontPageVersion.publishedBy: "operador"` historicos NO se reescriben — el versionado es append-only. Solo muere la constante `PUBLICADOR_MCP` junto con las tools.
- **D4 (suspension — Q2 opcion a)**: el enum `SUSPENDIDA` y sus guards QUEDAN (el storefront niega tiendas suspendidas; `publicarTienda` sigue tirando `CONFLICT`). Solo mueren las superficies de suspender/reactivar. Suspension/reactivacion = DB directa hasta el superadmin futuro. Los copys que nombran al rol ("Contacta al Operador para reactivarla", checklist) se reescriben a neutro ("contacta al soporte de la plataforma" o equivalente).
- **D5 (authPolicy)**: `resolverTenantAutorizado` se simplifica — muere el param `esOperador` y sus dos ramas (seleccion god-mode + error INVALID "indica sobre que Tienda operar"). Muere `esOperador()`. `parsearAllowlist`/`emailEnLista` solo sobreviven con otro consumidor real: verificado que sus UNICOS consumidores son `trpc.ts` (operadorProcedure/AccesoPanel), `pagebuilder.ts` y `getEditorProps.ts` — todos mueren o se simplifican aqui ⇒ **mueren las tres funciones**.
- **D6 (editor)**: muere la rama god-mode de `puedoEditar` (param `esOperador`) y sus callers (`exigirEditor`, procedure `puedoEditar`, `getEditorProps`): editar una tienda = tener `TenantMembership`, punto. Fail-closed intacto.
- **D7 (preview)**: la preview tokenizada del pagebuilder (`STOREFRONT_PREVIEW_TOKEN`, `previewToken.ts`) **SOBREVIVE** — la usa el editor del panel, no el rol.
- **D8 (asistente IA — derivada mecanica de D2, verificada pre-plan)**: `src/server/domain/pagebuilder/asistente.ts` importa `outlineDe`, `mcpListWidgetTypes` y `mcpListStyleOptions` desde `~/server/mcp/tools`. Antes de borrar `server/mcp/`, esos 3 helpers se REUBICAN en `src/server/domain/pagebuilder/` (renombrados sin el prefijo `mcp`, p.ej. `outlineDe`/`listarTiposWidget`/`listarOpcionesEstilo`), con sus tests. El asistente es feature del panel y sobrevive intacto.
- **D9 (docs)**: ADR corto nuevo "retiro del rol Operador de plataforma" (registra D2-futuro y el superadmin como diferidos) + nota superseded/addendum en ADR-0016 (el MCP god-mode ya no existe) y ADR-0022 (la excepcion "el acceso cross-tienda sigue vivo en /admin/operador" ya no aplica) + limpieza de CONTEXT.md y `docs/agents/backend-conventions.md` (definicion del rol).
- **D10 (persona vs rol)**: lo que se retira es el ROL en codigo (allowlist + god-mode). El "Operador de plataforma" como PERSONA operativa (el freelancer que administra infra: cuenta R2, Cloudflare, deploy) sigue existiendo en CLAUDE.md/roadmap — los comentarios de infra que lo mencionan en ese sentido (p.ej. `env.js` sobre buckets R2) se dejan o se rebautizan minimamente, NO se barren a ciegas.

## Plan

1. **F01 — Matar el MCP.** (a) Reubicar `outlineDe`, `mcpListWidgetTypes`, `mcpListStyleOptions` de `src/server/mcp/tools.ts` a `src/server/domain/pagebuilder/` (D8) y actualizar el import de `asistente.ts`; migrar los tests de esos helpers desde `src/__tests__/server/mcp/tools.test.ts` a un test bajo `pagebuilder/`. (b) Borrar `src/app/api/mcp/` completo, `src/server/mcp/` completo, `src/__tests__/server/mcp/` completo. (c) Borrar `MCP_OPERADOR_TOKEN` de `src/env.js` (schema + runtimeEnv) y de `.env` (+ `.env.example` si existe). (d) Actualizar el literal `publicadoPor: "operador"` de `useCases.test.ts` a un valor neutro (p.ej. un email) y el docstring "MVP: operador" de `publicarPagina.ts`. (F01)
2. **F02 — Matar el borde backend del Operador.** Borrar `src/server/api/routers/operador.ts` + su registro en `root.ts`, `operadorProcedure` de `src/server/api/trpc.ts`, `src/server/domain/operador/` completo (listarTiendas/suspenderTienda/reactivarTienda/schemas), `src/__tests__/server/operador/` completo. (F02)
3. **F03 — Editor solo por membresia.** `puedoEditar` pierde el param `esOperador` y su early-return god-mode; `exigirEditor` y el procedure `puedoEditar` de `pagebuilder.ts` dejan de computar `esOp` (mueren sus imports de `esOperador`/`parsearAllowlist`); `getEditorProps.ts` idem. Ajustar `puedoEditar.test.ts`, `exigirEditor.test.ts`, `getEditorProps.test.ts` (las ramas god-mode se borran; las de membresia quedan). Comentarios de `banner-editar-tienda.tsx` y `accionSesion.ts` que citan "membresia/Operador" pasan a "membresia". (F03)
4. **F04 — Simplificar authPolicy + env.** En `src/server/authPolicy.ts`: borrar `esOperador()`, `parsearAllowlist`, `emailEnLista`; `AccesoPanel` pierde el campo `esOperador`; `resolverTenantAutorizado` pierde el param `esOperador` y sus ramas (queda: seleccion ⇒ membresia o FORBIDDEN; sin seleccion ⇒ primera membresia o FORBIDDEN); `resolverTenantDelPanel` deja de pasar `esOperador: false` y su docstring D11 se actualiza (la excepcion del panel Operador ya no existe). En `trpc.ts`, `panelProcedure` deja de computar el flag. `getAccesoActual.ts` pierde `esOperador` de su output. Borrar `PLATFORM_OPERATOR_EMAILS` de `src/env.js` (schema + runtimeEnv) y de `.env`. Sweep mecanico de tests: `authPolicy.test.ts` (mueren los describes de parsearAllowlist/emailEnLista/esOperador y las ramas Operador de resolverTenantAutorizado), `getAccesoActual.test.ts` (`panel.acceso.003` muere o se reescribe sin el flag), y TODAS las factorias de `AccesoPanel` con `esOperador:` en `src/__tests__/server/panel/`, `camposCheckout/`, `tenants/`, `correo/` (~30 archivos, cambio mecanico: borrar el campo). (F04)
5. **F05 — Matar las superficies del panel + copy de suspension.** Borrar `src/pages/admin/operador.tsx`. En `admin-layout.tsx`: item "Operador" del rail, entrada Spotlight, badge "Operador de plataforma" del MenuCuenta, componente `SinTiendaOperador` (el usuario sin tienda cae al empty state estandar), y el prop/plumbing `esOperador` (viene de `getAccesoActual`, ya muerto en F04 — F04 y F05 deben aterrizar juntas o F05 inmediatamente despues para que compile). Reescribir copy sin el rol: `publicarTienda.ts` (CONFLICT de SUSPENDIDA) y `checklist-publicacion.tsx` (aviso de tienda suspendida). Sweep final de comentarios que citan el ROL (auth.ts, guardAdmin.ts, guardPaginaAdmin.ts, empty-state.tsx, etc.), respetando D10 (los de la persona/infra quedan). (F05)
6. **F06 — Registro documental.** Escribir `docs/adr/` nuevo (numero siguiente disponible): "Retiro del rol Operador de plataforma" — contexto (D11 lo dejo sin proposito), decision (extirpacion total, suspension por DB directa), y las dos decisiones DIFERIDAS explicitas (superadmin futuro; MCP futuro con tokens per-usuario scoped a membresia + MCP de plataforma aparte). Addendum/nota superseded en ADR-0016 y ADR-0022. Limpiar la definicion del rol en `CONTEXT.md` y `docs/agents/backend-conventions.md` (dejando nota de que el termino "Operador de plataforma" sobrevive solo como persona operativa, D10). (F06)
7. Al cierre, verificacion global del implementer: `grep -ri "operador" src/` solo devuelve (a) copys/comentarios de la persona operativa permitidos por D10 y (b) nada compilable del rol; `vitest run` filtrado verde en las areas tocadas. El gate completo (`npm run check`) lo corre el `change-set-reviewer`.

## Validaciones

### F01 — MCP muerto, asistente vivo

**Vitest** (integration):
- [ ] Los helpers reubicados (outline de pagina, listado de tipos de widget, listado de opciones de estilo) siguen cumpliendo su contrato desde `domain/pagebuilder` (tests migrados verdes). — `src/__tests__/server/pagebuilder/catalogoDelEditor.test.ts::page.catalogo.001` / `::page.catalogo.002` / `::page.catalogo.003`
- [ ] La suite del asistente IA sigue verde sin que exista `src/server/mcp/` (imports resueltos desde la nueva ubicacion). — `src/__tests__/server/pagebuilder/asistente.test.ts::page.ai.001-003`
- [ ] No queda referencia compilable a `~/server/mcp` ni a `MCP_OPERADOR_TOKEN` en `src/` (tsc verde + grep cero). — `npx tsc --noEmit` verde + `grep -rn "server/mcp\|MCP_OPERADOR_TOKEN" src/` cero

**E2E** (browser):
- [ ] `POST /api/mcp` (cualquier transporte) responde 404 en el dev server. — `tasks/e2e-plataforma-retiro-operador.md#retiro.mcp.001`

### F02 — Borde backend del Operador muerto

**Vitest**:
- [ ] El `appRouter` ya no expone la key `operador` (tsc: cualquier `api.operador.*` residual rompe compilacion; grep cero).
- [ ] La suite completa del area panel/tenants corre verde sin `operadorTiendas.test.ts` ni `src/server/domain/operador/`.

**E2E**:
- [ ] (no aplica — backend-only; la superficie UI se valida en F05)

### F03 — Editor autoriza solo por membresia

**Vitest**:
- [ ] `puedoEditar` devuelve `puedeEditar: true` sii existe `TenantMembership` (tenantId, userId); sin membresia ⇒ `false` — ya no existe ningun bypass por email/allowlist.
- [ ] `exigirEditor` tira FORBIDDEN para un usuario logueado sin membresia en el tenant del host.
- [ ] `getEditorProps` devuelve 404 neutral para un usuario logueado sin membresia (indistinguible de host sin tienda / sin sesion).

**E2E**:
- [ ] La dueña (con membresia) sigue pudiendo abrir `/editor` en el subdominio de su tienda; una cuenta sin membresia recibe 404.

### F04 — authPolicy y env sin rol Operador

**Vitest**:
- [ ] `resolverTenantAutorizado` con seleccion dentro de la membresia ⇒ la devuelve; seleccion fuera ⇒ FORBIDDEN; sin seleccion ⇒ primera membresia o FORBIDDEN — sin ninguna rama god-mode ni el error INVALID del Operador.
- [ ] `resolverTenantDelPanel` conserva su semantica exacta (host sin tienda ⇒ FORBIDDEN; host fuera de membresia ⇒ FORBIDDEN) con la firma simplificada.
- [ ] `getAccesoActual` ya no expone `esOperador` y sus casos restantes siguen verdes (`panel.acceso.003` eliminado o reescrito).
- [ ] `AccesoPanel` sin el campo `esOperador` compila en todas las factorias de test del panel (sweep completo, tsc verde).
- [ ] El env schema ya no declara `PLATFORM_OPERATOR_EMAILS` ni `MCP_OPERADOR_TOKEN` y la app arranca sin ellas en `.env`.

**E2E**:
- [ ] (no aplica — backend-only)

### F05 — Superficies del panel muertas + copy de suspension neutro

**Vitest**:
- [ ] `publicarTienda` sobre tienda SUSPENDIDA sigue tirando CONFLICT (guard intacto) con el copy nuevo que no nombra al rol Operador.

**E2E**:
- [ ] `/admin/operador` responde 404 en el subdominio y en el apex.
- [ ] El rail del panel no muestra el item "Operador", el Spotlight (Cmd+K) no ofrece la entrada, y el MenuCuenta no muestra el badge "Operador de plataforma".
- [ ] Un usuario logueado sin tienda ve el empty state estandar (ya no existe `SinTiendaOperador`).
- [ ] Una tienda con `estado = SUSPENDIDA` (toggle por DB directa, asistido) sigue con el storefront apagado y el checklist del panel muestra el aviso con el copy nuevo.

### F06 — Registro documental

**Vitest**:
- [ ] (no aplica — solo docs)

**E2E**:
- [ ] (no aplica — solo docs; validacion = checklist documental) ADR nuevo existe y registra las 2 decisiones diferidas; ADR-0016 y ADR-0022 tienen su nota superseded/addendum; CONTEXT.md y backend-conventions.md sin la definicion del rol.

## Invariantes

- I1: **Cero cambios de schema Prisma.** `Tenant.estado` (incl. `SUSPENDIDA`) y `StorefrontPageVersion` quedan intactos; nada de `db push`.
- I2: **Los guards de SUSPENDIDA quedan**: el storefront sigue negando tiendas suspendidas y `publicarTienda` sigue bloqueando con CONFLICT. Solo cambia el copy (D4).
- I3: **La preview tokenizada del pagebuilder sobrevive** (`STOREFRONT_PREVIEW_TOKEN`, `previewToken.ts`) — no tocarla (D7).
- I4: **Snapshots historicos append-only**: ningun `publishedBy` existente se reescribe (D3).
- I5: **Fail-closed sin sustituto**: al morir el god-mode, editar/operar una tienda ajena = FORBIDDEN/404 por membresia. Prohibido introducir cualquier bypass "temporal" (env var, email hardcodeado, flag).
- I6: **El asistente IA del editor no pierde capacidad**: los 3 helpers de D8 se reubican ANTES de borrar `server/mcp/`; su cobertura de tests migra con ellos.
- I7: **Tenancy intacta** (regla de oro): ninguna simplificacion de authPolicy puede aflojar el scoping por `tenantId` server-side ni la semantica de `resolverTenantDelPanel` (ADR-0022).
- I8: **Env limpio de verdad**: `PLATFORM_OPERATOR_EMAILS` y `MCP_OPERADOR_TOKEN` se BORRAN del schema de `env.js`, de `runtimeEnv` y de `.env` — no quedan declaradas inertes.
- I9: Ambiguedad fuera de estas decisiones/invariantes ⇒ parar y preguntar (p.ej. si aparece un consumidor no inventariado de `parsearAllowlist` o del MCP).

## Out of scope

- El **superadmin futuro** (D11/ADR-0022) — no se diseña ni se stubbed.
- El **MCP futuro** (tokens per-usuario scoped a membresia + MCP de plataforma) — solo se documenta como decision diferida en el ADR (D2).
- Cualquier **superficie nueva de suspension/reactivacion** — suspension = DB directa (D4).
- **Reescritura de snapshots** `publishedBy: "operador"` historicos (D3).
- Renombrar la **persona** "Operador de plataforma" en CLAUDE.md / roadmap / comentarios de infra (D10) — sobrevive como concepto operativo del freelancer.
- Cambios de schema, de flujo de pago, de storefront publico o del editor mas alla de la autorizacion.

## Especialistas a consultar

- `backend-reviewer` — revision de trpc.ts/authPolicy/routers tras la remocion (el area mas sensible: autorizacion fail-closed) y del env schema.
- `frontend-reviewer` — admin-layout.tsx (rail/Spotlight/MenuCuenta/empty state) y checklist-publicacion.tsx.
- `change-set-reviewer` — diff final + `npm run check` (el sweep toca ~40 archivos de test; el gate completo es obligatorio antes de commit).
- `feature-tester` — Vitest + E2E asistido (login Google real para F03/F05; toggle SUSPENDIDA por DB directa asistido por el usuario).
- (`schema-guardian` NO aplica — I1: cero cambios de schema.)

## Bitácora

- [2026-07-25] [planner-grill] Arranque. Inventario cargado (grep `operador|Operador|OPERATOR` en `src/` → 78 archivos). Señales estructurales confirmadas:
  - **Panel**: `src/pages/admin/operador.tsx`, item rail + Spotlight + badge "Operador de plataforma" + `SinTiendaOperador` en `src/components/admin/admin-layout.tsx`.
  - **Backend**: `operadorProcedure` en `src/server/api/trpc.ts`, router `src/server/api/routers/operador.ts` (registrado en `root.ts`), `src/server/domain/operador/` (listarTiendas / suspenderTienda / reactivarTienda / schemas).
  - **authPolicy** (`src/server/authPolicy.ts`): `esOperador()`, `parsearAllowlist()`, flag `esOperador` en `AccesoPanel`, rama Operador de `resolverTenantAutorizado` (tras D11/ADR-0022 su único consumidor `esOperador: true` real es el borde del Operador — al morir ese borde la rama queda muerta y la política se puede simplificar). `resolverTenantDelPanel` ya pasa `esOperador: false` hardcodeado.
  - **Env**: `PLATFORM_OPERATOR_EMAILS` en `src/env.js` + `.env`. Aparte (mecánicamente independiente): `MCP_OPERADOR_TOKEN` (Bearer del editor MCP god-mode, ADR-0016 — NO usa la allowlist de emails).
  - **Pagebuilder/MCP**: `src/server/mcp/{auth,tools}.ts`, `puedoEditar` (rama god-mode `esOperador`), `getEditorProps`, `banner-editar-tienda.tsx`, `accionSesion.ts`, `publishedBy: "operador"` en snapshots de StorefrontPageVersion.
  - **Suspensión**: `Tenant.estado = SUSPENDIDA` es real y con efecto de producto (apaga el storefront; `publicarTienda` bloquea con CONFLICT "solo el Operador reactiva"). El panel Operador es la ÚNICA superficie de suspender/reactivar.
  - **Tests**: `operadorTiendas.test.ts`, partes de `authPolicy.test.ts`, `getAccesoActual.test.ts` (`panel.acceso.003`), `publicarDespublicar.test.ts` (002d menciona al Operador), factorías con `esOperador` en ~70 tests de panel.
  - **Docs**: `docs/agents/backend-conventions.md` (definición del rol), `CONTEXT.md`, ADRs 0016/0019/0022 y otros que lo mencionan.
  - Contexto de decisión: ADR-0022 D11 (2026-07-25) ya rechazó el acceso Operador cross-tienda en el panel de Organizador; el superadmin del futuro será una cosa aparte.
- [2026-07-25] [planner-grill] Q1: ¿El editor MCP (god-mode por `MCP_OPERADOR_TOKEN`) sobrevive al retiro del rol, o muere también? Recomendada: sobrevive con renombre de vocabulario (token → `MCP_ADMIN_TOKEN` o similar, `publishedBy` nuevo → "mcp"; los valores históricos "operador" en versiones viejas se quedan como están).
- [2026-07-25] [planner-grill] Q1 answered: **(c) el MCP actual muere entero** (`/api/mcp` + tools + `MCP_OPERADOR_TOKEN`). Visión futura del usuario (FUERA de alcance, documentar junto al superadmin de D11): MCP con tokens per-usuario scoped a membresía (configurar su tienda, crear otra) + un MCP de plataforma aparte para él. Snapshots históricos `publishedBy: "operador"` NO se reescriben (append-only).
- [2026-07-25] [planner-grill] Q2: destino de suspender/reactivar (`Tenant.estado = SUSPENDIDA`) al morir su única superficie. Recomendada: (a) el enum y los guards quedan, las superficies mueren, suspensión por DB directa hasta el superadmin futuro. Defaults empaquetados en la misma ronda: borrar `PLATFORM_OPERATOR_EMAILS` de env schema y `.env`; simplificar `resolverTenantAutorizado` (muere el param `esOperador` y `esOperador()`; `parsearAllowlist`/`emailEnLista` solo si les queda otro consumidor); muere la rama god-mode de `puedoEditar`/`getEditorProps` (editar tiendas ajenas = por membresía); preview del pagebuilder SOBREVIVE (la usa el editor visual); ADR corto nuevo "retiro del rol Operador" + notas superseded en 0016/0022 + limpiar CONTEXT.md/backend-conventions.
- [2026-07-25] [planner-grill] Q2 answered (relevo del orchestrator): **(a) confirmada** + todos los defaults empaquetados confirmados por el usuario. Cierre del grill autorizado — escribir el plan sin re-preguntar.
- [2026-07-25] [planner-grill] Verificación pre-plan (greps dirigidos, sesión de cierre):
  - **Hallazgo clave (⇒ D8)**: `src/server/domain/pagebuilder/asistente.ts` (asistente IA, tanda 3) importa `outlineDe`, `mcpListWidgetTypes`, `mcpListStyleOptions` desde `~/server/mcp/tools` — borrar `server/mcp/` a secas rompe el asistente. El plan los reubica en `domain/pagebuilder/` antes del borrado.
  - Consumidores de `parsearAllowlist`/`emailEnLista`/`esOperador` confirmados: solo `trpc.ts` (AccesoPanel), `pagebuilder.ts` (exigirEditor + puedoEditar procedure), `getEditorProps.ts` — todos mueren/se simplifican aquí ⇒ las 3 funciones mueren (D5 resuelto).
  - `publicarPagina.publicadoPor` lo alimentan el router pagebuilder (email de la Organizadora — queda) y `PUBLICADOR_MCP` de tools.ts (muere). `useCases.test.ts:202` usa el literal `"operador"` — se neutraliza.
  - Copys de suspensión que nombran al rol: `publicarTienda.ts` (CONFLICT) y `checklist-publicacion.tsx` — se reescriben (D4); guards intactos.
  - `middleware.ts` y `csp.test.ts` NO referencian `/api/mcp` — cero trabajo ahí.
  - `admin-layout.tsx`: rail item (l.334-343), badge MenuCuenta (l.500-510), Spotlight (l.631-640), `SinTiendaOperador` (l.526-549, usado l.802-803) — todo mapeado.
- [2026-07-25] [planner-grill] **Plan escrito** (retomado por segundo planner tras interrupción). 6 features F01–F06, orden: MCP → borde backend → editor → authPolicy+env → superficies+copy → docs/ADR. Status queda `planning` a la espera del visto bueno del usuario al plan.
- [2026-07-25 22:35] [feature-implementer] Arranca implementación (visto bueno explícito del usuario al plan). Features pendientes: F01, F02, F03, F04, F05, F06. Read pass completo hecho (template, CLAUDE.md, ADR-0016/0022, backend-conventions, authPolicy.ts, mcp/*, asistente.ts, env.js, publicarPagina.ts). Working tree verificado: limpio salvo el carril `checkout-campos-configurables` (`exportarVentasCsv.ts`/`_csv.ts`/su test) — cordón respetado, no los toco.
- [2026-07-25 22:42] [feature-implementer] **F01 implementada** (MCP muerto, asistente vivo). TDD real 3 slices RED→GREEN sobre la reubicación (D8/I6): el test nuevo importaba del módulo inexistente ⇒ RED, se movió un helper por vez.
  - **Nuevo**: `src/server/domain/pagebuilder/catalogoDelEditor.ts` con los 3 helpers renombrados sin prefijo `mcp` — `outlineDe` (igual), `listarTiposWidget` (ex `mcpListWidgetTypes`), `listarOpcionesEstilo` (ex `mcpListStyleOptions`) + el helper privado `describir`. **Decisión táctica de naming/ubicación**: UN archivo, no tres, porque los tres comparten un único consumidor y un único propósito ("lo que el asistente de IA necesita LEER de la página sin ver el JSON crudo"); el nombre evita colisión con el widget `catalogo` (productos).
  - **Nuevo**: `src/__tests__/server/pagebuilder/catalogoDelEditor.test.ts` (3 tests, `page.catalogo.001-003`). El `003` es la migración literal de `mcp.style.003`; el `001`/`002` son cobertura NUEVA (antes `outlineDe` y `mcpListWidgetTypes` solo se ejercían de refilón desde las tools).
  - **Repuntado**: `asistente.ts` importa de la nueva ubicación (+ su docstring deja de citar al MCP). Suite del asistente 3/3 verde ⇒ I6 cumplido.
  - **Borrados**: `src/app/` COMPLETO (solo contenía `api/mcp/[transport]/route.ts`; el repo vuelve a ser 100% pages router), `src/server/mcp/` (auth.ts + tools.ts, incl. `verificarBearer` y la constante `PUBLICADOR_MCP`), `src/__tests__/server/mcp/`.
  - **Env (I8)**: `MCP_OPERADOR_TOKEN` fuera del schema Zod de `src/env.js`, de `runtimeEnv`, de `.env` y de `.env.example`. `STOREFRONT_PREVIEW_TOKEN` INTACTA (D7/I3) — solo se le quitó al comentario la mención al rol.
  - **Literales**: `useCases.test.ts` publica como `duena@tienda.cl` (era `"operador"`); docstrings de `publicarPagina.ts` sin el rol.
  - **D3 respetado**: los fixtures `publishedBy: "operador"` de `versionado.test.ts` se DEJAN — modelan filas históricas append-only, que es exactamente lo que D3 dice que no se reescribe.
  - Gate: `npx tsc --noEmit` **0 errores en todo el repo** (los 2 ajenos del carril de pago que anotaba el INDEX ya no están), `npx vitest run src/__tests__/server/pagebuilder/` **249/249 verde** (32 archivos).
  - **REVISABLE anotado, NO ejecutado**: la dependencia npm `mcp-handler` (+ el `@modelcontextprotocol/sdk` que arrastra) queda instalada y ya sin consumidores. El plan enumera qué borrar y `package.json` no está en esa lista ⇒ no la desinstalo por mi cuenta. Candidata a `npm uninstall mcp-handler` en el cierre.
