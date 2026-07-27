---
slug: checkout-retorno-numeros-sorteo
status: done
owner: nicolas
created: 2026-07-26
related_adrs: [ADR-0001, ADR-0004, ADR-0005, ADR-0024]
related_context: [Número del sorteo, Comprador, Orden, Tienda]

features:
  - id: F01
    behavior: "`checkout.estadoOrden` devuelve además `numeros` y `prefijo` cuando la orden está PAGADA (null mientras no lo esté), tenant-scoped y sin PII"
    state: passing

  - id: F02
    behavior: "La celebración PAGADO de `checkout/retorno` dibuja los números como boletos-chip (uno por bloque de `bloquesDeNumerosDelSorteo`), tematizados por la escala del tenant; sin números ⇒ celebración sin el bloque"
    state: passing

  - id: F03
    behavior: "FALLIDO terminal, timeout del cap de polling y llegada SIN token (D6) muestran copy honesto diferenciado (antes los tres caían en el genérico 'estamos confirmando tu pago')"
    state: passing
---

# Números de sorteo del Comprador en la página de retorno post-compra

## Contexto

La landing promete que el Comprador «ve su número» y hoy ninguna superficie se lo muestra en el
momento de la compra (backlog derivado de `landing-reposicionamiento`; la pata landing —FAQ 5,
`CONFIANZA[1]`, `landing.faq.005`— ya la cerró `sistema-correos-comprador` F03 y queda FUERA de
este plan). La numeración correlativa ya existe (ADR-0024, `RaffleEntry.numero` por compra pagada),
el prefijo configurable también (`Tenant.prefijoTicket`, F08/D12 de correos) y el punto único de
presentación es `src/lib/numerosDelSorteo.ts` (puro, importable del cliente) — que incluso nombra
«retorno post-pago» como superficie futura.

`src/pages/checkout/retorno.tsx` ya sondea `checkout.estadoOrden` cada 2.5s (cap 2 min, se detiene
en PAGADO/FALLIDO, confetti one-shot al PAGADO). Este plan: (1) extiende esa misma query para que
al confirmar PAGADO viajen también los números + prefijo, (2) los dibuja como boletos-chip en la
celebración, y (3) de paso arregla que FALLIDO y el timeout del cap muestran hoy el mismo copy
genérico "estamos confirmando tu pago" — dos estados terminales sin verdad honesta.

## Decisiones

- D1 (Q1): **Extender `checkout.estadoOrden`, no query nueva.** Cuando `estado === "PAGADO"` la
  respuesta incluye además `numeros: number[]` (las `RaffleEntry` de la orden, vía
  `Payment.token → Order`) y `prefijo: string | null` (`Tenant.prefijoTicket`); mientras
  PENDIENTE/FALLIDO/null ⇒ `numeros: null`. El cliente formatea con `bloquesDeNumerosDelSorteo`.
  Razón: el polling ya existe, los números llegan solos por la misma query sin ceremonia nueva.
  Se actualiza el doc-comment del use case: los números NO son PII ni montos — son la identidad
  pública del ticket (I-T6 sigue intacto para correo/montos/ítems).
- D2 (Q2): **Dos estados de copy honesto nuevos en la misma pantalla.**
  - FALLIDO terminal: «El pago no se concretó. No se hizo ningún cargo definitivo — puedes volver
    a la tienda e intentarlo de nuevo» (sin mencionar números ni correo, con acción de volver a la
    tienda).
  - Timeout suave tras el cap de 2 min: «La confirmación está tardando más de lo normal. Apenas se
    confirme, te llega el correo con tu compra». **CORREGIDA por el usuario (2026-07-26)**: el copy
    decía «tu compra y tus números» y se le quitó la promesa de números. Razón: en esa fase la
    orden ni siquiera está confirmada, así que nadie sabe todavía si participa del sorteo — una
    compra PAGADA sin tickets (D4) no tendría número que mandar, y era la ÚNICA fase que prometía
    un dato inexistente justo en la tanda que vino a poder cumplir esa promesa.
  - El polling existente queda tal cual (2.5s, cap 2 min, sin botón de refetch).
- D3 (Q3): **UI del bloque de números en PAGADO: boletos-chip, uno por bloque** de
  `bloquesDeNumerosDelSorteo(numeros, prefijo)`. Chip/boleto Mantine (`Paper`/`Badge` grande,
  `variant="light"` del color primario del tenant, número en fuente mono, gramática talonario).
  Caption «Tus números del sorteo» arriba, refuerzo «también van en tu correo de confirmación»
  abajo. Cero hex inline (todo por la escala del tenant, según `frontend-conventions`). Varios
  bloques envuelven con `Group wrap`. Componente local en `retorno.tsx`, sin dependencia nueva.
  NO replicar el markup del correo — solo compartir el formateador.
- D4 (edge case, decidido por el planner por coherencia con D1/D3 — mismo criterio que correos F03):
  **PAGADO sin `RaffleEntry`** (orden de productos que no participan en el sorteo, o sin sorteo
  activo al momento del pago) ⇒ la query devuelve `numeros: []` (distinto de `null` = «aún no
  confirmado») y la UI celebra **sin** el bloque de boletos ni el refuerzo del correo con números.
  Razón: no prometer números que no existen; `[]` vs `null` deja al cliente distinguir «pagado sin
  tickets» de «todavía no sé».
- D6 (**agregada por el usuario 2026-07-26, extiende F03**): **la llegada SIN `?token=` es una fase
  propia, no «esperando»**. Hoy entrar a `/checkout/retorno` a secas (enlace pegado a medias,
  favorito viejo, URL escrita a mano) muestra «estamos confirmando tu pago» para siempre, sobre un
  pago que nunca existió. Es el hallazgo (1) del `frontend-reviewer` de F03 y lo que
  `frontend-conventions` § «Salir de la app a un proveedor externo» ya declara resuelto en ESTA
  página: ausencia de token ⇒ fase error con salida al inicio, sin llamar a nada. Se agrega la fase
  `sin_token` al mismo `Record` de F03 (ícono `IconLinkOff` + color `red` — la 2ª dimensión visual
  que exige la convención cuando dos casos comparten color; el copy no promete números ni una
  entrega). La query sigue sin correr (`enabled: !!token`). **Precedencia**: sin token gana sobre
  todo, incluido el cap de 2 min — `detenido` se enciende igual aunque nunca haya habido nada que
  confirmar, y decirle «la confirmación está tardando» a quien no trae token es inventarle una
  compra. Esa precedencia se vuelve testeable extrayendo la derivación a
  `src/lib/faseRetornoCheckout.ts` (pura); el `Record` de copy se queda junto al render.
- D5 (técnica): el test existente `estado.004` (`getEstadoOrden.test.ts`) asserta que la respuesta
  es exactamente `{ estado }` — cambia de forma con D1 y se reescribe para asseverar la forma nueva
  (`{ estado, numeros, prefijo }`) manteniendo el guard de PII (sin correo, sin montos).

## Plan

1. Extender `src/server/domain/checkout/getEstadoOrden.ts`: cuando la orden está PAGADA, traer en
   la misma consulta las `RaffleEntry.numero` de la orden y el `prefijoTicket` del tenant;
   PENDIENTE/FALLIDO/token ajeno ⇒ `numeros: null, prefijo: null`. PAGADO sin entries ⇒
   `numeros: []`. Actualizar el doc-comment (D1/D4: números = identidad pública, no PII).
   Neutralidad cross-tenant intacta. (F01)
2. Actualizar/agregar tests de `getEstadoOrden` (incluye reescritura de `estado.004` por D5). (F01)
3. En `retorno.tsx`, rama PAGADO: componente local de boletos-chip por bloque
   (`bloquesDeNumerosDelSorteo(numeros, prefijo)`), caption + refuerzo, `Group wrap`, escala del
   tenant sin hex inline; omitir el bloque completo cuando `numeros` está vacío (D3/D4). (F02)
4. En `retorno.tsx`, estados terminales: rama FALLIDO con su copy + botón volver a la tienda, y
   estado de timeout (el `detenido` por cap sin estado resuelto) con su copy suave (D2). El
   polling no se toca. (F03)
5. Coordinación con carriles activos (ver Invariantes I6/I7): no tocar archivos de
   `sistema-correos-comprador` (plantillas, ledger) ni duplicar el formateador.
6. (D6) Fase `sin_token` en el mismo `Record`, con la derivación de fase extraída a
   `src/lib/faseRetornoCheckout.ts` (pura, testeada) para fijar la precedencia. El polling y el
   confetti siguen sin tocarse (I7). (F03)
7. Borrar el guard `landing.faq.005` (`src/__tests__/components/landing-copy.test.ts`): prohibía
   prometer el número «en pantalla» sobre la premisa de que ninguna pantalla lo muestra, y F02 la
   volvió falsa. Es exactamente lo que el backlog de `landing-reposicionamiento` pedía hacer al
   aterrizar esta feature. **El copy de la landing NO se toca** (esa mitad la cerró correos F03).

## Validaciones

### F01 — estadoOrden devuelve números + prefijo al PAGADO

**Vitest** (integration):
- [x] Orden PAGADA con RaffleEntry ⇒ respuesta incluye `numeros` con los enteros de la orden y `prefijo` del tenant — `src/__tests__/server/checkout/getEstadoOrden.test.ts::estado.005` ✅ 2026-07-26
- [x] Orden PAGADA sin RaffleEntry ⇒ `numeros: []` (no null) — `src/__tests__/server/checkout/getEstadoOrden.test.ts::estado.006` ✅ 2026-07-26
- [x] Orden PENDIENTE ⇒ `numeros: null` (los números no viajan antes de la confirmación) — `src/__tests__/server/checkout/getEstadoOrden.test.ts::estado.001` ✅ 2026-07-26
- [x] Orden FALLIDA ⇒ `numeros: null` — `src/__tests__/server/checkout/getEstadoOrden.test.ts::estado.007` ✅ 2026-07-26
- [x] Token de otra Tienda o inexistente ⇒ respuesta neutral (`estado: null`, sin números) — no filtra existencia — `src/__tests__/server/checkout/getEstadoOrden.test.ts::estado.002` + `::estado.003` ✅ 2026-07-26
- [x] La respuesta jamás incluye correo, montos ni ítems (guard I-T6, reescrito por D5) — `src/__tests__/server/checkout/getEstadoOrden.test.ts::estado.004` ✅ 2026-07-26
- [x] Tenant sin `prefijoTicket` ⇒ `prefijo: null` y los números salen sin prefijo — `src/__tests__/server/checkout/getEstadoOrden.test.ts::estado.008` ✅ 2026-07-26

**E2E** (browser):
- [x] (cubierto por el E2E de F02 — misma superficie) ✅ 2026-07-26

### F02 — boletos-chip en la celebración PAGADO

**Vitest**:
- [x] (no aplica — el formateo ya está cubierto por los tests de `numerosDelSorteo.ts`; el componente es presentación pura) ✅ 2026-07-26

**E2E**:
- [x] Compra con tickets confirmada por el webhook (Flow sandbox + túnel) ⇒ la celebración muestra los boletos-chip con los números correctos, con el MISMO texto por bloque que el correo de confirmación (prefijo incluido si el tenant lo tiene) ✅ 2026-07-26 — **sin Flow sandbox**: se ejerció contra órdenes que YA estaban `PAGADO` en la DB (la superficie solo LEE por token, I2). `autora` con su orden real (1 ticket ⇒ 1 boleto, caption en singular) y un fixture efímero en `demo-noche` con 4 tickets no contiguos ⇒ **2 boletos `41–43` y `50`**, y con `prefijoTicket=ARMY` temporal ⇒ `ARMY-41–43` / `ARMY-50`, byte-idéntico a `bloquesDeNumerosDelSorteo([41,42,43,50],"ARMY")` (I4). **Lo NO ejercido**: el viaje Flow→webhook→`PAGADO` en vivo (sigue pendiente-por-entorno; no es de esta superficie)
- [x] Compra pagada sin participación en sorteo ⇒ celebración sin bloque de boletos ni mención de números ✅ 2026-07-26 — orden real PAGADA sin tickets en `prueba`: celebra, `chips=0`, sin caption y el texto no dice «númer» en ningún lado (D4)
- [x] Los chips usan el color del tenant (verificar en un tenant con branding fuerte, eg. iselk) sin hex inline ✅ 2026-07-26 — computado en 3 tenants: `autora` rosa (`rgb(225,29,72)` sobre `rgb(252,232,237)`) y `demo-noche` violeta (`rgb(168,85,247)` sobre `rgb(246,238,254)`); borde `2px dashed` derivado del acento, mono + `tabular-nums`, **cero hex en los `style` inline**. Ver design finding de contraste en la Bitácora (no bloquea)

### F03 — copy honesto en FALLIDO, timeout y sin token (D6)

**Vitest** (el copy sigue sin test —es presentación— pero la DERIVACIÓN de fase sí, D6):
- [x] Sin `?token=` ⇒ fase `sin_token` — `src/__tests__/lib/faseRetornoCheckout.test.ts::retorno.fase.001` ✅ 2026-07-26
- [x] Pago confirmado ⇒ `pagado`; rechazado ⇒ `fallido` — `src/__tests__/lib/faseRetornoCheckout.test.ts::retorno.fase.002` + `::retorno.fase.003` ✅ 2026-07-26
- [x] Cap vencido con la orden sin resolver ⇒ `timeout`; polling vivo ⇒ `esperando` — `src/__tests__/lib/faseRetornoCheckout.test.ts::retorno.fase.004` + `::retorno.fase.005` ✅ 2026-07-26
- [x] **Precedencia**: sin token gana sobre el timeout aunque el cap ya haya vencido — `src/__tests__/lib/faseRetornoCheckout.test.ts::retorno.fase.006` ✅ 2026-07-26

**E2E**:
- [x] Orden FALLIDA ⇒ copy «el pago no se concretó / ningún cargo definitivo» con botón volver a la tienda, sin promesa de números ni correo ✅ 2026-07-26 — h1 «El pago no se concretó», ícono `credit-card-off`, copy exacto de D2, botón presente; el copy de la fase no contiene ni «númer» ni «correo»
- [x] Cap de 2 min sin confirmación ⇒ copy «la confirmación está tardando más de lo normal…» (verificable acortando el cap en dev o con orden PENDIENTE estancada), **sin prometer números** (D2 corregida) ✅ 2026-07-26 — con orden PENDIENTE real de `iselk`: a los 4 s `esperando` (`mail-check`, polling vivo), y **a los 124 s** vuelca a `timeout` (h1 «Seguimos confirmando tu pago», ícono `clock`); dice «te llega el correo con tu compra» y **NO promete números**
- [x] (D6) `/checkout/retorno` SIN `?token=` ⇒ «No encontramos tu compra» con ícono de enlace roto y botón de salida a la tienda — y NO se queda en «estamos confirmando tu pago» (verificar además en la pestaña de red que la query `estadoOrden` no se dispara) ✅ 2026-07-26 — ícono hero `tabler-icon-link-off`, botón «Volver a la tienda», y **0 llamadas a `estadoOrden`** en el registro de red (`enabled: !!token` confirmado en vivo)

## Invariantes

- I1: Tenancy (ADR-0005) — la query sigue tenant-scoped por el contexto server-side; token ajeno o
  inexistente ⇒ respuesta neutral idéntica, sin filtrar existencia.
- I2: La query es SOLO-LECTURA — jamás confirma ni transiciona la orden (eso es exclusivo del
  webhook, I6/ADR-0001). El redirect del navegador no es prueba de pago.
- I3: Sin PII ni montos en la respuesta — los números del sorteo son identidad pública del ticket,
  pero correo, total e ítems siguen prohibidos (I-T6).
- I4: `numerosDelSorteo.ts` es el punto ÚNICO de presentación (I12 de correos): el prefijo se pasa
  SIEMPRE explícito (obligatorio por firma), jamás se re-implementa el plegado en bloques ni se
  persiste el prefijo junto al número.
- I5: Cero hex inline en la UI — todo color por la escala Mantine del tenant
  (`frontend-conventions`). El confetti existente es la única excepción ya documentada.
- I6: NO tocar archivos del carril `sistema-correos-comprador` (in-flight): plantillas de correo,
  ledger `CorreoEnviado`, cron. Este plan solo IMPORTA `bloquesDeNumerosDelSorteo`.
- I7: NO tocar el polling existente (intervalo, cap, retry) ni el confetti — solo se agregan ramas
  de presentación.
- I8: Sin dependencias nuevas.

## Out of scope

- La pata landing del backlog (FAQ 5 + `CONFIANZA[1]`) — YA cerrada por `sistema-correos-comprador`
  F03, y el copy de la landing sigue sin tocarse acá. **Excepción autorizada por el usuario
  (2026-07-26)**: el guard `landing.faq.005` SÍ se borró en esta tanda (paso 7 del Plan) — el
  backlog pedía borrarlo justo al aterrizar esta feature, porque F02 volvió falsa su premisa.
- El verificador público de tickets por correo (`storefront-verificador-tickets`, carril propio en
  planning) — comparte a lo sumo el formateador.
- Replicar el markup de boletos del correo (F07/D10 de correos) — solo se comparte el formateador.
- Botón de refetch manual o cambios al esquema de polling.
- Enlace de descarga en la página de retorno (I7 histórico: la entrega va por correo, ADR-0002).
- Cambios de schema (todo lo necesario ya existe: `RaffleEntry.numero`, `Tenant.prefijoTicket`).

## Especialistas a consultar

- `backend-reviewer` — la extensión de `getEstadoOrden` (shape de respuesta pública, neutralidad
  cross-tenant, guard de PII).
- `frontend-reviewer` — boletos-chip (escala del tenant, gramática talonario, estados nuevos).
- `feature-tester` — Vitest + E2E asistido: el flujo PAGADO real necesita Flow sandbox + túnel
  cloudflared (ver memoria `flow-sandbox-e2e`); FALLIDO/timeout se pueden ejercer sin pagar.
- `change-set-reviewer` — cierre del diff.

## Bitácora

- [2026-07-26] [planner-grill] Reconstrucción inicial. Hallazgos de código: (1) `src/pages/checkout/retorno.tsx` YA sondea `checkout.estadoOrden` cada 2.5s con `?token=` de Flow (query `tenantProcedure` en `src/server/domain/checkout/getEstadoOrden.ts`, solo-estado sin PII, neutral `{estado:null}` si token ajeno/inexistente, cap de polling 2 min, confetti al PAGADO). (2) `src/lib/numerosDelSorteo.ts` (puro, `bloquesDeNumerosDelSorteo`/`formatearNumerosDelSorteo`, prefijo OBLIGATORIO por I12) se auto-declara punto único de presentación e incluso nombra «retorno post-pago» como superficie futura. (3) `RaffleEntry.numero` NOT NULL + `@@unique([raffleId,numero])`, entries por orden vía `orderId`. (4) La pata landing del backlog (Q1-e: `landing.faq.005`+FAQ5+`CONFIANZA[1]`) YA la cerró `sistema-correos-comprador` F03 ⇒ FUERA de este plan. (5) `storefront-verificador-tickets` (planning) busca por CORREO; esta superficie identifica por TOKEN de Flow — comparten a lo sumo el formateador.
- [2026-07-26] [planner-grill] Q1: ¿extender `estadoOrden` para devolver números+prefijo cuando PAGADO, o query nueva separada? Recomendada: extender la misma query.
- [2026-07-26] [planner-grill] Q1 answered: (a) extender `estadoOrden` — con `estado === "PAGADO"` devuelve además `numeros: number[]` (RaffleEntry de la orden vía Payment.token → Order) y `prefijo: string | null` (Tenant.prefijoTicket); PENDIENTE/FALLIDO ⇒ `numeros: null`. Cliente formatea con `bloquesDeNumerosDelSorteo`. Doc-comment del use case se actualiza (números = identidad pública del ticket, no PII).
- [2026-07-26] [planner-grill] Hallazgo re-lectura `retorno.tsx` (sesión nueva): polling YA resuelto (2.5s, cap 2 min, se detiene en PAGADO/FALLIDO) ⇒ los números llegan solos por la misma query, sin botón. PERO: FALLIDO y timeout muestran HOY el mismo copy genérico "estamos confirmando tu pago" — no hay estado terminal honesto.
- [2026-07-26] [planner-grill] Q2: ¿diferenciar los estados FALLIDO y timeout con copy honesto? Recomendada: sí — FALLIDO terminal ("el pago no se concretó", sin prometer números ni correo), timeout suave ("sigue en proceso, la confirmación llega por correo").
- [2026-07-26] [planner-grill] Q2 answered: SÍ, ambos estados nuevos en este plan. FALLIDO terminal ("no se hizo ningún cargo definitivo", botón volver a la tienda). Timeout suave tras cap 2 min ("apenas se confirme te llega el correo con tu compra y tus números"). Polling intacto, sin botón refetch.
- [2026-07-26] [planner-grill] Q3: ¿cómo se dibujan los números en la celebración PAGADO? Recomendada: (a) boletos como chips — un elemento por bloque de `bloquesDeNumerosDelSorteo` (mismo lenguaje visual que el correo F07/D10: un boleto por bloque), Mantine puro tematizado por la escala del tenant (variant light del color primario), número en fuente mono, caption "Tus números del sorteo" + refuerzo de que también van en el correo.
- [2026-07-26] [planner-grill] Q3 answered: boletos-chip confirmados (Paper/Badge grande variant light, fuente mono, gramática talonario, Group wrap, componente local en retorno.tsx, cero hex inline, NO replicar markup del correo).
- [2026-07-26] [planner-grill] Cierre del grill + verificación final de repo: (1) edge case PAGADO sin RaffleEntry decidido como D4 (`numeros: []` + celebración sin bloque — coherente con correos F03, que manda correo sin sección de números). (2) Test existente `estado.004` asserta forma exacta `{ estado }` ⇒ D5: se reescribe manteniendo el guard de PII. (3) Plan escrito (F01 backend, F02 boletos-chip, F03 copy terminal), status `planning`, implementación BLOQUEADA hasta visto bueno del usuario.
- [2026-07-26 21:51] [feature-implementer] Arranca implementación (visto bueno del usuario registrado en `tasks/INDEX.md`). Features pendientes: F01, F02, F03. Read pass completo: `_template.md`, `CLAUDE.md`, ADR-0024, `backend-conventions.md`, `frontend-conventions.md`, `docs/design.md`, `getEstadoOrden.ts` + su test, `retorno.tsx`, `numerosDelSorteo.ts`, router `checkout.ts`, `checkout/schemas.ts`, schema Prisma (Order/Payment/RaffleEntry/`Tenant.prefijoTicket`). Cordón con `sistema-correos-comprador` verificado: `confirmacionDeCompra.ts` solo se LEE como referencia de copy, no se toca.
- [2026-07-26 21:55] [feature-implementer] F01 implementada (TDD, 7 ciclos verticales rojo→verde). Archivos: `src/server/domain/checkout/getEstadoOrden.ts` (shape `{estado, numeros, prefijo}`, UNA sola consulta con `order.raffleEntries` + `tenant.prefijoTicket`, exposición gateada por `estado === "PAGADO"`), `src/__tests__/server/checkout/getEstadoOrden.test.ts` (fake db extendido a la proyección nueva; 9 tests: 5 reescritos por D5 + 4 nuevos), `src/server/api/routers/checkout.ts` (solo el comentario del procedure — dejó de decir «SOLO el estado enum»). Decisiones tácticas, todas dentro de D1/D4: (a) **una sola query** en vez de dos condicionales — los `raffleEntries` se proyectan siempre (una orden sin confirmar no tiene ninguna, el join vuelve vacío) y quien decide si SALEN es el estado, no la consulta; (b) `orderBy: {numero: "asc"}` en el select ⇒ el cliente recibe los números ya ordenados y `bloquesDeNumerosDelSorteo` pliega rangos contiguos sin depender del orden de inserción; (c) `estado.008` assertea contra `bloquesDeNumerosDelSorteo` en vez de contra un string armado a mano — ata el contrato al punto ÚNICO de presentación (I4) en vez de re-describirlo. Vitest filtrado **9/9 verde**; `tsc --noEmit` limpio. Sin cambios de schema (I: todo ya existía).
- [2026-07-26 22:00] [feature-implementer] F01 — `backend-reviewer` **APPROVE**, 0 blockers. Confirmó punto por punto: neutralidad cross-tenant intacta (el `prefijoTicket` se lee por la relación `Payment.tenant`, o sea el MISMO `tenantId` que ya pasó el `where`), guard de PII correcto y bien anclado en ADR-0024, `null`/`[]` garantizado en las 3 ramas, solo-lectura, y **avaló la query única**: `RaffleEntry` tiene `@@index([orderId])` ⇒ el join es un lookup indexado que vuelve vacío antes del pago, y con polling cada 2,5 s ahorrar el roundtrip pesa más que el join. También auditó el fake db contra el `select` real y no encontró dónde mienta. 2 nits: (1) doc-comment stale en `checkout/schemas.ts` (`getEstadoOrdenInput` seguía diciendo «solo el estado enum») ⇒ **APLICADO**; (2) el mismo lenguaje stale en `retorno.tsx:27` ⇒ lo toca F02. Drift de `docs/agents/*`: **ninguno** — F01 no consolidó patrón nuevo, es una extensión de un use case existente que ya sigue las convenciones vigentes (`select` explícito, layering, tenant-scoping por contexto).
- [2026-07-26 22:10] [feature-implementer] F02 implementada. Archivo: `src/pages/checkout/retorno.tsx` (componente local `BoletosDelSorteo` + su uso en la rama PAGADO + docstring de la página). Sin Vitest por decisión del plan (presentación pura; el formateo ya está cubierto por `numerosDelSorteo.test.ts`) ⇒ **TDD saltado a propósito en esta feature**. Decisiones tácticas: (a) la gramática visual se alineó con `src/components/storefront/momento-ticket.tsx` —el widget que muestra el EJEMPLO de ticket en la tienda— para que el Comprador reconozca su boleto real: borde `2px dashed color-mix(…acento 45%…)`, chip `--mantine-primary-color-0` y número en `--mantine-primary-color-filled`, mono + `tabular-nums` + `letterSpacing` (design.md §3). NO se replicó el markup del correo (D3 lo prohíbe); lo único compartido con el correo es el formateador (I4). (b) `Box` en vez de `Badge`/`Paper`: un `Badge` no soporta borde dashed con `color-mix` y su default (alto fijo + `overflow:hidden` + `nowrap`) está pensado para etiquetas cortas — mismo criterio que `momento-ticket.tsx`, que también usa `Box`. (c) el bloque va ENTRE el título y el párrafo de la descarga: el número es lo que el Comprador vino a ver (D3 fija la estructura INTERNA del bloque, no su posición). (d) caption en singular cuando es un solo número («Tu número del sorteo»). Cero hex (I5); polling y confetti intactos (I7). `tsc` + `eslint` limpios.
- [2026-07-26 22:12] [feature-implementer] F02 — auto-chequeo contra `docs/design.md` ANTES del reviewer: cero hex inline (todo por CSS vars de la escala del tenant, §9), números en mono + `tabular-nums` (§3), Tailwind acotado a `tabular-nums` (layout), sin motion nuevo (§7), `Group.gap` con valor fijo (el gotcha de `Group.gap` no-responsive de `frontend-conventions`). **`frontend-reviewer` APPROVE, 0 blockers.** Verificó I5, D4 (el `return null` no deja hueco muerto: el `gap` de flex solo aplica entre hijos renderizados), I7, la jerarquía de la composición y el wrap a 320 px (cada boleto es una caja independiente que fluye, no una grilla de N columnas ⇒ sin riesgo de scroll horizontal). 2 nits NO aplicados, a propósito: (1) **contraste del chip en modo oscuro per-tenant** — el par de tokens es idéntico al de `momento_ticket`, ya en producción, pero pide verificación en navegador sobre un tenant oscuro (demo-noche) ⇒ **queda para el `feature-tester`**; (2) repetición léxica de «correo» entre el refuerzo del bloque y el párrafo siguiente — el copy del refuerzo lo fijó D3 y el párrafo es preexistente ⇒ **se deja para el pase de pulido de copy del usuario**.
- [2026-07-26 22:20] [feature-implementer] F03 implementada. Archivo: `src/pages/checkout/retorno.tsx`. La pantalla pasó de 2 a **4 fases** (`type FaseRetorno` + `COPY_FASE: Record<FaseRetorno, CopyFase>` fuera del componente, patrón § «Avisos y tablas de copy por estado» de `frontend-conventions`): `pagado` / `fallido` / `timeout` / `esperando`, con los dos returns duplicados unificados en un solo `Stack`. Copy literal de D2. Colores por token semántico (design.md §2): `fallido` → `red` (pago rechazado está listado en la tabla), `timeout` → `pendiente` ámbar («en proceso» NUNCA en rojo), `pagado`/`esperando` → primario de la Tienda. Íconos que comunican la NATURALEZA del final: `IconCreditCardOff` (el cobro no pasó) / `IconClock` (sigue en camino). Decisión táctica del cálculo de fase: `detenido` se enciende por dos motivos, así que la rama `timeout` se evalúa DESPUÉS de atrapar `pagado`/`fallido`, y lleva `&& token` — sin token la query ni corre y decirle a esa persona que «la confirmación está tardando» sería inventarle una compra. Sin Vitest por decisión del plan ⇒ **TDD saltado**. `tsc` + `eslint` limpios. Polling, cap de 2 min y confetti intactos (I7).
- [2026-07-26 22:25] [feature-implementer] F03 — **`frontend-reviewer` APPROVE, 0 blockers.** Confirmó I7 intacto, la semántica de color, los íconos, el CTA y que el caso «query en error con `retry:false`» converge a `timeout` (fase razonable). **2 nits APLICADOS**: `color` pasó de `string | null` a la unión literal `"red" | "pendiente" | null` (un typo ya no compila — el precedente es `banner-facturacion.tsx`), e `icono` pasó a usar el alias `IconCmp` que repiten los siblings del panel. **3 hallazgos NO aplicados, para el usuario** (ninguno es regresión de esta tanda): (1) **«sin `?token=`» cae en `esperando` indefinidamente** — `frontend-conventions` § «Salir de la app a un proveedor externo» dice que la ausencia de token debería dar una fase `error` con salida al inicio, y nombra a ESTA página como precedente de esa regla; el hueco es PREEXISTENTE (existía con 2 fases) y D2 solo declaró `fallido`+`timeout` ⇒ agregarlo sería scope creep. (2) **el copy del timeout promete «tus números»** aunque en ese momento no se sabe si la orden tiene tickets (D4) — es D2 literal, lo implementé tal cual, pero la promesa puede sobrepasarse en el edge case. (3) `router.isReady` NO hace falta acá (la página tiene `getServerSideProps` ⇒ `router.query` viene poblado en el primer render), a diferencia de `admin/plan/retorno.tsx`.
- [2026-07-26 22:30] [feature-implementer] **Rojo AJENO detectado y NO tocado** (cordón I6): `numerosDelSorteo.test.ts::numeros.formato.009` está rojo por `src/server/domain/correo/ledgerCorreos.ts` — el guard estructural de I12 exige que los caminos de ESCRITURA no nombren `numerosDelSorteo`, y el carril `sistema-correos-comprador` agregó una línea de COMENTARIO que lo menciona («la misma lección que `bloquesDeNumerosDelSorteo`…»). Verificado con `git diff`: la línea es un `+` de ese carril, no de esta tanda. Es exactamente el anti-patrón que `frontend-conventions` § «Guard estructural de ausencia» documenta (leer el texto crudo hace que las lápidas cuenten como resurrecciones; el guard debería usar un `leerCodigo()` que quite comentarios). **Es del dueño de ese carril, no de este plan.** Los otros dos guards de I12 pasan: mi superficie es LECTORA (el propio docstring de `numerosDelSorteo.ts` la nombraba como superficie futura) y `numeros.formato.011` barre `raffleEntry.createMany` en `src/server`, que esta tanda no toca.
- [2026-07-26 22:33] [feature-implementer] **Hallazgo fuera de scope, para el usuario**: `src/__tests__/components/landing-copy.test.ts::landing.faq.005` sigue prohibiendo que la landing prometa «ves tu número **en pantalla**», y su comentario afirma literalmente que «NINGUNA pantalla los muestra todavía —ni el retorno post-pago—». Con F02 esa premisa dejó de ser cierta. El test **no está rojo** (el copy vigente no dice eso), pero ahora prohíbe una promesa que pasó a ser VERDAD. El plan pone esa pata en Out of scope («ya cerrada por correos F03»), así que NO toqué ni el copy ni el test: queda como decisión de producto del usuario (¿la landing debería decir ahora que el número se ve en pantalla, y relajarse/borrarse el guard?).
- [2026-07-26 22:36] [feature-implementer] Implementación completa. F01, F02 y F03 escritas, `frontend-reviewer` ×2 y `backend-reviewer` ×1 **APPROVE con 0 blockers**. Gates de esta tanda: Vitest filtrado `getEstadoOrden` **9/9 verde**, `tsc --noEmit` sin errores, `eslint` sin warnings sobre los 3 archivos tocados. NO se corrió la suite completa (es del `feature-tester`). Sin schema, sin dependencias nuevas, sin tocar el polling/confetti (I7) ni un solo archivo del carril `sistema-correos-comprador` (I6). Archivos: `src/server/domain/checkout/getEstadoOrden.ts`, `src/server/domain/checkout/schemas.ts` (doc-comment), `src/server/api/routers/checkout.ts` (comentario), `src/__tests__/server/checkout/getEstadoOrden.test.ts`, `src/pages/checkout/retorno.tsx`. **3 drafts de drift de `docs/agents/frontend-conventions.md` PENDIENTES DE PERMISO** (no aplicados): (a) la gramática de boleto (`Box` + borde dashed `color-mix` + chip mono `--mantine-primary-color-0`/`-filled`) salió del page builder y ahora se reusa en una página de plataforma — hoy solo vive como comentario «misma gramática que `momento_ticket`»; (b) variante del `Record<Union, Copy>` con **unión COMPUESTA** server+cliente (el doc describe el caso de union puramente derivado del router, y acá `timeout`/`esperando` no existen en `OrderStatus`); (c) un ícono **hero/celebración** de una página de marca usa el primario del tenant y NO el mapa `ESTADO_ORDEN_COLOR` (que es para badges de estado). **Listo para `feature-tester`**: Vitest ya verde en lo propio; los E2E de F02/F03 necesitan Flow sandbox + túnel para la rama PAGADO (FALLIDO y timeout se ejercen sin pagar), y el pendiente heredado del reviewer es el **contraste del chip en un tenant OSCURO** (demo-noche).
- [2026-07-26 22:25] [feature-implementer] **Relevo (sesión nueva, contexto chunkeado)**: el usuario respondió los 4 pendientes que dejó la sesión anterior y los manda aplicar en ESTA tanda, sin sacar el plan de `status: testing`. (1) Los 3 drafts de drift de `frontend-conventions.md` → **aplicar tal cual**. (2) El copy del timeout deja de prometer «tus números» (una orden sin sorteo no cumpliría esa promesa) → queda «tu compra» a secas, con D2 corregida. (3) La fase **sin `?token=`** se arregla acá (era el hallazgo (1) del `frontend-reviewer` de F03) → nueva D6 + extensión de F03. (4) El guard `landing.faq.005` se **borra** (el backlog de `landing-reposicionamiento` ya lo pedía al aterrizar esta feature; el copy de la landing NO se toca — eso lo cerró el carril de correos). Cordones intactos: `sistema-correos-comprador` (su rojo `numeros.formato.009` sigue siendo AJENO y no se toca) y polling/confetti (I7).
- [2026-07-26 22:30] [feature-implementer] **(4) `landing.faq.005` BORRADO acá.** Archivo: `src/__tests__/components/landing-copy.test.ts`. En su lugar queda una lápida que explica por qué murió: prohibía que la landing dijera que el Comprador ve su número «en pantalla» y su premisa escrita era «NINGUNA pantalla los muestra todavía —ni el retorno post-pago—», que F02 volvió falsa; el backlog de `landing-reposicionamiento` pedía borrarlo exactamente al aterrizar esta feature. Lo que la landing SÍ tiene que decir lo sigue exigiendo `landing.faq.007` (correos F03), que no se tocó — ni el copy. Vitest filtrado de la zona **28/28 verde** (`landing-copy` 14 tests tras el borrado + `landing-seo` 9 + `faq` 5).
- [2026-07-26 22:35] [feature-implementer] **(3) D6 implementada con TDD (6 ciclos rojo→verde) + (2) copy del timeout corregido.** Archivos: `src/lib/faseRetornoCheckout.ts` (NUEVO — `faseDelRetorno` pura + el tipo `FaseRetorno`, que se mudó desde la página), `src/__tests__/lib/faseRetornoCheckout.test.ts` (NUEVO — `retorno.fase.001..006`), `src/pages/checkout/retorno.tsx` (5ª fase `sin_token` en `COPY_FASE`, cálculo de fase delegado, copy del timeout sin «y tus números», docstring de la página). Decisión táctica de la extracción: el riesgo de esta lógica NO es el render sino la **precedencia de sus ramas** —`detenido` se enciende por dos motivos y el token puede faltar— y dentro de un ternario anidado de 4 niveles eso no era testeable; `retorno.fase.006` la clava para siempre (sin token gana incluso con `estado: "PAGADO"` en la mano). El `Record` de copy se quedó a propósito en la página: el módulo decide CUÁL fase, no QUÉ dice (frontend-conventions § «Avisos y tablas de copy por estado»). `sin_token` va en `red` como el rechazo, separado de él por el ícono (`IconLinkOff` = enlace roto vs `IconCreditCardOff` = cobro que no pasó), que es la 2ª dimensión que exige la convención. La query sigue sin correr sin token (`enabled: !!token`) y el botón «Volver a la tienda» ya era la salida al inicio. Polling, cap y confetti intactos (I7). Vitest filtrado **6/6 verde**; `tsc --noEmit` limpio en todo el repo; `eslint` sin warnings en los 4 archivos tocados.
- [2026-07-26 22:38] [feature-implementer] D6 — **`frontend-reviewer` APPROVE, 0 blockers.** Avaló las 5 cosas que le pregunté: la convivencia de dos fases en `red` separadas por ícono (mismo criterio que el precedente `COBRO_PENDIENTE`/`EXENCION_POR_EXPIRAR` de la convención), la honestidad de los dos copys nuevos —incluida la corrección del timeout, que era «la única fase que prometía un dato que podía no existir»—, la partición `src/lib` (CUÁL) vs página (QUÉ), el botón único como salida al inicio y a11y/responsive sin hallazgos. Verificó además que `EstadoOrden` de `~/styles/theme` calza con el `OrderStatus | null` del server y que I4/I5/I7 siguen intactos. **1 nit NO aplicado, a propósito**: el `variant="default"` del botón podría ser `filled` en las fases terminales donde es la ÚNICA acción — es preexistente de `fallido`, ya aprobado en la tanda anterior, y el propio reviewer pide que se toque en un pase de pulido de CTA, no acá. **1 gap de proceso que sí apliqué**: el plan no tenía checkbox E2E para `sin_token` ⇒ agregado a Validaciones de F03 (incluye verificar en la pestaña de red que `estadoOrden` no se dispara).
- [2026-07-26 22:42] [feature-implementer] **(1) Drift de `frontend-conventions.md` APLICADO tal cual, con la autorización explícita del usuario.** Los 3 bullets: (a) «Boleto del sorteo» en § «Card contenida y filas de números» —`Box` con borde dashed `color-mix` sobre acento-con-fallback-a-marca, chip `--mantine-primary-color-0`, número mono + `tabular-nums`, UNO POR BLOQUE y no por número, nacido en `momento_ticket` (el ejemplo) y reusado en `checkout/retorno.tsx` (el número real), y el porqué de que no sea `Badge`—; (b) «Variante: unión COMPUESTA server + cliente» y (c) «el ícono HERO usa el primario del tenant, no `ESTADO_ORDEN_COLOR`», los dos en § «Avisos y tablas de copy por estado». Verificado antes de escribir que la otra sesión (correos F08 + productos-tipos-digitales) tenía cambios sin commitear en ESE archivo: sus 3 inserciones caen en otras secciones (§ Mantine `className`/`Input.Wrapper`, § Deprecación suave, § Guard estructural) ⇒ **no se pisó nada**, solo se agregaron bullets. En (b) el ejemplo quedó como lo dictó el usuario (`COPY_FASE` en `retorno.tsx`) y se nombró además el «UN solo lugar» donde se traduce, que ahora existe de verdad (`faseDelRetorno`).
- [2026-07-26 22:45] [feature-implementer] **Drift NUEVO detectado en esta sesión, NO aplicado — pendiente de permiso.** El `frontend-reviewer` propuso consolidar en `frontend-conventions.md` el patrón que acaba de nacer acá: *cuando la derivación de «cuál caso del union aplica» tiene una precedencia no trivial entre ramas, esa derivación va como función PURA y testeada en `src/lib/` («decide CUÁL»), y el `Record<Union, Copy>` se queda junto al render («decide QUÉ»)*. Hoy quedó dicho de pasada dentro del bullet (b) de la unión compuesta, pero no como regla con nombre propio. NO lo escribí: el usuario autorizó 3 bullets concretos y este es un 4º. Queda el draft acá para aplicarlo cuando lo apruebe. **Sugerencia fuera de mi rol (no aplicada)**: nada nuevo para `CONTEXT.md` ni ADRs — D6 es una regla de presentación, no vocabulario del dominio.
- [2026-07-26 23:02] [feature-tester] **Vitest VERDE en todo el alcance del plan.** `getEstadoOrden` **9/9** (F01: los 7 checkboxes de Validaciones, incluida la reescritura D5 de `estado.004` y el `estado.008` que atea el contrato a `bloquesDeNumerosDelSorteo`), `faseRetornoCheckout` **6/6** (`retorno.fase.001..006`, con la precedencia D6 clavada) y `landing-copy` **14/14** tras el borrado de `landing.faq.005` (no quedó rojo ni huérfano). Regresión ampliada al área tocada (`src/__tests__/{server/checkout,lib,components}/`, 29 archivos): **218/219**. El único rojo es el AJENO ya anunciado.
- [2026-07-26 23:02] [feature-tester] **Rojo AJENO CONFIRMADO y no tocado**: `numerosDelSorteo.test.ts::numeros.formato.009`. Verificado con `git diff` que la línea ofensora es un `+` sin commitear del carril `sistema-correos-comprador` en `src/server/domain/correo/ledgerCorreos.ts` (un doc-comment que dice «…la misma lección que `bloquesDeNumerosDelSorteo` en `~/lib/numerosDelSorteo`»), y que en `HEAD` esa mención NO existe. Ninguno de los 5 archivos de ESTA tanda está en la greplist del guard (`aplicarEfectosPostPago`, `crearSorteo`, `ejecutarSorteo`, `ledgerCorreos`) ⇒ **no es regresión de este plan**. Los otros dos guards de I12 (`numeros.formato.010`/`.011`) pasan.
- [2026-07-26 23:20] [feature-tester] **E2E 9/9 VERDE — y la rama PAGADO SÍ se ejerció, sin Flow sandbox ni túnel.** Hallazgo que desbloqueó la corrida: esta superficie es SOLO-LECTURA por token (I2), así que no hace falta pagar — basta una orden que ya esté `PAGADO` en la DB. Censo de la DB: 2 órdenes PAGADAS con tickets (`autora`), 3 PAGADAS sin tickets y 6 PENDIENTES. Fixtures efímeros creados y **borrados al cierre** (verificado: 2 orders + 2 payments + 4 entries eliminados, 0 residuales): una orden FALLIDA en `prueba` (no había ninguna en toda la DB) y una PAGADA en `demo-noche` con 4 tickets NO contiguos (41,42,43,50) para ejercer el multi-bloque. `demo-noche.prefijoTicket` se puso en `ARMY` y **se revirtió a `null`** (verificado en DB). Resultados: `sin_token` (0 llamadas a `estadoOrden`, ícono `link-off`), `fallido` (copy D2 exacto, `credit-card-off`, sin «númer» ni «correo»), `esperando`→`timeout` **medido a los 124 s** (`clock`, sin prometer números — D2 corregida confirmada en vivo), `pagado` con 1 ticket en `autora` (caption SINGULAR «Tu número del sorteo»), `pagado` con 2 bloques en `demo-noche` (caption plural, `41–43` y `50`) y `pagado` SIN tickets en `prueba` (celebra sin bloque, D4). Con prefijo los boletos leen `ARMY-41–43` / `ARMY-50`, **byte-idéntico** a `bloquesDeNumerosDelSorteo` ⇒ I4 verificado de punta a punta contra el mismo formateador del correo. Consola limpia (0 errores/warnings propios) en las 5 fases.
- [2026-07-26 23:20] [feature-tester] **Carriles de navegador**: los DOS MCP estaban ocupados por agentes vivos (chrome-devtools con procesos de hace 1 min; Playwright `mcp-chrome-12f6c4f` desde las 20:27), así que —siguiendo `browser-verify` §0, que prohíbe expropiarlos— **no se cerró ninguno**. Se levantó un Chrome PROPIO headless (perfil aparte en el scratchpad, `--remote-debugging-port=9335`) manejado por CDP crudo desde Node 24, el mismo camino no disruptivo que ya usó `builder-countdown-presencia`. Sigue vivo (`browser-verify` §1: no se cierra). Gotcha nuevo anotado: con varias pestañas en paralelo Chrome **throttlea los timers de fondo** y el cap de 2 min no dispara ⇒ el check de `timeout` hay que correrlo en pestaña única con `Page.setWebLifecycleState: active`; en la corrida paralela dio falso rojo y en la aislada pasó a los 124 s.
- [2026-07-26 23:22] [feature-tester] **Design finding (§3.5, NO bloquea el pass funcional): el contraste del número del boleto queda bajo AA 4.5:1.** Medido sobre estilos computados: `autora` **4,0:1** (`rgb(225,29,72)` sobre `rgb(252,232,237)`) y `demo-noche` **3,5:1** (`rgb(168,85,247)` sobre `rgb(246,238,254)`). El número es `fz="lg"` (18 px) `fw={700}`, o sea queda 0,66 px por debajo del umbral de «texto grande» de WCAG (18,66 px en bold), donde 3:1 alcanzaría. **ATRIBUCIÓN: es PREEXISTENTE, no de esta tanda** — se midió el widget `momento_ticket` en la MISMA tienda oscura y devuelve el par de tokens IDÉNTICO (`rgb(168,85,247)` sobre `rgb(246,238,254)`), o sea el problema vive en el par `--mantine-primary-color-filled` / `--mantine-primary-color-0` que ya está en producción, no en `BoletosDelSorteo`. Cierra el nit que el `frontend-reviewer` de F02 difirió explícitamente al tester.
- [2026-07-26 23:22] [feature-tester] **Design finding (§3.5, NO bloquea): el boleto NO se adapta al modo oscuro.** En `demo-noche` la página renderiza en `dark` (`bodyBg rgb(36,36,36)`) pero el chip se queda en `--mantine-primary-color-0`, un lavanda CLARO — el resultado es una caja clara sobre página oscura. Revisado el screenshot: **lee bien** y hasta refuerza la gramática talonario (un boleto de papel sobre fondo oscuro), así que se reporta como decisión a confirmar, no como defecto. Es la otra mitad de lo que el reviewer mandó a verificar «en el peor tenant». Resto del gate de diseño OK: mono + `tabular-nums`, cero hex inline, sin motion nuevo, sin montos en pantalla.
- [2026-07-26 23:40] [orquestador] **CIERRE por decisión del usuario**: F01–F03 → `passing`, `status: done`, fila movida a Cerradas recientes en `tasks/INDEX.md`. El 4º drift («función pura decide CUÁL / `Record` decide QUÉ») quedó **APLICADO** en `frontend-conventions.md` con autorización del usuario (bullet propio en § Avisos y tablas de copy, ejemplar `faseDelRetorno` + `COPY_FASE`). Commit selectivo SOLO de los archivos 100% de esta tanda; `schemas.ts`, `routers/checkout.ts` (doc-comments), `frontend-conventions.md` y `tasks/INDEX.md` quedan SIN commitear a propósito — arrastran cambios uncommitted de carriles in-flight (correos/facturación/productos) y los commiteará su carril dueño. Pendientes vivos: nit del `variant` del botón en fases terminales (pase de pulido de CTA) + los 2 design findings preexistentes del par de tokens (`contraste 3,5:1 en demo-noche` y boleto claro en dark, ambos de `momento_ticket`).
