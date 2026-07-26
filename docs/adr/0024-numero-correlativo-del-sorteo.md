# Número del sorteo: correlativo público por Raffle, asignado con contador atómico en la transacción post-pago

> Aceptado 2026-07-26 (grill `tasks/26-07-26-correo-sistema-correos-comprador.md`, visto bueno explícito del usuario). Contexto de investigación: `.scratch/sistema-correos/investigacion.md` (gaps G1/G2).

## Contexto

`RaffleEntry.ordinal` (ADR-0012) es un **discriminador 0..K-1 dentro de la orden** — una capa defensiva de idempotencia, no un identificador del ticket en el sorteo: dos compradores distintos tienen ambos el ticket `0`. Eso hace **imposible decirle al [[Comprador]] "tus números son 1043–1092"**, que es el contenido central de la confirmación de compra, los recordatorios y los correos de resultado (catálogo C1–C5), y una promesa que la landing ya hace («ves tu número»). Además, `Raffle` registra `ganadorEmail` pero **no qué ticket ganó**: el número ganador no existe.

## Decisión

1. **Nace el concepto [[Número del sorteo]]**: cada [[Ticket]] (= cada `RaffleEntry`) recibe un `numero Int` **correlativo por [[Sorteo]]**, desde 1, con `@@unique([raffleId, numero])`. El `ordinal` **se mantiene** con su rol de idempotencia intra-orden (ADR-0012) — son dos conceptos distintos y coexisten.
2. **Asignación atómica en la misma `$transaction` de `aplicarEfectosPostPago`**, vía **contador en `Raffle`** (p.ej. `ultimoNumero`): la orden reclama un rango de K números incrementando el contador en un solo UPDATE; el row-lock de la fila `Raffle` **serializa confirmaciones concurrentes del mismo sorteo** sin locks distribuidos ni `SERIALIZABLE`.
3. **El replay se corta ANTES de reclamar rango**: si ya existen `RaffleEntry` de esa `(raffleId, orderId)`, los efectos son no-op — el replay del webhook **no consume números**. La garantía primaria sigue siendo la transición atómica `PENDIENTE→PAGADO` (ADR-0001); el `@@unique([raffleId, orderId, ordinal])` queda como capa defensiva; el `@@unique([raffleId, numero])` es la capa final: jamás dos tickets con el mismo número.
4. **Un número asignado es inmutable y no se reutiliza.** Una vez comunicado a un comprador es una promesa pública; ni fallas parciales (la `$transaction` revierte contador y entries juntos) ni re-ejecuciones lo cambian. No se promete ausencia de huecos — se promete unicidad e inmutabilidad.
5. **El sorteo registra el ticket ganador** (la `RaffleEntry`/número ganador, además del snapshot `ganadorEmail`), para que "salió el 1057" sea un hecho auditable y comunicable. La forma exacta (FK vs snapshot) la vetea `schema-guardian`.
6. **Presentación (D8)**: rangos (`1043–1092`), **sin prefijo de canal hoy**. Decisión tomada a propósito: si mañana hay venta offline o tickets bonus, el canal es una **columna nueva** con prefijo presentacional — el `numero` **no se re-significa** ni se re-particiona.
7. **Backfill**: las entries preexistentes reciben números por orden de `createdAt` dentro de su sorteo, una sola vez.

## Razón

El correlativo por sorteo es lo que el mercado entero (y el usuario: "¿no es un auto_increment?") espera de una rifa: números consecutivos, verificables, en rango. Alternativas descartadas: **`createMany({skipDuplicates})` a secas** no puede asignar correlativos (no sabe cuántos existen); **`SELECT max(numero)+1` bajo lock** exige locking explícito o aislamiento serializable y es frágil ante retries; **secuencias Postgres por sorteo** requieren DDL dinámico fuera de Prisma; **numerar al mostrar** (derivar de ordinal) reparte el mismo número a compradores distintos. El contador en la fila padre es el patrón más simple que da atomicidad, serialización y cero infra nueva — coherente con «simple y barato».

## Consecuencias

- **Schema** (`schema-guardian` obligatorio antes de `db push`): `RaffleEntry.numero` + unique nuevo, contador en `Raffle`, referencia/snapshot del ganador. El backfill debe correr antes de activar el unique o en el mismo paso.
- `aplicarEfectosPostPago` cambia de forma: de `createMany` ciego a **chequear-existencia → reclamar rango → crear K filas** dentro de la `$transaction`. El contrato externo (exactly-once, misma `$transaction` que `DownloadGrant`) no cambia.
- El panel del Organizador y toda superficie futura hacia el Comprador (correos, retorno, buscador de tickets) hablan en Números del sorteo; el `ordinal` no se muestra nunca — es plomería.
- Puerta abierta sin rework: canal/prefijo (columna nueva), multiplicador de tickets (ADR-0012) — K crece, el mecanismo de rango es el mismo.
