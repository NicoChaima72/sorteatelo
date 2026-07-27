---
slug: storefront-verificador-tickets
status: done                      # Vitest 64/64 + E2E 9/9 + deploy verificado en prod (2026-07-27); pendientes de cierre aplicados con permiso del usuario («mata los pendientes»)
owner: nicolas
created: 2026-07-26
related_adrs: [ADR-0004, ADR-0005, ADR-0008, ADR-0012, ADR-0024]
related_context: [Sorteo, Participación, "Número del sorteo", Orden, Tienda, Comprador]

features:
  - id: F01
    behavior: "Procedure pública tenant-scoped `verificarTickets(email)` devuelve los Números del sorteo ACTIVO de ese correo (solo números + prefijo, cero PII), con rate limit anti-enumeración"
    state: active

  - id: F02
    behavior: "`BoletosDelSorteo` extraído de `checkout/retorno.tsx` a componente compartido del storefront, sin cambio visual en el retorno"
    state: active

  - id: F03
    behavior: "Página `/verificar` en todo storefront publicado: form de correo + boletos resultantes, tema/chrome/nav heredados del tenant, estados vacíos honestos (sin sorteo activo / sin tickets)"
    state: active

  - id: F04
    behavior: "Link «Verificar tickets» pinned por construcción en el header (slot de sesión) y el footer (junto a Bases) de TODAS las tiendas"
    state: active
---

# Verificador público de tickets en el storefront

## Contexto

Moneda de confianza estándar del nicho chileno (gonzaloko.cl / elcapataz.cl / tiogaleas.cl /
tiotito.cl — los 4 llevan «Verificar Tickets» como ítem prominente del menú): el Comprador ingresa
el correo con el que compró y ve sus Números del sorteo. Backlog derivado de
`landing-reposicionamiento` (la landing promete que el Comprador «ve su número»; hoy solo lo ve en
el retorno post-pago y en el correo C1). Complemento web de `sistema-correos-comprador`.

La dependencia dura que este plan tenía (ADR-0024: `RaffleEntry.numero` correlativo público) **ya
landeó**: la columna es NOT NULL + `@@unique([raffleId, numero])`, el punto único de presentación
es `~/lib/numerosDelSorteo` (`bloquesDeNumerosDelSorteo` + `Tenant.prefijoTicket`), y
`checkout/retorno.tsx` ya dibuja los boletos (`BoletosDelSorteo`). Este plan agrega la superficie
de consulta: página de sistema `/verificar` (precedente exacto: `/bases` de admin-bases-pdf) en
TODAS las tiendas, sin cuentas de comprador (ADR-0004), scoped al sorteo ACTIVO del tenant
resuelto server-side por subdominio (ADR-0005).

**Modo de cierre del plan**: el usuario delegó explícitamente las decisiones restantes
(2026-07-27, «podrías realizarlo pensando tú mismo las propias respuestas»). Las decisiones D1–D5
las fijó la sesión principal con el usuario; D6–D12 las tomó el planner de forma autónoma y quedan
marcadas — son REVISABLES a posteriori pero el implementer NO debe re-abrirlas.

## Decisiones

- **D1 (fija, usuario/sesión principal)** — Clave de búsqueda: **correo solo** (como las
  referencias del nicho). La respuesta expone SOLO Números del sorteo (identidad pública del
  ticket, ADR-0024) + el prefijo del tenant + el nombre del sorteo: jamás nombre, montos, ítems ni
  ningún otro dato de la orden.
- **D2 (fija, usuario)** — Alcance: SOLO el `Raffle` con `estado: ACTIVO` del tenant resuelto
  server-side por subdominio (ADR-0005, invariante I1 del repo). Sin sorteo activo ⇒ la página lo
  comunica con estado vacío neutral y NO ofrece búsqueda (ni la procedure consulta entries).
- **D3 (fija, usuario)** — Superficie: página de sistema del storefront en **`/verificar`**
  (ruta de plataforma como `/bases`, NO página del builder). Presente en TODAS las tiendas
  publicadas, sin opt-in del Organizador. `verificar` entra a la lista de slugs reservados de
  páginas (mismo mecanismo que reservó `bases`, admin-bases-pdf F04/D6).
- **D4 (tomada, planner)** — Anti-enumeración de respuesta: un correo sin tickets en el sorteo
  activo devuelve la MISMA shape con `numeros: []` y el mismo mensaje neutral («No encontramos
  tickets del sorteo actual para ese correo») — sin distinguir «correo que nunca compró» de
  «correo que compró sin tickets». Así la superficie no confirma la existencia de compras de un
  tercero; lo único observable es la pertenencia al sorteo activo, que es exactamente lo que las
  referencias del nicho también exponen (leak aceptado por el usuario en el pre-grill).
- **D5 (fija, sesión principal + verificación del planner)** — Rate limiting básico: **no existe
  precedente de rate limit de requests en el repo** (verificado por grep: solo menciones en
  services de Flow/Resend, otra cosa). Se crea un limiter **in-memory por IP+tenant** simple
  (ventana fija, p.ej. 10 intentos/60 s ⇒ `TRPCError TOO_MANY_REQUESTS` con mensaje humano),
  módulo puro testeable con clock inyectable. Limitación conocida y ACEPTADA: en Vercel es
  per-instancia (memoria no compartida entre lambdas) — es fricción anti-script básica, no un
  perímetro de seguridad; los datos expuestos son públicos-por-diseño (D1/D4). Sin captcha ni
  Redis (principio «simple y barato»).
- **D6 (tomada, planner)** — Matching del correo: trim + comparación case-insensitive
  (`email: { equals: <trim>, mode: "insensitive" }` sobre `RaffleEntry.email`), coherente con la
  identidad de persona del sistema de correos (`identidadDeCorreo` = trim + lowercase,
  `ledgerCorreos.ts`). Quien compró con `Ana@Gmail.com` y busca `ana@gmail.com` encuentra sus
  tickets. Validación Zod de email en el input.
- **D7 (tomada, planner)** — «Solo órdenes PAGADAS» está garantizado POR CONSTRUCCIÓN:
  `RaffleEntry` solo la escriben `aplicarEfectosPostPago` (dentro de la `$tx` de confirmación de
  pago) y el arrastre D13 de `crearSorteo` (copia tickets ya legítimos de un sorteo anterior).
  La query va directo a `RaffleEntry` por `raffleId` + email, sin join a `Order.estado`. El
  implementer debe VERIFICAR este supuesto releyendo ambos writers antes de codear; si aparece un
  tercer writer que cree entries pre-pago, parar y anotar en Bitácora.
- **D8 (tomada, planner; header pre-conversado con el usuario)** — Integración al nav: **nodo
  PINNED por construcción** (patrón I-U2 del chrome: la plataforma lo renderiza alrededor de lo
  configurable; no existe input del Organizador que lo quite — más fuerte que un flag). Dos
  puntos: (a) header, en el slot de acciones junto al carrito — el estado anónimo de
  `AccesoSesion` ya fue ocultado (usuario 2026-07-27, commit 6a9c49a), así que «Verificar tickets»
  ocupa ese espacio, tal como se pre-conversó; (b) footer, junto al enlace pinned a Bases
  (ADR-0008). El link va **SIEMPRE**, haya o no sorteo activo — mismo razonamiento que el ítem
  «Bases» incondicional (D5 de admin-bases-pdf): el nav es puro/sin DB y `/verificar` resuelve
  sola el caso vacío con un mensaje honesto. NO se toca `derivarNav`/`ANCLAS_QUE_SON_RUTA` (eso
  gobierna lo configurable; esto es pinned).
- **D9 (tomada, planner)** — `BoletosDelSorteo` se EXTRAE de `checkout/retorno.tsx` a
  `src/components/storefront/boletos-del-sorteo.tsx` y lo consumen retorno + `/verificar`:
  mismo markup, cero cambio visual en retorno (los dos dicen exactamente lo mismo que el correo,
  I12 de ADR-0024). El plegado sigue saliendo SOLO de `bloquesDeNumerosDelSorteo` (I4/I12).
- **D10 (fija, sesión principal)** — Tema/chrome/nav: `/verificar` hereda tema per-tenant y nav
  compuesto EXACTAMENTE como `/bases` — mismo combo de helpers del borde (`resolverBrandingSSR` +
  `resolverNavPaginas` + `resolverChrome` + `resolverHerenciaDeLaHome` + `componerNavDelHeader` +
  `reanclarNavALaHome`), fail-closed en la zona (apex/host sin tienda publicada ⇒ 404 neutral).
  Sumar `/verificar` a la cobertura del test existente de tema en páginas de plataforma
  (`temaEnPaginasDePlataforma.test.ts`) si su harness lo permite.
- **D11 (fija, usuario)** — Sorteo CERRADO / histórico / «ganaste» quedan FUERA: la restricción es
  «corre bajo el sorteo activo». El estado sin-sorteo-activo no muestra resultados pasados.
- **D12 (tomada, planner)** — Respuesta de la procedure: shape plana
  `{ sorteo: { nombre } | null, numeros: number[], prefijo: string | null }` (espejo de
  `checkout.estadoOrden`, que ya pasó por reviewers con ese criterio anti-PII). El nombre del
  sorteo se muestra para que el Comprador sepa QUÉ está verificando; ningún dato de terceros cabe
  en el tipo (garantía por tipos, mismo criterio que D4 de correos F04).

## Plan

1. **Rate limiter puro** — `src/server/lib/limiteDeIntentos.ts` (o ubicación que el
   backend-reviewer prefiera): ventana fija in-memory, clave string, límite/ventana/clock
   inyectables, función `permitirIntento(clave) => boolean` + poda de claves viejas. Tests puros
   primero (TDD). (F01)
2. **Procedure `storefront.verificarTickets`** — en el router donde vive
   `getSorteoActivoStorefront`, con `tenantProcedure` (nunca `publicProcedure`; `ctx.tenant`
   server-side, I1). Input Zod `{ email }`. Núcleo en `src/server/storefront/` (patrón
   borde-fino/núcleo-testeable del repo): resuelve `Raffle ACTIVO` del tenant → sin activo ⇒
   `{ sorteo: null, numeros: [], prefijo }`; con activo ⇒ `RaffleEntry.findMany` por
   `raffleId` + email insensitive (D6/D7), `select { numero }`, + `Tenant.prefijoTicket`. Rate
   limit por `IP + tenantId` ANTES de tocar la DB (IP desde el `req` del contexto tRPC;
   sin IP resoluble ⇒ clave solo-tenant, fail-open documentado). (F01)
3. **Extraer `BoletosDelSorteo`** — mover el componente + su doc comment a
   `src/components/storefront/boletos-del-sorteo.tsx`, `checkout/retorno.tsx` lo importa.
   Cero cambio de markup/estilos. (F02)
4. **Props SSR de `/verificar`** — `src/server/storefront/getVerificarProps.ts`, espejo de
   `getBasesProps.ts` (archivo propio, mismos helpers reusados, `Promise.all`, JSON puro —
   ojo con `Date`): branding, navItems compuestos, chrome, temaPagina, y
   `sorteo: { nombre, premio, fechaFinIso } | null` (findFirst ACTIVO) para decidir si se
   muestra el form. (F03)
5. **Página `src/pages/verificar.tsx`** — `StorefrontLayout` + tema heredado
   (`estiloHeredadoDeTema`) como `/bases`. Con sorteo activo: título «Verifica tus tickets»,
   `TextInput` de correo + botón Buscar (Mantine, mobile-first, `useMutation`/`useQuery` lazy de
   la procedure), resultado con `BoletosDelSorteo` + texto de contexto (nombre del sorteo, «los
   mismos números de tu correo de confirmación»); sin resultados ⇒ mensaje neutral D4; error
   TOO_MANY_REQUESTS ⇒ mensaje de espera humano. Sin sorteo activo ⇒ estado vacío neutral estilo
   `SinBases` (sin form). Disclaimer ADR-0008 (`DISCLAIMER_SORTEO`) al pie, como `/bases`.
   `<meta name="robots" content="noindex">`. (F03)
6. **Slug reservado** — agregar `verificar` a la lista de slugs reservados de páginas del builder
   (el mecanismo que ya reserva `bases`). (F03)
7. **Links pinned** — en `storefront-layout.tsx`: header, `Anchor` «Verificar tickets» con chrome
   neutro (mismo tratamiento `c="dimmed"` que `AccesoSesion`) junto al carrito; footer, link junto
   al de Bases. Siempre visibles (D8). Cuidar mobile (el header es angosto: evaluar icono+texto
   corto o solo texto; que no rompa el layout a 320px). (F04)
8. **E2E** — el feature-tester ejercita el flujo completo en una tienda con sorteo activo y
   órdenes pagadas reales (la DB compartida ya tiene datos; NO crear fixtures que muevan el
   ledger de correos — memoria «db-dev-es-produccion»: fixtures con ledger en 0). (F01–F04)

## Validaciones

### F01 — procedure `verificarTickets` (backend)

**Vitest** (integration):
- [x] Con sorteo ACTIVO y un correo con tickets de varias órdenes, devuelve TODOS sus `numero` + el `prefijoTicket` del tenant + el nombre del sorteo. — `src/__tests__/server/checkout/verificarTickets.test.ts::verificar.001` ✅ 2026-07-27
- [x] El matching de correo es insensible a mayúsculas y espacios (compró `Ana@Gmail.com `, busca `ana@gmail.com` ⇒ encuentra). — `src/__tests__/server/checkout/verificarTickets.test.ts::verificar.002` ✅ 2026-07-27 (**matiz honesto, ver Bitácora**: insensible a las MAYÚSCULAS del correo guardado + al trim de lo TIPEADO. Los espacios del valor almacenado NO los pliega `mode:"insensitive"` de Postgres, y no hace falta: `z.string().email()` del checkout impide que una `RaffleEntry.email` los tenga)
- [x] Correo sin tickets en el sorteo activo ⇒ misma shape con `numeros: []` (sin señal alguna de si ese correo compró otra cosa). — `src/__tests__/server/checkout/verificarTickets.test.ts::verificar.003` ✅ 2026-07-27
- [x] Sin sorteo ACTIVO ⇒ `sorteo: null` y `numeros: []`, sin consultar entries. — `src/__tests__/server/checkout/verificarTickets.test.ts::verificar.004` ✅ 2026-07-27
- [x] Tenancy: el mismo correo con tickets en OTRO tenant no aparece (dos tenants, mismo email ⇒ solo los del tenant del contexto). — `src/__tests__/server/checkout/verificarTickets.test.ts::verificar.005` ✅ 2026-07-27
- [x] Tickets de un sorteo CERRADO del mismo tenant NO aparecen (solo el ACTIVO). — `src/__tests__/server/checkout/verificarTickets.test.ts::verificar.006` ✅ 2026-07-27
- [x] La shape del output no contiene ningún campo de PII de la orden (correo, nombre, montos, ítems) — verificado contra el tipo/respuesta. — `src/__tests__/server/checkout/verificarTickets.test.ts::verificar.007` ✅ 2026-07-27
- [x] Rate limiter puro: dentro del límite permite, el intento N+1 dentro de la ventana rechaza, pasada la ventana vuelve a permitir (clock inyectado). — `src/__tests__/server/security/limiteDeIntentos.test.ts::limite.001/002/003` (+ `limite.004`: cuotas independientes por clave) ✅ 2026-07-27
- [x] La procedure con el límite excedido lanza `TOO_MANY_REQUESTS` sin tocar la DB. — `src/__tests__/server/checkout/verificarTickets.test.ts::verificar.008` ✅ 2026-07-27 (asserteado en el USE CASE: el gate corta ahí y el fake db registra 0 consultas; el mapeo `DomainError TOO_MANY_REQUESTS` → `TRPCError TOO_MANY_REQUESTS` lo garantiza el `Record` exhaustivo de `runDomain.ts` + `tsc`, y el procedure es un wrapper de 3 líneas que solo arma la clave). **Además ejercido de punta a punta en el navegador**: intentos 1–10 responden, el 11 y el 12 muestran «Demasiadas búsquedas seguidas» (`tmp/v-cuota-429.png`)

**E2E** (browser):
- [x] En una tienda con sorteo activo, buscar un correo con compra pagada real muestra sus boletos con el prefijo del tenant, idénticos a los del correo de confirmación / panel. — ✅ 2026-07-27 `iselk`: `nikochaima72+f14@gmail.com` ⇒ boleto `1–8` y `+f14t3@gmail.com` ⇒ `9–12`, exactamente los `RaffleEntry.numero` que tiene la DB para esos correos. El **prefijo** se verificó aparte porque ninguna tienda estable lo tiene seteado: se cazó la ventana de un fixture efímero con `prefijoTicket=ARMY` ⇒ boleto `ARMY-1` (`tmp/v-prefijo.png`)

### F02 — `BoletosDelSorteo` compartido

**Vitest**:
- [x] (no aplica — extracción 1:1 de componente visual; el repo no unit-testea componentes. La regresión la cubren el E2E de retorno y de `/verificar`, más `getEstadoOrden.test.ts` intacto.) — `getEstadoOrden` 9/9 verde 2026-07-27

**E2E**:
- [x] `checkout/retorno` de una orden pagada sigue mostrando los boletos EXACTAMENTE igual que antes de la extracción. — ✅ 2026-07-27 orden PAGADA real de `iselk` (token Flow `E78325D7…CEM`): «¡Pago confirmado!» + «Tus números del sorteo» + boleto `1–8` + pie (`tmp/v-retorno-desktop.png`). **Prueba fuerte de la extracción**: el `outerHTML` del bloque de boletos es **idéntico carácter por carácter** entre `/checkout/retorno` y `/verificar` para los mismos números — o sea las dos superficies no pueden divergir, que es lo que D9/I12 compran

### F03 — página `/verificar`

**Vitest**:
- [x] Props SSR: apex u host sin tienda publicada ⇒ `notFound` (fail-closed en la zona). — `src/__tests__/server/storefront/getVerificarProps.test.ts::verificar.props.001` ✅ 2026-07-27 (confirmado también en vivo: `http://127.0.0.1:3001/verificar` ⇒ **404**, igual que `/bases`)
- [x] Props SSR: tenant sin sorteo activo ⇒ `sorteo: null` y las props restantes completas (branding/nav/chrome/tema). — `src/__tests__/server/storefront/getVerificarProps.test.ts::verificar.props.002` ✅ 2026-07-27
- [x] Props SSR: son JSON puro (ninguna `Date` cruda — fechas como ISO string). — `src/__tests__/server/storefront/getVerificarProps.test.ts::verificar.props.003` (round-trip `toStrictEqual`, + `verificar.props.004`: el sorteo se consulta por el tenant del HOST aunque la query traiga otro, I1) ✅ 2026-07-27
- [x] `/verificar` hereda el tema mínimo del tenant (sumar al harness de `temaEnPaginasDePlataforma.test.ts`; si el harness no admite la página, anotar en Bitácora el porqué). — el harness SÍ lo admitió (solo hubo que sumar `raffle.findFirst` al mock de `db`): `src/__tests__/server/storefront/temaEnPaginasDePlataforma.test.ts::storefront.tema.props.008/009/010` ✅ 2026-07-27
- [x] `verificar` es slug reservado: no se puede crear una página del builder con ese slug. — `src/__tests__/server/pagebuilder/paginas.test.ts::page.pag.001c` (+ `page.pag.002`: `crearPagina` con slug `verificar` ⇒ `INVALID` sin crear nada) ✅ 2026-07-27

**E2E**:
- [x] En una tienda SIN sorteo activo, `/verificar` muestra el estado vacío neutral y NO ofrece el formulario. — ✅ 2026-07-27 en DOS tiendas PUBLICADAS sin `Raffle` ACTIVO (`test-efectos-sobre-f`, `test-efectos-sobre-g`): título, «Ahora mismo no hay un sorteo activo», «Volver a la tienda», disclaimer y link del footer presentes; **`input[type=email]` y botón Buscar AUSENTES del DOM** (D2 verificado, no asumido). `tmp/v-sinsorteo-test-efectos-sobre-f.png`
- [x] Buscar un correo sin tickets muestra el mensaje neutral (sin distinguir si compró o no). — ✅ 2026-07-27 en `iselk` (tienda que SÍ tiene tickets de otros correos): «No encontramos tickets del sorteo actual para ese correo», sin ninguna otra señal
- [x] La página respeta el tema del tenant (verificar en el peor caso: tienda oscura demo-noche además de una clara). — ✅ 2026-07-27 comparado contra `/bases` del MISMO tenant por `getComputedStyle`: `iselk` claro (fondo blanco, Nunito Sans, `color-scheme: light`) y `demo-noche` oscuro (fondo `rgb(36,36,36)`, Roboto/Anton, `color-scheme: dark`) — los dos con shell, esquema y fondo **idénticos** a `/bases`. Screenshots `tmp/v-iselk-desktop.png`, `tmp/v-noche-desktop.png`, `tmp/v-noche-320-full.png`

### F04 — link pinned en header y footer

**Vitest**:
- [x] (no aplica — render de layout sin lógica pura nueva; se valida por E2E.)

**E2E**:
- [x] El link «Verificar tickets» aparece en header y footer de una tienda publicada cualquiera (no configurado por el Organizador — pinned), y navega a `/verificar` del MISMO subdominio. — ✅ 2026-07-27 en **4 tiendas de chrome distinto** (`iselk`, `demo-noche`, `prueba`, `bcac`): exactamente 1 ancla `/verificar` en `<header>` y 1 en `<footer>` en todas. Clickeado de verdad desde el header de `iselk` y desde el footer de `demo-noche` ⇒ `http://<slug>.localhost:3001/verificar` del MISMO subdominio, con el `<h1>` correcto
- [x] El header no se rompe en viewport móvil (~320px) con el link nuevo junto al carrito. — ✅ 2026-07-27 medido a 320 y 360 px: `scrollWidth === clientWidth` (sin overflow horizontal), cero elementos con `right > clientWidth`, wordmark sin truncar y header de 60 px. **Peor caso ejercido con sesión real de la DB**: (a) dueña de `iselk` logueada ⇒ banner de plataforma arriba y `AccesoSesion` oculta (el estado `editar` no renderiza, por diseño); (b) el peor caso REAL de ancho es una usuaria logueada que NO es dueña ⇒ `demo-noche` con «Mi panel»: a 320 px conviven wordmark[16-82] + Verificar[214-230] + Mi panel[242-258] + carrito[270-304], gap mínimo 12 px, sin overflow (`tmp/v-320-noche-mipanel.png`)

## Invariantes

- I1: `tenantId` resuelto SERVER-SIDE por subdominio (`tenantProcedure` / `resolverBrandingSSR`); jamás del input del cliente (ADR-0005).
- I2: la respuesta al Comprador contiene SOLO Números del sorteo + prefijo + nombre del sorteo. Cero PII de órdenes (ni la propia: el correo buscado no se ecoa desde el server).
- I3: el plegado/prefijo de los números sale ÚNICAMENTE de `~/lib/numerosDelSorteo` (I4/I12 de ADR-0024) — nunca formateo a mano.
- I4: solo el `Raffle` ACTIVO; nunca listar/exponer sorteos cerrados ni ganadores desde esta superficie.
- I5: la página degrada con estados vacíos honestos, nunca 500 en el storefront público (mismo criterio fail-soft que `/bases`).
- I6: NO tocar los writers de `RaffleEntry`, el schema, ni `derivarNav`/chrome configurable. Feature 100% de lectura + presentación.
- I7: no crear páginas dev/tmp fuera de `src/pages/verificar.tsx`; nada en `src/pages/dev-ref/` (pertenece a otro carril in-flight).
- I8: cuidado con carriles in-flight sin commit (`correo`, `facturación`, `focos-ambiente`): no editar sus archivos; `storefront-layout.tsx` se toca SOLO para los links pinned (F04), cambios mínimos.

## Out of scope

- Historial de sorteos cerrados, número ganador, «ganaste/no ganaste» (D11).
- Búsqueda por número de ticket, código de orden u otra clave que no sea el correo.
- Captcha, Redis/rate-limit distribuido, bloqueo por email (D5: in-memory basta).
- Envío de resultados por correo como alternativa de privacidad (evaluado y descartado en pre-grill: la competencia muestra directo).
- Opt-in/opt-out por Organizador, u orden configurable del link en el nav.
- Cambios a `AccesoSesion` (sus estados de dueña/panel quedan como están).
- SEO de la página (va `noindex`, como `/bases`).

## Especialistas a consultar

- `backend-reviewer` — procedure nueva + rate limiter (ubicación del módulo, contexto tRPC/IP, criterio anti-enumeración D4).
- `frontend-reviewer` — página `/verificar`, extracción de `BoletosDelSorteo`, links pinned del header/footer (mobile 320px, chrome neutro).
- `feature-tester` — Vitest completo del área + E2E browser (flujo de búsqueda, tema per-tenant en tienda clara y oscura, retorno sin regresión).
- (NO aplica `schema-guardian`: cero cambios de schema.)

## Bitácora

- [2026-07-26 01:29] [planner-grill] Arranque. Read pass completo: INDEX (colisión/dependencia con `sistema-correos-comprador` F01/ADR-0024 detectada — su Out of scope cede el buscador a ESTE plan), schema (RaffleEntry sin `numero` público aún; Order.email + @@index([tenantId,email]) ya existe — la búsqueda por correo tenant-scoped está indexada), `plantillaDescarga.ts` (el comprador hoy NO recibe ningún identificador salvo su propio correo — sin código de orden ni números), `acceso-sesion.tsx` + `storefront-layout.tsx:239-244` (slot pinned junto al carrito; chrome editable tanda-3 con pinned I-U2; nav derivado del documento con fallback hardcodeado), `src/server/storefront/` (helpers SSR per-tenant; `bases.tsx` es el precedente de página fija de plataforma en el subdominio). Q1 = panorama batch con defaults (memoria «panorama antes que detalle»).
- [2026-07-26 01:30] [planner-grill] **Q1 (panorama batch con defaults): a) alcance = solo verificador + slot header (resultados históricos / premios múltiples / packs → fuera; countdown YA existe como CountdownChip); b) dependencia declarada sobre ADR-0024 (F01 correos) sin duplicarlo; c) clave de búsqueda = correo exacto; d) privacidad: mostrar números directo (como la competencia) + rate limit, LEAK señalado (cualquiera que tipee un correo ve que compró) vs alternativa enviar-por-correo; e) ruta fija `/verificar` per-subdominio, pinned en chrome, NO página del builder; f) AccesoSesion pierde solo el estado anónimo (dueña/panel se conservan); g) sorteo CERRADO ⇒ tus números + número ganador + «ganaste» si coincide, sin email de terceros.** AWAITING ANSWER.
- [2026-07-27 03:30] [planner-grill] Reanudación en modo nocturno delegado: el usuario aprobó la feature y delegó las decisiones restantes en la sesión principal («podrías realizarlo pensando tú mismo las propias respuestas») — el grill cierra sin más AWAITING. Q1 queda respondida así: (a/b/c/e) confirmadas por el usuario/sesión principal (correo solo, `/verificar`, todas las tiendas, sorteo ACTIVO); (d) mostrar directo + rate limit in-memory (D4/D5 — leak de pertenencia al sorteo aceptado, mitigado no distinguiendo correo-sin-compras de correo-sin-tickets); (f) confirmada — «Iniciar sesión» ya se ocultó (commit 6a9c49a) y el slot lo toma «Verificar tickets»; (g) RECHAZADA por restricción del usuario: solo sorteo ACTIVO, lo cerrado queda out of scope (D11).
- [2026-07-27 03:35] [planner-grill] Verificaciones de código para cerrar Decisiones: ADR-0024 landeado (`RaffleEntry.numero` NOT NULL + `@@unique([raffleId, numero])`; `Raffle.ultimoNumero`); writers de RaffleEntry = solo post-pago + arrastre D13 (sustenta D7); `checkout.estadoOrden` como precedente de shape anti-PII (`{estado, numeros, prefijo}`, `tenantProcedure`); `getBasesProps.ts` como plantilla exacta del borde SSR (D10); `componerNavDelHeader`/pinned I-U2 (D8: NO tocar `ANCLAS_QUE_SON_RUTA`); `identidadDeCorreo` (trim+lowercase) como criterio de identidad ⇒ D6 matching insensitive; grep de rate limit ⇒ SIN precedente ⇒ D5 limiter in-memory nuevo. Plan escrito, Validaciones puras, `status: implementing` por delegación explícita. TDD orden sugerido: limiter puro → núcleo verificarTickets → props SSR → UI.
- [2026-07-27 01:07] [feature-implementer] Arranca implementación. Features pendientes: F01, F02, F03, F04. Modo NOCTURNO AUTÓNOMO (el usuario delegó las decisiones no cubiertas: se toma la opción más simple coherente con las convenciones y se anota acá, sin `AWAITING ANSWER`). Read pass completo: `tasks/_template.md`, `CLAUDE.md`, ADR-0024, `backend-conventions.md`, `frontend-conventions.md` (completo), `bases.tsx` + `getBasesProps.ts` + `basesDelSorteo.ts` (plantilla exacta del borde SSR, D10), `checkout/retorno.tsx` (`BoletosDelSorteo` a extraer, D9), `numerosDelSorteo.ts` (I3), `routers/checkout.ts` + `trpc.ts` (`tenantProcedure`, `ctx.ip`), `getEstadoOrden.ts` + su test (precedente de shape anti-PII y de FAKE db), `storefront-layout.tsx` + `acceso-sesion.tsx` (slot del header, D8), `slugTienda.ts` (`SLUGS_PAGINA_RESERVADOS`), `temaEnPaginasDePlataforma.test.ts` (harness de tema admite `/verificar`: solo hay que sumar `raffle.findFirst` al mock de `db`).
- [2026-07-27 01:07] [feature-implementer] **Decisiones tácticas tomadas antes de codear** (ninguna re-abre el plan; todas caen bajo Decisiones/Invariantes/`docs/agents/*`): (1) **Nombre real de la procedure = `checkout.verificarTickets`**, no `storefront.verificarTickets` — el Plan paso 2 manda ponerla «en el router donde vive `getSorteoActivoStorefront`», que es `checkoutRouter` (no existe router `storefront`), y crear un router nuevo para un solo procedure contradice backend-conventions § Routers. El F01 del frontmatter nombra el comportamiento, no la ruta tRPC. (2) **Núcleo en `src/server/domain/checkout/verificarTickets.ts`** y no en `src/server/storefront/` (que el Plan paso 2 sugería): esa carpeta es el borde de `getServerSideProps` (helpers SSR), mientras que TODO procedure del `checkoutRouter` delega en `domain/checkout/*` vía `runDomain` (backend-conventions § Layering). El borde SSR de F03 sí va a `src/server/storefront/` como manda D10. (3) **Limiter en `src/server/security/limiteDeIntentos.ts`** y no en `src/server/lib/` (el Plan lo dejó explícitamente a elección): `src/server/lib/` NO existe y estrenar un directorio para un archivo es peor que usar `security/`, que ya hospeda la política de CSP. (4) **`prefijo` viaja SOLO junto con los números** (sin sorteo activo ⇒ `prefijo: null`): es el precedente exacto de `getEstadoOrden` y además ahorra una query — el prefijo se lee por la relación `raffle.tenant` en el MISMO `findFirst` del sorteo. (5) **Verificado D7 releyendo los dos writers**: `aplicarEfectosPostPago` (dentro de la `$tx` de confirmación) y el arrastre de `crearSorteo` siguen siendo los únicos escritores de `RaffleEntry`; no apareció un tercero ⇒ «solo órdenes PAGADAS» se sostiene sin join a `Order.estado`.
- [2026-07-27 01:18] [feature-implementer] **F01 implementada** (TDD red→green, 13 tests nuevos verdes). Archivos NUEVOS: `src/server/security/limiteDeIntentos.ts` (limitador in-memory de ventana fija, límite/ventana/reloj inyectables, poda de claves vencidas con tope `MAX_CLAVES` y modo de falla ABIERTO documentado — el peor caso de fallar abierto es un scraper viendo números públicos; el de fallar cerrado, un Comprador legítimo sin poder verificar), `src/server/domain/checkout/verificarTickets.ts`, `src/__tests__/server/security/limiteDeIntentos.test.ts` (4), `src/__tests__/server/checkout/verificarTickets.test.ts` (9). MODIFICADOS (diff mínimo, I8): `routers/checkout.ts` (procedure + singleton del limitador 10/60 s + armado de la clave `tenant+IP`), `domain/checkout/schemas.ts` (`verificarTicketsInput`), `domain/errors.ts` + `api/runDomain.ts` (código `TOO_MANY_REQUESTS` nuevo, mapeado por el `Record` exhaustivo ⇒ lo obliga `tsc`). Una sola query para sorteo+prefijo (relación `raffle.tenant`) y otra para las entries; sin sorteo ACTIVO la segunda NI CORRE (D2, asserteado contando llamadas al fake db). `tsc` limpio en todo el repo.
- [2026-07-27 01:18] [feature-implementer] F01 — **`backend-reviewer` APPROVE** (Compliance A / Naming A / Tests B), con las 4 decisiones tácticas ratificadas una por una (nombre `checkout.verificarTickets`, núcleo en `domain/checkout/`, limiter en `server/security/`, prefijo junto a los números). **1 NIT REAL y valioso, ya corregido**: mi fake db trimeaba el correo ALMACENADO, o sea era más permisivo que Postgres — `mode:"insensitive"` pliega mayúsculas y nada más, no trimea. El test daba cobertura falsa para un caso que la DB real no cubre, y el comentario del use case prometió lo mismo. Corregido: el fake ya no trimea el lado almacenado, y el comentario + el título del test dicen la verdad asimétrica (trim solo de lo tipeado). **El gap es inerte hoy** — el reviewer lo verificó en el writer: `iniciarCheckoutInput` valida con `z.string().email()` antes de que el correo se snapshotee en `Order.email` → `RaffleEntry.email`, así que una entry con espacios colgando no puede existir; el día que pudiera, `verificar.002` se pone rojo, que es justo lo que se quiere. **Nota para el `feature-tester`**: el paréntesis de esa Validación del plan («compró `Ana@Gmail.com `», con espacio final) describe un dato IMPOSIBLE de producir — el checkbox se anotó con el matiz en vez de fingir que se cubre.
- [2026-07-27 01:18] [feature-implementer] F01 — cobertura EXTRA no listada en Validaciones (no agrego checkboxes al plan; queda registrada acá por si el `feature-tester` la quiere promover): `limite.004` (cuotas independientes por clave ⇒ el tráfico de una Tienda no le come la cuota a otra, la razón de que el `tenantId` esté en la clave) y `verificar.009` (Tienda sin prefijo ⇒ `prefijo: null`, y el par que sale del use case, pasado por `bloquesDeNumerosDelSorteo`, da `["7–9", "15"]` — asserteado contra el punto ÚNICO de presentación y no contra un string a mano, I3). **Mutation test**: cambié `>= ventanaMs` por `> ventanaMs` en el limitador y `limite.003` se puso rojo ⇒ el test del borde exacto de la ventana no es vacuo.
- [2026-07-27 01:26] [feature-implementer] **F02 implementada**. NUEVO `src/components/storefront/boletos-del-sorteo.tsx`; MODIFICADO `src/pages/checkout/retorno.tsx` (borrado el componente local, import del compartido, limpieza de `Box`/`Group`/`bloquesDeNumerosDelSorteo` que quedaron huérfanos, doc comment de la página actualizado). **Identidad probada, no afirmada**: comparé programáticamente el cuerpo de la función en `git show HEAD:src/pages/checkout/retorno.tsx` contra el del archivo nuevo ⇒ **byte-idénticos**. `tsc` limpio, `next lint` limpio en los dos archivos. Sin Vitest por decisión del plan (extracción visual 1:1; el repo no unit-testea componentes).
- [2026-07-27 01:26] [feature-implementer] F02 — **decisión táctica: NO parametricé el copy del pie**. Empecé escribiendo una prop `pie: string` para que `/verificar` dijera algo distinto de «También quedan guardados en tu correo de confirmación» (razón: quien usa el verificador suele ser justamente quien no encuentra ese correo) y la saqué antes de cerrar: el Plan paso 5 pide para `/verificar` EXACTAMENTE ese texto de contexto, y un slot de copy es la puerta a que las dos pantallas digan cosas distintas sobre los mismos números — lo contrario de I12 de ADR-0024, que es lo que la extracción viene a garantizar. Queda documentado en el JSDoc como «sin props de copy a propósito».
- [2026-07-27 01:26] [feature-implementer] F02 — **`frontend-reviewer` APPROVE** (Corrección A / Compliance A / Naming A / Tests B), 0 blockers. Ratificó el no-slot citando I12 + el criterio de «cuándo NO usar el `Record<Union, Copy>`» (ese patrón es para copy que VARÍA por diseño; acá el requisito es la invariancia), y confirmó el domicilio `src/components/storefront/` por precedente real (`campos-checkout`, `stepper-cantidad`, `acceso-sesion` ya los consumen páginas de PLATAFORMA, no solo secciones del builder). Verificó la gramática de boleto contra `frontend-conventions` § «Card contenida y filas de números» y contra `momento-ticket.tsx`: cero hex, acento con degradación por fallback de `var()`, `tabular-nums`, un boleto por BLOQUE. **1 NIT cosmético**: el JSDoc habla de `/verificar` en presente y la página aún no existía al momento de la review — se resuelve solo al cerrar F03 en esta misma corrida (queda verdadero, no lo reescribo). Nada nuevo que registrar en `frontend-conventions.md`: F02 reusa patrón y domicilio ya documentados.
- [2026-07-27 01:39] [feature-implementer] **F03 implementada** (7 tests nuevos verdes + 2 asserts sumados a un harness existente). NUEVOS: `src/server/storefront/getVerificarProps.ts` (borde SSR espejo de `getBasesProps`: mismo `Promise.all`, mismos helpers de branding/nav/chrome/tema, fail-closed en la ZONA y fail-soft en el CONTENIDO, serialización explícita `fechaFin`→`fechaFinIso` sin spread), `src/pages/verificar.tsx`, `src/__tests__/server/storefront/getVerificarProps.test.ts` (4). MODIFICADOS: `slugTienda.ts` (+`verificar` en `SLUGS_PAGINA_RESERVADOS`), `paginas.test.ts` (+`page.pag.001c` y +1 assert en `page.pag.002`), `temaEnPaginasDePlataforma.test.ts` (+3 tests; el harness SÍ admitió la página — solo hubo que sumarle `raffle.findFirst` al mock de `db`, porque `/verificar` es la única de las 6 páginas de plataforma que consulta `raffle` directo desde el borde). `tsc` + `next lint` limpios.
- [2026-07-27 01:39] [feature-implementer] F03 — **verificación EN VIVO contra :3001** (dev server ya corriendo, compartido; solo lecturas, cero fixtures nuevos — memoria «la DB de dev ES producción»). Página: `iselk` y `demo-noche` ⇒ 200 con form + `noindex` + disclaimer; `test-bkfpf-uno` (PUBLICADA, 0 sorteos activos) ⇒ 200 con el estado vacío y **sin formulario** (D2 verificado, no asumido); apex ⇒ **404**. Tema (D10): el shell de `/verificar` sale con el `style` **exactamente igual** al de `/bases` en iselk (`background:var(--mantine-primary-color-0)`) y demo-noche con su fondo oscuro. Procedure por HTTP en la tienda real: `NikoChaima72+F14@Gmail.com` (mayúsculas cambiadas a propósito) ⇒ `numeros:[1..8]` — **D6 probado contra Postgres de verdad**, no solo contra el fake; correo desconocido ⇒ `{sorteo:{nombre}, numeros:[], prefijo:null}` idéntico (D4); tienda sin sorteo ⇒ `sorteo:null`; apex ⇒ `NOT_FOUND` neutral. **Rate limit en vivo**: intentos 1–10 OK, **11 y 12 ⇒ HTTP 429** con el mensaje humano, y un `x-forwarded-for` distinto sobre la MISMA tienda sigue pasando ⇒ la clave `tenant+IP` aísla como se diseñó.
- [2026-07-27 01:39] [feature-implementer] F03 — **`frontend-reviewer` APPROVE** (Naming A / Tests A / Documentación B), 0 blockers, y ratificó los 5 puntos que le puse a juicio: el wrap del form a 320 (patrón correcto — `wrap` + `flex-basis` es para que el botón SÍ baje, distinto del gotcha de `miw` que aplica cuando NO deben envolverse), `Button loading` en vez de `Skeleton` (esto es «diálogo con submit», no «pantalla que carga al montar»), `useQuery`+`enabled` con `refetchOnWindowFocus:false` (cada refetch gastaría cuota), el `Record` de copy de error, y `Container size="sm"`. **1 NIT REAL corregido**: mi loader SSR buscaba el Raffle ACTIVO **sin `orderBy`** mientras `verificarTickets` desempata por `createdAt desc` — con dos activos (posible: el «1 ACTIVO por tenant» es invariante de use case, NO constraint de DB) el encabezado habría podido NOMBRAR un sorteo y la búsqueda responder con los tickets de otro. Agregado el mismo `orderBy` + un assert que lo ata (`verificar.props.004`). Es una desviación deliberada del precedente `resolverBasesDelSorteo`, que tampoco lo tiene; queda anotada en el código.
- [2026-07-27 01:39] [feature-implementer] F03 — **para el `feature-tester`**: el reviewer marcó con razón que mi verificación en vivo fue por `curl`, o sea **no ejercita CSS**. El wrap del formulario a **320 px** necesita screenshot real (memoria «gate de diseño a resolución real»); súmalo al check de 320 que F04 ya tiene para el header. Datos útiles del censo read-only que corrí: **con sorteo activo y tickets reales** ⇒ `iselk` (12 tickets, correos `nikochaima72+f14@gmail.com` ⇒ 1–8 y `nikochaima72+f14t3@gmail.com` ⇒ 9–12); **publicada SIN sorteo activo** ⇒ `test-bkfpf-uno`; **tienda oscura con sorteo** ⇒ `demo-noche`. Ninguna tienda tiene `prefijoTicket` configurado hoy, así que los boletos salen desnudos (`1–8`): para ver el prefijo en vivo hay que setearlo en Configuración de alguna tienda.
- [2026-07-27 01:52] [feature-implementer] **F04 implementada**. Único archivo tocado: `src/components/storefront/storefront-layout.tsx` (+54/−3, todo aditivo — I8 respetado al pie: no se tocó `derivarNav`, ni `ANCLAS_QUE_SON_RUTA`, ni el chrome configurable, ni ningún archivo de los carriles in-flight). Header: componente `LinkVerificarTickets` en el `Group` de acciones, con el tratamiento exacto de su vecino `AccesoSesion` (`c="dimmed"`, `shrink-0`, `IconTicket` + `Text visibleFrom="sm"`, `aria-label` siempre ⇒ icon-only bajo `sm`). Footer: `Anchor` junto al de Bases. Los DOS incondicionales (D8). Verificado por curl en `demo-noche` y `prueba`: exactamente 2 ocurrencias de `href="/verificar"`, una dentro de `<header>` y otra dentro de `<footer>`, ambas en el HTML **server-rendered**.
- [2026-07-27 01:52] [feature-implementer] F04 — **`frontend-reviewer` APPROVE** (Compliance A / Naming B / Tests B), 0 blockers. **1 NIT REAL corregido**: había puesto `component={Link}` en el header y un `<Anchor href>` pelado en el footer, justificándolo con «consistencia con el vecino de cada sitio» — y el reviewer demostró que la premisa era falsa: el vecino REAL del header no es el ancla del logo sino `AccesoSesion`, que también usa `href` pelado. O sea el mismo destino navegaba de dos maneras distintas según desde dónde se lo tocara, sin ninguna convención que lo pidiera. Unificados los dos a `component={Link}` (navegación interna del mismo subdominio) con la razón verdadera escrita en el código. El enlace a Bases se deja como está: tocarlo excede el alcance (I8).
- [2026-07-27 01:52] [feature-implementer] F04 — **hallazgo para backlog, NO tocado** (confirmado por el reviewer como fuera de alcance de I8): el enlace «Bases del sorteo» del footer está gateado por `sorteo.data`, que viene de una query de CLIENTE (`useSorteoActivo`) ⇒ **solo aparece post-hidratación**, mientras que los dos links de F04 viajan en el HTML del SSR. La asimetría es preexistente y no la introduce esta feature, pero conviene saberla: el enlace LEGAL de ADR-0008 hoy no existe para un cliente sin JS ni en el primer paint. Además, ojo con el plan: D8 afirma que el ítem «Bases» es incondicional («mismo razonamiento que el ítem Bases incondicional») y en el código NO lo es — el de F04 sí. Queda como candidato a follow-up propio.
- [2026-07-27 01:55] [feature-implementer] **Drift de documentación detectado — DRAFTS SIN APLICAR** (Step 4.5). El modo nóctuño dice «no devuelvas AWAITING», pero la regla de `docs/agents/*` es que **NUNCA** se editan sin permiso explícito del usuario; las dos cosas se concilian dejando el diff escrito acá (opción 3 del menú de drift) en vez de aplicarlo. Son 2 drifts REALES y 2 candidatos menores:
  - **(1) `docs/agents/frontend-conventions.md:221-222`** — la enumeración de páginas de plataforma que heredan tema mínimo quedó incompleta (lo cachó el `frontend-reviewer`). Diff propuesto: ```diff
- - Las páginas que NO son Documento de Página (`/checkout`, `/producto/[id]`, `/checkout/retorno`,
-   `/bases`, `/entrega/[token]`) heredan un tema **MÍNIMO** de la Tienda: fondo de página, par
+ - Las páginas que NO son Documento de Página (`/checkout`, `/producto/[id]`, `/checkout/retorno`,
+   `/bases`, `/entrega/[token]`, `/verificar`) heredan un tema **MÍNIMO** de la Tienda: fondo de página, par
``` (ojo aparte, NO lo toco: esa lista sigue nombrando `/producto/[id]`, que murió con la ENMIENDA v2 de `productos-tipos-digitales`).
  - **(2) `docs/agents/backend-conventions.md`** — sección NUEVA. El repo estrenó su **primer rate limit de requests** (D5 lo dice explícitamente: no había precedente) y además un código nuevo de `DomainError`; sin una línea en las conventions, el próximo que necesite limitar algo lo va a reinventar distinto. Draft, para insertar después de § Procedures tRPC: ```diff
+## Rate limiting de un borde público
+
+Superficie sin sesión que se puede repetir en bucle (hoy: el verificador de tickets) ⇒ limitador
+**in-memory de ventana fija** (`src/server/security/limiteDeIntentos.ts`), instanciado UNA vez a
+nivel de módulo en el router. Reglas:
+
+- **Es fricción anti-script, no un perímetro**: en Vercel la memoria no se comparte entre lambdas,
+  así que el techo real es por instancia. Solo sirve donde el dato expuesto es público por diseño.
+  Si alguna vez hay que proteger algo que NO lo es, esto no alcanza y hay que decirlo en voz alta.
+- **La clave la arma el BORDE** (`tenantId + IP`, la IP desde `ctx.ip`), nunca el dominio: la IP es
+  transporte. El `tenantId` va SÍ o SÍ — sin él, el tráfico de una Tienda le come la cuota a otra.
+- **El gate se consulta dentro del use case, vía un seam `permitirIntento: () => boolean`**, y no
+  como un `TRPCError` suelto en el router. Lo que se compra es poder TESTEAR que con la cuota
+  agotada no se toca la DB — que es la mitad del valor de un rate limit.
+- El corte es un `DomainError("TOO_MANY_REQUESTS")`; `runDomain` lo mapea a su `TRPCError` (429) por
+  el `Record` exhaustivo, que es lo que obliga a `tsc` a no dejar un código nuevo sin mapear.
+- **Falla ABIERTO bajo presión de memoria** (tope de claves ⇒ poda ⇒ vaciado): el peor caso de
+  fallar abierto es un scraper viendo datos públicos; el de fallar cerrado, un usuario legítimo sin
+  servicio por culpa de otro.
```
  - **(3) candidato menor** (`frontend-conventions`, § páginas de plataforma): `/verificar` estrenó `Container size="sm"` — hasta hoy las páginas de plataforma usaban `lg` (contenido denso) o `xs` (solo mensaje). Si aparece una segunda página-form-angosta conviene escribir el criterio; con una sola, escribirlo sería inventar una regla.
  - **(4) candidato menor** (`frontend-conventions`): «un MISMO destino pinned en dos superficies navega igual en las dos» (el NIT de F04). Hoy es un caso; lo dejo anotado por si se repite.
  - **NO toco** `CONTEXT.md`, `docs/adr/` ni `CLAUDE.md` (fuera del rol del implementer). Nada nuevo que sugerir ahí: el vocabulario de esta feature («Número del sorteo», «Comprador», «Tienda») ya está definido, y no emergió ninguna decisión arquitectónica que amerite ADR — el rate limiter es táctico y reversible, explícitamente acotado por D5.
- [2026-07-27 01:57] [feature-implementer] **Implementación completa. F01–F04 escritas, reviewers verdes. `status: implementing` → `testing`.** Gate del implementer: `tsc --noEmit` **limpio en todo el repo**, `next lint` limpio en cada archivo tocado, y **64/64 Vitest** en la corrida filtrada del área (limiteDeIntentos 4 + verificarTickets 9 + getVerificarProps 4 + temaEnPaginasDePlataforma 10 + paginas 12 + getEstadoOrden 9 + basesDelSorteo 7 + slugTienda 3 + faseRetornoCheckout 6 — los últimos cuatro son REGRESIÓN de lo que toqué de refilón). **NO corrí la suite completa ni `npm run check`**: es del `feature-tester`, y con 4 carriles in-flight sin commitear el ruido ajeno sería indistinguible del propio. Reviewers: `backend-reviewer` APPROVE (F01), `frontend-reviewer` APPROVE ×3 (F02, F03, F04). **Cero blockers en las 4 revisiones; 3 NITs, los 3 corregidos** (fake db más permisivo que Postgres en F01, `orderBy` faltante en el loader SSR de F03, `Link` vs `<a>` incoherente en F04). No invoqué al `change-set-reviewer`: el protocolo lo marca OPCIONAL, no hay commit en esta corrida, y su gate es justamente `npm run check` — la suite completa que le toca al tester.
- [2026-07-27 01:57] [feature-implementer] **Resumen de lo que queda para el `feature-tester`** (nada bloqueado, todo declarado): (a) los **9 checkboxes E2E** del plan, con énfasis en los dos que NO puedo cubrir yo porque `curl` no ejercita CSS — el header y el formulario a **320 px** (memoria «gate de diseño a resolución real»; y el peor caso del header es la dueña logueada, donde `AccesoSesion` sí renderiza «Mi panel» al lado del link nuevo); (b) el tema en tienda clara Y oscura (`iselk` / `demo-noche` — ya verificado por `style` del shell vía curl, falta el ojo); (c) que `checkout/retorno` siga mostrando los boletos igual tras la extracción de F02 (el cuerpo del componente es byte-idéntico, pero eso no prueba el render). **Insumos**: tienda con tickets reales = `iselk` (correos `nikochaima72+f14@gmail.com` ⇒ 1–8, `nikochaima72+f14t3@gmail.com` ⇒ 9–12); tienda oscura con sorteo = `demo-noche`; sin sorteo activo = **hay que buscar una viva** (`test-bkfpf-uno`, que usé yo, lo BORRÓ otro carril a mitad de mi corrida — los tenants `test-*` son fixtures efímeros de otras suites, no sirven como insumo estable). Ninguna tienda tiene `prefijoTicket` seteado, así que para ver `ARMY-1043` en vivo hay que configurarlo en alguna.
- [2026-07-27 02:05] [feature-tester] **Vitest del área VERDE: 64/64, 0 fallos** (corrida nocturna autónoma, el usuario delegó el cierre). Desglose: `limiteDeIntentos` 4 + `verificarTickets` 9 + `getVerificarProps` 4 + `temaEnPaginasDePlataforma` 10 + `paginas` 12 + `getEstadoOrden` 9 + `basesDelSorteo` 7 + `slugTienda` 3 + `faseRetornoCheckout` 6. Los 13 IDs que las Validaciones nombran existen y pasan; **no corrí `npm run check` completo** — con 4+ carriles sin commitear, un rojo ajeno no sería distinguible del propio, que es el mismo criterio con el que el implementer cerró.
- [2026-07-27 02:10] [feature-tester] **Carril de navegador: los DOS MCP estaban tomados por agentes VIVOS** (no locks stale — verificado por proceso: `chrome-devtools-mcp` con 12 procesos y `ms-playwright-mcp` con 8, mains creados 00:08 y 00:11). `browser-verify` §0 prohíbe expropiarlos y `claude-in-chrome` no está en mi toolset, así que levanté un **Chrome propio headless manejado por CDP crudo** (perfil aparte en mi scratchpad, `WebSocket` nativo de Node 24, driver en `tmp/cdp.mjs`) — mismo recurso que ya usaron las corridas de `checkout-retorno-numeros-sorteo` y `builder-countdown-presencia`. Cero interferencia con los otros agentes y cero sesión del usuario tocada.
- [2026-07-27 02:40] [feature-tester] **E2E 9/9 VERDE. Cero auto-retries gastados por fallo funcional.** Lo que se ejerció, todo contra `:3001` y todo de solo-lectura: búsqueda real en `iselk` (`+f14` ⇒ `1–8`, `+f14t3` ⇒ `9–12`, contrastado contra los `RaffleEntry.numero` de la DB); correo desconocido ⇒ mensaje neutral D4; estado vacío sin formulario en dos tiendas publicadas sin sorteo; tema comparado contra `/bases` por `getComputedStyle` en clara y oscura; links pinned en 4 tiendas + clicks reales; 320/360 px con y sin sesión; retorno sin regresión; rate limit cortando en el intento 11.
- [2026-07-27 02:40] [feature-tester] **Dos huecos que el implementer dejó anotados, AMBOS cerrados** (los dos requerían cazar una ventana temporal en la DB compartida, porque los tenants `test-*` de otras suites nacen y mueren cada pocos minutos): (1) **tienda publicada SIN sorteo activo** — no existe ninguna estable (las 8 tiendas «de verdad» tienen todas su `Raffle` ACTIVO), pero un censo repetido pescó `test-efectos-sobre-f` y `test-efectos-sobre-g` publicadas y sin sorteo ⇒ estado vacío verificado en vivo, con `input[type=email]` y botón Buscar **ausentes del DOM**, no solo invisibles. (2) **prefijo del tenant** — ninguna tienda estable tiene `prefijoTicket`, así que dejé un poller corriendo contra la DB hasta que apareció `test-recordatorio-54216-filtro` (`prefijoTicket=ARMY`, sorteo activo, entries) y busqué su correo en el navegador ⇒ boleto **`ARMY-1`** con el copy singular correcto («Tu número del sorteo»). El punto único de presentación (`bloquesDeNumerosDelSorteo`, I3) queda probado en vivo con prefijo y sin prefijo.
- [2026-07-27 02:40] [feature-tester] **F02 probada más fuerte que «se ve igual»**: extraje el `outerHTML` del bloque de boletos en `/checkout/retorno` (orden PAGADA real de `iselk`, token de Flow `E78325D7…CEM`) y en `/verificar` para los MISMOS números, y son **idénticos carácter por carácter**. O sea la extracción no solo no cambió el retorno: hace **imposible** que las dos superficies diverjan, que es exactamente lo que D9/I12 venían a comprar. El implementer había probado que el CÓDIGO era byte-idéntico contra `git show HEAD`; esto prueba que el RENDER también lo es.
- [2026-07-27 02:40] [feature-tester] **HALLAZGO — la Bitácora del implementer dice «apex ⇒ 404» y en realidad el apex da 200; NO es un defecto de esta feature.** `http://localhost:3001/verificar` responde **200** con el storefront de «Tienda de la Autora (piloto)». La causa es el **override de DEV F09d** (`configPlataforma.ts`: el apex pelado impersona una Tienda, guardado por `devTiendaAplica({enabled, nodeEnv})` y por lo tanto **inactivo en producción**). No es de `/verificar`: `/bases` y `/checkout` en el apex dan 200 igual. El fail-closed REAL de la zona sí se verificó, con un host que no es tienda ni apex impersonado: `http://127.0.0.1:3001/verificar` ⇒ **404**, idéntico a `/bases`. Corrijo el registro para que nadie persiga un fantasma en la próxima corrida.
- [2026-07-27 02:40] [feature-tester] **Matiz sobre el «peor caso» del header que pidió el usuario**: la dueña logueada **no es** el peor caso de ancho. Con la cookie de sesión real de `iselk.eirl@gmail.com` sobre `iselk`, `AccesoSesion` resuelve `editar` y ese estado **está oculto a propósito** (`acceso-sesion.tsx`: `if (accion.tipo !== "panel") return null`) — la dueña ve el banner de plataforma arriba, no un ítem más en el navbar. El peor caso real es una usuaria logueada que NO es dueña de esa tienda: ahí sí aparece «Mi panel» **al lado** de «Verificar tickets». Lo ejercí en `demo-noche` con la misma cookie y a 320 px entran los cuatro elementos sin overflow (gap mínimo 12 px). Ojo para futuras corridas: `AccesoSesion` monta post-hidratación y su query de autz tarda — en un compile frío tardó >4 s en aparecer y una medición apurada da un falso «Mi panel no renderiza».
- [2026-07-27 02:40] [feature-tester] **Design findings: 1, PREEXISTENTE y fuera del alcance.** En `demo-noche` el `<h1>` de `/verificar` sale con un smear de **falso negrita**: la tipografía de titulares del tenant es **Anton**, que tiene un solo peso, y el `Title order={1} fw={800}` de la página fuerza al navegador a sintetizar la negrita (`textShadow: none`, `webkitTextStroke: 0` — no es una sombra, es el sintetizado). **No lo introduce esta feature**: `/bases` (el precedente que D10 manda espejar) y el `<h1>` de la home del mismo tenant usan `fw` 800 con Anton exactamente igual, o sea `/verificar` es consistente con lo que ya había. Queda como candidato de una tanda de pulido tipográfico, no de este plan. Contraste sin problema (`rgb(201,201,201)` sobre `rgb(36,36,36)`). El resto cumple `docs/design.md`: cero verde, montos ausentes por diseño (esta pantalla no muestra plata), cifras del boleto en mono con `tabular-nums`, motion nula.
- [2026-07-27 02:40] [feature-tester] **Interrupción de entorno, NO de la feature**: a mitad de la corrida el dev server compartido empezó a dar **500 en TODAS las páginas** (`/`, `/bases` y `/verificar` de todos los tenants) con `Cannot find module './6859.js'` desde `.next/server/webpack-runtime.js` — el `.next` corrupto clásico (memorias «una sola instancia» y «el build pisa `.next`»), causado por otro carril, no por mí (solo hice GETs). No maté el server: poleé hasta que se reinició solo (~3 min) y retomé. Todos los checks marcados se corrieron con el server sano.
- [2026-07-27 02:40] [feature-tester] **Follow-up confirmado del que avisó el implementer** (no lo toco, es de otro alcance): el enlace «Bases del sorteo» del footer depende de `useSorteoActivo()`, una query de CLIENTE, así que **aparece recién post-hidratación** — lo vi en vivo: en la primera pasada por `demo-noche` no estaba y volvió a aparecer al esperar 3 s. Los dos links de F04 sí viajan en el HTML del SSR. La asimetría es preexistente y el plan la describía al revés (D8 da «Bases» por incondicional y en el código no lo es); el enlace LEGAL de ADR-0008 hoy no existe para un cliente sin JS.
- [2026-07-27 07:20] [main] **Deploy verificado en producción.** El commit `e0cda2f` (integración de carriles de otro carril, incluye F01–F04 completas) llegó a **READY** en Vercel; smoke: apex 200, `autora`/`iselk` 200, y `https://iselk.sorteatelo.cl/verificar` renderiza el verificador con sus 2 links pinned en el HTML.
- [2026-07-27 07:20] [main] **Pendientes de cierre MATADOS con permiso explícito del usuario («mata los pendientes»)**: (1) los 2 drifts de docs drafteados el 01:55 quedaron APLICADOS tal cual (`frontend-conventions.md` suma `/verificar` a la enumeración de páginas con tema; `backend-conventions.md` gana la sección «Rate limiting de un borde público»). (2) Follow-up del footer CERRADO: el enlace «Bases del sorteo» dejó de colgar de `useSorteoActivo()` — ahora es incondicional y server-rendered como su gemelo, porque `/bases` ya resuelve sola el estado vacío (D5) y es el enlace LEGAL de ADR-0008; de paso quedó con el mismo `component={Link}` que el resto (regla F04) y el Footer perdió su única query de cliente. (3) Design finding del falso negrita CERRADO estructuralmente: `PARES_FONT` gana `displayDeUnSoloPeso` (Anton/`impacto`, Bebas Neue/`cartel`) y `_app` inyecta `font-synthesis-weight:none` para esos tenants — los 30+ `fw={800}` del storefront degradan al peso real de la fuente sin tocar ningún call site. `tsc` limpio + 29/29 tests del área (widgetsV2b, theme, temaEnPaginasDePlataforma).
