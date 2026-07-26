# Máquina de correos: ledger `CorreoEnviado` + cron horario reconciliation-based, bajo la cuota de Resend Free

> **Estado: aceptado** (2026-07-26, grill `tasks/26-07-26-correo-sistema-correos-comprador.md`,
> respuestas explícitas del usuario a T1/T2 y a la restricción de cuota). Investigación:
> `.scratch/sistema-correos/investigacion.md` §3. Sucede a ADR-0010 (adapter Resend) sin
> reemplazarlo: el adapter sigue siendo el borde HTTP; esto es la capa de orquestación arriba.
>
> _Nota de numeración_: el plan reservaba el número 0025 para esta decisión, pero 0025 lo tomó el
> ADR del MCP del Organizador (renombrado desde un 0024 duplicado) y 0026 la facturación de la
> plataforma. Esta decisión es la 0027.

## Contexto

Hoy existe UN correo (descarga post-pago, ADR-0010): se envía inline en el camino del webhook de
Flow, su único registro es un `console.log`, y si Resend falla el plan B es que un humano lo note
y use el reenvío manual del panel. El catálogo C1–C5 (confirmación con [[Número del sorteo]],
recordatorios T-48h/T-6h, resultado ganador/no-ganador) exige **envíos programados por fecha**,
**blasts a N compradores** y la garantía de que un correo **jamás salga dos veces** — con un
dominio de envío compartido por todas las Tiendas, un duplicado o un blast descontrolado quema la
reputación de TODOS los tenants.

Dos restricciones de plataforma mandan el diseño:

- **Vercel Cron es best-effort**: puede saltarse corridas y puede duplicarlas. Cualquier job que
  pregunte «¿qué toca justo ahora?» pierde envíos o los repite.
- **Resend queda en plan Free por decisión del usuario** («van a ser 100 correos por un largo
  tiempo»): **100 correos/día, 3.000/mes, 1 dominio verificado**. Un blast de 300 correos se corta
  a la mitad. La máquina tiene que tolerar la cuota como condición normal de operación, no como
  error.

## Decisión

1. **Ledger persistente `CorreoEnviado`**: toda intención de envío se escribe como fila
   (`tenantId`, `tipo`, `clave`, `email` snapshot, `estado PENDIENTE|ENVIADO|FALLIDO`, `intentos`,
   `proveedorId`, `ultimoError`) con **`@@unique([tipo, clave])`** como llave de idempotencia.
   Claves naturales determinísticas: `orderId` (confirmación), `raffleId:offsetHoras:email`
   (recordatorio), `raffleId:email` (resultado).
2. **Protocolo claim → send → confirm**: el claim es `createMany({ skipDuplicates: true })` —
   dos corridas concurrentes no pueden reclamar la misma fila, sin locks distribuidos. Enviar y
   recién después confirmar (`ENVIADO` + `proveedorId`).
3. **Modo de falla elegido: falla segura = el correo NO sale.** Si el proceso muere entre claim y
   send, la fila queda `PENDIENTE` y la corrida siguiente la recupera. Enviar-primero arriesga
   duplicados, que son irrecuperables. Para un sorteo, un correo tarde es mucho mejor que uno
   repetido.
4. **Scheduler: Vercel Cron horario reconciliation-based** (`/api/cron/correos`, gated por
   `CRON_SECRET`). El job nunca pregunta «¿qué toca ahora?» sino **«¿qué está vencido y sin
   enviar?»** — una corrida perdida se recupera sola a la hora siguiente; una duplicada no hace
   nada (el claim la frena). UTC puro: la hora de Chile se calcula con `Intl.DateTimeFormat` +
   `America/Santiago` dentro del use case (Chile tiene DST), jamás en la expresión cron.
5. **Reintentos con presupuesto**: sweeper sobre `PENDIENTE` viejo con `intentos < 3`; al tercer
   fallo real, `FALLIDO` y visible en el panel. **La cuota agotada NO es un fallo real**: un
   429/rechazo por límite de Resend deja la fila `PENDIENTE` **sin consumir intentos** — es una
   condición retryable estructuralmente distinta de un bounce o un 4xx de payload. Así un blast
   > 100/día se **drena en los días siguientes** sin degradar correos sanos a `FALLIDO`.
6. **Envío en lote**: el adapter (ADR-0010) crece con `enviarLote()` vía `POST /emails/batch`
   (chunks de 100 — el rate limit de Resend es 10 req/s), `headers`/`tags`/`Idempotency-Key`
   opcionales y `AbortSignal.timeout(8000)`. La `Idempotency-Key` (ventana 24 h de Resend) es una
   segunda línea de defensa; la primera y definitiva es el ledger.
7. **La confirmación de compra (C1) usa la misma máquina**: su fila `PENDIENTE` se escribe
   **dentro de la `$transaction` de `confirmarPagoDeOrden`** (un efecto post-pago más, junto a
   `DownloadGrant` y `RaffleEntry`); el envío sale post-commit vía `waitUntil` de
   `@vercel/functions` (excepción explícita al «cero deps» de ADR-0010 — pages router no tiene
   `after()`), y si falla, el cron lo drena. **El webhook de Flow nunca espera a Resend.**
8. **Un solo dominio de envío por ahora**: todo sale de `sorteatelo.cl` (verificado en Resend).
   El remitente/dominio de envío es **dato de configuración, no constante** — el seam para el
   upgrade.

## Trigger de upgrade (decisión tomada-y-diferida, D2 del plan)

La separación `notificaciones.sorteatelo.cl` (transaccional) / `avisos.sorteatelo.cl`
(recordatorios) está **aceptada en principio** pero diferida con el plan Free. **Se reactiva —
contratar Resend Pro (~USD 20/mes) + crear los subdominios DNS — cuando el volumen real se
acerque a los topes del Free (100/día o 3.000/mes)**, o antes si un blast de recordatorios empieza
a competir con los correos transaccionales por la cuota diaria. Gracias al seam del punto 8, el
switch es config + DNS, no código.

## Razón

- **Contra `scheduled_at` de Resend como scheduler**: tope 30 días, sin PATCH (reagendar =
  cancelar + recrear), y el contenido del recordatorio depende del estado AL MOMENTO del envío
  (números, fecha movida, tienda suspendida). Poner el agendamiento en un tercero duplica la
  fuente de verdad.
- **Contra colas externas** (Vercel Queues beta, Inngest $99/mes, trigger.dev): infra y vendor
  nuevos para un job que son tres llamadas HTTP. Contradice «simple y barato».
- **Contra enviar sin ledger**: con cron best-effort y cuota diaria, la idempotencia y el backlog
  consultable no son opcionales — son lo que convierte «se cortó a la mitad en silencio» en «se
  termina de enviar mañana y se ve en el panel».

## Consecuencias

- Schema nuevo `CorreoEnviado` (tenant-scoped, ADR-0005) — `schema-guardian` obligatorio.
- `vercel.json` nace en el repo (primer cron del proyecto); `CRON_SECRET` entra a `src/env.js`.
  Requiere Vercel Pro (ya asumido, ADR-0015).
- Convención nueva «jobs reconciliation-based» en `docs/agents/backend-conventions.md` (hoy el
  único patrón de side-effects es el decorator post-commit síncrono).
- Todo correo futuro (C6–C10, facturación si migra, avisos al Organizador) nace sobre esta
  máquina: tipo nuevo + clave natural nueva, cero infra nueva.
- Los `FALLIDO` necesitan una superficie (panel) — un ledger que nadie mira es un `console.log`
  con más pasos.
