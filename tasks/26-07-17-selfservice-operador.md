---
slug: selfservice-operador
status: testing                # planning | implementing | testing | done
owner: nicolas
created: 2026-07-17
related_adrs: [ADR-0005, ADR-0006, ADR-0007, ADR-0008]
related_context: [Tienda, Organizador, Operador de plataforma, Subdominio, Plantilla, CredencialFlow, Términos de Servicio, Disclaimer del sorteo, Producto, Sorteo, Bases del sorteo]

features:
  - id: F01
    behavior: "Alta self-service de Tienda: un usuario logueado SIN tienda crea una (slug validado, único y no reservado + nombre) — se crea el Tenant en CONFIGURACION y su TenantMembership en una $transaction; el empty state 'sin tienda' pasa a un formulario de creación"
    state: active
  - id: F02
    behavior: "Aceptación de ToS registrada (quién/cuándo/versión) sobre un texto de ToS versionado en el repo; queda como requisito del gate de publicación (ADR-0008)"
    state: active
  - id: F03
    behavior: "Checklist de publicación + publicar/despublicar: readiness server-side (ToS + CredencialFlow + ≥1 producto activo con PDF + bases si hay sorteo activo) que gobierna tanto el checklist del panel como el gate; publicar transiciona CONFIGURACION→PUBLICADA solo si el gate pasa; despublicar es reversible"
    state: active
  - id: F04
    behavior: "Panel del Operador: listado de TODAS las Tiendas con su estado (operador-only, server-side) + suspender/reactivar (SUSPENDIDA saca el storefront del subdominio; reactivar vuelve a CONFIGURACION). Sin editar contenido de tenants"
    state: active
---

# F08 — Self-service de tenants + panel del Operador

## Contexto

Fase F08 del roadmap SaaS (`26-07-16-saas-roadmap.md`). Criterio de hecho: **que un tercero cree
su Tienda y la publique SIN intervención del Operador**. Todo el andamiaje pesado ya existe de
F01/F05/F06: modelo `Tenant` con su enum de ciclo de vida (`ALTA | CONFIGURACION | PUBLICADA |
SUSPENDIDA`), `TenantMembership` (Organizador↔Tienda), `FlowCredential` cifrada, `panelProcedure`
que carga `ctx.acceso` (userId + esOperador vía `PLATFORM_OPERATOR_EMAILS` + membresías,
server-side), los use cases del panel (`guardarCredencialFlow`, `crearProducto`+subida R2,
`guardarConfiguracionTienda`, sorteo, bases como `Tenant.basesSorteo`), y `resolverTenantDesdeHost`
que sirve storefront SOLO a Tiendas `PUBLICADA`. El signIn de Google ya es abierto (autenticación
abierta, autorización fail-closed en la capa de datos): hoy un usuario logueado SIN membresía ve el
empty state "tu cuenta no tiene una tienda asignada".

F08 cierra el hueco de onboarding: (1) ese empty state pasa a ser un **formulario de alta** que crea
la Tienda + la membresía; (2) un **checklist de pasos pendientes** (no un wizard lineal rígido) guía
al Organizador hacia la publicación reusando las páginas del panel que ya existen; (3) la
**publicación** transiciona el estado con un gate duro (ADR-0008: sin ToS aceptados y sin bases del
sorteo no se publica); (4) el **Operador** gana una vista de todas las Tiendas con acciones de
supervisión (suspender/reactivar). El ToS es un **borrador operativo** de texto en el repo — la
validación legal formal es F10 (ADR-0008) y no bloquea. Corre en dev con `*.localhost` (S1); la
decisión abierta #4 (dominio con wildcard) no bloquea. Layering D8, tenancy server-side (I1),
fail-closed.

## Decisiones

- **D1 — El alta self-service crea la Tienda en `CONFIGURACION`** (no `ALTA`). Razón: en self-service
  el acto de crear la Tienda ES el arranque de su configuración; no existe el limbo "creada pero sin
  dueño trabajando". `ALTA` (el `@default` del enum) queda como estado vestigial para tenants
  sembrados/creados por el Operador sin Organizador activo — el resolver y el gate lo tratan idéntico
  a `CONFIGURACION` (ambos = editable/no-pública). No cambia el enum. Supuesto revisable.
- **D2 — Aceptación de ToS = 3 campos aditivos en `Tenant`, NO un modelo aparte.** Se agregan
  `tosVersion String?`, `tosAceptadoAt DateTime?`, `tosAceptadoPor String?` (snapshot del EMAIL del
  aceptante, durable si el `User` se borra — ADR-0004). Razón: espeja EXACTAMENTE el precedente de la
  ejecución auditable del sorteo (`Raffle.ganadorEmail`/`ejecutadoAt`/`ejecutadoPor` viven ON la
  entidad, no en una tabla de auditoría), es un `db push` aditivo sin relación nueva, y el gate solo
  necesita la última aceptación. Alternativa (modelo `TosAcceptance` append-only con historial de
  versiones) se difiere a F10, cuando el audit trail legal importe. Revisable.
- **D3 — El ToS es texto versionado en el repo, no un modelo de DB.** Un módulo `src/server/tos/`
  exporta `TOS_VERSION` (string, ej. `"2026-07-17"`) + `TOS_TEXTO`. La UI lo renderiza; la aceptación
  graba `tosVersion = TOS_VERSION`. El gate exige `tenant.tosVersion === TOS_VERSION` (una bump de
  versión invalida la aceptación previa a efectos del gate). Razón: el contenido lo escribe el
  humano/abogado (ADR-0008), no es dato del dominio; versionarlo en repo es lo más simple y auditable.
- **D4 — Onboarding = checklist de pasos pendientes, NO wizard lineal.** Un use case
  `getEstadoPublicacion` computa server-side cada requisito (ToS, Flow, ≥1 producto publicable, bases
  si hay sorteo) con su estado done/pending, y ES la única fuente de verdad que alimenta tanto el
  checklist del panel (cada ítem enlaza a la página existente: Configuración, Productos, aceptar ToS)
  como el gate de `publicarTienda`. Razón: el brief lo pide; es order-independent, resumible, sin
  máquina de estados de wizard, y reusa las páginas del panel tal cual. Robusto > lineal.
- **D5 — El gate de publicación** (recomputado server-side dentro de `publicarTienda`, jamás confiado
  al cliente): (a) ToS aceptado en la versión vigente; (b) `FlowCredential` cargada; (c) ≥1 `Product`
  con `activo = true` **y** `pdfPath` no-null (un producto sin PDF vendería pero no entregaría —
  publicable = entregable, I9); (d) si existe un `Raffle` `ACTIVO`, `Tenant.basesSorteo` no vacío
  (ADR-0008: no se publica un sorteo activo sin bases). Sin sorteo activo, (d) no aplica. Razón:
  criterio de hecho del roadmap + ADR-0008.
- **D6 — Máquina de estados (F03/F04)**: `crearTienda: → CONFIGURACION` (D1); `publicarTienda:
  {ALTA|CONFIGURACION} → PUBLICADA` (gate D5); `despublicarTienda: PUBLICADA → CONFIGURACION`
  (Organizador, reversible); `suspenderTienda: {ALTA|CONFIGURACION|PUBLICADA} → SUSPENDIDA`
  (Operador); `reactivarTienda: SUSPENDIDA → CONFIGURACION` (Operador — vuelve SIEMPRE a
  CONFIGURACION, no a PUBLICADA: obliga a re-publicar conscientemente y re-evalúa el gate; MVP no
  guarda el estado previo, S9). Razón: transiciones mínimas y seguras; sin historial (S9).
- **D7 — El slug del alta reusa `esSlugValido`** (exportado de `parsearHost.ts`, decisión d de F01-B)
  + una lista de **reservados** (`www`, `api`, `admin`, `app`, `mail`, `static`, `assets`, `cdn`,
  `dev`, `panel`, `operador`…) que vive junto a `esSlugValido` en `src/server/tenancy/` para que no se
  desincronice, + unicidad por el `@unique` de DB (colisión ⇒ `CONFLICT`). El slug es **inmutable tras
  crear** (S3). Razón: el slug ES el subdominio (ADR-0007); una definición única evita el drift que
  advirtió F01-B.
- **D8 — MVP: un Organizador crea UNA Tienda.** `crearTienda` rechaza (`CONFLICT`) si el usuario ya
  tiene una membresía. El selector multi-tienda queda para el Operador (F04, que sí opera sobre
  cualquier `tenantId`). Razón: S6 (un dueño por Tienda, sin equipos/roles finos); mantiene el alta
  simple. Revisable.
- **D9 — El Operador es supervisión, no edición.** `listarTiendas`/`suspenderTienda`/`reactivarTienda`
  gatean directo por `acceso.esOperador` (server-side); el `tenantId` objetivo entra por input pero la
  AUTORIZACIÓN es el flag Operador, jamás el input (I1). No hay use cases del Operador que editen
  productos, precios, credenciales ni config de un tenant. Razón: alcance del roadmap ("solo
  supervisión/moderación") + ADR-0006 (la plataforma orquesta, no opera las tiendas).

## Plan

Pasos en orden de dependencia. El schema (paso 1) lo revisa `schema-guardian` antes de tocarlo.

1. **Schema aditivo** — invocar `schema-guardian`: 3 campos nullable en `Tenant` (`tosVersion`,
   `tosAceptadoAt`, `tosAceptadoPor`) espejando el patrón de auditoría de `Raffle`; sin modelo nuevo,
   sin cambio de enum, `db push` aditivo (I8/S7). (F02)
2. **Módulo ToS** (`src/server/tos/tos.ts`): `TOS_VERSION` + `TOS_TEXTO` (borrador operativo). (F02)
3. **Reservados de slug** (`src/server/tenancy/`): `SLUGS_RESERVADOS` + helper `esSlugDisponible(slug)`
   que compone `esSlugValido` + no-reservado (unicidad la resuelve la DB). (F01)
4. **Use case `crearTienda`** (`domain/tenants/`): valida slug (esSlugValido + no reservado), exige
   que el usuario no tenga ya membresía (D8), crea `Tenant` (estado CONFIGURACION) + `TenantMembership`
   en `$transaction`; colisión de slug ⇒ `CONFLICT`. Input SIN tenantId; el `userId` sale de
   `ctx.acceso` (I1). (F01)
5. **Use case `aceptarTos`** (`domain/tenants/`): graba `tosVersion=TOS_VERSION`, `tosAceptadoAt=ahora`,
   `tosAceptadoPor=acceso.email` sobre el tenant resuelto (`resolverTenantAutorizado`). Idempotente
   (re-aceptar la misma versión re-sella el timestamp). (F02)
6. **Use case `getEstadoPublicacion`** (`domain/tenants/`): computa los 4 requisitos del gate (D5) +
   `puedePublicar` + el estado actual del tenant. Única fuente de verdad para checklist y gate. (F03)
7. **Use cases `publicarTienda` / `despublicarTienda`** (`domain/tenants/`): `publicarTienda` recomputa
   el gate server-side (reusa la lógica de `getEstadoPublicacion`) y transiciona a PUBLICADA solo si
   pasa (si no, `INVALID`/`CONFLICT` con el requisito faltante); `despublicarTienda` PUBLICADA→
   CONFIGURACION. Ambos scopeados por membresía (I1). (F03)
8. **Use cases del Operador** (`domain/operador/`): `listarTiendas` (todas, con estado + KPIs mínimos),
   `suspenderTienda`, `reactivarTienda` — los tres gatean por `acceso.esOperador` (FORBIDDEN si no);
   el `tenantId` objetivo entra por input (el flag Operador autoriza, no el input). (F04)
9. **Router**: agregar los procedures a `panelRouter` (o un `operadorRouter` nuevo montado en root),
   todos `panelProcedure`, finos → `runDomain` → domain (D8). (F01–F04)
10. **UI**:
    - Empty state `SinTienda` (en `admin-layout.tsx`) → formulario de alta (slug + nombre) con
      feedback de slug tomado/reservado. (F01)
    - Página/sección **checklist de publicación** en el panel (ítems con enlace a las páginas
      existentes + estado done/pending desde `getEstadoPublicacion`) + botón Publicar (deshabilitado
      hasta `puedePublicar`) + Despublicar. (F02/F03)
    - Card/modal de **aceptación de ToS** (renderiza `TOS_TEXTO`, botón Aceptar). (F02)
    - Sección **Operador** (visible solo si `esOperador`): tabla de todas las Tiendas con estado +
      acciones Suspender/Reactivar. (F04)
11. Cierre: `backend-reviewer` (use cases/gate/tenancy) + `frontend-reviewer` (UI Mantine) +
    `change-set-reviewer` con la lista de archivos de la sesión.

## Validaciones

### F01 — Alta self-service de Tienda

**Vitest** (integration):
- [x] `crearTienda` con slug válido y libre crea el `Tenant` en estado CONFIGURACION + la
  `TenantMembership` del usuario, en una sola transacción. — `src/__tests__/server/tenants/crearTienda.test.ts::tenants.alta.001` ✅ 2026-07-27
- [x] Slug inválido (no cumple `esSlugValido`) ⇒ error de validación; slug reservado (`www`, `api`,
  `admin`…) ⇒ rechazo; slug ya existente ⇒ `CONFLICT` sin crear membresía huérfana. — `src/__tests__/server/tenants/crearTienda.test.ts::tenants.alta.002a/002b/002c` + `src/__tests__/server/tenancy/slugTienda.test.ts::tenants.slug.001/002/003` ✅ 2026-07-27
- [x] Un usuario que ya tiene una membresía no puede crear otra Tienda (`CONFLICT`, D8). — `src/__tests__/server/tenants/crearTienda.test.ts::tenants.alta.003` ⚠️ el test pasa, pero **D8 ya NO rige en producto** (ADR-0022 multi-tienda; nikochaima72 tiene 9 membresías). Ver Bitácora 2026-07-27.
- [x] El `userId` de la membresía sale del acceso server-side, nunca del input (no hay `userId`/
  `tenantId` en el input del use case). — `src/__tests__/server/tenants/crearTienda.test.ts::tenants.alta.004` ✅ 2026-07-27

**E2E** (browser):
- [x] En dev: un usuario Google recién logueado SIN tienda ve el formulario de alta; crea una con
  slug+nombre y el panel pasa a mostrar su Tienda (nombre en el nav, sin empty state). Un slug ya
  tomado muestra el error correspondiente. ✅ 2026-07-27 — cuenta Google REAL `nicolas.chaima@datawalt.cl`
  con 0 membresías; `www` ⇒ «reservado por la plataforma», `autora` ⇒ «ya está en uso por otra tienda»,
  `e2e-alta-2707` ⇒ Tenant CONFIGURACION + membresía. **Salvedad de dev**: el redirect post-alta al
  subdominio rebota a `/login` porque la cookie es host-only en `localhost` (en prod es wildcard,
  ADR-0019); se puenteó con el mismo `sessionToken` en el subdominio.

### F02 — Aceptación de ToS registrada

**Vitest** (integration):
- [x] `aceptarTos` graba `tosVersion` = versión vigente, `tosAceptadoAt` y `tosAceptadoPor` (email del
  aceptante) sobre la Tienda del acceso; scopeado por membresía (sin membresía ⇒ FORBIDDEN). — `src/__tests__/server/tenants/aceptarTos.test.ts::tenants.tos.001/001b/003` ✅ 2026-07-27
- [x] Re-aceptar la misma versión es idempotente (no falla; re-sella el timestamp). — `src/__tests__/server/tenants/aceptarTos.test.ts::tenants.tos.002` ✅ 2026-07-27
- [x] `getEstadoPublicacion` reporta el requisito ToS como pendiente si `tosVersion` es null o distinta
  de la vigente, y como cumplido si coincide. — `src/__tests__/server/tenants/getEstadoPublicacion.test.ts::tenants.publicacion.tos.001` ✅ 2026-07-27

**E2E** (browser):
- [x] En el checklist del panel, aceptar el ToS marca ese ítem como cumplido y el registro queda en la
  Tienda (verificable en Prisma Studio: version/fecha/email). ✅ 2026-07-27 — `tosVersion=2026-07-17`,
  `tosAceptadoAt=2026-07-27T05:26:59Z`, `tosAceptadoPor=nicolas.chaima@datawalt.cl`. **Hallazgo legal**:
  el texto del ToS NO menciona la suscripción de $25.000/mes de la Plataforma (ADR-0026) — ver Bitácora.

### F03 — Checklist de publicación + publicar/despublicar

**Vitest** (integration):
- [x] `getEstadoPublicacion` marca cumplidos exactamente los requisitos presentes: ToS vigente,
  `FlowCredential` cargada, ≥1 `Product` activo con `pdfPath` no-null, y bases (`basesSorteo` no vacío)
  solo si hay un `Raffle` ACTIVO. `puedePublicar` = todos cumplidos. — `src/__tests__/server/tenants/getEstadoPublicacion.test.ts::tenants.publicacion.001/001b` + núcleo puro `src/__tests__/server/tenants/evaluarPublicacion.test.ts::tenants.publicacion.eval.001-005` ✅ 2026-07-27
- [x] `publicarTienda` recomputa el gate server-side y transiciona CONFIGURACION→PUBLICADA solo si
  pasa; con cualquier requisito faltante NO publica y devuelve el requisito faltante (`INVALID`/
  `CONFLICT`). — `src/__tests__/server/tenants/publicarDespublicar.test.ts::tenants.publicacion.002/002b/002c/002d` ✅ 2026-07-27
- [x] Con `Raffle` ACTIVO y `basesSorteo` vacío, `publicarTienda` falla (gate ADR-0008); sin sorteo
  activo, ese requisito no aplica y puede publicar. — `src/__tests__/server/tenants/publicarDespublicar.test.ts::tenants.publicacion.003` + `src/__tests__/server/tenants/evaluarPublicacion.test.ts::tenants.publicacion.eval.005` ✅ 2026-07-27
- [x] `despublicarTienda` transiciona PUBLICADA→CONFIGURACION; ambas operaciones scopeadas por
  membresía (tienda ajena ⇒ FORBIDDEN). — `src/__tests__/server/tenants/publicarDespublicar.test.ts::tenants.publicacion.004/004b/004c` ✅ 2026-07-27

**E2E** (browser):
- [x] Con todos los requisitos cumplidos, Publicar deja la Tienda PUBLICADA y `<slug>.localhost` sirve
  el storefront; Despublicar la baja y el subdominio vuelve a respuesta neutral. Con un requisito
  faltante, el botón Publicar está deshabilitado y el checklist muestra qué falta. ✅ 2026-07-27 —
  las tres ramas ejercidas en vivo sobre `e2e-alta-2707`: con pasos pendientes el botón venía
  `disabled` + «Completa los pasos pendientes»; con todo cumplido, Publicar ⇒ PUBLICADA y storefront
  200 con catálogo/vitrina/disclaimer; Despublicar ⇒ CONFIGURACION y subdominio 404 neutral.
  **El checklist creció** desde el plan original: hoy son 5 ítems (ToS, Flow, producto, bases si hay
  sorteo ACTIVO, **«Activa tu plan»** de ADR-0026) — el 5º no existía en F08.

### F04 — Panel del Operador — **SUPERSEDED por ADR-0023 (2026-07-26), NO TESTEABLE**

El rol Operador fue **extirpado del producto**: `domain/operador/`, `src/pages/admin/operador.tsx`,
el router `operador`, la env `PLATFORM_OPERATOR_EMAILS` y los tests `operadorTiendas.test.ts` ya no
existen (commit `2260667`, carril `plataforma-retiro-operador`). Hoy hay **una sola puerta de
autorización: la membresía**. Los 3 checkboxes de abajo quedan como registro histórico.

**Vitest** (integration):
- [ ] ⏭️ SUPERSEDED — `listarTiendas` … — el archivo `src/__tests__/server/operador/operadorTiendas.test.ts` fue borrado por ADR-0023.
- [ ] ⏭️ SUPERSEDED — `suspenderTienda`/`reactivarTienda` … — ídem.

**E2E** (browser):
- [ ] ⏭️ SUPERSEDED — no hay panel del Operador ni allowlist de plataforma que ejercer.

## Invariantes

- **I1 — Tenancy server-side**: el `userId` del alta y el `tenantId` sobre el que opera cada use case
  salen de `ctx.acceso` (sesión/membresía) o del flag `esOperador`, resueltos SERVER-SIDE; un
  `tenantId` del input SELECCIONA (solo para el Operador) pero JAMÁS autoriza (ADR-0005; lección H1).
- **I2 — Gate de publicación no evadible**: la transición a PUBLICADA ocurre SOLO tras recomputar el
  gate (D5) dentro del use case; nunca se confía en un `puedePublicar` que venga del cliente.
- **I3 — ADR-0008**: no hay publicación sin ToS aceptado en la versión vigente; no hay publicación con
  `Raffle` ACTIVO sin bases cargadas. El disclaimer del sorteo del storefront (F06) es aparte y no se
  toca acá.
- **I4 — Slug**: se valida con `esSlugValido` (reusado, no reimplementado) + reservados + unicidad de
  DB; inmutable tras crear (S3).
- **I5 — Operador supervisa, no edita**: los use cases del Operador solo cambian el `estado` del
  tenant; ninguno edita contenido/credenciales/config de una Tienda ajena (ADR-0006).
- **I6 — Cifrado / secretos**: F08 no toca `FlowCredential` salvo LEER si está cargada (`configurada`,
  sin traer columnas cifradas); ningún secreto en logs ni respuestas (I5 del roadmap, ADR-0006).
- **I7 — Layering + schema**: routers finos → `runDomain` → `domain/`; antes de tocar el schema,
  `schema-guardian`; `db push` aditivo hasta F10 (I8/S7 del roadmap).
- **I8 — Fail-closed**: sin sesión ⇒ UNAUTHORIZED; logueado sin membresía y sin rol ⇒ solo puede crear
  su primera Tienda (nada más); Operador se designa solo por `PLATFORM_OPERATOR_EMAILS`.

## Out of scope

- Validación legal formal del ToS (F10, ADR-0008 — dependencia externa; el borrador operativo no
  bloquea).
- Cerrar la decisión abierta #4 (dominio de la plataforma con wildcard): F08 corre en dev con
  `*.localhost`; el `NEXTAUTH_URL`/dominio real es de F07/F10.
- Multi-tienda por un mismo Organizador, equipos y roles finos dentro de una Tienda (S6).
- Modelo de cobro de la Plataforma a los tenants / billing (decisión de negocio abierta, ADR-0006).
- Edición del contenido de una Tienda por el Operador (solo supervisión de estado).
- Auto-suspensión por incumplimiento / moderación automática (la suspensión es manual del Operador).
- Historial de transiciones de estado del ciclo de vida (S9 — enum simple, sin auditoría de cambios).
- Correo de bienvenida / notificaciones de onboarding (podría enganchar con F04-correo, no en F08).
- Modelo `TosAcceptance` append-only con historial de versiones (diferido a F10, D2).

## Especialistas a consultar

- `schema-guardian` — los 3 campos aditivos de ToS en `Tenant` (naming, nullable, patrón de auditoría
  espejando `Raffle`; confirmar que no hace falta modelo ni índice nuevos).
- `backend-reviewer` — use cases de alta/publicación/operador, el gate recomputado server-side, el
  guard por `esOperador`, reuso de `esSlugValido`/`resolverTenantAutorizado`, layering y env.
- `frontend-reviewer` — formulario de alta, checklist de publicación, card de ToS y tabla del Operador
  (Mantine 7; convenciones de data-fetching y empty/error states).
- `feature-tester` — Vitest + E2E asistido en dev (`*.localhost`): alta → checklist → publicar ⇒
  storefront vivo; suspender por el Operador ⇒ storefront cae.
- `change-set-reviewer` — diff completo de la fase antes de commit.

## Bitácora

- [2026-07-17 00:00] [planner-grill] Plan de F08 escrito por CRITERIO (sin grill, por instrucción
  explícita del usuario — panorama antes que detalle; ninguna pregunta resultó estructuralmente
  imposible de asumir). Decisiones clave cerradas por criterio y marcadas como revisables donde
  corresponde: **D1** alta crea en CONFIGURACION (ALTA queda vestigial); **D2** aceptación de ToS = 3
  campos aditivos en `Tenant` (`tosVersion`/`tosAceptadoAt`/`tosAceptadoPor`), NO modelo aparte,
  espejando el patrón de auditoría de `Raffle` (modelo `TosAcceptance` con historial diferido a F10);
  **D3** ToS = texto versionado en repo (`src/server/tos/`); **D4** onboarding = checklist de pasos
  (no wizard), con `getEstadoPublicacion` como única fuente de verdad de checklist + gate; **D5** gate
  = ToS + Flow + ≥1 producto activo con PDF + (bases si hay sorteo activo, ADR-0008); **D6** máquina de
  estados mínima; **D7** slug reusa `esSlugValido` + reservados; **D8** MVP 1 Tienda por Organizador;
  **D9** Operador supervisa (solo estado), no edita. 4 features (F01 alta, F02 ToS, F03 publicación,
  F04 Operador). Un solo `db push` aditivo (3 campos en Tenant). **AWAITING USER APPROVAL** — la
  implementación no arranca sin visto bueno explícito del usuario.
- [2026-07-17 02:30] [feature-implementer] Arranca implementación. Visto bueno dado (contrato
  nocturno delegado). `status: planning → implementing`, F01 `state: active`. Features pendientes:
  F01, F02, F03, F04. Read pass completo: CLAUDE.md, template, ADR-0005/0006/0007/0008, backend/
  frontend/data-fetching-conventions, prisma-conventions, design.md, y el código a reusar (authPolicy
  + resolverTenantAutorizado, panelProcedure/ctx.acceso, domain/panel/*, tenancy/parsearHost.esSlugValido
  + resolverTenant, schema Tenant/TenantMembership, admin-layout/pages Mantine, patrón de tests fake-db
  con test-id en comentario). Orden de ejecución: F01 (sin schema) → F02 (schema-guardian + db push
  aditivo + tos module + aceptarTos) → F03 → F04.
- [2026-07-17 03:10] [feature-implementer] F01 (alta self-service) implementada. Archivos:
  `src/server/tenancy/slugTienda.ts` (SLUGS_RESERVADOS + esSlugReservado/esSlugDisponible,
  reusa esSlugValido de parsearHost — D7/I4, sin definición paralela), `src/server/domain/tenants/
  crearTienda.ts` (Tenant CONFIGURACION + membership en $transaction; userId del acceso I1; slug
  validado; D8 rechaza 2ª tienda), `src/server/domain/tenants/schemas.ts` (crearTiendaInput, slug
  trim+lowercase), procedure `panel.crearTienda`, `src/components/admin/crear-tienda.tsx` (form
  Mantine, normaliza slug amigable sin reimplementar validez), wiring en `admin-layout.tsx` (form
  para Organizador nuevo; SinTiendaOperador para Operador sin tienda propia → link a /admin/operador).
  Tests fake-db: slugTienda 3 + crearTienda 6, verdes (filtrados). tsc limpio. Nota táctica: gate de
  "1 tienda por cuenta" via `acceso.tenantIds` (snapshot server-side) + pre-chequeo de slug en la $tx;
  el `@unique` de DB es el backstop de carrera (documentado en el use case). Reviewers diferidos al
  cierre de la implementación completa (instrucción del orchestrator, punto 6 "al cierre").
- [2026-07-17 03:12] [feature-implementer] schema-guardian (invocado al inicio para F02):
  **APPROVE** de los 3 campos aditivos de ToS en `Tenant` (tosVersion/tosAceptadoAt/tosAceptadoPor,
  todos String?/DateTime?/String?). Confirma: sin modelo nuevo, sin relación, sin @@index (no
  queriables); `db push` ADITIVO (sin --accept-data-loss); sin riesgo de dinero ni tenancy. Señala
  una divergencia semántica NO bloqueante: write-MANY (se sobrescriben al re-aceptar versión nueva)
  vs write-once de Raffle — el historial legal completo se difiere a F10 (D2). Aplicaré su bloque
  paste-ready (comentario con nota write-many + tipos alineados) en F02.
- [2026-07-17 03:40] [feature-implementer] F02 (aceptación de ToS) backend implementada. Schema:
  3 campos aditivos en `Tenant` aplicados con `npm run db:push` (ADITIVO, DB en sync) + `prisma
  generate` OK. OJO OPERATIVO: había TRES `next dev` corriendo (:3000/:3001/:3003) — la corrupción
  multi-instancia que advierte la memoria; uno tenía locked el query_engine DLL y bloqueaba el
  generate (EPERM). Maté los tres listeners (PIDs 35632/45236/36232), regeneré el client OK. Dev
  server a levantar UNA sola vez en :3001 para la verificación (punto 7). Archivos: `src/server/tos/
  tos.ts` (TOS_VERSION="2026-07-17" + TOS_TEXTO **BORRADOR REVISABLE** — refleja ADR-0008/0006),
  `src/server/domain/tenants/aceptarTos.ts` (graba los 3 campos; email snapshot con fallback a
  userId; idempotente write-many), procedures `panel.getTos` (query de texto versionado) +
  `panel.aceptarTos` (mutation). Tests fake-db: aceptarTos 4, verdes. tsc limpio. La UI de aceptación
  (modal con TOS_TEXTO) se construye junto al checklist en F03 (acoplada a getEstadoPublicacion).
- [2026-07-17 04:10] [feature-implementer] F03 (checklist + publicar/despublicar) implementada.
  Núcleo puro `src/server/domain/tenants/_publicacion.ts` (`evaluarPublicacion` + `mensajeRequisitoFaltante`)
  = ÚNICA fuente de verdad del gate (D4/I2), reusado por `getEstadoPublicacion.ts` (checklist, carga
  ToS+Flow+producto-publicable+sorteo-activo) y `publicarTienda.ts` (RECOMPUTA el gate DENTRO de la $tx,
  transición {ALTA|CONFIGURACION}→PUBLICADA; ya PUBLICADA idempotente; SUSPENDIDA→CONFLICT). `despublicarTienda.ts`
  = updateMany guard WHERE estado=PUBLICADA (atómico, count 0 ⇒ CONFLICT). Procedures `panel.getEstadoPublicacion/
  publicarTienda/despublicarTienda`. UI: `src/components/admin/checklist-publicacion.tsx` (checklist con
  items que enlazan a config/productos, ToS modal que renderiza TOS_TEXTO + aceptar, botón Publicar
  disabled hasta puedePublicar, banner PUBLICADA con "Ver mi tienda" abriendo `<slug>.<host>` + Despublicar
  con openConfirmModal, banner SUSPENDIDA). Montado en `admin/index.tsx` (Resumen). Tests fake-db:
  evaluarPublicacion 6 + getEstadoPublicacion 5 + publicarDespublicar 9, verdes. tsc limpio. Auto-chequeo
  design.md: color de estado vía tokens Mantine (`green`/`gray`/`red`), no hex inline; `red` reservado a
  despublicar/suspendida (destructivo/error); sin clases de color Tailwind (reemplacé un `divide-[var...]`
  por `<Divider/>` de Mantine); voz español neutro; sin montos en esta pantalla.
- [2026-07-17 04:35] [feature-implementer] F04 (panel del Operador) implementada. `domain/operador/`:
  `listarTiendas.ts` (gate acceso.esOperador → todas las tiendas con estado + _count productos/órdenes,
  NO scopea por tenant = excepción de plataforma, nunca trae columnas cifradas I5), `suspenderTienda.ts`
  ({ALTA|CONFIG|PUBLICADA}→SUSPENDIDA via updateMany guard estado!=SUSPENDIDA), `reactivarTienda.ts`
  (SUSPENDIDA→CONFIGURACION, D6 nunca directo a PUBLICADA), `schemas.ts` (inputs con tenantId que
  SELECCIONA, no autoriza — I1/I5). Router NUEVO `operadorRouter` montado en root como `operador`
  (frontera visible: autorizado por flag, no membresía). UI: `src/pages/admin/operador.tsx` (tabla de
  todas las tiendas + EstadoTiendaBadge nuevo + suspender con openConfirmModal rojo + reactivar; loading
  per-fila via mutation.variables.tenantId; estado "no autorizado" si FORBIDDEN), `estado-tienda-badge.tsx`
  (misma excepción documentada de estado-badge: dot inline por semántica de comercio PENDIENTE), nav link
  Operador en admin-layout solo si esOperador. Tests fake-db: operadorTiendas 6, verdes. tsc limpio.
  Auto-chequeo design.md: red reservado a suspender (destructivo), green a reactivar/publicada (token
  Mantine), badges con excepción documentada; montos NO aplican (conteos con num()); voz neutro.
- [2026-07-17 04:55] [feature-implementer] Gate de cierre VERDE (instrucción punto 6): `npm run check`
  = tsc + next lint + `vitest run` completo ⇒ 50 archivos / **254 passed | 1 skipped** (exit 0). +39
  tests nuevos de F08 sobre el baseline de 216.
- [2026-07-17 05:00] [feature-implementer] backend-reviewer: **REQUEST_CHANGES** (1 blocker). Blocker:
  `crearTienda` garantizaba D8 solo con el snapshot `acceso.tenantIds` (pre-tx), sin recuento en la tx
  ni `@unique` de DB que respalde "1 Tienda por user" ⇒ dos altas concurrentes del mismo usuario (doble
  submit) podían crear 2 Tenants+membresías. NO es fuga cross-tenant (I1/I2/I5/I6 e aislamiento: A). FIX
  APLICADO: recuento `tx.tenantMembership.count({ where: { userId } })` DENTRO de la $transaction como
  guard autoritativo (el snapshot queda de fast-fail); comentario de cabecera aclara que el `@unique`
  respalda solo el slug, no D8 (por qué no hay unique por userId: post-MVP el Operador podría sumar un
  user a varias Tiendas). Test nuevo `tenants.alta.003b` (snapshot vacío + count=1 ⇒ CONFLICT). Nit
  cosmético (findUniqueOrThrow→INTERNAL si faltara la fila, prob. ~nula por FK Restrict) NO tocado.
- [2026-07-17 05:02] [feature-implementer] frontend-reviewer: **REQUEST_CHANGES** (1 blocker + 3 nits).
  Blocker: `checklist-publicacion.tsx` pintaba PUBLICADA con un `Badge color="green"` ad-hoc en vez de
  reusar `EstadoTiendaBadge` (creado en esta misma feature, usado bien en operador.tsx) — dos
  representaciones del mismo enum. FIX APLICADO: reusa `<EstadoTiendaBadge estado="PUBLICADA" />`
  (Badge quitado de imports). Nits: (1) `tabular-nums` off-label en el preview del slug → QUITADO;
  (2) orden interno useDisclosure tras la query → REORDENADO antes; (3) `whitespace-pre-wrap` fuera
  del whitelist de layout → NO tocado (necesario para el ToS; ver drift abajo). Post-fix: next lint
  exit 0, tsc limpio, F08 tests 40/40, /admin y /admin/operador compilan (307, no 500).
- [2026-07-17 05:05] [feature-implementer] DRIFT de docs detectado (Step 4.5) — NO aplicado, requiere
  permiso del usuario. Candidatos que ambos reviewers marcaron para `docs/agents/frontend-conventions.md`:
  (a) `whitespace-pre-wrap` como utility de layout permitida para TEXTO PREFORMATEADO versionado (ToS hoy;
  candidato para bases de sorteo/descripciones); (b) el estado **"no autorizado" (FORBIDDEN)** como 4ª
  rama explícita distinta del error genérico en pantallas gateadas por rol (primer precedente:
  `operador.tsx`). Quedan como propuestas REVISABLES para el usuario/próxima sesión (no se toca la doc
  sin visto bueno explícito).
- [2026-07-17 05:15] [feature-implementer] change-set-reviewer: **APPROVE** (0 blockers, 2 nits). Gate
  RE-corrido tras los fixes: tsc exit 0 + next lint exit 0 + `vitest run` = 50 archivos / **255 passed |
  1 skipped** (exit 0; el +1 sobre 254 es `tenants.alta.003b` del fix de D8). Nits = las 2 excepciones
  ya conscientes/logueadas (hex inline del badge = mismo precedente aceptado de `EstadoBadge`;
  whitespace-pre-wrap = ya surfaced como drift). Verificó: tenancy server-side sin fuga cross-tenant,
  gate no evadible en la $tx, cifrado (solo tenantId en lecturas de FlowCredential), layering, Zod,
  schema aditivo. Veredicto: cerrable.
- [2026-07-17 05:16] [feature-implementer] Implementación completa. F01..F04 escritas; schema-guardian +
  backend + frontend + change-set reviewers VERDES; gate `npm run check` verde (255/256, +1 skip).
  `status: implementing → testing`. NO commit / NO feature-tester (instrucción del usuario). Los archivos
  de test están anotados en Validaciones (checkboxes `[ ]` — los marca el feature-tester). Dev server
  activo en :3001 (1 instancia) para el E2E asistido. REVISABLE por el usuario: (1) texto del ToS
  `src/server/tos/tos.ts` (BORRADOR, validación legal = F10); (2) 2 drafts de drift de frontend-conventions
  sin aplicar (whitespace-pre-wrap; estado "no autorizado"); (3) seed tenants autora/prueba están
  PUBLICADA con tos=null y sin bases pese a raffle ACTIVO (se sembraron directo a PUBLICADA, bypass del
  gate — para demo del checklist conviene un tenant fresco creado por el alta).
- [2026-07-27 02:00] [feature-tester] **Corrida E2E completa del alta self-service, 10 meses de features
  después.** Vitest del carril `tenants`+`tenancy`: **88/88 verde** (11 archivos). E2E: **alta de punta a
  punta con una cuenta Google REAL de un desconocido** (`nicolas.chaima@datawalt.cl`, 0 membresías) hasta
  storefront vivo y cobro real en el sandbox de Flow. Evidencia: Tienda `e2e-alta-2707`
  (`cms2s8nuh000d14igr0trktih`), hoy en CONFIGURACION (despublicada a propósito al cierre).
  **DIAGNÓSTICO DEL BUG DE LOGIN que reportó el usuario** («entré con datawalt pero sigue con
  nikochaima72»): NO era cookie vieja. En la tabla `Account` había **dos cuentas Google colgando del
  MISMO `User`** — el `sub` de `nicolas.chaima@datawalt.cl` (hd=datawalt.cl) apuntaba a
  `cmrogd2yz…` = nikochaima72@gmail.com. Es el comportamiento estándar del PrismaAdapter de NextAuth v4:
  si hay **sesión activa** cuando vuelve el callback de OAuth, la cuenta nueva se **linkea al usuario de
  la sesión** en vez de crear uno. O sea: entrar con datawalt era, literalmente, entrar como nikochaima72,
  y `User` con email datawalt no existía. Agravante: `GoogleProvider` (`src/server/auth.ts:99`) no pasa
  `prompt=select_account`, así que Google nunca mostraba el chooser. Para correr el E2E se **desvinculó
  temporalmente** esa fila y se forzó el chooser a mano sobre la URL de authorize (sin tocar código);
  **al cierre se restauró** el link exacto (Account `sub 118316…` → userId nikochaima72), así que el
  mundo del usuario quedó como estaba. *Decisión pendiente del usuario*: si quiere que datawalt sea una
  cuenta separada de verdad, hay que borrar esa fila `Account` y volver a entrar (y considerar
  `authorization: { params: { prompt: "select_account" } }` en el provider).
  **RESULTADO HONESTO: sí, un desconocido puede montar y publicar su tienda solo.** Tropieza en 4 puntos,
  ninguno bloqueante: (UX-1) el producto **nace en «Borrador»** y la única acción de la fila es «Editar» —
  el checklist pide «un producto activo» pero nada dice que el que acabas de crear no lo está; (UX-2) el
  preview del slug dice literal **«tu-tienda.tudominio»** en vez del dominio real; (UX-3) el panel contra
  la DB remota tarda **~8 s** en refrescar tras guardar (las credenciales de Flow siguen diciendo «No
  conectada» un rato largo después de guardarlas bien — funciona, pero invita a re-guardar); (UX-4) un
  desconocido sin tienda ve el **nav completo** (Productos/Ventas/Sorteo/Plan/Configuración) y todos los
  links vuelven al mismo formulario de alta.
  **HALLAZGO LEGAL (F10)**: el ToS vigente `2026-07-17` **no menciona la suscripción de $25.000/mes**
  (ADR-0026) y su §3 dice que la Plataforma «no retiene comisión» — cierto para las ventas, pero el
  Organizador acepta el texto ANTES de ver el precio y el contrato no habla del cobro recurrente.
  Candidato firme a bump de `TOS_VERSION` cuando se revise con abogado.
  **DEUDA DEL PLAN — (a) es un HALLAZGO DE PRODUCTO, no un detalle**: el guard **D8 sigue VIVO y es
  autoritativo** (`crearTienda.ts:58-80`, recuento dentro de la `$tx` ⇒ CONFLICT si el usuario ya tiene
  UNA membresía), y `<CrearTienda/>` se renderiza en **un solo lugar**: el empty-state «no tienes tienda»
  de `admin-layout.tsx:767`. Consecuencia: **por self-service NADIE puede crear una segunda Tienda** —
  no hay entrada en el switcher ni en ningún otro lado. Pero el resto del producto ya asume lo contrario:
  ADR-0022 trae panel multi-tienda + switcher, y la facturación tiene un plan **ADICIONAL de $12.500
  «segunda tienda a mitad de precio»** con el `PlatformBillingCustomer` único por usuario diseñado
  explícitamente para eso (`iniciarRegistroTarjeta.ts`, `planParaNuevaSuscripcion`). Hoy ese plan
  **es inalcanzable sin meter mano por script** (`scripts/otorgar-membresia.ts`). O se retira D8 y se
  agrega «crear otra tienda» al switcher, o el precio ADICIONAL no tiene camino. Decisión del usuario;
  (b) **F04 completa quedó SUPERSEDED** por ADR-0023
  (no hay Operador); (c) el checklist tiene hoy **5 ítems**, no 4: se sumó «Activa tu plan».
  **Salvedad de dev, no bug**: la cookie de sesión es host-only en `localhost`, así que el redirect
  post-alta al subdominio rebota a `/login` (en prod la cookie va al wildcard, ADR-0019).
  Higiene al cierre: suscripción `sus_w4cab9c03c` cancelada (Flow status 4, `next_invoice=null`) y
  customer `cus_gd085472bd` borrado (status 0); tienda despublicada; `src/config.ts` restaurado a
  `devTienda.enabled: true`; túnel cloudflared apagado y `.env` anotado; 9 exenciones GRANDFATHER
  intactas (ninguna de la tienda nueva: pagó de verdad). Log completo: `tasks/.e2e-run-selfservice.log`.
