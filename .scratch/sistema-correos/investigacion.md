## Sistema de correos de Sortéatelo — propuesta unificada

> Síntesis de los 4 informes (benchmark de confirmación, benchmark de recordatorios/resultado, técnica Resend/scheduling, mapeo del repo) + verificación directa contra el código en `main` al 2026-07-26.
>
> **Corrección de premisa:** el brief dice "hoy NO existe ningún correo". Es falso: F04 ya entregó el **correo de descarga post-pago** (`src/server/domain/correo/plantillaDescarga.ts`, subject `"Tu compra en <Tienda>: enlaces de descarga"`), su adapter Resend por `fetch` crudo, el decorator post-commit y el reenvío manual desde el panel. Lo que falta es todo lo demás — y, sobre todo, **los números del sorteo no están en ese correo, y hoy ni siquiera existen como dato** (ver §4, gap G1).

---

## 1. Catálogo de correos propuesto

| # | Correo | Trigger | Destinatario | Contenido clave | Prioridad |
|---|---|---|---|---|---|
| C1 | **Confirmación de compra** (extiende el correo de descarga ya existente, no lo duplica) | Transición real `PENDIENTE→PAGADO` confirmada server-side contra Flow (`conCorreoPostPago`) | Comprador (`Order.email`) | Agradecimiento en voz de la Tienda · **sus números del sorteo, en rango** (`1043–1092`) · link a la página que **re-firma** la URL de descarga (no la URL firmada pegada) · resumen de orden (nº, fecha, monto, cantidad) · **cuándo cierra y se realiza el sorteo** (`Raffle.fechaFin`, en hora de Chile) · link a las bases + disclaimer ADR-0008 | **F1** |
| C2 | **Recordatorio T-48 h** | Cron horario: `Raffle` ACTIVO con `fechaFin` dentro de la ventana [48 h, 49 h) | Compradores con `RaffleEntry` en ese sorteo | "Tu sorteo en `<Tienda>` cierra el viernes" · **sus números repetidos** · fecha/hora exacta con zona horaria · CTA único · link a bases · **one-click unsubscribe** | **F1** |
| C3 | **Recordatorio T-6 h ("última llamada")** | Cron horario, ventana [6 h, 7 h) | Ídem C2 | Igual que C2, tono de cierre; el CTA de compra pesa más acá | **F1** |
| C4 | **Resultado — ganador** | Ejecución del sorteo (`Raffle.ejecutadoAt` pasa de null a fecha) | `Raffle.ganadorEmail` | Felicitación con nombre del sorteo y premio · **número ganador** · **instrucciones y plazo para reclamar** · canal de contacto (= reply-to del Organizador) | **F1** |
| C5 | **Resultado — no ganaste** | Mismo evento que C4 | Todos los participantes ≠ ganador (dedup por email) | Gracias · **el número ganador** · **los números que jugaron** · link a la verificación pública del sorteo · sin promo adentro (ver §2 D4) | **F1** |
| C6 | **Recordatorio T-7 días** | Cron, solo si `fechaFin − fechaInicio > 14 días` | Ídem C2 | Informativo, sin urgencia | F2 |
| C7 | **Aviso de venta al Organizador** | Mismo post-commit que C1 | Emails con membresía del tenant | Monto, producto, nº de tickets otorgados | F2 |
| C8 | **Aviso de rebote / correo no entregado** | Webhook Svix `email.bounced` / `email.complained` | Organizador | "El correo a `x@y.cl` rebotó" + botón de corregir y reenviar | F2 |
| C9 | **Descuento de consuelo** | 24–48 h después de C5 | No ganadores con opt-in | Código/beneficio para el próximo sorteo — **correo de marketing separado, a propósito** | F2 |
| C10 | **Recuperación de checkout abandonado** | Cron sobre `Order` `PENDIENTE` con antigüedad > N h | Comprador que dejó email y no pagó | "Tu compra quedó a medias" | F2 (requiere consentimiento explícito, ver §2 D5) |
| — | *Reenvío manual de la confirmación desde el panel* | — | — | **Ya existe** (`reenviarCorreoDescargaDeOrden.ts`); solo hay que actualizarlo cuando C1 cambie de plantilla | hecho |

### Justificación de la cadencia (2 recordatorios en F1, no 4)

- **Kickstarter**, que vive de la conversión en las últimas horas y tiene datos de millones de campañas, manda exactamente **dos**: T-48 h y T-8 h. **Eventbrite** manda **uno** (T-48 h) por defecto. El consenso de lifecycle email pone el techo en 3 y advierte "sharply diminishing returns and rising unsubscribe risk" más allá de eso.
- Los datos de baja respaldan la moderación: los flujos automatizados desuscriben **0,182 %** vs. 0,067 % de los transaccionales (~2,5× peor), y el motivo #1 declarado de baja es "demasiados correos" (31 %). Con `<0,3 %` de spam rate como umbral de Gmail y **un dominio compartido por todas las tiendas**, cada recordatorio de más es riesgo sistémico, no solo ruido.
- Por eso: **T-48 h (el ancla de la industria) + T-6 h (el que convierte)** como línea base; **T-7 d solo para sorteos largos** (>14 días), donde 48 h después de semanas de silencio llega en frío.
- **Techo duro: 3 correos de recordatorio por sorteo por comprador**, con supresión cruzada si el mismo email compró varias veces en el mismo sorteo (hoy `RaffleEntry` tiene una fila por ticket — hay que agrupar por email antes de enviar).
- **Segmentación robada a Kickstarter:** ellos excluyen a quien ya respaldó. Nosotros no podemos excluir al comprador (es el único que tiene números), pero sí **cambiar el CTA**: al que ya compró se le informa ("estos son tus números"); el CTA de "compra más números" es una decisión a validar (§2 D3), no un default.

---

## 2. Decisiones de producto a validar con el usuario

**D1 — Remitente: ¿se mantiene "Tienda X · vía Sortéatelo"?**
Opciones: (a) friendly-from de plataforma + reply-to del Organizador [**ya implementado**]; (b) dirección verificada del Organizador; (c) dominio propio del tenant autenticado.
Industria: Rafflebox y Zeffy mandan todo desde su propio dominio; Eventbrite y Ticket Tailor usan From de plataforma + reply-to del organizador; Shopify **reescribe** el From a `store+123@shopifyemail.com` cuando el dominio del comercio tiene DMARC en enforcement.
Recomendación: **mantener (a) tal cual — es el estado del arte y ya está construido.** (c) queda como upgrade de F08 vía Domains API de Resend; el seam a dejar hoy es que `construirFrom()` reciba el dominio de envío como dato, no como constante.

**D2 — ¿Separar subdominios de envío?**
Opciones: (a) todo por `no-reply@sorteatelo.cl` (apex, hoy); (b) `notificaciones.sorteatelo.cl` para transaccional + `avisos.sorteatelo.cl` para recordatorios.
Industria: Eventbrite manda recordatorios desde un subdominio distinto (`reminder.eventbrite.com`); Rafflebox usa `tickets.rafflebox.org`; Resend recomienda subdominios explícitamente.
Recomendación: **(b), y es la decisión de mayor palanca por menor costo del informe.** Un blast de recordatorios que junte quejas de spam no puede contaminar la entregabilidad del correo con el PDF comprado, que es el que *no puede fallar*. Costo: 2 constantes + registros DNS. **Requiere plan Pro de Resend (Free = 1 dominio).**

**D3 — ¿CTA de "comprar más números" en los recordatorios?**
Opciones: (a) recordatorio puramente informativo; (b) CTA de compra; (c) informativo en T-48 h, CTA de compra en T-6 h.
Industria: Kickstarter separa por segmento y advierte al creador que a los backers existentes hay que ofrecerles subir el pledge "**without pressure**"; Eventbrite mantiene los recordatorios operativos, con CTAs blandos.
Recomendación: **(c)** — pero con conciencia del costo legal: en cuanto el CTA principal es vender, el correo **es marketing** bajo el test de "primary purpose" y bajo el art. 28 B chileno. La postura barata y defendible es **tratar los tres recordatorios como marketing** (con opt-out) y no discutir plantilla por plantilla.

**D4 — Correo de "no ganaste": ¿a todos? ¿con el nombre del ganador? ¿con promo adentro?**
Opciones: (a) no notificar; (b) notificar limpio; (c) notificar con descuento de consuelo.
Industria: **RallyUp lo tiene automático y el default es notificar**, y agrega el nombre del ganador por defecto (removible); **Raffall** notifica a *todos* cuando el sorteo se completa; en Chile la vara (YoSorteo.cl) es un mail manual al ganador.
Recomendación: **(b) mandarlo a todos, limpio y transaccional, con el número ganador pero SIN el nombre/email del ganador por defecto** — publicar el nombre de un ganador es tratamiento de dato personal bajo la Ley 21.719 (plena vigencia 1-dic-2026) y necesita base de licitud + aviso en las bases. El descuento va como C9, correo aparte de marketing 24–48 h después: metido dentro de C5, contamina el primary purpose de un correo que hoy es transaccional. **En un mercado donde la sospecha de "está arreglado" es el riesgo reputacional #1, este correo es la mejor defensa que existe y cuesta casi nada.**

**D5 — Opt-in de recordatorios en el checkout: ¿premarcado, no premarcado, o inexistente?**
Opciones: (a) sin checkbox, todos reciben recordatorios (apoyándose en "es relacional"); (b) checkbox **no premarcado**; (c) checkbox premarcado.
Industria/ley: la Ley 21.719 exige consentimiento "libre, informado, específico, inequívoco y **verificable**" para marketing directo y **prohíbe las casillas premarcadas**; el art. 28 B (vigente hoy) ya exige canal de baja. Gmail exige one-click unsubscribe RFC 8058 en marketing.
Recomendación: **(b), con `timestamp + IP + texto exacto mostrado` persistidos** — el consentimiento verificable es una columna en la DB, no una intención. Y el consentimiento es **por tenant**: el comprador consintió recibir correos de *esa tienda*, no de la plataforma ni de las demás.

**D6 — ¿Quién figura como responsable en el pie del correo?**
El art. 28 B exige "la identidad del remitente" en toda comunicación promocional, y el ADR-0008 pone la responsabilidad del sorteo en el Organizador. Hoy `Tenant` no tiene razón social ni RUT.
Recomendación: **pie con nombre/razón social del Organizador + link a bases + "Sortéatelo provee la infraestructura"**, replicando la advertencia de Ticket Tailor en el ToS (las consultas de compradores se derivan al Organizador). Requiere campo nuevo (gap G7).

**D7 — ¿La plataforma se registra en el Portal del Proveedor de SERNAC ("No Molestar")?**
Obliga a procesar un **reporte diario** y responder en ≤1 día hábil; incumplir sale hasta 300 UTM por consumidor. Recomendación: **lo absorbe la plataforma, no cada Organizador** (no lo van a hacer) — pero es un job recurrente, no un trámite único. Decisión con costo operativo real: vale la pena confirmarla antes de F08.

**D8 — Presentación de los números: ¿rango o lista? ¿con prefijo de canal?**
Industria: RallyUp muestra **rangos** (`W100–W150`) con prefijo por canal (`W` online, `P` papel, `T` bonus).
Recomendación: **rango**, y decidir ahora si los números llevan prefijo — **es gratis hoy y carísimo retroactivamente** si mañana se venden números offline o se regalan bonus.

---

## 3. Arquitectura recomendada

### 3.1 Dónde se dispara la confirmación (C1) — reusar lo que ya existe

Nada de una segunda ruta. El camino es el que ya está cableado:

`src/pages/api/webhooks/flow.ts:63-69` → `src/server/pago/conCorreoPostPago.ts:26-48` (dispara **post-commit** y **solo** cuando `resultado.transicion === "PAGADO" && !resultado.yaProcesado`) → `src/server/domain/correo/enviarCorreoDescargaDeOrden.ts` → `src/server/services/correo.ts`.

Tres cambios quirúrgicos:

1. **La plantilla crece con el sorteo.** `plantillaDescarga.ts` pasa a recibir los números y la fecha de cierre del `Raffle` de la orden. El use case ya lee la orden dentro del mismo camino; hay que sumar el `findFirst` del `Raffle` y las `RaffleEntry` de esa orden.
2. **`waitUntil` para sacar Resend del camino crítico del webhook.** Hoy el `await` del envío está entre Flow y el 200. Con pages router la herramienta es `waitUntil` de `@vercel/functions` (`after()` de `next/server` es Next 15.1+, **no aplica**), más un `AbortSignal.timeout(8000)` en el `fetch` del adapter — hoy no tiene ninguno.
3. **`Idempotency-Key: confirmacion-compra/${orderId}`** en el POST. Una línea; cubre el replay del webhook dentro de la ventana de 24 h de Resend.

### 3.2 Scheduling de recordatorios: **Vercel Cron horario, reconciliation-based** — y por qué no los otros

**Elección: `vercel.json` con `{"crons":[{"path":"/api/cron/correos","schedule":"0 * * * *"}]}`, protegido con `CRON_SECRET`.**

- **Contra `scheduled_at` de Resend:** tope de 30 días (una ventana de sorteo puede ser mayor), **no hay PATCH** (reagendar = cancelar + recrear, lo que obliga a persistir el `email.id` igual), y sobre todo el contenido del recordatorio **depende del estado al momento del envío** (cuántos números tiene, si el sorteo se cerró antes, si el tenant fue suspendido, si movieron la fecha). Poner el agendamiento en un tercero es duplicar la fuente de verdad. Sirve como **micro-optimización dentro del job** (mandar a las 09:00 de Chile desde una corrida de las 08:00), nunca como scheduler.
- **Contra Vercel Queues:** beta pública desde feb-2026; agrega un concepto de infra para un job que son 3 llamadas HTTP.
- **Contra Inngest/trigger.dev:** vendor nuevo + SDK en el bundle, y el salto Free→Pro de Inngest es $99/mes. Contradice "simple y barato".

Reglas del job:
- **UTC puro, sin DST.** No codificar "9 AM Chile" en la expresión cron: correr cada hora y calcular con `Intl.DateTimeFormat` + `timeZone: "America/Santiago"` dentro del use case (Chile tiene DST; cero dependencias nuevas).
- **Reconciliación, no disparo puntual.** Vercel documenta que la entrega del cron es *best effort* y **puede duplicar corridas**. El job nunca pregunta "¿qué toca justo ahora?" sino **"¿qué recordatorios están vencidos y sin enviar?"** — así una corrida perdida se recupera sola a la hora siguiente.
- **Requiere Vercel Pro** (Hobby = 1 corrida/día y 10 s de ejecución). Ya asumido por ADR-0015.

### 3.3 Ledger de envíos: `CorreoEnviado` con protocolo claim → send → confirm

```prisma
enum CorreoTipo   { CONFIRMACION_COMPRA, RECORDATORIO_SORTEO, RESULTADO_GANADOR, RESULTADO_NO_GANADOR }
enum CorreoEstado { PENDIENTE, ENVIADO, FALLIDO }

model CorreoEnviado {
  id          String       @id @default(cuid())
  tenantId    String
  tipo        CorreoTipo
  clave       String       // clave natural determinística
  email       String       // snapshot del destinatario
  proveedorId String?      // id de Resend — join con el webhook/pull de entrega
  estado      CorreoEstado @default(PENDIENTE)
  intentos    Int          @default(0)
  ultimoError String?
  enviadoAt   DateTime?
  createdAt   DateTime     @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([tipo, clave])       // ← la llave de idempotencia
  @@index([estado, createdAt])  // barrido de PENDIENTE/FALLIDO
  @@index([tenantId, tipo])     // panel del Organizador
  @@index([proveedorId])        // lookup desde el webhook de Resend
}
```

Claves naturales, siguiendo la convención ya escrita en el schema (los uniques omiten `tenantId` cuando el id padre ya es tenant-bound — igual que `RaffleEntry` y `DownloadGrant`):

| Tipo | `clave` |
|---|---|
| `CONFIRMACION_COMPRA` | `orderId` |
| `RECORDATORIO_SORTEO` | `${raffleId}:${offsetHoras}:${email}` |
| `RESULTADO_GANADOR` / `RESULTADO_NO_GANADOR` | `${raffleId}:${email}` |

**Protocolo:**
1. **Claim** — `createMany({ data, skipDuplicates: true })`, el mismo patrón que ya usa `aplicarEfectosPostPago` para las `RaffleEntry`. Dos corridas concurrentes del cron **no pueden reclamar la misma fila** → *no hace falta lock distribuido*, pese a lo que sugiere la doc de Vercel para el caso general.
2. **Send** — leer `PENDIENTE`, chunkear de a **100** y usar `POST /emails/batch` (el rate limit de Resend es **10 req/s por team**: 300 destinatarios = 3 llamadas, no 300). La respuesta viene **en el mismo orden** del request → mapear ids. `Idempotency-Key: recordatorio-sorteo/${chunkId}` como segunda línea (ventana 24 h, no sustituye al ledger).
3. **Confirm** — `updateMany` a `ENVIADO` + `proveedorId` + `enviadoAt`.
4. **Sweeper** — la misma corrida barre `PENDIENTE` con `createdAt < now-10min` e `intentos < 3`; a los 3, `FALLIDO` y visible en el panel del Operador.

**Modo de falla elegido a propósito:** si el proceso muere entre (1) y (2) la fila queda `PENDIENTE` y el correo **no** sale — falla segura y recuperable. Enviar-primero-registrar-después arriesga **duplicados**, que son irrecuperables y queman la reputación del dominio compartido. Para un sorteo, un recordatorio tarde es mucho mejor que uno repetido.

**El mismo ledger unifica confirmación y recordatorios:** la fila `PENDIENTE` de C1 se escribe **dentro de la `$transaction` de `confirmarPagoDeOrden`** (es un efecto post-pago más, junto a `DownloadGrant` y `RaffleEntry`) y se envía post-commit. Si Resend falla, hoy el único plan B es que un humano note el problema y use el reenvío del panel; con el ledger, **el cron horario lo drena solo** y el `console.error` invisible se convierte en backlog consultable.

### 3.4 Entregabilidad: empezar por pull, webhook cuando duela

`GET /emails/{id}` devuelve `last_event` — el mismo cron puede reconciliar el estado de los envíos recientes sin endpoint nuevo ni Svix. Cuando haga falta (C8), `POST /api/webhooks/resend` con verificación Svix (`svix-id`/`svix-timestamp`/`svix-signature`), que **exige raw body** → `export const config = { api: { bodyParser: false } }`, igual que el webhook de Flow.

### 3.5 Templates: **NO adoptar react-email todavía**

El adapter habla HTTP crudo a propósito (D4/I7, cero deps), y `plantillaDescarga.ts` ya sanea cabeceras contra header-injection y escapa HTML. Meter un render de React en el camino del webhook de pago para 5 plantillas no paga. **Reconsiderar cuando las plantillas tengan que llevar identidad visual per-tenant** (`Tenant.logoUrl`/`colorPrimario`/`colorAcento`): ahí el HTML a mano se vuelve insostenible y `react-email` + su Tailwind sí paga.

Lo que sí conviene extraer **ya**, manteniendo la interfaz nuestra y no la del SDK: `CorreoInput` crece con `headers?`, `tags?`, `scheduledAt?`, `idempotencyKey?`, y `CorreoService` gana `enviarLote(inputs: CorreoInput[])` → `POST /emails/batch`. (Ojo: `tags` de Resend solo acepta ASCII alfanumérico + `_` + `-` → sirve `tenantId`/`raffleId`/`tipo`, **no** el nombre de la tienda; y `/emails/batch` **no soporta attachments** — irrelevante hoy, porque los PDFs van por URL firmada, ADR-0002.)

### 3.6 Sender multi-tenant — resumen del cableado

```
From:     <Tienda> · vía Sortéatelo <compras@notificaciones.sorteatelo.cl>   (C1, C4, C5)
From:     <Tienda> · vía Sortéatelo <sorteos@avisos.sorteatelo.cl>          (C2, C3, C6, C9)
Reply-To: correo del Organizador
Headers:  List-Unsubscribe + List-Unsubscribe-Post  (solo en los de avisos.)
```
El `From` **debe** estar alineado con SPF o DKIM para pasar DMARC: poner el correo del Organizador ahí haría que los organizadores con dominio propio en `p=reject` se rechacen duro. `Reply-To` no participa de la autenticación → es gratis y seguro. Resend **no inyecta** los headers RFC 8058 en `POST /emails` (solo en Broadcasts): hay que mandarlos a mano, con un token de baja y un endpoint público `POST /api/correo/baja/<token>` (sin login, ADR-0004) contra una tabla de supresión `(tenantId, email)`.

**Riesgo estructural a nombrar:** con dominio compartido, **una tienda que abuse quema la reputación de todas**. La mitigación mínima viable sin infra nueva es exactamente el ledger + los eventos de bounce/complaint: permiten atribuir las quejas a un tenant y suspenderle el envío.

---

## 4. Gaps del repo detectados

Verificados contra el código, no inferidos.

**G1 — 🔴 Los números del sorteo no existen como dato público.** `RaffleEntry.ordinal` (`prisma/schema.prisma:359`) es un discriminador **0..K-1 dentro de la orden**, no un correlativo del sorteo: dos compradores distintos tienen ambos el ticket `0`. **No hay forma de escribir "tus números son 1043–1092"**, que es el contenido central de C1, C2, C3 y C5. Falta un `numero Int` correlativo por sorteo con `@@unique([raffleId, numero])`, asignado en la misma `$transaction` de `aplicarEfectosPostPago` — y eso **choca de frente con la idempotencia actual** (`createMany({ skipDuplicates: true })` no puede asignar correlativos sin un contador o un `SELECT max + K` bajo lock). **Es un cambio de modelo con invariante de concurrencia: exige `domain-planner` + `schema-guardian` antes de tocar nada, y es el bloqueante #1 de todo el resto.**

**G2 — 🔴 El sorteo no registra el número ganador.** `Raffle` tiene `ganadorEmail`, `ejecutadoAt`, `ejecutadoPor` (`prisma/schema.prisma:337-339`) pero **ninguna referencia a la `RaffleEntry` ganadora**. C4 y C5 necesitan el número ganador. Depende de G1.

**G3 — 🔴 No hay ledger de envíos ni idempotencia persistida.** Hoy el único registro de que un correo salió es el `console.log`. Sin `CorreoEnviado`, un cron best-effort duplica.

**G4 — 🔴 No existe infraestructura de cron.** No hay `vercel.json` en el repo, no hay `src/pages/api/cron/`, y **ni `docs/agents/backend-conventions.md` ni `CLAUDE.md` mencionan jobs/cron/scheduler** — la convención vigente para side-effects es exclusivamente el decorator post-commit síncrono. Falta también `CRON_SECRET` en `src/env.js` (hoy solo están `RESEND_API_KEY:71` y `APP_URL:77`) y una convención escrita de "job idempotente y reconciliation-based".

**G5 — 🔴 No hay consentimiento ni opt-out.** No existe campo de opt-in de marketing en `Order`, ni tabla de supresión `(tenantId, email)`, ni token de baja, ni endpoint público de baja. Existe `CheckoutField` con tipo `CHECKBOX` per-tenant (`prisma/schema.prisma:500-521`), pero **no sirve como consentimiento**: es configurable por el Organizador, tiene tope de 10 campos activos y no persiste IP ni el texto exacto mostrado (que la Ley 21.719 exige para que el consentimiento sea *verificable*).

**G6 — 🟠 El remitente no está resuelto en producción.** `plantillaDescarga.ts:26` declara `REMITENTE_CORREO = "no-reply@sorteatelo.cl"` (apex), pero el encabezado de `src/server/services/correo.ts:15-18` documenta que en la práctica se envía desde el remitente de **prueba** `onboarding@resend.dev`, gated por la verificación del dominio en Resend. **El dominio `sorteatelo.cl` no está verificado**; los subdominios de D2 tampoco existen. Es prerequisito de cualquier envío real.

**G7 — 🟠 Falta la identidad legal del Organizador para el pie del correo.** `Tenant` tiene `nombre` y `contactoEmail` (`:148`) pero no razón social ni RUT — el art. 28 B pide "la identidad del remitente".

**G8 — 🟠 Desalineación del reply-to.** `enviarCorreoDescargaDeOrden.ts:88-101` deriva el reply-to de la **membresía más antigua** del tenant, con un comentario que dice "cuando F08 agregue un email de contacto por Tienda, se cambia SOLO acá la fuente" — pero **`Tenant.contactoEmail` ya existe** en el schema desde plantilla-rica F02. Decidir cuál manda (probablemente `contactoEmail ?? membresía más antigua`) antes de multiplicar plantillas que arrastren la misma lógica.

**G9 — 🟡 El adapter de correo está incompleto para el caso batch.** `CorreoService` solo expone `enviarCorreo(input)` con `{from, to, replyTo, subject, text, html}` (`src/server/services/correo.ts:34-49`): **sin timeout en el `fetch`, sin `headers`, sin `tags`, sin `Idempotency-Key`, sin `scheduledAt` y sin `POST /emails/batch`**. Con 10 req/s de límite, un blast en `for` de `POST /emails` se rompe.

**G10 — 🟡 Dependencias ausentes (a propósito, pero hay que decidir).** `package.json` no tiene `resend`, `react-email`, `svix` ni **`@vercel/functions`** — esta última es necesaria para `waitUntil`. Adoptarla contradice literalmente la decisión D4/I7 ("cero dependencias nuevas") documentada en el adapter: es una decisión a tomar explícitamente, no un `npm i` al pasar.

**G11 — 🟡 Sin manejo de zona horaria en fechas de sorteo.** `Raffle.fechaInicio`/`fechaFin` son `DateTime` (UTC). Todo correo que diga "cierra el viernes a las 23:59" tiene que formatear en `America/Santiago` con la zona explícita — como hace Omaze en sus bases.

**G12 — 🟡 Bloqueantes operativos de plan, no de código.** **Resend Free = 3.000/mes con tope de 100/día y 1 dominio.** Un sorteo con 300 compradores es un blast de 300 correos en una hora: **se corta a la mitad, en silencio**. Y 1 dominio hace imposible la separación de D2. **Resend Pro ($20/mes) y Vercel Pro son prerequisitos de F07**, no optimizaciones posteriores.

---

### Orden de ataque sugerido

1. **G1 + G2** (numeración del sorteo) — bloquean el contenido de 4 de los 5 correos F1. Van por `domain-planner` → `schema-guardian`.
2. **G3 + G4 + G9** (ledger + cron + batch en el adapter) — la máquina compartida por todo lo demás.
3. **C1 extendido** (números en el correo que ya existe) + `waitUntil` + `Idempotency-Key`.
4. **C4/C5** (resultado) — misma máquina, disparados por la ejecución del sorteo; los más baratos y los de mayor retorno reputacional.
5. **G5 + G6 + G7** (consentimiento, subdominios, identidad legal) — **prerequisitos duros de C2/C3**: sin opt-out no se mandan recordatorios.
6. **C2 + C3** (recordatorios).