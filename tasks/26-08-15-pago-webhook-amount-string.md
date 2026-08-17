---
slug: pago-webhook-amount-string
status: testing               # F01 implementada + backend-reviewer APPROVE 2026-08-16; F02 es operativa post-deploy
owner: nicolas
created: 2026-08-15
related_adrs: [ADR-0001, ADR-0006]
related_context: [Orden, Pago, Ticket, Número del sorteo, Ledger de correos]

features:
  - id: F01
    behavior: "El adapter Flow normaliza `amount` de `payment/getStatus` a number ANTES de que el dominio lo vea (Flow producción lo manda como string); el Gate 5 del webhook sigue bloqueando montos realmente distintos y montos ilegibles (fail-closed vía NaN), y sigue procediendo con warning cuando Flow omite el campo"
    state: active

  - id: F02
    behavior: "Rescate operativo de la orden real atascada de iselk (`cmsovwfxe000cyg2vru7qxe7n`): re-POST del webhook con el token real transiciona la orden a PAGADO y materializa TODO el pipeline post-pago (ticket número 13, DownloadGrant, fila del ledger, correo entregado a la compradora)"
    state: not_started
---

# Fix incidente producción: webhook Flow rechaza pagos reales por `amount` string

## Contexto

La primera venta real de iselk (2026-08-11, $3.000 Onepay, orden `cmsovwfxe000cyg2vru7qxe7n`)
está PAGADA en Flow pero PENDIENTE en nuestra DB: la compradora pagó y no recibió ni tickets ni
descarga ni correo. Causa raíz demostrada con la respuesta cruda de producción: Flow serializa
`amount` como **string** (`{"status":2,"amount":"3000"}`) y el Gate 5 de `webhookFlow.ts:107`
compara con `!==` estricto contra `montoEsperado: number` ⇒ `"3000" !== 3000` ⇒ `amount_mismatch`
⇒ ack 200 sin transicionar. El tipo `FlowGetStatusResponse.amount?: number` (`flow.ts:53`) no
refleja la realidad y `httpGet` no coerciona nada. **Ningún pago real de producción puede
confirmarse hoy**; los tests pasan porque los fakes usan `amount` numérico.

Grounding ya hecho (ver Bitácora 2026-08-15): facturación NO tiene el bug (ya tipa
`number | string` y coerciona vía `String()` → Decimal), `fee` NO tiene el bug (va crudo a
`Prisma.Decimal`), el endpoint `https://sorteatelo.cl/api/webhooks/flow` responde en producción.

## Decisiones

- **D1 — `amount` presente pero ILEGIBLE (`"abc"`, `""`): fail-closed** (usuario, 2026-08-16).
  Cae en `amount_mismatch` y NO transiciona: `Number()` → `NaN` nunca iguala al esperado — la rama
  mismatch existente lo atrapa; se documenta y testea. Razón: con dinero, la defensa se cierra ante
  datos corruptos; la tolerancia legítima ya la cubre la rama AUSENTE (warning y procede), y un
  falso bloqueo se rescata con re-POST del token (igual que este incidente).
- **D2 — La normalización vive en el ADAPTER** (`src/server/services/flow.ts`), no en el núcleo del
  webhook: el dominio recibe `amount?: number` de verdad (number válido, `NaN` si ilegible,
  `undefined` si ausente). Razón: el contrato del tipo vuelve a ser cierto; el Gate 5 no cambia su
  lógica. Nota regla de oro: esto NO es aritmética de dinero — `amount` es solo una COMPARACIÓN de
  defensa sobre CLP entero; la plata persistida sigue saliendo de `Payment.monto` (Decimal) y `fee`
  sigue crudo string → `Prisma.Decimal`.
- **D3 — Facturación y `fee` quedan FUERA de alcance**: revisados, sin bug (Bitácora 2026-08-15).

## Plan

1. Normalizar `amount` en el adapter Flow: aceptar `number | string` del wire, exponer
   `amount?: number` (parseado; ilegible ⇒ `NaN`), corregir el tipo `FlowGetStatusResponse` y el
   comentario del Gate 5. (F01)
2. Tests Vitest con el shape REAL de producción (string) y los casos de D1. (F01)
3. Deploy vía skill `deploy` (gate + commit + push a main + verificación post-deploy). (F01)
4. Rescate: re-POST del webhook con el token real y verificación integral del pipeline con los
   scripts de diagnóstico. (F02)

## Validaciones

### F01 — Gate 5 con `amount` string real

**Vitest** (integration):
- [x] Pago status 2 con `amount: "3000"` (string, shape real de producción) y esperado 3000 ⇒ transiciona a PAGADO — `src/__tests__/server/pago/webhookFlow.test.ts::webhook.amount.wire.string` + `src/__tests__/server/services/flow.test.ts::flow.getStatus.002` ✅ 2026-08-16
- [x] Pago status 2 con `amount: 3000` (number, shape sandbox) ⇒ transiciona a PAGADO (no regresión) — `src/__tests__/server/pago/webhookFlow.test.ts::webhook.amount.wire.number` + `src/__tests__/server/services/flow.test.ts::flow.getStatus.003` ✅ 2026-08-16
- [x] Pago status 2 con `amount: "9999"` ≠ esperado ⇒ `amount_mismatch`, NO transiciona (la defensa sigue viva) — `src/__tests__/server/pago/webhookFlow.test.ts::webhook.amount.wire.mismatch` ✅ 2026-08-16
- [x] Pago status 2 con `amount: "abc"` / `""` (ilegible, D1 fail-closed) ⇒ `amount_mismatch`, NO transiciona — `src/__tests__/server/pago/webhookFlow.test.ts::webhook.amount.wire.ilegible` (`it.each`: `"abc"` y `""`) + `src/__tests__/server/services/flow.test.ts::flow.getStatus.004` (`"abc"`, `""`, `"   "` ⇒ NaN observable) ✅ 2026-08-16
- [x] Pago status 2 sin `amount` ⇒ warning y transiciona (comportamiento actual intacto) — `src/__tests__/server/pago/webhookFlow.test.ts::webhook.amount.wire.ausente` + `src/__tests__/server/services/flow.test.ts::flow.getStatus.005` (`undefined` y `null`) ✅ 2026-08-16
- [x] Normalizar el `amount` no altera ningún otro campo de la respuesta (el `fee` sigue crudo string para el `Decimal` del dominio, I1) — `src/__tests__/server/services/flow.test.ts::flow.getStatus.006` ✅ 2026-08-16 *(checkbox agregado por el implementer: cobertura extra de I1, no estaba en el plan)*

**E2E** (browser):
- [x] ⏭️ NO APLICA — backend-only, confirmado por el `feature-tester` 2026-08-16: no hay superficie de navegador que ejercer (el cambio vive entero en el adapter Flow + el comentario del Gate 5, cero UI). La verificación real end-to-end es el rescate **F02**, que corre post-deploy contra producción y lo ejecuta el orquestador.

### F02 — Rescate de la orden atascada (producción)

**Precondiciones**: fix deployado en Vercel + `FLOW_URL_CONFIRMATION=https://sorteatelo.cl/api/webhooks/flow` en Production (el usuario la actualizó 2026-08-16).

**Operativo** (con `.tmp-diag-iselk*.mts` para verificar; corre contra datos REALES):
- [x] `POST https://sorteatelo.cl/api/webhooks/flow` con `token=E539F5A2AC2081CF4068F3F49208B4CFAEC071CO` responde 200 sin `ignorado` — `{"received":true,"yaProcesado":false,"transicion":"PAGADO"}` ✅ 2026-08-16
- [x] Orden `cmsovwfxe000cyg2vru7qxe7n` en estado PAGADO; Payment con `fee` registrado — PAGADO, fee `96`, monto `3000` ✅ 2026-08-16
- [x] 1 RaffleEntry nueva con número 13 en el raffle `cms1zov3u000enkk28ns7ivsk` (ultimoNumero pasa de 12 a 13) — rango 13–13, contador en 13 ✅ 2026-08-16
- [x] 1 DownloadGrant para la orden, con token y expiración a 30 días — 1 grant ✅ 2026-08-16
- [x] Fila `CONFIRMACION_COMPRA` en el ledger para la orden, que termina ENVIADO (waitUntil o cron) — ENVIADO vía waitUntil inmediato, proveedorId `6e73f5e5-7018-4d6d-bf50-d7fec6859c22` ✅ 2026-08-16
- [x] Correo real entregado a la compradora (proveedorId de Resend presente; idealmente confirmación de la Organizadora) — Resend `last_event: "delivered"` 18:13 UTC, asunto «Tu compra en ISELK Sorteos: tus números y tu descarga» ✅ 2026-08-16
- [x] Re-POST del mismo token (replay) ⇒ no-op: sin ticket duplicado, sin segundo correo, número no consumido — `{"yaProcesado":true,"transicion":"NINGUNA"}`; post-replay: 1 ticket, 1 grant, 1 fila de ledger, contador sigue 13 ✅ 2026-08-16

## Invariantes

- I1: el fix NO introduce aritmética `number` de dinero — `amount` normalizado se usa SOLO para la
  comparación de defensa; los montos persistidos siguen en Decimal.
- I2: el Gate 5 NUNCA se relaja: monto distinto o ilegible ⇒ NO transicionar (D1). Solo el caso
  AUSENTE procede, con warning, como hoy.
- I3: el núcleo del webhook (`webhookFlow.ts`) mantiene su contrato — el cambio de shape se absorbe
  en el adapter (D2); si el implementer necesita tocar el Gate 5 más allá del comentario, para y
  pregunta.
- I4: el rescate usa EXCLUSIVAMENTE el camino de producción (webhook idempotente); nada de escribir
  la orden/tickets a mano en la DB.

## Out of scope

- Facturación/suscripciones y `fee` (revisados, sin bug — D3).
- Reintentos/alertas ante `amount_mismatch` (hoy: log + ack; mejorar observabilidad es tanda futura).
- Las otras 2 órdenes PENDIENTE de la compradora (status 1 en Flow: nunca pagadas, correctas).
- Gestión de env vars de Vercel (corre en paralelo por fuera del plan).

## Especialistas a consultar

- `backend-reviewer` — validación del cambio en adapter + gate al cierre de F01.

## Bitácora

- [2026-08-15 08:42] [planner-grill] Arranca el grill del fix del incidente de producción (primera venta real de iselk atascada). Diagnóstico ya hecho en sesión con datos vivos: Flow producción devuelve `amount` como STRING en `payment/getStatus` (`{"status":2,"amount":"3000"}` verificado crudo); `webhookFlow.ts:107` compara estricto `flowPago.amount !== ruteo.montoEsperado` (number de `pago.monto.toNumber()`, `enrutarPagoFlow.ts:135`) ⇒ `"3000" !== 3000` ⇒ `amount_mismatch` ⇒ 200 sin transicionar. Orden atascada: `cmsovwfxe000cyg2vru7qxe7n` (tenant iselk `cms1zomt40000nkk27yi4e7ca`), pagada $3.000 Onepay 2026-08-11, token `E539F5A2AC2081CF4068F3F49208B4CFAEC071CO`, flowOrder 177895518. Precondición externa (NO parte del plan): usuario verifica `FLOW_URL_CONFIRMATION=https://sorteatelo.cl/api/webhooks/flow` en Vercel Production.
- [2026-08-15 08:42] [planner-grill] Grounding en código hecho (read pass completo): (1) el ÚNICO gate de igualdad de amount en `src/server` es `webhookFlow.ts:107` — el mundo facturación NO tiene chequeo equivalente: `flowPlataforma.ts` ya tipa `FlowInvoice.amount?: number | string` (comentario: "Flow lo manda como STRING con 4 decimales `"25000.0000"`") y `procesarNotificacionSuscripcion.ts:597-600` coerciona con `String()` → `Prisma.Decimal`, null-safe ⇒ facturación revisada, sin bug, fuera de alcance. (2) `fee` sin bug: `confirmarPagoDeOrden.ts:73-75` lo pasa crudo (string) a `new Prisma.Decimal(input.fee)`, cero aritmética number. (3) Los fakes de `webhookFlow.test.ts:37` usan `amount: montoEsperado` (number) — por eso los tests pasan con el bug vivo. (4) `httpGet` del adapter (`flow.ts:182-189`) hace `res.json()` con cast, nada coerciona en runtime; el tipo `FlowGetStatusResponse.amount?: number` (línea 53) miente.
- [2026-08-15 08:42] [planner-grill] Q1: ¿qué hace el webhook cuando `amount` viene presente pero ILEGIBLE (no parsea a número, ej. `"abc"` o `""`)? Recomendada: fail-closed — cae en `amount_mismatch` y NO transiciona (vía `Number()` → NaN, que nunca iguala al esperado), distinto del caso AUSENTE que sigue procediendo con warning.
- [2026-08-16 09:05] [planner-grill] GRILL CERRADO — el usuario respondió Q1: **(a) fail-closed** (la recomendada). Asentada como D1. Nota de proceso: la segunda invocación del planner se stalleó tras el grounding; el orquestador materializó el cierre del plan (features F01/F02, decisiones, validaciones, invariantes) a partir de lo ya asentado en esta Bitácora, sin decisiones nuevas. Queda AWAITING USER APPROVAL.
- [2026-08-16 13:21] [feature-implementer] Arranca implementación. Plan aprobado por el usuario. Alcance de esta corrida: **F01 solamente** (F02 es operativa post-deploy y la ejecuta el orquestador; sin deploy ni commit desde acá, por instrucción explícita). Read pass completo: `tasks/_template.md`, `CLAUDE.md`, ADR-0001, ADR-0006, `docs/agents/backend-conventions.md` y el área de código: `services/flow.ts`, `pago/webhookFlow.ts`, `pago/enrutarPagoFlow.ts`, `services/flowPlataforma.ts` (precedente de la casa para el mismo campo: `FlowEstadoPago.amount?: number | string | null`) + los tests `services/flow.test.ts` y `pago/webhookFlow.test.ts`.
- [2026-08-16 13:27] [feature-implementer] **F01 implementada** (ciclo TDD por slices, skill `tdd`). Archivos: `src/server/services/flow.ts` (tipo nuevo `FlowGetStatusWire` = shape CRUDO del wire con `amount?: number | string | null`, que pasa a ser el retorno del seam `HttpGet`; `FlowGetStatusResponse` queda como el shape NORMALIZADO que ve el dominio con `amount?: number` — el tipo vuelve a ser cierto; función exportada `normalizarAmountFlow`; `getStatus` normaliza antes de devolver; el cast de `fetchGet` apunta al wire), `src/server/pago/webhookFlow.ts` (**SOLO el comentario del Gate 5**, I3 respetado: cero cambios de lógica), `src/__tests__/server/services/flow.test.ts` y `src/__tests__/server/pago/webhookFlow.test.ts`.
  - **Tracer bullet RED legítimo**: el primer test (wire `amount: "3000"`, el shape real del incidente) falló con `confirmarPago` llamado 0 veces — o sea reprodujo el incidente de producción en Vitest ANTES del fix. Verde tras normalizar.
  - **Decisión táctica (cubierta por D1/D2, no bloqueante)**: `normalizarAmountFlow` es TOTAL y defensiva porque parsea JSON no confiable — `number` ⇒ tal cual; `string` legible ⇒ `Number()`; `""`/`"   "` ⇒ `NaN` **explícito** (sin ese guard `Number("")` es `0`, y el fail-closed quedaría dependiendo de que el monto esperado no sea 0); cualquier otro tipo (objeto/array) ⇒ `NaN`; `undefined`/`null` ⇒ `undefined`. Nota: `null` se lee como AUSENTE (rama tolerante con warning) y no como ilegible — es "Flow no informó el campo", el mismo criterio con el que el codebase ya trata `paymentData: ... | null`.
  - **Los tests del webhook cablean el ADAPTER REAL** (`crearFlowService` con `httpGet` fake) dentro del `FlowRuteado`, en vez de fakear el `getStatus` entero: fakear el `getStatus` es EXACTAMENTE lo que escondió este bug hasta producción (los fakes viejos devolvían `amount` number, o sea el shape del sandbox). El wire del fixture es la respuesta cruda real de la orden atascada (`flowOrder: 177895518`, `commerceOrder: cmsovwfxe000cyg2vru7qxe7n`).
  - **2 mutation tests** para probar que los tests no son vacuos: (a) quitar el guard del string vacío ⇒ 2 rojos en `flow.getStatus.004`; (b) implementar D1 en su variante TOLERANTE (ilegible ⇒ `undefined` en vez de `NaN`) ⇒ rojo en el fail-closed del webhook. Ambas mutaciones revertidas.
  - **I1 verificado por grep**: el ÚNICO consumidor de `getStatus().amount` en el mundo BYO es el Gate 5 (`webhookFlow.ts:109/114/119`) — comparación de defensa, cero aritmética; `fee` sigue viajando crudo (string) a `Prisma.Decimal`, y facturación (D3) sigue intacta con su `String()` → `Decimal`.
  - Verificación: `npx tsc --noEmit` **limpio en todo el repo**; `eslint` limpio sobre los 4 archivos; **Vitest filtrado 53/53** (webhookFlow 18, services/flow 14, enrutarPagoFlow 4, flowDeTenant 3, conCorreoPostPago 5, flowPlataforma 9). Suite completa y E2E = del `feature-tester`. Sin commit ni deploy (instrucción del usuario).
- [2026-08-16 13:32] [feature-implementer] **`backend-reviewer`: APPROVE** — 0 blockers, 0 nits, rúbrica A/A/A/A (corrección, compliance, naming, tests). Verificó archivo:línea los 4 invariantes: I1 (`flowPago.amount` NO viaja a `confirmarPago` — solo `fee` crudo y `flowOrder`; cero aritmética, cero persistencia del number), I2 (el `!==` estricto atrapa el `NaN` **por construcción**, así que el fail-closed no depende de una rama nueva), I3 (en `webhookFlow.ts` solo cambió el comentario), I4/ADR-0006 (ruteo, descifrado y logs sin secretos intactos). Barrió los consumidores del seam: `GetStatusDeTenant` sigue tipado contra el shape NORMALIZADO (correcto), y los mocks de `aplicarEfectosPostPago.test.ts`, `enviarCorreoDescargaDeOrden.test.ts` y `flowDeTenant.test.ts` siguen satisfaciendo sus tipos ⇒ **el split wire/normalizado quedó contenido enteramente dentro de `services/flow.ts`**. Sobre los bordes de parseo que le pedí mirar (`"3000.0000"`, `" 3000"`, `"3e3"`, `Infinity`, negativos): **no ameritan cerrar más el gate** — `"3000.0000"` parsea a 3000 y coincide igual (CLP entero), `" 3000"` lo cubre el `.trim()`, y todo lo demás cae en la rama `!==` contra un `montoEsperado` entero positivo finito. Sin acciones pendientes del reviewer.
- [2026-08-16 13:33] [feature-implementer] **F01 CERRADA — plan a `status: testing`.** F02 NO se tocó (operativa post-deploy, la ejecuta el orquestador). **1 drift de doc detectado y NO aplicado** (falta permiso del usuario): `docs/agents/backend-conventions.md` no documenta que **el wire de un proveedor externo se normaliza en el ADAPTER y que el sandbox miente sobre el contrato de producción**. El doc ya tiene la lección HERMANA para el mismo proveedor (§ Aritmética de fechas: "las fechas de un proveedor externo vienen en SU zona"), así que esta es la segunda vez que Flow rompe por un escalar cuyo tipo el código daba por sentado — con el agravante de que acá el fake del test imitaba el sandbox y por eso la suite estuvo verde con el bug vivo en producción. Diff propuesto en el mensaje al usuario. **Sugerencias que NO aplico por estar fuera del scope del implementer**: nada para `CONTEXT.md` (cero vocabulario nuevo) ni para ADRs (ADR-0001 ya dice "la confirmación server-side es la única fuente de verdad"; esto es un detalle de implementación del adapter, no una decisión arquitectónica nueva).
- [2026-08-16 13:55] [feature-tester] **F01 VERDE — veredicto PASS.** Suite Vitest **COMPLETA** (`npx vitest run`, sin filtro): **1645 passed / 2 failed / 1 skipped en 227 archivos, 566 s** (9,4 min — dentro del costo aceptado de la DB remota, no se cortó). Los **6 checkboxes de Validaciones F01 quedan `[x]`**; el checkbox E2E queda marcado **NO APLICA** (backend-only: el cambio vive entero en el adapter + un comentario, cero superficie de navegador — la verificación end-to-end real es F02 post-deploy).
  - **Evidencia por test (corrida verbose de los 2 archivos del alcance: 32/32 verde)**: adapter — `flow.getStatus.002` `"3000"`⇒3000 y `typeof number`; `.003` `3000`⇒3000 intacto; `.004` ×3 (`"abc"`, `""`, `"   "`) ⇒ `Number.isNaN` true; `.005` ×2 (`undefined`, `null`) ⇒ `undefined`; `.006` `fee: "103"` sigue crudo. Webhook con el **wire real** — `webhook.amount.wire.string` ⇒ `confirmarPago` 1 vez con `PAGADO` y sin `ignorado`; `.number` ⇒ ídem (cero regresión del sandbox); `.mismatch` (`"9999"`) ⇒ `confirmarPago` NUNCA, 200 + `ignorado: "amount_mismatch"`; `.ilegible` ×2 (`"abc"`, `""`) ⇒ mismo fail-closed (**D1/I2 verificados**); `.ausente` ⇒ confirma con `console.warn` conteniendo `"sin amount"` (rama tolerante intacta). Los 6 tests VIEJOS del Gate 5 y los 9 del núcleo del webhook siguen verdes ⇒ sin regresión.
  - **Alcance del diff auditado**: `git diff HEAD` toca **exactamente los 4 archivos declarados** (`services/flow.ts` +57, `pago/webhookFlow.ts` +7 **solo comentario**, y los 2 de test). **I3 confirmado por diff**: cero cambio de lógica en `webhookFlow.ts`.
  - **2 rojos, AMBOS AJENOS a F01 — no bloquean el veredicto.** Los dos viven en `src/__tests__/server/correo/` (carril `sistema-correos-comprador`, F05/F06, que nunca pasó por `feature-tester`). **Prueba estructural de que F01 no puede ser la causa**: los 2 archivos rojos tienen **cero** referencias a `services/flow` / `webhookFlow` / `normalizarAmountFlow` / `getStatus`, y **ningún archivo de `src/server/domain/correo/` importa los módulos cambiados** (grep recursivo: NINGUNO) ⇒ los 2 archivos tocados son inalcanzables desde ese árbol.
    - (a) `reenviarCorreoDescargaDeOrden.test.ts` — `PrismaClientKnownRequestError: Unique constraint failed on (token)` al crear la orden fixture. **FLAKE de contención/fixture residual**: re-corrido en aislamiento con `--no-file-parallelism` pasó **6/6**. Mismo patrón ya documentado en INDEX para `productos-tipos-digitales` (DB remota compartida entre carriles).
    - (b) `recordatoriosDelSorteo.test.ts::correo.recordatorio.014` («el resolvedor REAL del cron declara y resuelve RECORDATORIO_SORTEO», línea 516) — `expected +0 to be 1`: `resolvedor.armar()` devuelve 0 mensajes donde espera 1 (T-6h, `horasAlCierre: 6.5`). **NO es flake: reproduce 3/3** (suite completa, aislamiento del archivo, y corrida standalone con `-t` en 25 s). `resolvedor.tipos` sí contiene `RECORDATORIO_SORTEO` (la assert previa pasa), así que lo que falla es el ARMADO, no la declaración; sus 7 tests hermanos —incluido el que llama `armarRecordatoriosDeSorteo` **directo**— pasan, o sea el problema aparece al pasar por el registro/`planificarRecordatorios`, no en la plantilla. **Candidato a `troubleshooter`, dueño = carril de correos.**
  - **Sin cambios de `state`/`status`** (los decide el usuario) y **sin commit**. No se levantó dev server ni se tocó navegador (innecesario para F01). **F02 sigue `not_started`**: es post-deploy y la ejecuta el orquestador.
- [2026-08-16 14:20] [orquestador] DEPLOY + RESCATE F02 EJECUTADOS. Gate completo: change-set-reviewer APPROVE (0 blockers, 2 nits aplicados/documentados; check:types y check:lint 100% verdes; los 2 rojos de check:test verificados independientemente como preexistentes y ajenos — flake de contención + correo.recordatorio.014, este último con dueño anotado para troubleshooter), next build local exit 0 (dev-ref apartado, NEXT_PUBLIC_PLATFORM_DOMAIN=sorteatelo.cl). Commit `ddd3915` pusheado; deployment `dpl_3PqMhfB3v1iXpLkGcREQU8cxqr5t` READY en producción, aliases apex + wildcard; smoke 200 en apex, autora, iselk y e2e-alta-2707. Rescate: webhook re-POST transicionó la orden real a PAGADO — ticket número 13 emitido, grant creado, fee 96 registrado, correo DELIVERED a la compradora (Resend). Replay verificado no-op. Los 7 checkboxes operativos de F02 marcados con evidencia. Decisión sobre el ROJO preexistente: el usuario delegó el cierre nocturno completo (mensaje "visto bueno de todo y finaliza todo"); el orquestador procedió documentando — ratificación formal del usuario pendiente al despertar. Pendientes del usuario: states F01/F02 y status global, drift de backend-conventions.md (AWAITING), rojo correo.recordatorio.014 al troubleshooter.
- [2026-08-16 14:25] [orquestador] E2E DE ACEPTACIÓN COMPLETO (pedido del usuario: "una compra en ambiente de test en la tienda y que me lleguen los tickets"). Tienda `e2e-alta-2707` publicada vía panel (checklist completo: ToS, Flow sandbox, producto con PDF, bases, plan FULL AL_DIA; membresía agregada a nikochaima72 — pertenecía a nicolas.chaima@datawalt.cl). Compra real en producción con Flow sandbox: Guía de prueba E2E $3.000, Webpay tarjeta test Transbank, comprador nikochaima72+e2e-prod@gmail.com. La orden `cmsw4mwzc0002338nr57fxien` transicionó a PAGADO por el WEBHOOK AUTOMÁTICO (sin re-POST — valida FLOW_URL_CONFIRMATION nueva + fix del amount juntos): ticket número 1, grant, fee 96, ledger ENVIADO, Resend delivered, correo VERIFICADO EN EL GMAIL del usuario (asunto «Tu compra en Sorteos de Prueba 27-07: tus números y tu descarga», número 1 + enlace /entrega 200). Nota UX menor detectada (NO de este plan): el retorno del sandbox llegó a /checkout/retorno SIN token en la query ⇒ la página mostró el fallback "No encontramos tu compra" (honesto, el correo sí llegó); candidato a issue aparte.
