# E2E — Facturación de la plataforma (suscripciones Flow, cuenta propia)

Checks de navegador de la facturación de la plataforma (`tasks/26-07-26-plataforma-facturacion-suscripciones.md`,
ADR-0026). Los ejecuta el `feature-tester` con la skill `browser-verify`. Cada check tiene un ID que
el plan referencia desde sus Validaciones. Marcado `[x]` solo por el feature-tester.

> **Dev server**: `next dev` en **:3001**. Una sola instancia (memoria «Dev server: una sola instancia»).
>
> **Hosts** (mismo entorno que `tasks/e2e-plataforma-retiro-operador.md`): panel de una tienda en
> `http://<slug>.localhost:3001/admin`; el apex de verdad es `http://www.localhost:3001` (el apex
> pelado impersona la tienda `autora` por `devTienda`).

## Requisitos previos del entorno

Esta feature toca **plata real de la plataforma** contra la API de Flow. Antes de correr cualquier
check de este archivo:

1. **Cuenta Flow de PLATAFORMA en sandbox** (distinta de las cuentas BYO de los tenants seed) con
   `FLOW_PLATAFORMA_API_KEY` / `FLOW_PLATAFORMA_SECRET_KEY` en `.env` y `FLOW_PLATAFORMA_SANDBOX="true"`.
2. **Túnel público** apuntando al webhook de suscripciones, con `FLOW_PLATAFORMA_URL_CALLBACK`
   seteada (`https://<tunel>/api/webhooks/flow-suscripciones`). Sin túnel, Flow no puede notificar y
   los checks del webhook (F04) no se pueden verificar.
3. **Planes creados en Flow**: `npm run flow:planes` (idempotente). Verificar en la salida que
   quedaron `sorteatelo-tienda-full` y `sorteatelo-tienda-adicional`.
4. **Tarjeta de prueba Transbank** para el registro (ver memoria «Flow sandbox E2E»).
5. Una tienda de prueba con el resto del checklist de publicación YA cumplido (ToS + credencial Flow
   + 1 producto entregable), en estado `CONFIGURACION` y **sin** `PlatformExemption` — si no, el paso
   «Activa tu plan» aparece cumplido por cortesía y no se puede ejercer.

## Corrida `feature-tester` — 2026-07-26

Leyenda de las marcas: `[x] ✅` verificado · `[ ] 🟡` PARCIAL (la mitad server-side quedó verificada,
falta la lectura en pantalla) · `[ ] ⏭️` **pendiente-sandbox** (exige la cuenta Flow de plataforma y/o
el túnel, que no existen en este entorno).

Dos límites del entorno mandaron sobre esta corrida:

1. **No hay cuenta Flow de PLATAFORMA**: `.env` no tiene `FLOW_PLATAFORMA_API_KEY` /
   `FLOW_PLATAFORMA_SECRET_KEY` / `FLOW_PLATAFORMA_URL_CALLBACK` (sí están las BYO de los tenants
   seed, que son otro mundo — I1). Se comprobó que eso **falla fast y con mensaje** en las dos
   puertas: `panel.iniciarRegistroTarjeta` responde `Falta FLOW_PLATAFORMA_API_KEY para operar la
   facturación de la plataforma…` y `npm run flow:cupones -- crear` aborta con el mismo mensaje sin
   dejar fila local (verificado con un `listar` después). Ningún check ⏭️ falló: no se pudieron
   ejercer.
2. **Los dos carriles de navegador estaban ocupados** por agentes concurrentes (Playwright
   `mcp-chrome-12f6c4f` desde las 12:09; chrome-devtools desde las 16:46 — el `feature-tester` de
   `guia-conecta-tu-ia`, que además dejó una membresía `ft-guia-vacio@example.invalid` en
   `e2e-numeros` durante esta corrida). La skill `browser-verify` prohíbe robarle el navegador a otro
   agente, así que lo verificable sin render se ejerció por **HTTP real contra el dev server**: SSR y
   redirects con `curl`, y las queries/mutations del panel llamando a los endpoints tRPC con la
   cookie de sesión (`panel.getEstadoPlan`, `panel.getAvisoFacturacion`,
   `panel.getEstadoPublicacion`, `panel.iniciarRegistroTarjeta`, `checkout.iniciarCheckout`). Eso
   cubre la decisión server-side completa; lo que queda 🟡 es el render (rail, color del banner,
   tabla, modales), que en el panel se computa client-side desde esas mismas queries.

Los estados se indujeron por DB directa (como manda este archivo) sobre `autora` y `e2e-numeros`, y
**se restauraron al terminar**: cero `PlatformSubscription` / `PlatformInvoice` /
`PlatformBillingCustomer` / `PlatformCoupon` en la DB, las 7 exenciones `GRANDFATHER` originales en su
lugar y los 7 storefronts respondiendo 200.

### Segunda pasada — RENDER en navegador (chrome-devtools), 2026-07-26 17:30–18:30

El usuario autorizó el carril **chrome-devtools**, que esta vez estaba libre. Se ejercieron **en
pantalla** los 8 checks que la primera pasada había dejado 🟡: **7 pasaron a ✅** y el octavo
(`cupon.e2e.002`) quedó ⏭️ porque su mitad faltante no era el render sino el ida-y-vuelta con Flow —
todo lo que NO depende de Flow (reserva, abandono, listado con trazabilidad, reintento, flag
inválido) sí quedó verificado. Los 7 ⏭️ de la primera pasada siguen intactos: exigen la cuenta Flow
de plataforma y el túnel, que este entorno no tiene.

Se cerró además el **design compliance** pendiente (§3.5) leyendo colores con `getComputedStyle`
contra `docs/design.md`, y se reprodujeron en el navegador las **2 notas de UX** que la primera
pasada había anotado (parpadeo del rail; `/editor` en 200 con la tienda en pausa). Cero violaciones
de diseño.

**Dos incidentes AJENOS de carriles concurrentes** atravesaron la corrida (ninguno de facturación):
(1) 17:32–17:34 el carril `sistema-correos-comprador` renombró `plantillaDescarga.ts` sin actualizar
su importer y dejó **todo el router tRPC en 500** (se recuperó solo con un shim); (2) desde ~17:23
`node_modules/.bin` y el cliente Prisma generado **desaparecieron** (npm/prisma de otro carril),
así que los escenarios se indujeron con **SQL crudo** vía `prisma db execute --stdin` en vez de
`tsx` (`tmp/fscen.sh` / `tmp/fread.sh`); `node_modules` se recompuso a las 17:42.

### Tercera pasada — SANDBOX REAL DE FLOW (chrome-devtools), 2026-07-26 20:00–21:00

Con la cuenta Flow de **plataforma** ya montada (`FLOW_PLATAFORMA_*` en `.env`, sandbox), el túnel vivo
y los 2 planes creados por la UI del dashboard, se ejercieron los **8 checks ⏭️ pendiente-sandbox** y se
cerró la lista **«A VERIFICAR CONTRA EL SANDBOX REAL»**.

Resultado: **2 pasaron a ✅, 5 quedaron ❌ y 1 🟡**, por **4 blockers de integración reales** que ningún
test de Vitest podía cazar (los 209 tests de facturación siguen verdes, porque los fakes codifican el
contrato equivocado):

1. **El redirect al registro de tarjeta va SIN el `token`.** `customer/register` devuelve `{token, url}`
   y hay que mandar al Pagador a `url?token=…`; `iniciarRegistroTarjeta.ts:102` y
   `iniciarCambioDeTarjeta.ts:44` devuelven solo `registro.url` ⇒ Flow muestra «¡Ups! Ha ocurrido un
   error / Error Processing Request». El service BYO lo hace bien (`services/flow.ts:144`).
2. **Flow vuelve del registro con un POST**, no con un GET: `POST /admin/plan/retorno` pierde la cookie
   de sesión (SameSite=Lax, cross-site) ⇒ **307 a `/login`**, y además `retorno.tsx:62` lee el token de
   `router.query`, que en un POST no existe.
3. **El CLI de cupones no puede crear NINGÚN cupón**: `duration` está invertido. Flow exige
   `duration=0` (para siempre, sin `times`) o `duration=1` + `times=N`; el service manda `1` para
   siempre y `2` para N períodos (`flowPlataforma.ts:370`).
4. **El webhook de suscripciones es SORDO**: Flow notifica con `token=<…>` en form-urlencoded, no con
   `subscriptionId`/`subscription_id` (`webhookSuscripciones.ts:55`) ⇒ toda notificación se ackea con
   `missing_subscription_id` y NADA se espeja. El token se resuelve con **`payment/getStatus?token=`**,
   cuyo `commerceOrder` es `<subscriptionId>_<invoiceId>_<fecha>`.

Para poder verificar lo que hay DETRÁS de esos blockers, el registro de tarjeta se ejerció de verdad
(Transbank OneClick, VISA 4051 8856 0044 6623 y débito 4051 8842 3993 7763) armando a mano la URL con
`?token=` y forzando el retorno por GET. Todo lo que viene después del redirect **funciona**.

Higiene: las 4 suscripciones creadas quedaron canceladas en Flow (status 4, cero cobro recurrente vivo),
cupones y customer de prueba borrados, DB restaurada (0 filas `Platform*` salvo las 7 exenciones
GRANDFATHER). Residuo justificado: `plans/list` sigue listando 2 planes de sonda con `status 0` — Flow no
los saca, que es justamente la evidencia de por qué un «existe?» por `plans/list` debe filtrar `status === 1`.

### Corrección post-3ª-pasada — 2026-07-26 22:40 (`feature-implementer`)

Los **4 blockers** y el bootstrap quedaron corregidos, con `backend-reviewer` en APPROVE. Quedan **5
checks por re-correr**: `activar.e2e.001`/`.002`, `cupon.e2e.001`/`.002` y `plan.e2e.002`.

Dos cosas cambiaron y conviene saberlas ANTES de correrlos:

1. **La `url_return` ya no es la página del panel.** Flow ahora vuelve a
   `/api/facturacion/retorno-plan` (o `/retorno-tarjeta`), un endpoint público que recibe su **POST
   cross-site**, saca el token del body y responde **303** a `/admin/plan/retorno?token=…`. En
   pantalla el flujo se ve igual; en la pestaña de red aparece ese 303 intermedio. El puente existe
   porque la cookie de sesión (`SameSite=Lax`) no viaja en un POST cross-site — el `307 → /login` de
   la 3ª pasada pasaba también en producción.
2. **El redirect a Flow ya lleva `?token=`**, así que «Continuar» y «Cambiar tarjeta» no deberían
   necesitar que nadie arme la URL a mano.

Verificado por el implementer contra la API real, sin crear suscripciones: `npm run flow:planes` sale
«ya existía» ×2; un POST con un token inventado al webhook responde `token_sin_suscripcion` (o sea que
la cadena `token → payment/getStatus` corre de verdad); los dos puentes responden 303 con el `Location`
correcto. **Lo que NO se pudo verificar sin un cobro real es el espejo del invoice** — o sea el corazón
de F04: exige una suscripción viva + el túnel, y es lo primero que conviene mirar en esta corrida.

### Cuarta pasada — LOS 5 ROJOS, SIN FORZAR NADA (chrome-devtools), 2026-07-26 22:05–22:45

Con los 4 blockers corregidos, el túnel vivo y los 2 planes en Flow, se re-corrieron los **5 checks
rojos**: **los 5 pasaron a ✅**, y esta vez el flujo entero fluyó solo — nadie armó una URL a mano ni
forzó un retorno. Los 4 blockers quedaron cerrados en pantalla: el redirect lleva `?token=`, el POST
cross-site de Flow entra por `/api/facturacion/retorno-plan` y sale **303** al panel con la sesión
viva, el CLI crea cupones contra Flow en sus dos ramas de `duration`, y **el webhook oye**.

**El espejo de invoices ocurre de verdad**: 4 notificaciones reales de Flow entraron por el túnel y
dejaron una fila `PlatformInvoice` por invoice, con el monto correcto —incluido el **$6.250** del
cupón—, ruteadas por `commerceOrder` e idempotentes por `flowInvoiceId`.

Pero al mirar el ledger contra lo que Flow REALMENTE cobró aparecieron **2 blockers nuevos**, los dos
de plata y ninguno cazable por Vitest (los fakes vuelven a codificar un contrato que Flow no habla):

5. **El espejo no sabe leer el cobro.** `derivarEstadoInvoice` (`_invoiceFlow.ts:60`) lee `paid`,
   `payment_date`, `outstanding` y `attemp`: **ninguno de los cuatro existe** en el payload real de
   Flow. Un invoice que Flow ya cobró (`payment.status 2`, fee y balance incluidos) se espeja
   `PENDIENTE` **para siempre**. ⇒ el comprobante (1) nunca sale, el dunning nunca arranca (nada
   llega a `FALLIDA`/`VENCIDA`), ninguna tienda entra jamás en pausa por pago con datos reales, y el
   `paymentLink` nunca se puebla.
6. **La promoción de D7 cobra de más.** Cancelar la FULL dispara el `changePlan` de la adicional más
   antigua y Flow **emite y cobra en el acto** una factura extra por el período YA PAGADO: la tienda
   promovida terminó pagando **$25.000 por un mes de $12.500**. La 3ª pasada vio que la factura vieja
   no se re-cobraba, pero no que aparecía una nueva.

Higiene: 3 suscripciones creadas, las 3 canceladas (`status 4`, cero cobro recurrente vivo); cupones
y customer de prueba **eliminados** en Flow; DB restaurada (7 exenciones GRANDFATHER, todas las
tiendas PUBLICADA, **0 filas `Platform*`**).

## F03 — Activa tu plan (publicar)

- [x] ✅ `facturacion.activar.e2e.001` — **Flujo completo en sandbox Flow**: en el panel de una tienda
      en configuración, el checklist muestra «Activa tu plan» como ÚLTIMO ítem pendiente → «Ver el
      precio» abre el modal con **$25.000/mes** (el precio sale del server, no del cliente) →
      «Continuar» redirige al formulario de tarjeta de Flow → se ingresa la tarjeta de prueba
      Transbank → Flow POSTea a `<slug>.localhost:3001/api/facturacion/retorno-plan`, que responde
      **303** a `/admin/plan/retorno?token=…` (ver la nota de la corrección) → la página
      muestra «Estamos activando tu plan…» y termina en «¡Tu plan está activo y tu tienda publicada!».
      **Evidencia en DB**: una fila `PlatformSubscription` del tenant con `plan = FULL`,
      `montoBruto = 25000`, `estado = AL_DIA` y `flowSubscriptionId` no nulo; una fila
      `PlatformBillingCustomer` del User con `tarjetaMarca` y `tarjetaUltimos4` poblados (y **nada
      más** de la tarjeta); el `Tenant.estado` en `PUBLICADA`.
- [x] ✅ `facturacion.activar.e2e.002` — **Segunda tienda del mismo Pagador a mitad de precio**: con el
      plan de la primera tienda ya activo, el modal de una SEGUNDA tienda del mismo Organizador
      muestra **$12.500/mes** y el aviso «Es tu segunda tienda en adelante: va a mitad de precio».
      Tras activar, su `PlatformSubscription` queda `plan = ADICIONAL`, `montoBruto = 12500`.
- [x] ✅ `facturacion.activar.e2e.003` — **Tienda exenta publica sin tarjeta** (D8): con una
      `PlatformExemption(CORTESIA, exentaHasta = null)` insertada por DB directa, el ítem del
      checklist se lee «Tu plan es de cortesía» / «Tu tienda no paga mensualidad», está marcado como
      cumplido, y «Publicar mi tienda» funciona **sin pasar por Flow** (cero `PlatformSubscription`
      para ese tenant al terminar).
- [x] ✅ `facturacion.cupon.e2e.001` — **El código aplica descuento visible**: con un cupón creado por
      CLI (F08), tipear el código en «¿Tienes un código?» del modal y continuar deja el canje
      registrado (`PlatformCouponRedemption` con el `tenantId`, el `codigo` normalizado en mayúsculas
      y `subscriptionId` ligado tras activar), y la suscripción en Flow queda con el cupón aplicado.
      Un código inexistente muestra el mensaje **neutral** («Ese código no es válido o ya no se puede
      usar…») sin decir por qué.
- [x] ✅ `facturacion.cupon.e2e.002` — **El CLI de cupones, ida y vuelta** (F08) — *pasada de render
      2026-07-26: la mitad NAVEGADOR + CLI quedó verificada (ver tabla de evidencia); lo que falta es
      estrictamente el ida-y-vuelta con Flow, así que el check pasa de 🟡 a ⏭️*: `npm run flow:cupones --
      crear --codigo E2E50 --porcentaje 50 --meses 1 --max 1` crea el cupón en el sandbox de Flow y la
      fila local en la misma corrida (el `flowCouponId` se imprime y tiene que existir en el panel de
      Flow). `npm run flow:cupones -- listar` lo muestra con `canjes 0/1`; tras usarlo en el flujo de
      arriba, la misma corrida lo muestra con `canjes 1/1` y la línea de trazabilidad con la fecha, el
      nombre de la Tienda y el correo del Pagador. **Chequeo del que más se aprende**: abrir el modal,
      tipear el código y ABANDONAR el redirect ⇒ el listado debe decir `canjes 0/1 (+1 reserva/s en
      curso)`, no `canjes 1/1` — la reserva se libera sola al reintentar. Repetir el `crear` con el
      mismo código **falla sin tocar Flow** (no debe aparecer un segundo cupón en el panel de Flow), y
      `--maxCanjes 1` (flag inexistente) tiene que fallar en vez de crear un cupón ilimitado.

## F04 — Espejo del cobro y dunning (corrección del blocker 5)

> Requiere **una suscripción nueva y un cobro real** en el sandbox: es el camino que estuvo roto en
> silencio toda la feature. Los estados inducidos por DB NO sirven acá — lo que se valida es
> justamente que lo que llega de Flow se lea bien.

- [x] ✅ `facturacion.espejo.e2e.001` — **El cobro se registra como cobro**: activar el plan de una
      tienda (flujo de F03) y esperar la notificación del cobro. En la DB, la fila de
      `PlatformInvoice` tiene que quedar en **`estado: PAGADA`** (antes quedaba `PENDIENTE` para
      siempre) con `pagadaAt` poblado desde el `payment.paymentData.date` de Flow, y la suscripción
      en `AL_DIA`. Cruzar contra `invoice/get <id>`: `status` debe ser `1` y `payment.status` `2`.
- [x] ✅ `facturacion.espejo.e2e.002` — **Sale el comprobante (correo 1 de D10)**: el mismo cobro tiene
      que disparar el correo de comprobante al Pagador — el que no salió NUNCA hasta ahora. Revisar
      la bandeja real. Reprocesar la misma notificación (re-postear el `token` al webhook) **no**
      manda un segundo comprobante.
- [x] ✅ `facturacion.espejo.e2e.003` — **La página Plan muestra el cobro cobrado**: `/admin/plan` tiene
      que listar ese invoice como pagado en el historial (no «En curso» en ámbar) y el badge del
      estado del plan en «Al día».
- [x] ✅ `facturacion.espejo.e2e.004` — **Dunning (si el sandbox lo permite)**: sigue sin haber tarjeta
      de prueba que inscriba y después falle (punto 3 de «A VERIFICAR»). Si aparece una forma de
      producir un cobro fallido, verificar la cadena entera: invoice `FALLIDA` con `intentos` =
      `attemp_count` y `paymentLink` poblado desde `invoice/get`, correo (2) con el link, y al agotar
      los reintentos (`attemp_count >= 3`) invoice `VENCIDA` ⇒ suscripción `EN_PAUSA_POR_PAGO` ⇒
      storefront en pausa. **Si no se puede producir, dejarlo ⏭️ y decirlo**: es el único tramo del
      camino de la plata que sigue sin evidencia de sandbox.

## F05 — Gating por facturación (tienda en pausa)

> **Cómo poner una tienda en pausa sin esperar el dunning real de Flow**: la pausa es un estado
> DERIVADO (D5/D15), así que se induce por DB directa sobre la suscripción de la tienda de prueba:
> `UPDATE "PlatformSubscription" SET estado = 'EN_PAUSA_POR_PAGO' WHERE "tenantId" = '<id>';`. Para
> el check del `paymentLink` hace falta además un `PlatformInvoice` de esa suscripción con
> `estado = 'VENCIDA'` y `paymentLink` poblado. Al terminar, devolver el estado a `AL_DIA`.
>
> Los checks `.001`/`.002` NO necesitan el sandbox de Flow ni el túnel: se ejercen sobre el estado
> derivado. Solo el flujo de F03 los necesita.

- [x] ✅ `facturacion.pausa.e2e.001` — **El storefront de una tienda en pausa no vende**: visitar
      `http://<slug>.localhost:3001/` redirige a `/en-pausa`, que muestra «<Nombre> está en pausa» +
      «Esta tienda no está recibiendo pedidos por ahora» y el aviso de que las descargas anteriores
      siguen disponibles. **No menciona el pago, el plan ni la mora en ninguna parte del HTML** (la
      mora es asunto entre la Plataforma y el Organizador). La página trae `<meta name="robots"
      content="noindex">`. `/producto/<id>` y `/checkout` de la misma tienda también aterrizan ahí.
      Devuelto el estado a `AL_DIA`, `/en-pausa` redirige de vuelta a la home y el catálogo vuelve.
- [x] ✅ `facturacion.pausa.e2e.002` — **El panel queda restringido con el banner**: entrar a
      `http://<slug>.localhost:3001/admin` redirige a `/admin/plan`; lo mismo `/admin/productos`,
      `/admin/ventas`, `/admin/sorteo` y `/admin/configuracion`. En `/admin/plan` se ve el banner rojo
      «Tu tienda está en pausa» con el botón **Pagar ahora** apuntando al `paymentLink` de Flow, y el
      rail izquierdo muestra **solo** «Plan» (sin Resumen/Productos/Ventas/Sorteo/Configuración ni
      «Editor de la tienda»). Con la suscripción en `COBRO_PENDIENTE` en cambio, el banner es ÁMBAR
      («No pudimos cobrar tu plan»), el rail está COMPLETO y las páginas del panel responden normal.
- [x] ✅ `facturacion.pausa.e2e.003` — **I5: el Comprador no paga la mora del Organizador**. Con la
      tienda en pausa: (a) el enlace `/api/descargas/<token>` de un `DownloadGrant` vigente de una
      compra ANTERIOR sigue devolviendo el 302 a la URL prefirmada y el PDF se descarga; (b)
      `/checkout/retorno?token=<token de una orden real>` sigue respondiendo 200 con la marca de la
      tienda (no redirige a `/en-pausa`). Este es el check que más importa de F05.

## F06 — Cancelación del plan

> Requiere una suscripción VIVA en el sandbox de Flow (la que dejó el flujo de F03): la cancelación
> se pide contra `subscription/cancel` de verdad, así que este check NO se puede inducir por DB.
> Después de correrlo, la tienda queda con la cancelación pedida — para repetir F03 hay que
> re-suscribir (que es justamente lo que valida el último punto).

- [x] ✅ `facturacion.cancelar.e2e.001` — **Cancelar con confirmación explícita**: en
      `http://<slug>.localhost:3001/admin/plan`, el botón «Cancelar mi plan» abre un modal que dice
      hasta cuándo sigue vendiendo la tienda y que no se borra nada; el botón de confirmar es ROJO y
      dice «Cancelar el plan». Al confirmar, la página pasa a mostrar **«Cancelado: tu tienda vende
      hasta el DD-MM-AAAA»** y el botón de cancelar desaparece. Verificar en la DB que
      `cancelacionSolicitadaAt` y `cancelacionEfectivaAt` quedaron poblados y que **`estado` sigue
      `AL_DIA`** (D6: la tienda vende hasta cerrar el período). El storefront sigue vendiendo.
- [x] ✅ `facturacion.cancelar.e2e.002` — **El correo (5) llega al Pagador**: revisar la bandeja del
      correo real usado en el sandbox — asunto «Cancelamos el plan de <Tienda>», con la fecha hasta la
      que vende. Cancelar de nuevo (recargando y reintentando la mutation a mano) **NO** manda un
      segundo correo.
- [x] ✅ `facturacion.cancelar.e2e.003` — **Cerrado el período, hay que re-suscribir**: inducir el cierre
      poniendo la suscripción en `CANCELADA` por DB (el webhook hace esto cuando Flow reporta
      `status = 4`). La tienda entra en modo pausa —storefront en `/en-pausa`, panel restringido con el
      banner «Tu tienda no tiene un plan activo»— y el botón «Reactivar mi plan» de `/admin/plan` abre
      el modal de activación con la **tarjeta ya registrada** (no vuelve a pedir el registro completo).

### Corrección del blocker 6 — la promoción NO cobra dos veces

> Requiere **dos tiendas del mismo Pagador con suscripción viva** (una full + una adicional), que es
> el escenario que produjo el cobro doble en las pasadas 3ª y 4ª.

- [x] ✅ `facturacion.cancelar.e2e.004` — **Cancelar la full NO le cobra nada a la vecina**: con A
      (full, $25.000) y B (adicional, $12.500) del mismo Pagador, cancelar A. Verificar
      **inmediatamente** en Flow: `subscription/get` de B sigue con
      `planId = sorteatelo-tienda-adicional` y **no apareció ningún invoice nuevo** («Cambio de plan
      a …»). Comparar la lista de invoices de B antes y después: tiene que ser la MISMA. En la DB, B
      queda con `plan: ADICIONAL`, `planProgramado: FULL` y `planProgramadoDesde` = la más tardía
      entre su próximo cobro y el fin del período de A.
- [x] ✅ `facturacion.cancelar.e2e.005` — **El cron no adelanta la promoción**: llamar al cron
      (`GET /api/cron/facturacion` con el bearer) mientras B siga cobrando su período viejo. El body
      tiene que responder `promociones: 0` y, otra vez, **cero invoices nuevos** en Flow para B.
- [x] ✅ `facturacion.cancelar.e2e.006` — **La promoción se aplica cuando corresponde**: forzar el
      escenario del período nuevo poniendo por DB `planProgramadoDesde` (y `periodoInicio`) de B de
      modo que `periodoInicio >= planProgramadoDesde`, y llamar al cron. Ahí sí: `promociones: 1`,
      `subscription/get` de B pasa a `sorteatelo-tienda-full`, y en la DB B queda `plan: FULL`,
      `montoBruto: 25000`, `planProgramado: null`. **Anotar cuánto cobró Flow en ese momento** — se
      espera una factura de diferencia que complete el precio del período EN CURSO (no del anterior);
      ese es el dato que ninguna pasada tiene todavía. Volver a llamar al cron: `promociones: 0` y
      ningún cobro nuevo.

## F07 — Exención (cortesía / grandfathering)

> **Cómo montar el escenario**: no hay superficie para crear exenciones — se administran por DB
> directa (D8, coherente con ADR-0023). Insertar a mano sobre la tienda de prueba:
>
> ```sql
> INSERT INTO "PlatformExemption" ("id","tenantId","motivo","exentaHasta","createdAt","updatedAt")
> VALUES (gen_random_uuid()::text, '<tenantId>', 'CORTESIA', NULL, now(), now());
> ```
>
> La fecha se mueve con `UPDATE ... SET "exentaHasta" = now() + interval '4 days'`. **Nada de esto
> necesita el sandbox de Flow ni el túnel**: la exención no toca Flow (una tienda cortesía no tiene
> suscripción ni tarjeta). Al terminar, borrar la fila.
>
> **Script de grandfathering**: `npm run grandfather:tiendas` (sin `--aplicar`) LISTA las candidatas
> y no escribe nada — es seguro correrlo tal cual contra la DB de dev y sirve como verificación del
> filtro: no debe aparecer ninguna tienda que ya tenga plan o exención.

- [x] ✅ `facturacion.cortesia.e2e.001` — **Plan cortesía**: en `/admin/plan` de una tienda con
      `PlatformExemption(CORTESIA, exentaHasta = NULL)` se lee «Plan cortesía» + «Tu tienda vende sin
      costo, sin fecha de término» — sin badge de estado, sin monto, sin botón de cancelar y **sin
      banner** en el panel. El storefront vende normal, y en el checklist de publicación el paso
      «Activa tu plan» aparece cumplido: publicar funciona **sin pasar por Flow** (cero
      `PlatformSubscription` para ese tenant al terminar). Con `exentaHasta` a 3 meses, el mismo
      bloque dice «hasta el DD-MM-AAAA» y sigue sin haber banner.
- [x] ✅ `facturacion.cortesia.e2e.002` — **Preaviso de expiración (ventana de 7 días)**: con
      `exentaHasta = now() + interval '4 days'`, TODA página del panel muestra un banner **ÁMBAR** (no
      rojo) «Tu plan cortesía está por terminar» que nombra **la fecha exacta**; el rail sigue
      COMPLETO y la tienda sigue vendiendo. El botón secundario dice **«Ver mi plan»**, NO «Activar mi
      plan»: mientras la cortesía siga vigente el server rechaza el registro de tarjeta (D8).
      **Seguir el botón** y comprobar que `/admin/plan` explica qué pasa después («Después de esa
      fecha vas a poder activar tu plan acá mismo: $25.000 al mes…») — el CTA tiene que aterrizar en
      algo que exista. Con `now() + interval '30 days'` el banner desaparece. Con `exentaHasta` en el PASADO,
      el banner pasa a ROJO («Tu plan cortesía terminó»), el rail se reduce a «Plan», el storefront
      cae en `/en-pausa` y ahí sí aparece «Activar mi plan». **La evaluación es LAZY** (D8): basta
      recargar la página, sin cron, sin job y sin re-deploy.
- [x] ✅ `facturacion.cortesia.e2e.003` — **La cortesía que llega a mitad del registro de tarjeta no
      cobra** (F07/D3 + el guard de `activarPlanTrasRegistro`): arrancar «Activa tu plan» en una
      tienda sin exención, y ANTES de completar el formulario de Flow insertarle una
      `PlatformExemption(GRANDFATHER)` por DB (o correr `npm run grandfather:tiendas -- --aplicar` con
      la tienda ya publicada). Al volver del redirect, la página de retorno muestra el mensaje «Tu
      tienda quedó con plan cortesía…» y **no existe `PlatformSubscription` para ese tenant**;
      verificar además en el panel de Flow que no quedó ninguna suscripción viva del customer.

## F09 — Cron diario (avisos programados)

> **Cómo montar el escenario**: el cron NO se puede esperar (corre una vez al día). Se dispara a mano
> contra el dev server, con el mismo bearer que manda Vercel:
>
> ```bash
> curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/facturacion
> ```
>
> Las fechas se mueven por DB (`UPDATE "PlatformSubscription" SET "proximoCobroAt" = now() + interval
> '1 day'`, `UPDATE "PlatformExemption" SET "exentaHasta" = now() + interval '3 days'`). **No hace
> falta el sandbox de Flow**: el cron no habla con Flow, solo lee y manda correos. Sí hace falta el
> correo real de comprador/pagador si se quiere verificar la entrega (memoria «Flow sandbox E2E»).

- [x] ✅ `facturacion.cron.e2e.001` — **El gate del endpoint**: sin header `Authorization` responde
      **401**; con `Bearer` incorrecto, **401**; con `POST` y el bearer correcto, **405**. En los tres
      casos NO sale ningún correo y las marcas (`renovacionAvisadaPara`, `avisoExpiracionEnviadoAt`)
      quedan intactas.
- [x] ✅ `facturacion.cron.e2e.002` — **Aviso de renovación, una sola vez por período**: con
      `proximoCobroAt = now() + interval '1 day'`, la corrida responde `{"ok":true,"renovaciones":1,…}`,
      llega el correo «Se acerca el cobro del plan de …» con **la fecha** y el monto, y
      `renovacionAvisadaPara` queda igual a `proximoCobroAt`. **Correr el curl de nuevo**: responde
      `renovaciones: 0` y NO llega un segundo correo. Mover `proximoCobroAt` al mes siguiente y
      repetir: vuelve a avisar (la marca es una fecha, no un flag).
- [x] ✅ `facturacion.cron.e2e.003` — **Fin de cortesía**: con `PlatformExemption(CORTESIA, exentaHasta =
      now() + interval '3 days')` y **sin** suscripción viva, la corrida responde `exenciones: 1` y
      llega «El plan cortesía de … se termina» con la fecha y **sin ningún monto** (el precio depende
      del Pagador y se explica en el panel). Re-correr: `exenciones: 0`. Con una suscripción `AL_DIA`
      detrás de la misma cortesía, la corrida responde `exenciones: 0` y **no llega correo** — es la
      misma decisión que ya toma el banner del panel (F07).

## F10 — Página «Plan» (historial, tarjeta, cortesía)

- [x] ✅ `facturacion.plan.e2e.001` — **Historial de cobros real**: después del flujo de
      `facturacion.activar.e2e.001` (y con al menos un invoice espejado por el webhook), `/admin/plan`
      muestra la tarjeta del Pagador (**marca + últimos 4, nada más** — verificar la respuesta de red)
      y una tabla «Cobros» con la fecha, el monto en CLP y el estado de cada cobro. Un cobro `PAGADA`
      **no** tiene botón «Pagar»; forzando uno a `FALLIDA` con `paymentLink` por DB, su fila sí lo
      muestra y el link abre Flow en **pestaña nueva**.
- [x] ✅ `facturacion.plan.e2e.002` — **Cambiar tarjeta**: con el plan activo, «Cambiar tarjeta» lleva al
      formulario de Flow; al volver a `/admin/plan/retorno-tarjeta` la página confirma con los
      **últimos 4 nuevos** y `/admin/plan` los muestra. Verificar en DB que **la suscripción no
      cambió** (`flowSubscriptionId`, `estado`, `periodoFin` y `proximoCobroAt` idénticos) — cambiar el
      plástico no puede costar el período ya pagado. Con un `?token=` inventado a mano, la página
      falla y la tarjeta queda como estaba.
- [x] ✅ `facturacion.plan.e2e.003` — **Cortesía SOBRE un plan vivo no esconde el cobro** (el
      pre-existente que F10 cierra): a una tienda con suscripción `AL_DIA`, insertarle una
      `PlatformExemption(CORTESIA)` por DB. `/admin/plan` tiene que mostrar «Plan cortesía» **y
      además** el plan activo con su monto, su badge, su tarjeta y «Cancelar mi plan» — antes de F10
      la rama exenta lo ocultaba todo y dejaba a alguien pagando sin ninguna superficie donde verlo.

## Notas para quien ejecute

- **El gate de publicación es server-side** (I2/I4): comprobar que llamar `panel.publicarTienda` con
  la tienda sin plan responde `INVALID` con el mensaje del plan, no solo que el botón esté deshabilitado.
- **Nunca aparece la tarjeta completa**: revisar la respuesta de red de `getEstadoPlan` — solo puede
  traer marca y últimos 4 (I7).
- El registro de tarjeta se confirma contra `customer/getRegisterStatus` **server-side** (I3): un
  `?token=` inventado a mano en `/admin/plan/retorno` debe fallar sin crear nada.

## Evidencia por check — corrida 2026-07-26

| check | marca | evidencia |
|---|---|---|
| `facturacion.activar.e2e.001` / `.002` | ⏭️ | sin cuenta Flow de plataforma en `.env`; `iniciarRegistroTarjeta` corta antes de cualquier llamada externa |
| `facturacion.activar.e2e.003` | ✅ | server-side (1ª pasada): con `PlatformExemption(CORTESIA)` el checklist devuelve `facturacion: {exenta: true, cumplido: true}` y `iniciarRegistroTarjeta` responde `Tu tienda tiene plan cortesía: no necesitas registrar una tarjeta.` (D8, sin tocar Flow). **Render (2ª pasada)**: en el checklist de `e2e-numeros` el ítem se lee «Tu plan es de cortesía» / «Tu tienda no paga mensualidad» con `circle-check` **teal `#1d7a70`** (cumplido) y **sin botón de acción**, mientras los 4 ítems pendientes van con `circle-dashed` **gris `#565b68`**. El prerequisito 5 se resolvió poniendo `autora` en `CONFIGURACION` por DB (ToS + credencial + producto + bases ya cumplidos) con cortesía perpetua: los 5 ítems quedan cumplidos, «Publicar mi tienda» habilitado y el **click real** deja la notificación «¡Tu tienda está publicada!» + badge `Publicada` **sin pasar por Flow** — DB después: `autora` `PUBLICADA`, **0 `PlatformSubscription`**, 0 `PlatformBillingCustomer`, storefront 200 |
| `facturacion.cupon.e2e.001` | ⏭️ | exige el redirect real de Flow |
| `facturacion.cupon.e2e.002` | ⏭️ | 1ª pasada: `flow:cupones -- listar` corre (`= no hay cupones creados.`); `crear` aborta por falta de credenciales **sin dejar la fila local**. **2ª pasada (navegador + CLI, con la fila local del cupón sembrada por DB)**: tipear **`e2e50` en minúscula** en «¿Tienes un código?» y darle a «Continuar» ⇒ el código se **normaliza a `E2E50`**, se **RESERVA** (contador `canjes=1`, 1 `PlatformCouponRedemption` con `subscriptionId` NULL) y el redirect queda **ABANDONADO** porque falta la credencial: la UI lo dice en una notificación **roja** con el mensaje fail-fast exacto y el modal sigue abierto sin navegar. `npm run flow:cupones -- listar` imprime entonces **`canjes 0/1 (+1 reserva/s en curso)`** — NO `1/1` — con la línea de trazabilidad (fecha, nombre de la Tienda, correo del Pagador, `[reserva en curso]`); **reintentar no duplica** la reserva (sigue en 1); y `--maxCanjes 1` (flag inexistente) **falla listando los flags válidos** antes de tocar Flow, sin crear un cupón ilimitado. Queda pendiente SOLO la mitad Flow: `crear` contra el sandbox, ver el `flowCouponId` en el panel de Flow y que un `crear` repetido no deje un segundo cupón allá |
| `facturacion.pausa.e2e.001` | ✅ | `/`, `/producto/<id>` y `/checkout` → **307 → `/en-pausa`**; `/en-pausa` → 200 con «Tienda de la Autora (piloto) está en pausa», «Esta tienda no está recibiendo pedidos por ahora» y el aviso de la descarga; `<meta name="robots" content="noindex"/>`; **cero** ocurrencias de pago/plan/mora/deuda/suscrip/factur en el HTML. Devuelto a `AL_DIA`: `/` → 200 y `/en-pausa` → 307 a `/`. Extra (nota «el gate es server-side»): `checkout.iniciarCheckout` por HTTP con la tienda en pausa responde `Esta tienda no está recibiendo pedidos por ahora.` y deja **0 órdenes** |
| `facturacion.pausa.e2e.002` | ✅ | server-side (1ª pasada): las 5 rutas del panel → **307 → `/admin/plan`**; `/admin/plan` → 200; `getAvisoFacturacion` = `{aviso:"EN_PAUSA_POR_PAGO", paymentLink:"…", enPausa:true}`. **Render (2ª pasada)**, con la suscripción en `EN_PAUSA_POR_PAGO` y un invoice `VENCIDA` con `paymentLink`: los 5 redirects se ven **en el navegador** (`/admin/productos`, `/admin`, `/admin/ventas`, `/admin/sorteo`, `/admin/configuracion` terminan en `/admin/plan`), el banner es **ROJO `#c03e2e`** con título «Tu tienda está en pausa» y botón **«Pagar ahora»** cuyo `href` ES el `paymentLink` (con `target="_blank"`), el **rail muestra solo «Plan»**, y los badges van `En pausa por pago` rojo / cobro `Impago` rojo / `Pagado` teal. Contraste **`COBRO_PENDIENTE`**: `/admin/productos` responde **200 sin redirect** con su contenido, el banner es **ÁMBAR `#a06b08`** («No pudimos cobrar tu plan», ícono `alert-triangle`) con «Pagar ahora» + «Ver mi plan», y el **rail queda COMPLETO**. El banner se confirmó **GLOBAL** (aparece fuera de `/admin/plan`) |
| `facturacion.pausa.e2e.003` | ✅ | con la tienda en pausa, `/api/descargas/<token>` → **302** y `/checkout/retorno?token=<token real>` → **200**, idénticos al baseline previo a la pausa |
| `facturacion.cancelar.e2e.001` / `.002` | ⏭️ | la cancelación pega contra `subscription/cancel` real |
| `facturacion.cancelar.e2e.003` | ✅ | server-side (1ª pasada): inducido `CANCELADA`, storefront → `/en-pausa`, `/admin` → `/admin/plan`, `{aviso:"SIN_PLAN", enPausa:true}` y la tarjeta sigue en el payload. **Render (2ª pasada)**: banner **ROJO** «Tu tienda no tiene un plan activo», **rail solo «Plan»**, badge `CANCELADA` + «Cancelado: tu tienda vende hasta el 26 jul 2026» + «Tarjeta Visa terminada en 4242» (la tarjeta **sobrevive**), botón **«Reactivar mi plan»** presente y «Cancelar mi plan» **ausente**. **Click real** en «Reactivar mi plan» ⇒ abre el modal «Activa tu plan» con el precio del server (**$25.000/mes**), el input de código y «Tu tarjeta la guarda Flow, no Sortéatelo» — **no vuelve a pedir el registro completo** |
| `facturacion.cortesia.e2e.001` | ✅ | server-side (1ª pasada): `getEstadoPlan` con exención perpetua devuelve `{exenta:true, suscripcion:null, tarjeta:null, historial:[]}` y `aviso:null`. **Render (2ª pasada)**, con `PlatformExemption(CORTESIA)` real: se lee **«Plan cortesía»** + «Tu tienda vende sin costo, **sin fecha de término**», **sin badge, sin monto, sin botón** y **SIN banner**, con el **rail completo** y el storefront en 200. Con `exentaHasta = +90d` el mismo bloque dice «Tu tienda vende sin costo **hasta el 24 oct 2026**» y agrega «Después de esa fecha vas a poder activar tu plan acá mismo: **$25.000** al mes, IVA incluido» — y sigue sin banner. El «publica sin pasar por Flow» está en `activar.e2e.003` |
| `facturacion.cortesia.e2e.002` | ✅ | server-side (1ª pasada): la ventana de 7 días es **lazy** — `+4d` ⇒ `EXENCION_POR_EXPIRAR`, `+30d` ⇒ `aviso:null`, pasado ⇒ `EXENCION_EXPIRADA` + `enPausa:true`. **Render (2ª pasada)**: con `+4d`, el banner aparece en **`/admin/ventas`** (⇒ es **global**, no solo en Plan), es **ÁMBAR `#a06b08`** con ícono **`clock`** (una fecha que se acerca, no algo que falló), titula «Tu plan cortesía está por terminar» y **nombra la fecha exacta** («hasta el 30 jul 2026»), el **rail sigue completo**, el storefront en 200, y el botón secundario dice **«Ver mi plan»** — NO «Activar mi plan» (D8). **Seguido el botón**, `/admin/plan` explica qué pasa después: «Después de esa fecha vas a poder activar tu plan acá mismo: $25.000 al mes, IVA incluido» (el CTA aterriza en algo que existe). Con `+30d` el banner **desaparece**. Con la fecha en el **pasado** y solo recargar (sin cron, sin job, sin redeploy): banner **ROJO** «Tu plan cortesía terminó» (ícono `alert-triangle`), **rail reducido a «Plan»**, storefront → `/en-pausa`, `/admin/productos` → `/admin/plan`, y **ahí sí** aparece «Activar mi plan» con «Tu plan sería de $25.000 al mes, IVA incluido» |
| `facturacion.cortesia.e2e.003` | ⏭️ | exige arrancar el redirect real de Flow |
| `facturacion.cron.e2e.001` | ✅ | sin header → **401**; `Bearer` incorrecto → **401**; `POST` con el bearer correcto → **405**; sin efectos |
| `facturacion.cron.e2e.002` | ✅ | `proximoCobroAt = +1d` ⇒ `{"ok":true,"renovaciones":1,"exenciones":0,"enviados":1,"fallidos":0}` y `renovacionAvisadaPara == proximoCobroAt`; 2ª corrida ⇒ `renovaciones:0`; con una fecha de cobro NUEVA y la marca vieja intacta ⇒ vuelve a avisar (`renovaciones:1`) — la marca es una fecha, no un flag. La bandeja la confirma el usuario |
| `facturacion.cron.e2e.003` | ✅ | cortesía a 3 días **sin** plan ⇒ `{"exenciones":1,"enviados":1}` + `avisoExpiracionEnviadoAt` sellado; re-corrida ⇒ `exenciones:0`; la MISMA cortesía con una suscripción `AL_DIA` detrás ⇒ `exenciones:0` y cero envíos (la misma decisión que toma el banner). La bandeja la confirma el usuario |
| `facturacion.plan.e2e.001` | ✅ | **Render (2ª pasada)** con suscripción `AL_DIA` + 2 invoices inducidos por DB (el flujo sandbox de `activar.e2e.001` sigue ⏭️, y este archivo ya autoriza forzar el estado del cobro por DB): la card muestra badge **«Al día» teal `#1d7a70`**, **$25.000 /mes**, «Próximo cobro: 15 ago 2026» y **«Tarjeta Visa terminada en 4242»** (marca + últimos 4, nada más); la tabla **«Cobros»** trae Fecha / Monto / Estado ordenada de la más nueva a la más vieja, la fila `PAGADA` va con badge teal y **sin** botón, y la `FALLIDA` con badge **ámbar `#a06b08`** (jamás rojo) + botón **«Pagar»** con `href` = `paymentLink`, **`target="_blank"`** y `rel="noreferrer"`. Montos con `tabular-nums` y formato CLP (`$25.000`). **I7 en la respuesta de red del navegador**: `tarjeta` = `{marca:"Visa", ultimos4:"4242"}` y nada más; el objeto `suscripcion` NO trae `flowSubscriptionId` ni el `userId`/`pagadorId` del Pagador (el único «token» del JSON es el del `paymentLink` de Flow) |
| `facturacion.plan.e2e.002` | ⏭️ | el cambio de tarjeta es un registro real contra Flow |
| `facturacion.plan.e2e.003` | ✅ | server-side (1ª pasada): con `PlatformExemption(CORTESIA)` **sobre** una suscripción `AL_DIA` el payload trae `exenta:true` **y** la suscripción completa. **Render (2ª pasada)**: la pantalla muestra «Plan cortesía» + «sin fecha de término» **y además** «Además tienes un plan activo, que se sigue cobrando todos los meses. Si no lo necesitas mientras dure la cortesía, puedes cancelarlo acá» + «Plan de tu tienda» con badge **Al día**, **$25.000 /mes**, la tarjeta **Visa 4242**, «Cambiar tarjeta», **«Cancelar mi plan»** y la tabla «Cobros». El pre-existente que F10 cerró, verificado en pantalla |

### Design compliance (§3.5) — cerrado en la 2ª pasada, **cero violaciones**

Colores leídos con `getComputedStyle` en el navegador y cruzados contra `docs/design.md`:

| Superficie | Token esperado | Medido | Veredicto |
|---|---|---|---|
| Banner `COBRO_PENDIENTE` | `pendiente` ámbar `#a06b08` | `rgb(160,107,8)` | ✅ **jamás en rojo** (§9) |
| Banner `EXENCION_POR_EXPIRAR` | `pendiente` ámbar | `rgb(160,107,8)` | ✅ ídem, + ícono `clock` (vs. `alert-triangle` de lo que falló) |
| Banner `EN_PAUSA_POR_PAGO` / `SIN_PLAN` / `EXENCION_EXPIRADA` | `red` ladrillo `#c03e2e` | `rgb(192,62,46)` | ✅ el rojo corresponde: la tienda dejó de vender |
| Badge suscripción `AL_DIA` | `exito` teal `#1d7a70` | `rgb(29,122,112)` | ✅ |
| Badge cobro `FALLIDA` | `pendiente` ámbar | `rgb(160,107,8)` | ✅ el rojo es de `VENCIDA`, que salió `rgb(192,62,46)` |
| Checklist: ítem cumplido / pendiente | teal / `gray` frío `#565b68` | `rgb(29,122,112)` / `rgb(86,91,104)` | ✅ pendiente **nunca en rojo** |
| Aviso «segunda tienda a mitad de precio» | `gray` (no teal: no es un «cumplido») | `rgb(86,91,104)` | ✅ |
| Montos | `Intl.NumberFormat` CLP + `tabular-nums` | `$25.000` / `$12.500`, `font-variant-numeric: tabular-nums` | ✅ nada concatenado a mano |
| Motion | transiciones default de Mantine (§7) | modal y notificaciones con el fade/pop default | ✅ sin springs ni zooms |

Única observación tipográfica (**no es violación de esta feature**): los montos van en Instrument Sans
con `tabular-nums`, no en IBM Plex Mono. Es la convención que YA usan las tablas del panel
(`ventas.tsx`), así que la página Plan es consistente con su vecindario; si se quiere el mono de §3
para montos, es una decisión de alcance panel-completo, no de facturación.

### Las 2 notas de UX de la 1ª pasada, reproducidas en el navegador

1. **Parpadeo del rail (confirmado)**: con la tienda en pausa, el **HTML del SSR** de `/admin/plan`
   trae el rail COMPLETO (`Resumen`/`Productos`/`Ventas`/`Sorteo`/`Plan`/`Configuración`) y tras
   hidratar queda **solo «Plan»** ⇒ hay 5 ítems que se pintan y rebotan (`admin-layout.tsx:238`
   deriva `enPausa` de la query). La autoridad está bien puesta —los 5 redirects son server-side y se
   volvieron a ver uno por uno—, así que sigue siendo **nota de UX y no bug**.
2. **`/editor` fuera de la restricción (confirmado)**: con la tienda en pausa responde **200** sin
   redirect, mientras las 5 rutas `/admin/*` sí redirigen. Editar sin vender no cobra nada, pero este
   archivo dice «sin Editor de la tienda» hablando del rail: conviene que la decisión quede explícita.

## Evidencia por check — 3ª pasada (SANDBOX REAL), 2026-07-26

| check | marca | evidencia |
|---|---|---|
| `facturacion.activar.e2e.001` | ❌ | Todo lo previo al redirect ✅: checklist con «Activa tu plan» como ÚNICO pendiente (gris `circle-dashed`, los otros 4 en teal), modal con **$25.000 /mes** del server. **Falla en «Continuar»** (blocker 1: URL sin `?token=` ⇒ «Error Processing Request») y otra vez al volver (blocker 2: `POST /admin/plan/retorno` → 307 → `/login`). Forzando la URL con token y el retorno por GET, el resto funciona **entero**: registro real con VISA 4051…6623 → `getRegisterStatus` = `{status:"1", customerId, creditCardType:"Visa", last4CardDigits:"6623"}` → «¡Tu plan está activo y tu tienda publicada!» → DB `PlatformSubscription` `plan=FULL`, `montoBruto=25000`, `estado=AL_DIA`, `flowSubscriptionId=sus_r4eaeefdbc`, período 26-jul→25-ago; `PlatformBillingCustomer` con `Visa`/`6623` y nada más; `Tenant=PUBLICADA` |
| `facturacion.activar.e2e.002` | ❌ | Mismos 2 blockers. Verificado con una FULL **realmente activa** del mismo Pagador: el modal de la 2ª tienda dice «Tienda adicional / **$12.500 /mes** / Es tu segunda tienda en adelante: va a mitad de precio». Forzado el retorno: `plan=ADICIONAL`, `montoBruto=12500`, `flowPlanId=sorteatelo-tienda-adicional`. La página de retorno muestra la rama honesta cuando el checklist no da para publicar: «Tu plan está activo» + «Antes de publicar debes aceptar los Términos de Servicio» |
| `facturacion.cupon.e2e.001` | ❌ | El cupón **no se puede crear por CLI** (blocker 3) y «Continuar» no llega a Flow (blocker 1). Con el cupón creado a mano en Flow (id 1263) + fila local: tipear **`e2e50` en minúscula** normaliza a `E2E50` y RESERVA; forzado el retorno, la redención queda **ligada** a la suscripción y **en Flow la suscripción trae `discount:[{coupon:{id:1263, percent_off:"50.00"}}]`** con la factura del período en **$6.250**. Código inexistente ⇒ notificación con el mensaje **neutral** exacto («Ese código no es válido o ya no se puede usar. Revísalo, o continúa sin código.») |
| `facturacion.cupon.e2e.002` | ❌ | **Blocker 3**: `npm run flow:cupones -- crear` falla en las DOS ramas contra el sandbox real — con `--meses N` ⇒ `duration=2` ⇒ *«The duration must be 0 or 1»*; sin `--meses` ⇒ `duration=1` sin `times` ⇒ *«If duration = 1 times must be sent»*. Mapeo real: **`duration=0` = para siempre**, **`duration=1` + `times=N` = N períodos**. Lo demás del check SÍ quedó verificado: `listar` muestra `canjes 0/1 (+1 reserva/s en curso)` con fecha/Tienda/correo y `[reserva en curso]`, y tras el canje `canjes 1/1`; repetir `crear` con el mismo código corta con «Ya existe un cupón con el código E2E50» **antes de tocar Flow**; `--maxCanjes` (flag inexistente) falla listando los flags válidos. Nota: Flow **normaliza el `name`** quitando no-alfanuméricos |
| `facturacion.cancelar.e2e.001` | ✅ | Modal: «Tu tienda sigue vendiendo hasta el **25 ago 2026**, el fin del período que ya pagaste» + «No se borra nada…»; botones «Mejor no» / «Cancelar el plan», este último con fondo **rojo `rgb(192,62,46)` = `#c03e2e`**. Confirmado ⇒ «**Cancelado: tu tienda vende hasta el 25 ago 2026**», el botón «Cancelar mi plan» **desaparece**, notificación de cierre. DB: `cancelacionSolicitadaAt` + `cancelacionEfectivaAt` sellados y **`estado` sigue `AL_DIA`**. Flow: `cancel_at_period_end=1`, `cancel_at=2026-08-25`, `status=1` (viva). Storefront de la tienda: **200** |
| `facturacion.cancelar.e2e.002` | 🟡 | El envío ocurrió (el use case leyó `PlatformBillingCustomer.email` y `RESEND_API_KEY` está puesta), pero **la bandeja la confirma el usuario**. La mitad anti-duplicado SÍ está verificada: reintentar la mutation devuelve 200 con la misma fecha y `cancelacionSolicitadaAt` **intacto** ⇒ el guard atómico corta antes de Flow y del correo |
| `facturacion.cortesia.e2e.003` | ✅ | En una tienda PUBLICADA sin exención (⇒ en pausa) `/admin/plan` ofrece «Activar mi plan»; abierto el modal y dado «Continuar» (customer resuelto en Flow), se insertó `PlatformExemption(GRANDFATHER)` **en el medio**; al volver, la página dice «**Tu tienda quedó con plan cortesía: no se creó ningún cobro y no necesitas registrar una tarjeta.**». DB: **0 `PlatformSubscription`** para ese tenant. En Flow, `customer/getSubscriptions` del Pagador lista las 3 suscripciones de las OTRAS pruebas y **ninguna** de esta tienda |
| `facturacion.plan.e2e.002` | ❌ | «Cambiar tarjeta» reproduce el **blocker 1** (mismo redirect sin token, `iniciarCambioDeTarjeta.ts:44`). Forzado a mano con una tarjeta DISTINTA (débito 4051 8842 3993 7763 ⇒ `RedCompra`/`7763`): la página de retorno confirma «Listo, cambiamos tu tarjeta / Los próximos cobros van a la tarjeta **RedCompra terminada en 7763**» y el **diff de DB** muestra que cambiaron SOLO `tarjetaMarca`/`tarjetaUltimos4`: la suscripción quedó **byte-idéntica** (`flowSubscriptionId`, `estado`, `periodoFin`, `proximoCobroAt` y hasta su `updatedAt`). Con un `?token=` inventado: «No pudimos cambiar tu tarjeta … Tu plan sigue activo con la tarjeta anterior» y cero cambios (nit: ese texto filtra el mensaje crudo «Flow (plataforma) /api/customer/getRegisterStatus respondió 401») |

### «A VERIFICAR CONTRA EL SANDBOX REAL» — los 9 puntos, cerrados

| # | pregunta | respuesta verificada |
|---|---|---|
| 1 | shape/casing de la notificación del webhook | **`POST` form-urlencoded con `token=<…>`** — nunca `subscriptionId`. Se resuelve con `payment/getStatus?token=`, cuyo `commerceOrder` es `<subscriptionId>_<invoiceId>_<fecha>` y trae `status`, `amount`, `payer`, `paymentData{fee, balance, transferDate}`. **El webhook actual es sordo** (blocker 4) |
| 2 | `plan/create` con un `planId` que ya existe | No hace upsert: responde **«This planId has already been used»**. Pero el endpoint correcto es el **PLURAL**: `plan/create` y `plan/get` dan `105 No services available` mientras `plans/create` / `plans/get` / `plans/list` responden 200 ⇒ **`npm run flow:planes` está roto**. Además `plans/list` **sigue listando los planes borrados con `status 0`**: un chequeo de existencia por ahí debe filtrar `status === 1` |
| 3 | numeración de `Invoice.status` / `outstanding` en un incobrable | Invoice recién emitida y ya cobrada: `status: 1`, `attemp_count: 1`, `attemped: 0`, `due_date` = creación + `days_until_due`, `amount` con **4 decimales** (`"25000.0000"`), y un bloque `payment` con `status: 2` (pagado). **El caso incobrable NO se pudo producir** (no hay tarjeta de prueba que registre y falle el cobro): sigue abierto |
| 4 | idempotencia de `cancel` y de `changePlan` | `subscription/cancel` repetido ⇒ **200** (idempotente). `subscription/changePlan` repetido ⇒ **400 `code 1001` «The selected plan is the same as the current one»** ⇒ **NO** es idempotente: el recálculo de D7 tiene que tragarse ese 1001 |
| 5 | `temporality: 2` = «desde la próxima renovación» | **No como se esperaba**: el `planId` de la suscripción cambia **en el acto** y `new_plan_scheduled_change_date` / `newPlanId` quedan **null**. Lo que sí se cumple es lo que importa: la factura ya emitida del período **no se re-cobra** (siguió en $6.250), o sea el cambio no es retroactivo. El fallback a `proximoCobroAt` que ya tiene el código es, en la práctica, el único camino |
| 6 | el `expires` de los cupones | Flow guarda `expires` como **00:00 de ese día**, pero un `subscription/create` con ese cupón **el mismo día lo aplica igual** (1.000 → 900). El riesgo que levantó el `backend-reviewer` **no se materializa** |
| 7 | re-registrar la tarjeta ⇒ ¿cobra la nueva? | Sí: la tarjeta vive en el **customer** (`customer/get` pasó a `RedCompra`/`7763` con un **`tbkUser` nuevo**) y la suscripción referencia `customerId`, no la tarjeta. La premisa de «Cambiar tarjeta» se sostiene (la prueba definitiva sería el cobro del mes siguiente) |
| 8 | qué trae `next_invoice_date` | **`"2026-08-26 00:00:00"`** — string sin zona, a medianoche **hora de Flow (Santiago)**. `new Date(...)` lo interpreta en la TZ del proceso: en esta máquina (UTC-4) quedó `2026-08-26T04:00:00Z`; **en Vercel (UTC) quedaría `00:00Z`, 4 horas antes** ⇒ el aviso del cron y las fechas de los correos se corren. Mismo formato en `period_start` / `period_end` |
| 9 | ¿Flow manda correos propios? | **Sí.** La pantalla de registro lo dice literal: «Los cargos que se efectúen serán notificados vía email a nikochaima72@gmail.com». Hay duplicación con nuestros correos (1)/(2) — no bloqueante, decisión de producto |

**Cosmético (anotado en la Bitácora)**: el nombre del plan viaja con un guion largo `—` y Flow lo guarda
**HTML-escapado** (`Sortéatelo &mdash; plan tienda`), y así sale en el dashboard y en el `subject` de cada
invoice. Se ve en las superficies de Flow, no en las nuestras: conviene un guion simple en `_precios.ts`.

## Evidencia por check — 4ª pasada (los 5 rojos, sin forzar nada), 2026-07-26 22:05–22:45

Tiendas usadas: `autora` (1ª, FULL), `demo-dreamy` (2ª, ADICIONAL), `demo-noche` (3ª, cupón),
`demo-editorial` (solo reserva/liberación, sin suscripción). Todas del mismo Pagador
`nikochaima72@gmail.com`, con la exención GRANDFATHER quitada para la corrida y devuelta al cierre.

| check | marca | evidencia |
|---|---|---|
| `facturacion.activar.e2e.001` | ✅ | Checklist de `autora` con los 4 primeros ítems en `circle-check` **teal `#1d7a70`** y «Activa tu plan» como ÚNICO pendiente (`circle-dashed` gris `#565b68`); «Ver el precio» ⇒ modal «Plan de tu tienda / **$25.000 /mes**» del server. **«Continuar» redirige solo** a `sandbox.flow.cl/app/customer/disclaimer.php?token=E3F0109384…` (blocker 1 cerrado). Registro real: VISA 4051 8856 0044 6623, 12/30, CVV 123, simulador RUT 11.111.111-1 clave 123. **Retorno visto en la pestaña de red**: `POST /api/facturacion/retorno-plan` **303** → `GET /admin/plan/retorno?token=…` **200**, con la sesión viva (blocker 2 cerrado). Pantalla: «Estamos activando tu plan…» → «**¡Tu plan está activo y tu tienda publicada!**». DB: `PlatformSubscription` `plan=FULL`, `montoBruto=25000`, `estado=AL_DIA`, `flowSubscriptionId=sus_g286f51c39`, período 26-jul→25-ago, `proximoCobroAt` 26-ago; `PlatformBillingCustomer` `Visa`/`6623` y nada más de la tarjeta; `Tenant=PUBLICADA` |
| `facturacion.activar.e2e.002` | ✅ | Con la FULL de `autora` viva, `/admin/plan` de `demo-dreamy` ya dice «Tu plan sería de **$12.500** al mes» y el modal titula «**Tienda adicional** / $12.500 /mes» + «**Es tu segunda tienda en adelante: va a mitad de precio**». Registro real completo ⇒ «¡Tu plan está activo y tu tienda publicada!». DB: `plan=ADICIONAL`, `montoBruto=12500`, `estado=AL_DIA`, `flowPlanId=sorteatelo-tienda-adicional`, `flowSubscriptionId=sus_id54131226`. **UN solo `PlatformBillingCustomer`** (`cus_qb0f1c5714`) para las 3 tiendas: es lo que sostiene el pricing del Pagador |
| `facturacion.cupon.e2e.001` | ✅ | Cupón creado **por CLI** (ya no a mano). Código inexistente `NOEXISTE99` ⇒ notificación **roja `#c03e2e`** con el mensaje neutral exacto («Ese código no es válido o ya no se puede usar. Revísalo, o continúa sin código.») y el modal **sigue abierto** sin navegar. `e2e50` **en minúscula** ⇒ se normaliza a `E2E50`, RESERVA y redirige. Completado el registro: `PlatformCouponRedemption` **ligada** al `subscriptionId` de `demo-noche`. En Flow, `sus_gd22197b8d` trae `discount:[{coupon:{id:1266, name:"E2E50", percent_off:"50.00"}}]` y la factura del período (1179473) en **$6.250** |
| `facturacion.cupon.e2e.002` | ✅ | **Blocker 3 cerrado, en las dos ramas de `duration`**: `crear --codigo E2E50 --porcentaje 50 --meses 1 --max 1` ⇒ «E2E50 creado (**flowCouponId 1266**)»; `crear --codigo E2ESIEMPRE --porcentaje 25 --max 1` (rama «para siempre», `duration=0`) ⇒ «creado (**1267**)». Ambos **visibles en el panel de Flow** como `Activo`. `listar` ⇒ `E2E50 — 50% por 1 mes · canjes 0/1` y `E2ESIEMPRE — 25% por siempre · canjes 0/1`. **El chequeo del que más se aprende**: con el redirect a medio camino, `listar` imprime **`canjes 0/1 (+1 reserva/s en curso)`** con la línea `2026-07-27  borahae (cmrzthap…) · nikochaima72@gmail.com  [reserva en curso]`; tras completar, **`canjes 1/1`** con la trazabilidad. **Liberación verificada aparte** (`demo-editorial`): reservar `E2ESIEMPRE`, abandonar el redirect, y reintentar **sin código** ⇒ vuelve a `canjes 0/1` sin línea de reserva. `crear` repetido ⇒ «Ya existe un cupón con el código E2E50» **antes de tocar Flow** (el panel de Flow sigue con UNA sola fila de E2E50). `--maxCanjes 1` ⇒ «No conozco el flag --maxCanjes. Los válidos son: …» |
| `facturacion.plan.e2e.002` | ✅ | «Cambiar tarjeta» redirige solo (mismo fix del token). Tarjeta DISTINTA: débito 4051 8842 3993 7763 ⇒ `RedCompra`/`7763`. Retorno por el 2º puente ⇒ `/admin/plan/retorno-tarjeta?token=…`: «**Listo, cambiamos tu tarjeta** / Los próximos cobros van a la tarjeta **RedCompra terminada en 7763**», y `/admin/plan` los muestra. **Diff de DB antes/después**: cambian SOLO `tarjetaMarca` y `tarjetaUltimos4`; la suscripción queda **byte-idéntica** (`flowSubscriptionId`, `estado`, `periodoFin`, `proximoCobroAt` y hasta su `updatedAt`). Con `?token=` inventado: «No pudimos cambiar tu tarjeta / No pudimos confirmar tu tarjeta con Flow. Vuelve a intentarlo en unos minutos. / Tu plan sigue activo con la tarjeta anterior», **cero cambios**, y el mensaje crudo del proveedor **ya no se filtra** (queda solo en el log del server: `[facturacion] la API de Flow falló { error: '…respondió 401…' }`) — nit de la 3ª pasada, cerrado |
| `facturacion.plan.e2e.001` | ✅ (con salvedad) | Re-verificado con datos **reales**: la card muestra badge «AL DÍA», **$25.000 /mes**, «Próximo cobro: **26 ago 2026**» (la hora de Santiago, bien) y «Tarjeta Visa terminada en 6623»; la tabla «Cobros» trae la fila real del invoice espejado (26 jul 2026 · $25.000 · «En curso», ámbar `#a06b08`). I7 en la respuesta de red: `tarjeta = {marca, ultimos4}` y el objeto `suscripcion` **sin** `flowSubscriptionId` ni `pagadorId`. **Salvedad del blocker 5**: la fila que la tabla puede mostrar hoy con datos reales es siempre «En curso» — un cobro `PAGADA` no se alcanza |
| `facturacion.cancelar.e2e.001` | ✅ (re-verificado) | Ejercido de nuevo con una suscripción real: modal «Tu tienda sigue vendiendo hasta el **25 ago 2026**, el fin del período que ya pagaste» + «No se borra nada…», botones «Mejor no» / «Cancelar el plan». Confirmado ⇒ «**Cancelado: tu tienda vende hasta el 25 ago 2026**», «Cancelar mi plan» desaparece, notificación de cierre. DB: 2 fechas selladas y `estado` intacto en `AL_DIA`. Flow: `cancel_at_period_end=1`, `cancel_at=2026-08-25`. **D7 verificado con datos reales**: se promovió `demo-dreamy` (la adicional **más antigua**) con `planProgramado=FULL` desde el 26-ago y NO `demo-noche` — pero ver el **blocker 6** |

### Los 2 blockers nuevos, con la evidencia cruda

**Blocker 5 — el espejo del invoice no sabe leer el cobro (F04).**

| | |
|---|---|
| Lo que hizo Flow | `invoice/get 1179470` ⇒ `payment.status = 2`, `paymentData.date = "2026-07-26 22:11:58"`, `fee 723`, `balance 24140` — **6 segundos** después de crear la suscripción. El dashboard lo muestra «Pagado» y la suscripción «Pago al día: Sí» |
| Lo que guardamos | `PlatformInvoice` `estado = PENDIENTE`, `pagadaAt = null` — escrito a las 22:12:06, o sea **8 segundos después del cobro** |
| La causa | `derivarEstadoInvoice` (`_invoiceFlow.ts:60-71`) decide con `paid`, `payment_date`, `outstanding` y `attemp`. Claves reales del invoice embebido en `subscription/get` (lo que usa el webhook): `amount, attemp_count, attemped, created, currency, customerId, due_date, id, next_attemp_date, period_end, period_start, status, subject, subscriptionId`. `invoice/get` agrega `chargeAttemps, error, errorDate, errorDescription, items, outsidePayment, payment{...}, paymentLink`. **`paid`, `payment_date`, `outstanding` y `attemp` no existen en ninguno de los dos** |
| Reproducción | `derivarEstadoInvoice(<payload real del invoice YA COBRADO>)` ⇒ `"PENDIENTE"` |
| Consecuencias | (1) el comprobante (1) nunca sale; (2) **el dunning está muerto**: nada llega a `FALLIDA`/`VENCIDA`, así que ninguna tienda entra en `EN_PAUSA_POR_PAGO` con datos reales y una tienda que deja de pagar **sigue vendiendo para siempre** — todo el gating de F05 se verificó solo con estados inducidos por DB; (3) `paymentLink` nunca se puebla (además solo viene en `invoice/get`, y acá es `null`) ⇒ «Pagar ahora» sin link; (4) la rama `ANULADA` al cancelar tampoco se alcanza |
| Pista para el fix | La evidencia de pago **ya está en el borde**: `resolverSuscripcionDeToken` llama `payment/getStatus` (status 1 pend / 2 pagado / 3 rechazado / 4 anulado) y parsea `<subscriptionId>_<invoiceId>_<fecha>`, pero descarta el status y el invoiceId — devuelve solo el `flowSubscriptionId` (`resolverSuscripcionDeToken.ts:59`) |
| Trampa del fix | En un invoice **pagado** Flow manda `attemp_count: 1` y `attemped: 0` ⇒ mapear `intentos := attemp_count` leería un cobro exitoso como `FALLIDA`. El caso de cobro **fallido** sigue sin poder producirse en sandbox (punto 3 de «A VERIFICAR»), y ahora es load-bearing |

**Blocker 6 — la promoción de D7 cobra un mes de más (F06).**

Al cancelar la FULL de `autora`, el recálculo promovió `demo-dreamy` con `subscription/changePlan`
(`temporality: 2`). Flow **emitió y cobró en el acto** una factura extra:

| invoice | monto | subject | cobrado |
|---|---|---|---|
| 1179471 | $12.500 | `… plan tienda adicional - período: 2026-07-26 / 2026-08-25` | `payment.status 2` — 22:17:59 |
| 1179474 | $12.500 | `**Cambio de plan a** … plan tienda - período: 2026-07-26 / 2026-08-25` | `payment.status 2` — 22:37:44, `fee 361`, `balance 12070` |

O sea: **$25.000 cobrados por un mismo período cuyo plan vale $12.500**, a un Organizador que no pidió
nada (su vecino canceló). Contradice D6 («el mes cobrado se respeta, sin prorrateos») y el principio de
D16 («al Organizador no se le cobra doble»). La 3ª pasada vio que la factura vieja no se re-cobraba
—cierto— pero no que Flow emite una nueva. Nuestro espejo local hace lo correcto (deja `plan=ADICIONAL`
+ `planProgramado=FULL` desde el 26-ago); el que cobra de más es Flow, en el acto, por nuestra llamada.

### Cierre de la 4ª pasada — verificación independiente, 2026-07-26 23:00 (2º `feature-tester`)

El tester de la 4ª pasada cayó por un corte de conexión **después** de escribir todo lo de arriba y
**antes** de la Bitácora del plan. La corrida **no se repitió**: se reconstruyó desde
`tasks/.e2e-run-facturacion-sandbox2.log` y se re-verificó lo que el log no respaldaba, trayendo de
nuevo los payloads crudos desde la API de Flow. Resultado: **todo lo documentado arriba se sostiene.**

| qué se re-verificó | resultado |
|---|---|
| **Blocker 5** (no estaba completo en el log) | **Reproducido en vivo**: `invoice/get 1179470` (pagado, `payment.status 2`) ⇒ `derivarEstadoInvoice(...)` = **`PENDIENTE`**; ídem con el invoice **embebido** en `subscription/get`, que es el que usa el webhook. Las 4 claves que lee (`paid`, `payment_date`, `outstanding`, `attemp`) **no existen en ninguno de los dos payloads**. `paymentLink` = `null` en los 4 invoices |
| **Blocker 6** (**no estaba en el log**, solo acá) | **Confirmado con los invoices crudos**: `1179471` y `1179474` son la **misma suscripción** `sus_id54131226` y el **mismo período** `2026-07-26 → 2026-08-25`, $12.500 cada uno, **los dos con `payment.status 2`** (22:17:59 y 22:37:44). $25.000 cobrados por un período de $12.500. Extra: `sus_id54131226` hoy tiene `planId = sorteatelo-tienda-full` ⇒ el `changePlan` movió el plan **en el acto** |
| **Higiene en Flow** | **Nada quedó por hacer.** Las 3 suscripciones de la pasada en `status 4`; `customer/getSubscriptions` de los 4 customers ⇒ **las 7 históricas todas en `status 4`**, `morose 0`, `next_invoice_date null` ⇒ **cero cobro recurrente vivo**. `customer/list?status=1` ⇒ **`total 0`**. Los 5 cupones en `status 0`. `plans/list`: los 2 planes reales **vivos en `status 1`** ($25.000 / $12.500) y las 2 sondas en `status 0` |
| **Higiene en DB** | **0 filas** en `PlatformSubscription` / `PlatformInvoice` / `PlatformBillingCustomer` / `PlatformCoupon` / `PlatformCouponRedemption`; **7 exenciones `GRANDFATHER`**; `autora` y las 7 tiendas del set en `PUBLICADA`; storefronts 200 |
| **Entorno** | `:3001` sano y **una sola instancia de este repo** (el `:3000` es otro proyecto, `grillos-ai`). Túnel `cloudflared` **aún vivo** (webhook responde 200) — a decisión del usuario bajarlo |

**Dato de contrato que apareció al verificar** (corrobora el fix del blocker 3): `coupon/get` devuelve
`duration` **numérico** (`1266` ⇒ `duration 1` + `times 1`; `1267` ⇒ `duration 0` + `times null`)
mientras `coupon/list` lo devuelve como **etiqueta** (`"Definite"` / `"Undefined"`). Los contadores
cuadran: `redemtions` = 1 en `E2E50` y **0** en `E2ESIEMPRE` (la reserva se liberó sola).

**Residuo AJENO que no se tocó**: el tenant `ft-f04-ms2mt4uz` («Tienda Resultado [F04]») lo creó el
carril `26-07-26-correo-sistema-correos-comprador` (su F04 es «C4/C5 resultado»), no esta feature.

**Lectura honesta del conjunto**: **19/20 checks `[x]` + 1 🟡**, y aun así **ningún checkbox cubre los
blockers 5 y 6**. Los 20 checks pueden estar verdes y F04 (espejo/dunning) y F06 (promoción D7) seguir
sin poder confiarse en producción.

## Evidencia por check — 5ª pasada (LOS DOS BLOCKERS, CON PLATA REAL), 2026-07-27 00:10–00:45

Tiendas: `autora` (A, FULL $25.000), `demo-dreamy` (B, ADICIONAL $12.500) y `demo-noche` (el impago),
las tres del mismo Pagador `nikochaima72@gmail.com`, con la exención GRANDFATHER quitada para la
corrida y repuesta al cierre. **Los 7 checks del scope pasaron, y el 🟡 de `cancelar.e2e.002` quedó
cerrado.** Cero auto-retries: nada hubo que reintentar.

**Carril**: chrome-devtools estaba lockeado por el navegador HUÉRFANO del tester de la 4ª pasada (perfil
sin escrituras desde las 22:51; ese agente murió por un corte de conexión). Playwright estaba VIVO
(escrituras a las 00:04 y 00:08) y **no se tocó**. Se recuperó solo el huérfano del propio carril; la
sesión de NextAuth sobrevivió.

| check | marca | evidencia |
|---|---|---|
| `facturacion.espejo.e2e.001` | ✅ | Plan de `autora` activado por el flujo real (modal $25.000 del server → redirect con `?token=` → VISA Transbank → puente POST→303 → «¡Tu plan está activo y tu tienda publicada!»). `sus_k192dd0650`, período 27-jul→26-ago, `proximoCobroAt` 27-ago (todas a 04:00Z = medianoche de Santiago: el fix de `fechaFlow`, bien). Flow cobró el invoice **1180181** a las 00:14:36. **A las 00:16:06 la notificación real entró por el túnel y el ledger escribió `estado = PAGADA`** —antes quedaba `PENDIENTE` para siempre— con **`pagadaAt = 2026-07-27T04:14:37.000Z`, que coincide AL SEGUNDO con `payment.paymentData.date`**, `intentos = 1`, y la suscripción en `AL_DIA`. Cruce contra `invoice/get 1180181`: **`status: 1`** y **`payment.status: 2`** (fee 723, balance 24140), justo lo que el check pedía |
| `facturacion.espejo.e2e.002` | ✅ | **El correo (1) salió por primera vez en 5 pasadas**: Resend id `234f13d4-90c9-4c30-82da-dfdcb3579a85`, «Comprobante del plan de Tienda de la Autora (piloto)» → `nikochaima72@gmail.com`, **`last_event: delivered`** (confirmación del proveedor, no solo «el use case llamó a enviar»). Cuerpo: «Recibimos el pago… **Monto: $25.000** (IVA incluido)… Si necesitas la boleta de este cobro, responde este correo y la emitimos» (coherente con D13). Reprocesada la notificación ⇒ `{"received":true,"ruteo":"PROCESADA","estado":"AL_DIA"}` y sigue habiendo **1 sola** fila de invoice y **1 solo** comprobante. *Salvedad de método*: el token ORIGINAL de la notificación de Flow **no es recuperable** (no hay log del túnel y `payment/getStatusByFlowOrder` no lo devuelve), así que el reproceso se hizo por la puerta documentada `subscriptionId` (`facturacion.webhook.003`), que entra al MISMO `procesarNotificacionSuscripcion`. Segunda evidencia independiente del mismo correo: el cobro de B disparó «Comprobante del plan de borahae», también `delivered` |
| `facturacion.espejo.e2e.003` | ✅ | `/admin/plan` de `autora`: badge **«AL DÍA» teal `rgb(29,122,112)`**, **$25.000 /mes**, «Próximo cobro: **27 ago 2026**», «Tarjeta **Visa** terminada en **6623**», y la tabla «Cobros» con **27 jul 2026 · $25.000 · «PAGADO»** en teal — **no** «En curso» ámbar, que era la salvedad de la 4ª pasada. La fila pagada **no** tiene botón «Pagar», la página **no** tiene banner y el rail está COMPLETO. Montos con `font-variant-numeric: tabular-nums` |
| `facturacion.espejo.e2e.004` | ✅ (con salvedad) | **Se pudo producir el dunning, por primera vez.** Dos intentos: (1) la tarjeta de RECHAZO de Transbank (MASTERCARD 5186 0595 5959 0568) **falla en la INSCRIPCIÓN**, no en el cobro ⇒ «No pudimos activar tu plan / Flow no confirmó el registro de tu tarjeta» y **cero filas creadas** (de paso, el guard del registro verificado en vivo); (2) la vía que sí funciona: **`customer/unRegister`** deja al customer en `pay_mode: manual` («no se podrá hacer cargos automáticos», dice la doc de Flow) y entonces todo invoice nuevo nace impago. Resultado: **invoice 1180186 con `status: 0`**, `amount 12500`, `attemp_count 1`, `attemped 0`, `due_date 2026-07-30`, `payment.status 1` y **`paymentLink` poblado** — la palanca entera de D4, que nunca había tenido evidencia. `invoice/getOverDue` antes de esto daba **total 0**: en este sandbox jamás había existido un impago. **Cadena completa, con la fila local ligada**: webhook ⇒ `{"ruteo":"PROCESADA","estado":"COBRO_PENDIENTE"}`; ledger ⇒ invoice **`FALLIDA`**, `intentos = 1` (= `attemp_count`), **`paymentLink` poblado desde `invoice/get`** (el invoice EMBEBIDO no lo trae: el enriquecimiento del fix es lo que lo salva); **correo (2)** «No pudimos cobrar el plan de borahae» → **delivered**, con el link EXACTO de Flow y el copy de D4 («Vamos a reintentarlo… tu tienda sigue vendiendo con normalidad»); panel con banner **ÁMBAR `#a06b08`** + «Pagar ahora» al `paymentLink` real (`target="_blank"`, `rel="noreferrer"`), **rail COMPLETO**, badge «COBRO PENDIENTE» y fila «NO SE PUDO COBRAR» con su «Pagar»; **storefront en 200** (D4: en reintentos la tienda sigue vendiendo). **Salvedad, lo único que sigue sin evidencia real**: el AGOTAMIENTO de los 3 reintentos (Flow los espacia en días), o sea la transición `FALLIDA → VENCIDA → EN_PAUSA_POR_PAGO`. Sí quedó ejercida la derivación sobre el **shape real** con `attemp_count: 3` ⇒ `VENCIDA`, y la pausa en pantalla ya estaba ✅ desde la 2ª pasada con estado inducido |
| `facturacion.cancelar.e2e.002` | ✅ | Cancelada la full de `autora`, salió «Cancelamos el plan de Tienda de la Autora (piloto)» → **delivered**, nombrando «**26 ago 2026**» y el «no se borra nada». Re-disparada la mutation a mano: **200 con la misma fecha**, `cancelacionSolicitadaAt` **intacto** y **ningún segundo correo** (el guard atómico corta antes de Flow y del envío). Cierra el 🟡 que venía desde la 3ª pasada |
| `facturacion.cancelar.e2e.004` | ✅ | **El blocker 6 está muerto.** Baseline de B en Flow: `planId = sorteatelo-tienda-adicional`, invoices `[1180182 $12.500]`. Cancelada A por UI (modal «vende hasta el 26 ago 2026», confirmar en rojo), **inmediatamente después** B en Flow: `planId` **SIGUE** `sorteatelo-tienda-adicional` y la lista de invoices es **IDÉNTICA** — **cero «Cambio de plan a …»**. En la 4ª pasada, en este mismo punto, Flow ya había emitido y cobrado 1179474 por $12.500 de más. DB: A con `cancelacionSolicitadaAt`/`cancelacionEfectivaAt` sellados y `estado` intacto en **`AL_DIA`** (D6); B con `plan: ADICIONAL`, **`planProgramado: FULL`** y **`planProgramadoDesde: 2026-08-27T04:00Z`** = la MÁS TARDÍA entre el próximo cobro de B (27-ago) y el fin del período de A (26-ago), tal cual la regla del implementer |
| `facturacion.cancelar.e2e.005` | ✅ | Cron con el período viejo de B corriendo ⇒ `{"ok":true,"renovaciones":0,"exenciones":0,"promociones":0,"enviados":0,"fallidos":0}`. En Flow B sigue con **1 invoice** y en plan adicional; en DB, `planProgramado` sigue pendiente sin tocarse |
| `facturacion.cancelar.e2e.006` | ✅ | Forzado por DB `planProgramadoDesde := periodoInicio` de B (el propio archivo autoriza mover esas fechas) ⇒ predicado `periodoInicio >= planProgramadoDesde` verdadero. Cron ⇒ **`promociones: 1`**; en Flow B pasa a `sorteatelo-tienda-full`; en DB queda `plan: FULL`, `montoBruto: 25000`, **`planProgramado: null`**. **EL DATO QUE NINGUNA PASADA TENÍA — cuánto cobra Flow al aplicarse la promoción**: emite y cobra el invoice **1180183 = $12.500** («Cambio de plan a … - período: 2026-07-27 / 2026-08-26», `payment.status 2` a las 00:27:45, fee 361, balance 12070). Es **el DELTA** (25.000 − 12.500), así que el período 27-jul→26-ago termina cobrado **12.500 + 12.500 = $25.000**, exactamente el precio full de ese período: **no se cobra de más, se completa**. El delta disparó su propio comprobante, también entregado. Cron de nuevo ⇒ `promociones: 0` y **cero invoices nuevos** |

### Datos de contrato de Flow que aparecieron en esta pasada

| dato | por qué importa |
|---|---|
| **Un invoice PAGADO y uno IMPAGO son idénticos salvo `status`** | 1180181 (pagado): `status 1, attemp_count 1, attemped 0`. 1180186 (impago): `status 0, attemp_count 1, attemped 0`. Con los dos payloads reales lado a lado queda probado que `attemp_count`/`attemped` **no distinguen nada** y que `status` era el único camino: la decisión del fix del blocker 5 está validada por datos, no por documentación |
| `paymentLink` **solo** viene en `invoice/get`, y solo si está impago | El invoice embebido en `subscription/get` no lo trae ⇒ sin el enriquecimiento que agregó el fix, «Pagar ahora» quedaría sin link justo cuando hace falta |
| **`morose` no es 0/1**: la suscripción impaga vino con **`morose: 2`** | D15 asumía un flag. Hoy no se usa para decidir (se deriva de `status`), así que no rompe nada — pero conviene que nadie construya sobre «morose es booleano» |
| Un **downgrade** de plan no devuelve plata: emite un invoice de **$0** y deja `balance -12500` como crédito | Ese crédito se come el delta del siguiente upgrade (otro invoice en $0). Relevante si alguna vez se ofrece bajar de plan |
| `subscription/changePlan` **no acepta `temporality`** y aplica en el acto | Ya estaba en la Bitácora del implementer; esta pasada lo confirma en los dos sentidos (upgrade y downgrade) |

### Hallazgo nuevo (no bloqueante) — la alerta del punto ciego es ruido, no señal

`esCobroAbandonadoSinSuspender` devuelve **`true` para un impago normal recién emitido** (el real:
`status 0`, `attemp_count 1`, `attemped 0`). Ahora sabemos por payload real que **`attemped: 0` es el
estado NORMAL** —lo trae hasta un invoice ya pagado—, así que el predicado `attemped ===
FLOW_NO_SE_COBRARA` no discrimina el caso ambiguo: el log «ruidoso» que el fix agregó se va a disparar
en CADA cobro impago. La lectura del estado sigue siendo correcta y conservadora (nadie se suspende de
más); lo que no sirve, como está, es la alerta. Es de F04 y no bloquea ningún check.

### Rojos de Vitest de esta corrida — los 4 son AJENOS

`src/__tests__/server/facturacion` está **224/224 verde** (24 archivos), y `scripts` + `services` +
`panel` + `tenants` en 274 passed + 1 skipped. Los 4 rojos están todos en
`src/__tests__/server/storefront` y aparecieron porque **HEAD se movió durante la corrida** (la sesión
arrancó en `4208c80` y terminó en `15c1c4e`; la facturación quedó commiteada en `56ecc20`):

1. `temaEnPaginasDePlataforma.test.ts` ×3 — `db.raffle.findFirst` es `undefined` en el doble: el carril
   de checkout agregó una query de sorteo a `getPropsCheckout` (`getStorefrontProps.ts:203`) sin
   actualizar el fake. Nada que ver con facturación.
2. `gateVentaEnElBorde.test.ts::facturacion.gate.borde.005` — este SÍ es un guard de facturación, y lo
   rompió el carril del navbar (`c248164`): `pages/entrega/[token].tsx` ahora importa `resolverChrome`
   y `resolverNavPaginas` de `MODULO_PROPS`, y el guard exige lista VACÍA. **Verificado que NO es un
   bug**: los dos helpers reciben `tenantSlug` explícito y no leen el host ni llaman a
   `resolverBrandingSSR`, así que la invariante que el guard protege —la página de entrega es
   host-agnóstica porque el enlace del correo apunta al apex— **sigue en pie**. Lo que quedó viejo es la
   aserción `toEqual([])`, que debería pasar a una allowlist de helpers host-agnósticos. **No lo toqué**:
   aflojar un guard es decisión de quien lo escribió, no del tester.

### Higiene de la 5ª pasada

- **Flow**: las 3 suscripciones de la corrida en `status 4`; barrido por los 5 customers históricos ⇒ 10
  suscripciones, **todas `status 4`, `morose 0`, sin `next_invoice_date`** = cero cobro recurrente vivo.
  El invoice impago 1180186 se **anuló** (`invoice/cancel` ⇒ `status 2`) y `invoice/getOverDue` ⇒ **total
  0**: no queda deuda viva ni cobro por email pendiente. `customer/delete cus_fcef29e32f` ⇒ `status 0`;
  `customer/list status=1` ⇒ **total 0**. Los 2 planes reales siguen vivos (`status 1`) con el
  `urlCallback` del túnel. No se creó ningún cupón.
- **DB**: **0 filas** en las 5 tablas `Platform*` y las **7 exenciones GRANDFATHER** repuestas, todas
  perpetuas; las 7 tiendas `PUBLICADA` y sus 7 storefronts en 200. **Sin residuo**.

**Fuera del alcance de esta feature, anotado al pasar**: `npm run grandfather:tiendas` en seco lista
bien (`autora — candidata` cuando se le saca la exención, `nada que hacer` con todas exentas, «Nada se
escribió»). Y el seed de `prueba` guarda su `ProductFile` con la key `prueba/seed/…` — con prefijo de
**slug**, no de `tenantId`—, así que la defensa en profundidad de `manejarDescarga` la rechaza con el
404 neutral: un grant de esa tienda nunca podría descargarse. Es dato del seed, no de facturación.
