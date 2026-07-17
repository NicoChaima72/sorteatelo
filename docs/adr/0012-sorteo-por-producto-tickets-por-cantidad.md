# Sorteo por producto participante: tickets por cantidad (una Participación = un ticket)

Cambia la semántica del [[Sorteo]] de una Tienda. **Antes** (F02): comprar una [[Orden]] pagada inscribía al comprador con **una** [[Participación]] (`RaffleEntry`), sin importar qué ni cuánto compró — idempotencia por `@@unique([raffleId, orderId])` (una entry por orden). **Ahora**:

1. Cada [[Producto]] tiene un flag simple `participaEnSorteo` (sí/no), editable en el panel. Una Tienda mezcla productos participantes y no participantes.
2. La compra es **por cantidad**: el [[ÍtemDeOrden]] lleva `cantidad` (≥1) y el checkout la soporta (selector +/− en el carrito).
3. Los **tickets** de una orden = **suma de las cantidades de los ítems cuyo producto participa**. Cada ticket es **una** `RaffleEntry` de grano fino en el [[Sorteo]] ACTIVO de la Tienda de la orden. Casos canónicos: participante×1 (+ otros no participantes) ⇒ 1 ticket; participante×3 ⇒ 3 tickets; solo no participantes ⇒ 0 tickets ⇒ **ninguna** `RaffleEntry` (la venta no se compromete — mismo espíritu que "sin sorteo activo").
4. El ganador se sortea **entre tickets** (más tickets = más chance): es el punto de la promo.

Razón: el Organizador necesita una palanca promocional real ("compra más del producto X y tenés más chances"), no una inscripción plana por orden. El grano fino (una entry por ticket) hace que el sorteo uniforme existente ya premie la cantidad **sin tocar la lógica del sorteo** — más filas = más probabilidad. Se prefiere sobre alternativas más complejas (pesos/`ticketsCount` por entry) porque mantiene el modelo simple, auditable fila-a-fila, y compatible con el `ejecutarSorteo` random-uniforme ya construido y probado (F05).

## Decisión de idempotencia (crítica, ADR-0001)

El invariante de exactly-once ante replay del webhook se **preserva**, no se degrada:

- **Garantía primaria (ya existente)**: `confirmarPagoDeOrden` fija la transición `PENDIENTE→PAGADO` con un `updateMany WHERE estado = PENDIENTE` atómico; el hook post-pago se invoca **una sola vez** (en la transición ganadora; en replay `count === 0` ⇒ el hook no corre). Esto no cambia.
- **Capa defensiva determinística (nueva)**: `RaffleEntry` gana una columna `ordinal Int` y su unique pasa de `@@unique([raffleId, orderId])` a **`@@unique([raffleId, orderId, ordinal])`**. Los efectos post-pago generan exactamente K filas con `ordinal` 0..K-1 vía `createMany({ skipDuplicates: true })`. Ante una hipotética segunda invocación, el mismo conjunto determinístico de `(raffleId, orderId, ordinal)` colisiona y se omite ⇒ exactly-once aunque el hook corriera dos veces.
- **K debe ser estable entre corridas**: por eso el flag `participaEnSorteo` se **congela como snapshot en el `OrderItem` al comprar** (junto al precio, I4), no se lee del `Product` vivo en el webhook. Si el Organizador togglea el flag entre la compra y el pago (o entre el pago y un replay), K no cambia: los tickets reflejan el trato tal como estaba **al comprar**, y el conjunto de ordinales es reproducible. Sin snapshot, un flip cambiaría K y el conjunto de ordinales, rompiendo exactly-once y la semántica de "el trato se congela en la compra".

## Consecuencias

- **Schema** (aditivo, `db push`; `schema-guardian` antes): `Product.participaEnSorteo Boolean @default(false)`; `OrderItem.cantidad Int @default(1)` + `OrderItem.participaEnSorteo Boolean @default(false)` (snapshot); `RaffleEntry.ordinal Int @default(0)` con el unique ampliado. Datos existentes: productos ⇒ no participan (opt-in); ítems viejos ⇒ cantidad 1; entries viejas ⇒ ordinal 0 (cada `(raffleId, orderId)` tenía ≤1 entry ⇒ el nuevo unique se satisface sin colisión, sin `--accept-data-loss`).
- **Entitlement inmune a la cantidad**: `DownloadGrant` sigue siendo **uno por (orden, producto)** — comprar 3 unidades de un PDF da 1 derecho de descarga, no 3. La cantidad afecta **tickets y precio**, nunca los grants. El `@@unique([orderId, productId])` del grant no cambia.
- **Dinero (I4)**: `OrderItem.precio` sigue siendo el precio **unitario** congelado; el subtotal de línea = `precio × cantidad` y el `Order.total` (= monto a Flow) se calculan con `Decimal` server-side en `iniciarCheckout`. El cliente nunca suma ni multiplica dinero.
- **Sorteo sin cambios de algoritmo**: `ejecutarSorteo` ya elige uniforme entre las `RaffleEntry` — con N entries por orden participante, esa orden tiene N× chance automáticamente. Solo cambian los **rótulos de conteo** (el panel/storefront cuentan *tickets/participaciones*, no órdenes; el panel puede agrupar por correo mostrando tickets por participante).
- **Puerta abierta (no se implementa)**: que un producto dé >1 ticket por unidad (multiplicador). Se abre sin rework mayor: snapshot un `ticketsPorUnidad Int` en el `OrderItem` y K = `Σ cantidad × ticketsPorUnidad`. Hoy es 1 ticket por unidad; no se agrega la columna todavía (YAGNI).
- **Responsabilidad legal (ADR-0008) intacta**: las bases del sorteo son del Organizador; el mecanismo de tickets no traslada responsabilidad a la Plataforma. Si las bases del piloto describen la mecánica de tickets, es contenido del Organizador.
- **Aislamiento por tenant (ADR-0005) intacto**: los tickets se crean en el `Raffle` ACTIVO del `tenantId` **derivado de la orden server-side**, nunca de input.
