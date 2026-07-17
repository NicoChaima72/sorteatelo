---
slug: sorteo-por-producto
status: testing               # planning | implementing | testing | done
owner: nicolas
created: 2026-07-17
related_adrs: [ADR-0012, ADR-0001, ADR-0002, ADR-0005, ADR-0008]
related_context: [Sorteo, Ticket, Participación, Producto, "Producto participante", Orden, ÍtemDeOrden, Entitlement, Carrito, Comprador]

features:
  - id: F01
    behavior: "Schema: Product.participaEnSorteo + OrderItem.cantidad + OrderItem.participaEnSorteo (snapshot) + RaffleEntry.ordinal con @@unique([raffleId, orderId, ordinal]); migración con defaults"
    state: active
  - id: F02
    behavior: "Cantidad end-to-end en el checkout: selector +/− en el carrito, input {productId, cantidad}, precio unitario × cantidad en Decimal server-side, total a Flow"
    state: active
  - id: F03
    behavior: "Efectos post-pago por ticket: K = suma de cantidades de ítems participantes (snapshot); K RaffleEntry con ordinal 0..K-1, idempotente; K=0 ⇒ ninguna entry; DownloadGrant sigue 1 por (orden, producto)"
    state: active
  - id: F04
    behavior: "Panel: toggle participaEnSorteo en el form de producto; conteo del sorteo por ticket (panel + storefront); ejecución sin cambio de algoritmo (draw entre tickets)"
    state: active
---

# Sorteo por producto participante (tickets por cantidad)

## Contexto

Hoy (F02) toda [[Orden]] pagada inscribe al comprador con **una** [[Participación]] (`RaffleEntry`),
sin importar qué compró ni cuánto — idempotencia por `@@unique([raffleId, orderId])`. El [[Sorteo]] es
una inscripción plana por orden. El usuario quiere convertirlo en una **palanca promocional real**:
marcar qué [[Producto]]s participan y premiar la **cantidad** comprada de esos productos con más chances.

Esta feature cambia la **semántica del Sorteo** en el dominio (por eso `domain-planner` + ADR nivel 2,
ver [ADR-0012](../docs/adr/0012-sorteo-por-producto-tickets-por-cantidad.md)): la [[Orden]] pasa a
comprarse **por cantidad**; los **[[Ticket]]s** de una orden = suma de las cantidades de los ítems cuyo
producto participa; cada ticket es una `RaffleEntry` de grano fino; el ganador se sortea entre tickets.
Es **aditiva** sobre F01–F08 ya hechas (no rompe pago, entrega, panel ni storefront existentes) y
reusa el `ejecutarSorteo` random-uniforme de F05 **sin cambiar su algoritmo** (más filas = más chance).

Regla de negocio **ya cerrada por el usuario** (vinculante): flag simple `participaEnSorteo` por
producto; compra por cantidad con selector +/−; tickets = Σ cantidades de participantes (1×⇒1, 3×⇒3,
0 participantes⇒0 tickets⇒ninguna entry, la venta no se compromete); 1 ticket por unidad hoy;
multiplicador >1 por unidad = puerta abierta (no cerrarla, no implementarla).

## Decisiones

- **D1 — Flag simple a nivel Producto, sin FK Product↔Raffle.** `Product.participaEnSorteo Boolean
  @default(false)`. El ticket va al `Raffle` ACTIVO del tenant de la orden; como hay **a lo sumo un
  Raffle ACTIVO por Tienda** (S5, invariante de sembrado/gestión ya vigente), el flag basta — no hace
  falta ligar el producto a un raffle específico. Razón: acoplar el producto a un raffle concreto se
  rompería al cerrar/rotar sorteos; el flag + "1 activo por tenant" es más simple y ya es como
  `aplicarEfectosPostPago` resuelve el raffle (`findFirst` por tenantId+ACTIVO). Ver [[Producto participante]].
- **D2 — `participaEnSorteo` se congela como SNAPSHOT en el `OrderItem` al comprar** (junto al precio,
  I4), no se lee del `Product` vivo en el webhook. Razón: (a) semántica — el trato se congela en la
  compra, como el precio; (b) **idempotencia** — K (número de tickets) debe ser estable entre la primera
  confirmación y un replay; si K se derivara del flag vivo y el Organizador lo toggleara, K cambiaría y
  el conjunto determinístico de ordinales también, **rompiendo exactly-once**. Ver ADR-0012 § idempotencia.
- **D3 — Idempotencia por `ordinal` determinístico.** `RaffleEntry` gana `ordinal Int` y el unique pasa
  de `@@unique([raffleId, orderId])` a `@@unique([raffleId, orderId, ordinal])`. Se crean exactamente K
  filas con `ordinal` 0..K-1 vía `createMany({ skipDuplicates: true })`. Garantía primaria intacta: el
  hook post-pago corre **una sola vez** (transición atómica `PENDIENTE→PAGADO` en `confirmarPagoDeOrden`;
  en replay `count===0` ⇒ el hook no corre). La capa `ordinal`+`skipDuplicates` es defensa determinística
  que preserva exactly-once aunque el hook corriera dos veces. Ver [ADR-0012](../docs/adr/0012-sorteo-por-producto-tickets-por-cantidad.md).
- **D4 — La cantidad afecta tickets y precio, NUNCA los DownloadGrant.** `DownloadGrant` sigue siendo
  **uno por (orden, producto)** — comprar 3 unidades de un PDF da 1 derecho de descarga, no 3. El
  `@@unique([orderId, productId])` del grant no cambia; la lógica de grants de F02 queda intacta.
- **D5 — `OrderItem.precio` sigue siendo el precio UNITARIO congelado.** Se agrega `cantidad`; el
  subtotal de línea = `precio.times(cantidad)` y el `Order.total` (= monto a Flow) se calculan con
  `Decimal` server-side en `iniciarCheckout`. NO se cambia `precio` a subtotal (perdería el unitario y
  rompería la semántica "precio congelado como hoy").
- **D6 — El sorteo se sortea entre TICKETS; `ejecutarSorteo` no cambia de algoritmo.** Ya elige uniforme
  entre las `RaffleEntry`; con N entries por orden participante, esa orden tiene N× chance
  automáticamente. Solo cambian los **rótulos de conteo**: panel y storefront cuentan
  *tickets/participaciones*, no órdenes. El panel agrupa por correo mostrando tickets por participante
  (más honesto que listar 3 correos iguales); el storefront muestra el total de participaciones.
- **D7 — Selector de cantidad en el carrito, sin aritmética de dinero en el cliente.** El carrito gana
  `cantidad` por ítem (≥1) con stepper +/−; persiste en `localStorage` per-slug. El cliente muestra
  precio unitario y cantidad por separado; **no** multiplica ni suma dinero (I4 vigente). El input de
  checkout pasa de `productIds: string[]` a `items: {productId, cantidad}[]`.
- **D8 — Defaults de migración (aditivos, `db push`, sin `--accept-data-loss`).** `participaEnSorteo`
  default `false` (opt-in: no meter productos al sorteo sin querer). `OrderItem.cantidad` default `1`
  (los ítems históricos eran implícitamente 1). `RaffleEntry.ordinal` default `0` (cada `(raffleId,
  orderId)` tenía ≤1 entry ⇒ el unique ampliado se satisface sin colisión). El **seed piloto** marca el
  producto de la autora `participaEnSorteo: true` para demostrar la promo (revisable, S3).
- **D9 — Layering D8 del roadmap intacto.** Router fino → `runDomain()` → use case `domain/<modulo>/` →
  `services/`. Nada de este cambio toca `services/` ni credenciales; es dominio + schema + UI.

## Plan

Orden por dependencia. `schema-guardian` **antes** de tocar `schema.prisma` (I8).

1. **Schema** (`schema-guardian` primero). `Product.participaEnSorteo Boolean @default(false)`;
   `OrderItem.cantidad Int @default(1)` + `OrderItem.participaEnSorteo Boolean @default(false)`;
   `RaffleEntry.ordinal Int @default(0)` y swap del unique a `@@unique([raffleId, orderId, ordinal])`
   (el prefijo `[raffleId, orderId]` sigue cubriendo los lookups por raffle y por (raffle, orden)).
   `db push` aditivo. (F01)
2. **Checkout input + use case.** `schemas.ts`: `iniciarCheckoutInput` → `items: z.array({ productId:
   cuid, cantidad: int ≥1 (≤ tope razonable, ej. 99) }).min(1)`, refine "productId único". `iniciarCheckout`:
   carga productos scoped por tenant, valida existencia/activo, arma `OrderItem` con `precio` (unitario,
   snapshot), `cantidad`, `participaEnSorteo` (snapshot del Product), subtotal `precio × cantidad`
   (Decimal), `total` = Σ subtotales. Monto a Flow = `total.toFixed(0)`. (F02)
3. **Carrito.** `ItemCarrito` gana `cantidad`; `CarritoContextValue` gana `setCantidad(id, n)`
   (y `agregar` inicia en 1). Persistencia y filtro de JSON corrupto contemplan `cantidad`. UI
   (`carrito-ui.tsx`, `catalogo.tsx`, `producto/[id].tsx`, `checkout/index.tsx`): stepper +/− por ítem;
   sin total sumado en cliente. Checkout envía `items: {productId, cantidad}`. (F02)
4. **Efectos post-pago por ticket** (`aplicarEfectosPostPago.ts`). El select de la orden incluye
   `items: { productId, cantidad, participaEnSorteo }`. DownloadGrant: **sin cambio** (1 por ítem/producto).
   Ticket: `K = Σ item.cantidad donde item.participaEnSorteo`. Si K===0 ⇒ omitir entries (log inocuo,
   como "sin raffle activo"). Si hay raffle ACTIVO y K>0 ⇒ `createMany` K filas `{ tenantId, raffleId,
   orderId, email, ordinal: i }` para i en 0..K-1, `skipDuplicates: true`. (F03)
5. **Panel — toggle.** `crearProductoInput`/`actualizarProductoInput` ganan `participaEnSorteo: boolean`;
   `crearProducto`/`actualizarProducto` lo persisten. `productos.tsx`: Switch "Participa en el sorteo"
   en el form. (F04)
6. **Panel — conteo por ticket.** `getSorteoDelPanel`: `totalParticipaciones` = entries.length (tickets);
   `participantes` agrupados por correo con `tickets` (cantidad de entries por correo). `productos.tsx`/
   `sorteo.tsx` del panel muestran tickets por participante + total. `ejecutarSorteo`: **sin cambio de
   lógica** (draw entre entries = entre tickets); revisar sólo rótulos/copy. (F04)
7. **Storefront — conteo.** `getSorteoActivoStorefront` ya devuelve `_count.entries` (ahora = tickets);
   `sorteo.tsx` (storefront) relabela a "participaciones" (revisable). (F04)
8. **Seeds.** `seed-tenants.ts`: el producto de la autora `participaEnSorteo: true`; el de prueba `false`
   (o true — revisable). Ítems/entries existentes ya cubiertos por defaults de D8. (F01)
9. Cierre: `schema-guardian` (schema) + `backend-reviewer` (checkout/efectos) + `frontend-reviewer`
   (carrito/panel) + `change-set-reviewer` (diff completo) + `feature-tester`.

## Validaciones

### F01 — Schema (participaEnSorteo + cantidad + ordinal + unique)

**Vitest** (integration):
- [ ] Un `Product` nace con `participaEnSorteo = false` si no se especifica (default opt-in). — `src/__tests__/server/schema/sorteoPorProducto.test.ts::sorteo.schema.001`
- [ ] Un `OrderItem` acepta `cantidad ≥ 1` y default 1; persiste `participaEnSorteo` como snapshot. — `src/__tests__/server/schema/sorteoPorProducto.test.ts::sorteo.schema.002`
- [ ] Se pueden crear ≥2 `RaffleEntry` para el mismo `(raffleId, orderId)` con `ordinal` distintos; dos con el mismo `(raffleId, orderId, ordinal)` colisionan (unique). — `src/__tests__/server/schema/sorteoPorProducto.test.ts::sorteo.schema.003`

**E2E**: (no aplica — verificable por migración/DB; cubierto por F03 en vivo)

### F02 — Cantidad end-to-end en el checkout

**Vitest**:
- [ ] `iniciarCheckout` con `items: [{productId, cantidad: 3}]` crea 1 `OrderItem` con `cantidad = 3`, `precio` unitario snapshot y `participaEnSorteo` snapshot del Product; `Order.total` = `precio × 3` (Decimal, exacto). — `src/__tests__/server/checkout/iniciarCheckout.test.ts::checkout.iniciar.001`
- [ ] `total` con múltiples ítems de cantidades distintas = Σ `precio × cantidad`, en `Decimal` (sin drift de redondeo); monto a Flow = `total.toFixed(0)`. — `src/__tests__/server/checkout/iniciarCheckout.test.ts::checkout.iniciar.002`
- [ ] `cantidad < 1` o no entera ⇒ rechazo de validación; `productId` duplicado en el input ⇒ rechazo. — `src/__tests__/server/checkout/iniciarCheckout.test.ts::checkout.iniciar.003`
- [ ] Aislamiento: un `productId` de otra Tienda ⇒ `NOT_FOUND` (sin fuga de existencia); producto inactivo ⇒ `INACTIVE`. — `src/__tests__/server/checkout/iniciarCheckout.test.ts::checkout.iniciar.004a/004b/004c`

**E2E** (browser):
- [ ] En un storefront: agregar un producto, subir la cantidad con +/− a 3, ir a pagar ⇒ el total mostrado por Flow = precio×3. — `tasks/e2e-storefront.md#storefront.cantidad.001`

### F03 — Efectos post-pago por ticket

**Vitest**:
- [ ] Orden con 1 ítem participante `cantidad = 3` ⇒ 3 `RaffleEntry` (ordinal 0,1,2), mismo correo, en el raffle ACTIVO del tenant de la orden. — `src/__tests__/server/pago/aplicarEfectosPostPago.test.ts::efectos.ticket.001`
- [ ] Orden con 1 participante×1 + 1 no-participante×5 ⇒ 1 `RaffleEntry` (solo los participantes cuentan). — `src/__tests__/server/pago/aplicarEfectosPostPago.test.ts::efectos.ticket.002`
- [ ] Orden con solo productos no participantes ⇒ **0** `RaffleEntry` (la venta no se compromete; log inocuo). — `src/__tests__/server/pago/aplicarEfectosPostPago.test.ts::efectos.ticket.003`
- [ ] Sin `Raffle` ACTIVO en la Tienda ⇒ 0 entries, aunque haya productos participantes (la venta no se compromete). — `src/__tests__/server/pago/aplicarEfectosPostPago.test.ts::efectos.ticket.004`
- [ ] **Idempotencia**: invocar el hook dos veces sobre la misma orden ⇒ exactamente K entries (skipDuplicates sobre el conjunto determinístico de ordinales), no 2K. — `src/__tests__/server/pago/aplicarEfectosPostPago.test.ts::efectos.ticket.005`
- [ ] `DownloadGrant` = uno por (orden, producto) **independiente de la cantidad** (comprar ×3 de un producto ⇒ 1 grant). — `src/__tests__/server/pago/aplicarEfectosPostPago.test.ts::efectos.ticket.006`
- [ ] Tenancy: `tenantId`/`raffleId` salen de la orden cargada por `tx`, nunca de parámetro. — `src/__tests__/server/pago/aplicarEfectosPostPago.test.ts::efectos.ticket.007`

**E2E** (browser, sandbox):
- [ ] Comprar en un storefront un producto participante ×N (pago sandbox) ⇒ en el panel del sorteo aparecen N participaciones para ese correo; replay del webhook ⇒ siguen N. — `tasks/e2e-storefront.md#sorteo.tickets.e2e.001`

### F04 — Panel toggle + conteo por ticket + ejecución

**Vitest**:
- [ ] `crearProducto`/`actualizarProducto` persisten `participaEnSorteo` (scoped por tenant, nunca de input). — `src/__tests__/server/panel/crearProducto.test.ts::panel.productos.crear.001` + `src/__tests__/server/panel/actualizarProducto.test.ts::panel.productos.actualizar.001` (+ hydration `listarProductosDelPanel.test.ts::panel.productos.listar.001`)
- [ ] `getSorteoDelPanel` devuelve `totalParticipaciones` = nº de tickets y `participantes` agrupados por correo con su conteo de tickets. — `src/__tests__/server/panel/getSorteoDelPanel.test.ts::panel.sorteo.get.001`
- [ ] `getSorteoActivoStorefront` cuenta tickets (entries), sin exponer correos. — `src/__tests__/server/checkout/getSorteoActivoStorefront.test.ts::checkout.sorteo.storefront.001`
- [ ] `ejecutarSorteo`: con 3 entries de correo A y 1 de correo B, el draw uniforme puede caer en cualquiera de las 4 filas (A con 3× chance); idempotencia y auditoría de F05 intactas. — `src/__tests__/server/panel/ejecutarSorteo.test.ts::panel.sorteo.ejecutar.007`

**E2E** (browser):
- [ ] Panel de producto: activar/desactivar "Participa en el sorteo" persiste y se refleja. — `tasks/e2e-panel-organizadores.md#panel.productos.sorteo-toggle.001`
- [ ] Panel del sorteo: muestra tickets por participante y total de participaciones. — `tasks/e2e-panel-organizadores.md#panel.sorteo.tickets.001`

## Invariantes

- **I1 (tenancy, ADR-0005)**: `tenantId`/`raffleId` de tickets y el scoping del raffle salen de la ORDEN
  cargada server-side, nunca de input; el flag/precio/cantidad se leen scoped por tenant.
- **I2 (idempotencia, ADR-0001/0012)**: la transición `PENDIENTE→PAGADO` y el hook corren una sola vez;
  la creación de tickets es exactly-once ante replay vía `@@unique([raffleId, orderId, ordinal])` +
  ordinales deterministas 0..K-1 + `skipDuplicates`. K es estable (snapshot de `participaEnSorteo`/`cantidad`).
- **I3 (la venta es lo primario)**: 0 tickets (sin participantes o sin raffle activo) NO falla ni revierte
  la orden pagada; un problema del sorteo nunca compromete la venta.
- **I4 (dinero)**: `Decimal @db.Decimal(15,2)`; `precio` unitario congelado; subtotal `precio × cantidad`
  y total calculados server-side; el cliente nunca suma/multiplica dinero.
- **I5 (entrega inmune a la cantidad)**: `DownloadGrant` uno por (orden, producto); la cantidad no lo altera.
- **I6 (privacidad)**: el conteo público del storefront jamás expone correos (ADR-0004).
- **I7 (aditivo)**: no se rompe el circuito de pago, entrega, panel ni storefront ya en verde (F01–F08);
  `ejecutarSorteo` conserva su algoritmo y garantías.

## Out of scope

- **Multiplicador de tickets por unidad** (>1 ticket/unidad): puerta abierta, NO se implementa (ADR-0012).
  No se agrega columna `ticketsPorUnidad` todavía.
- Ligar un `Product` a un `Raffle` específico (FK): innecesario con "1 raffle activo por tenant" (D1).
- Cambiar el algoritmo de `ejecutarSorteo`, agregar múltiples ganadores o pesos por-entry.
- Tope de compra por producto más allá de una validación de cordura (ej. cantidad ≤ 99).
- Cuentas de comprador, historial de aceptación, o cualquier cosa fuera de tickets/cantidad.

## Supuestos (resueltos por criterio, revisables)

- **S1**: Tope de cordura `cantidad ≤ 99` por producto (evita abuso/overflow); ajustable si el negocio
  quiere un límite distinto.
- **S2**: El panel del sorteo AGRUPA participaciones por correo mostrando tickets por participante (más
  honesto que listar correos repetidos). Alternativa (listar entries crudas) es una línea de UI.
- **S3**: El seed piloto marca el producto de la autora `participaEnSorteo: true` y el de prueba `false`
  (para ejercer ambos caminos); el Organizador decide en el panel en producción.

## Especialistas a consultar

- `schema-guardian` — **antes** del schema: `participaEnSorteo`, `cantidad`, `ordinal`, swap del unique
  de `RaffleEntry`, clasificación aditivo vs destructivo del `db push`, defaults de migración.
- `backend-reviewer` — `iniciarCheckout` (Decimal × cantidad, snapshot), `aplicarEfectosPostPago`
  (ticketing + ordinal + idempotencia), inputs Zod, layering.
- `frontend-reviewer` — stepper de cantidad en carrito/catálogo/detalle/checkout, toggle del panel,
  rótulos de conteo por ticket.
- `change-set-reviewer` — diff completo de la sesión + este plan antes de commit.
- `feature-tester` — Vitest + E2E asistido (compra ×N en sandbox, replay del webhook, panel del sorteo).
- `troubleshooter` — si el snapshot de `participaEnSorteo` o el swap del unique pelea con datos/tests existentes.

## Bitácora

- [2026-07-17 00:00] [planner-grill] (domain-planner) Plan escrito **sin grill** por instrucción explícita
  del usuario: regla de negocio ya cerrada (flag participaEnSorteo, compra por cantidad, tickets = Σ
  cantidades de participantes, 1 ticket/unidad, multiplicador = puerta abierta). El resto resuelto por
  criterio y marcado como Decisiones D1–D9 / Supuestos S1–S3. Ninguna pregunta resultó estructuralmente
  imposible de asumir.
- [2026-07-17 00:00] [planner-grill] Hallazgo clave del código: el hook post-pago (`aplicarEfectosPostPago`)
  corre **exactly-once** — `confirmarPagoDeOrden` transiciona con `updateMany WHERE estado=PENDIENTE` atómico
  y solo invoca el hook en la transición ganadora (replay ⇒ `count===0` ⇒ hook no corre). El `skipDuplicates`
  de F02 es defensa adicional. Por eso el mecanismo de idempotencia nuevo (D3) es la **capa determinística**
  (`ordinal` 0..K-1 + unique ampliado) que preserva exactly-once ante hipotética doble invocación, con K
  estable gracias al snapshot de `participaEnSorteo`/`cantidad` en el `OrderItem` (D2). Otro hallazgo:
  `ejecutarSorteo` ya sortea uniforme entre `RaffleEntry`, así que N tickets = N× chance **sin cambiar el
  algoritmo** (D6) — el cambio es de rótulos de conteo, no de draw.
- [2026-07-17 00:00] [planner-grill] Docs de dominio mantenidos en la misma sesión: **ADR-0012** creado
  (nivel 2 — cambia modelo de datos y semántica del Sorteo; criterios Nygard: architecturally significant,
  difícil de revertir, restringe features futuras/idempotencia). `CONTEXT.md` actualizado: § Producto (flag),
  nuevo término **Producto participante**, § ÍtemDeOrden (cantidad + snapshot), § Sorteo (draw entre tickets),
  nuevo término **Ticket**, § Participación reescrita ("una Participación = un ticket", ordinal, unique nuevo).
  Roadmap `26-07-16-saas-roadmap.md`: nota en Bitácora (feature aditiva post-F08, no altera el orden de fases).
  **AWAITING USER APPROVAL** — la implementación no arranca sin visto bueno explícito.
- [2026-07-17 14:00] [feature-implementer] Visto bueno explícito del usuario ("visto bueno, go go go").
  `status: planning → implementing`. Read pass completo hecho (CLAUDE.md, ADR-0012 + 0001/0002/0005/0008,
  CONTEXT.md §Producto participante/Ticket/ÍtemDeOrden/Participación, prisma/backend/frontend-conventions,
  design.md, y el código de las 4 áreas: schema, checkout, carrito storefront, panel sorteo/productos, seed).
  Features pendientes: F01, F02, F03, F04.
- [2026-07-17 14:20] [feature-implementer] F01 schema: `schema-guardian` **APPROVE** (3 cambios aditivos +
  corrección de comentarios inline stale de RaffleEntry/OrderItem, aplicada). Editado `schema.prisma`. Al
  correr `npm run db:push` Prisma pide `--accept-data-loss` — NO por pérdida real, sino porque el swap de
  unique `@@unique([raffleId,orderId])` → `@@unique([raffleId,orderId,ordinal])` gatilla su heurística
  conservadora (DROP+CREATE de índice). Verificado en la DB real: 2 RaffleEntry totales, 2 grupos
  `(raffleId,orderId)` distintos, **0 grupos con >1** ⇒ con todas en `ordinal=0` la tripleta es única, sin
  colisión, pérdida de datos = cero. PAUSA: la instrucción del orquestador fue explícita "NO
  --accept-data-loss" y este swap lo exige. Espero confirmación antes de aplicar.
- [2026-07-17 14:35] [feature-implementer] AUTORIZADO por el usuario (opción A): corrido
  `npm run db:push -- --accept-data-loss` UNA sola vez. Constancia: el flag se usó con evidencia de **0
  grupos `(raffleId,orderId)` duplicados** en la DB de dev ⇒ cero pérdida real; el flag es solo un
  tecnicismo de Prisma para el swap de índice único (DROP+CREATE). Nota a futuro: cuando el proyecto migre
  a migraciones versionadas (F10, antes de datos de terceros), este tipo de swap de índice se maneja con
  una migración propia, no con `db push --accept-data-loss`. DB en sync; cliente Prisma regenerado (hubo
  que bajar el dev server :3001 PID 29452 que lockeaba el query engine DLL en Windows, regenerar, y
  relevantarlo). **F01 CERRADA**: schema aplicado + 3 tests DB-backed verdes (sorteo.schema.001/002/003).
  Reviewer de F01 = `schema-guardian` APPROVE previo (cambios aplicados verbatim + comentarios inline
  corregidos). Sin drift de docs en F01 (ADR-0012 + CONTEXT.md ya estaban escritos por el domain-planner).
- [2026-07-17 15:10] [feature-implementer] **F02 IMPLEMENTADA** (cantidad end-to-end). Backend:
  `checkout/schemas.ts` — `iniciarCheckoutInput` pasa de `productIds: string[]` a
  `items: {productId, cantidad(int 1..99)}[]` + refine "productId único" + const `MAX_CANTIDAD_POR_ITEM=99`
  (S1). `iniciarCheckout.ts` — select ahora trae `participaEnSorteo`; cada OrderItem congela precio UNITARIO
  + cantidad + snapshot del flag (D2/D5); `total = Σ precio.times(cantidad)` en `Prisma.Decimal` server-side
  (I4); monto a Flow = `total.toFixed(0)`. Frontend: `carrito.tsx` — `ItemCarrito.cantidad`, `setCantidad`
  clampeado [1,99], `agregar` inicia en 1 (`Omit<...,"cantidad">`), `leerPersistido` normaliza carritos
  viejos sin cantidad. Nuevo `stepper-cantidad.tsx` (reusable, tokens/tabular-nums/aria, sin dinero en
  cliente). Stepper cableado en carrito-drawer, catálogo, detalle de producto y checkout; checkout envía
  `items: {productId, cantidad}`. Archivos: `src/server/domain/checkout/{schemas,iniciarCheckout}.ts`,
  `src/components/storefront/{carrito,carrito-ui,catalogo,stepper-cantidad}.tsx`,
  `src/pages/producto/[id].tsx`, `src/pages/checkout/index.tsx`, test
  `src/__tests__/server/checkout/iniciarCheckout.test.ts` (6/6 verde, checkout.iniciar.001..004c) + E2E
  `storefront.cantidad.001` en e2e-storefront.md. `tsc --noEmit` limpio.
  **Auto-chequeo design.md (UI tocada)**: OK — StepperCantidad usa `variant="default"` (tokens, cero hex/color
  Tailwind crudo), número con `tabular-nums`, íconos Tabler named-import, aria-labels; precios UNITARIOS con
  `clp()`; sin verde/rojo de comercio mal usado; motion default de Mantine (§7). Sin dinero calculado en cliente
  (I4). **Reviewers**: por instrucción del brief ("schema-guardian + backend-reviewer + frontend-reviewer al
  cierre"), los `*-reviewer` de backend/frontend se corren UNA vez al cierre de F04 sobre el diff completo
  (F02+F03+F04), no por micro-feature — reconcilia con el protocolo per-feature sin churn redundante.
- [2026-07-17 15:35] [feature-implementer] **F03 IMPLEMENTADA** (efectos post-pago por ticket).
  `aplicarEfectosPostPago.ts`: el select de la orden ahora trae `items:{productId,cantidad,participaEnSorteo}`;
  `K = Σ cantidad de ítems con participaEnSorteo=true`; crea K `RaffleEntry` con `ordinal` 0..K-1 vía
  `createMany({skipDuplicates:true})`; K=0 (sin participantes) ⇒ log inocuo + return; sin raffle ACTIVO ⇒
  log inocuo + return; DownloadGrant SIN cambio (1 por producto, cantidad no lo altera — I5/D4). Idempotencia
  exactly-once preservada (ordinales deterministas + unique ampliado + K estable por snapshot). Test
  `aplicarEfectosPostPago.test.ts` reescrito a semántica per-ticket (12/12 verde, efectos.001, efectos.ticket.001..007,
  efectos.005/007/008/009); E2E `sorteo.tickets.e2e.001` en e2e-storefront.md.
- [2026-07-17 15:55] [feature-implementer] **F04 IMPLEMENTADA** (panel toggle + conteo por ticket). Backend:
  `panel/schemas.ts` (crear/actualizarProductoInput ganan `participaEnSorteo: z.boolean()`), `crearProducto.ts`
  + `actualizarProducto.ts` (persisten el flag), `listarProductosDelPanel.ts` (devuelve el flag para hidratar
  el form), `getSorteoDelPanel.ts` (`totalParticipaciones` = nº tickets; `participantes` AGRUPADOS por correo
  con `tickets` + `ultimaInscripcion`, S2/D6), `getSorteoActivoStorefront.ts` (rename `totalParticipantes`→
  `totalParticipaciones`, ahora cuenta tickets — decisión táctica: renombré el campo del storefront además del
  panel por consistencia de vocabulario CONTEXT §Ticket/Participación, cubierto por D6). Frontend:
  `admin/productos.tsx` (Switch "Participa en el sorteo" + hidratación + submit + badge "Sorteo"/IconGift en
  tabla), `admin/sorteo.tsx` (StatCard "Participaciones"/tickets + tabla agrupada con columna Tickets + textos
  relabelados), `storefront/sorteo.tsx` (relabel "participaciones"). Seed `seed-tenants.ts`: producto spec gana
  `participaEnSorteo?` (autora true, prueba false, S3) con re-sync SOLO del flag en el else de find-or-create.
  Tests F04 (fake-db) 21/21 verde: crearProducto/actualizarProducto/listarProductosDelPanel/getSorteoDelPanel/
  getSorteoActivoStorefront/ejecutarSorteo (panel.sorteo.ejecutar.007 = draw entre 4 tickets, A 3×). Seed test
  DB-backed 3/3 verde. E2E `panel.productos.sorteo-toggle.001` + `panel.sorteo.tickets.001` en
  e2e-panel-organizadores.md. `tsc --noEmit` limpio. **Dev DB sincronizada** (targeted update, sin tocar
  credenciales): autora producto participaEnSorteo=true, prueba false — la promo queda demostrable en vivo.
  **Auto-chequeo design.md (UI F04)**: OK — Switch de Mantine con `getInputProps(...,{type:"checkbox"})`; badge
  "Sorteo" `variant="light"` (tokens, IconGift Tabler), columna Tickets con `num()` + `tabular-nums`; StatCard
  reusado; español neutro; sin hex/color Tailwind crudo; sin verde/rojo de comercio mal usado. Reviewers
  backend+frontend invocados sobre el diff completo (verdict en entrada aparte).
- [2026-07-17 16:05] [feature-implementer] **Reviewers al cierre — ambos APPROVE, 0 blockers.**
  `backend-reviewer` APPROVE: tenancy/Decimal/idempotencia/layering/venta-primaria OK; 2 nits (subject de Flow
  no incluye cantidad — cosmético, no dinero; re-sync del flag en el seed puede pisar un true manual — intencional
  por S3). `frontend-reviewer` APPROVE: Mantine puro, color por tokens, I4 (cero dinero en cliente), form/hidratación
  OK, contrato tRPC `{participantes:{email,tickets,ultimaInscripcion}[], totalParticipaciones}` coincide 1:1 con
  admin/sorteo.tsx; 2 nits (NIT-1 `MAX_CANTIDAD_POR_ITEM` duplicado client/server por diseño — el cliente no puede
  importar código server, documentado en ambos; NIT-2 `stepper-cantidad.tsx` es patrón nuevo → candidato a drift de
  frontend-conventions, lo propongo en Step 4.5). Ninguno de los 4 nits bloquea; los dejo tal cual (los 2 de backend
  son intencionales/cosméticos; NIT-1 frontend es inevitable por el boundary client/server).
- [2026-07-17 16:20] [feature-implementer] **`change-set-reviewer` APPROVE — gate `npm run check` VERDE**:
  tsc exit 0, next lint "No ESLint warnings or errors" exit 0, vitest **264 passed / 1 skipped (265), 51
  archivos** (suite COMPLETA, no filtrada). 0 blockers. Apliqué su único nit accionable: comentario stale
  `(D2)`→`(D4)` en la línea del bloque DownloadGrant de `aplicarEfectosPostPago.ts` (grants-por-producto es
  D4; comment-only, no re-corro gate). El `prisma:error` de unique en el log es la aserción deliberada de
  `sorteo.schema.003` (colisión esperada dentro de `expect().rejects`), no un fallo. Scratch `tmp/*.ts`
  preexistentes son ajenos (no afectan el gate). **Implementación completa: F01..F04 escritas, 4 reviewers
  verdes (schema-guardian/backend/frontend/change-set), gate composite verde. status → testing.** Sin
  commit/push/feature-tester (instrucción). Checkboxes Vitest siguen `[ ]` a propósito (los marca el
  feature-tester). **Drift de docs pendiente de permiso del usuario (Step 4.5), NO aplicado**: (1)
  `docs/agents/frontend-conventions.md` — consolidar el patrón `StepperCantidad` (stepper +/− del storefront)
  + el carrito con `cantidad`/`setCantidad`; (2) `docs/agents/prisma-conventions.md` — lección operativa: un
  swap/ampliación de `@@unique` (DROP+CREATE de índice) SIEMPRE pide `--accept-data-loss` aunque sea aditivo,
  verificar 0 duplicados antes. Ambos con diff propuesto en el resumen al usuario (opciones 1-4).
