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

## F03 — Activa tu plan (publicar)

- [ ] ⏭️ `facturacion.activar.e2e.001` — **Flujo completo en sandbox Flow**: en el panel de una tienda
      en configuración, el checklist muestra «Activa tu plan» como ÚLTIMO ítem pendiente → «Ver el
      precio» abre el modal con **$25.000/mes** (el precio sale del server, no del cliente) →
      «Continuar» redirige al formulario de tarjeta de Flow → se ingresa la tarjeta de prueba
      Transbank → Flow devuelve a `<slug>.localhost:3001/admin/plan/retorno?token=…` → la página
      muestra «Estamos activando tu plan…» y termina en «¡Tu plan está activo y tu tienda publicada!».
      **Evidencia en DB**: una fila `PlatformSubscription` del tenant con `plan = FULL`,
      `montoBruto = 25000`, `estado = AL_DIA` y `flowSubscriptionId` no nulo; una fila
      `PlatformBillingCustomer` del User con `tarjetaMarca` y `tarjetaUltimos4` poblados (y **nada
      más** de la tarjeta); el `Tenant.estado` en `PUBLICADA`.
- [ ] ⏭️ `facturacion.activar.e2e.002` — **Segunda tienda del mismo Pagador a mitad de precio**: con el
      plan de la primera tienda ya activo, el modal de una SEGUNDA tienda del mismo Organizador
      muestra **$12.500/mes** y el aviso «Es tu segunda tienda en adelante: va a mitad de precio».
      Tras activar, su `PlatformSubscription` queda `plan = ADICIONAL`, `montoBruto = 12500`.
- [x] ✅ `facturacion.activar.e2e.003` — **Tienda exenta publica sin tarjeta** (D8): con una
      `PlatformExemption(CORTESIA, exentaHasta = null)` insertada por DB directa, el ítem del
      checklist se lee «Tu plan es de cortesía» / «Tu tienda no paga mensualidad», está marcado como
      cumplido, y «Publicar mi tienda» funciona **sin pasar por Flow** (cero `PlatformSubscription`
      para ese tenant al terminar).
- [ ] ⏭️ `facturacion.cupon.e2e.001` — **El código aplica descuento visible**: con un cupón creado por
      CLI (F08), tipear el código en «¿Tienes un código?» del modal y continuar deja el canje
      registrado (`PlatformCouponRedemption` con el `tenantId`, el `codigo` normalizado en mayúsculas
      y `subscriptionId` ligado tras activar), y la suscripción en Flow queda con el cupón aplicado.
      Un código inexistente muestra el mensaje **neutral** («Ese código no es válido o ya no se puede
      usar…») sin decir por qué.
- [ ] ⏭️ `facturacion.cupon.e2e.002` — **El CLI de cupones, ida y vuelta** (F08) — *pasada de render
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

- [ ] ⏭️ `facturacion.cancelar.e2e.001` — **Cancelar con confirmación explícita**: en
      `http://<slug>.localhost:3001/admin/plan`, el botón «Cancelar mi plan» abre un modal que dice
      hasta cuándo sigue vendiendo la tienda y que no se borra nada; el botón de confirmar es ROJO y
      dice «Cancelar el plan». Al confirmar, la página pasa a mostrar **«Cancelado: tu tienda vende
      hasta el DD-MM-AAAA»** y el botón de cancelar desaparece. Verificar en la DB que
      `cancelacionSolicitadaAt` y `cancelacionEfectivaAt` quedaron poblados y que **`estado` sigue
      `AL_DIA`** (D6: la tienda vende hasta cerrar el período). El storefront sigue vendiendo.
- [ ] ⏭️ `facturacion.cancelar.e2e.002` — **El correo (5) llega al Pagador**: revisar la bandeja del
      correo real usado en el sandbox — asunto «Cancelamos el plan de <Tienda>», con la fecha hasta la
      que vende. Cancelar de nuevo (recargando y reintentando la mutation a mano) **NO** manda un
      segundo correo.
- [x] ✅ `facturacion.cancelar.e2e.003` — **Cerrado el período, hay que re-suscribir**: inducir el cierre
      poniendo la suscripción en `CANCELADA` por DB (el webhook hace esto cuando Flow reporta
      `status = 4`). La tienda entra en modo pausa —storefront en `/en-pausa`, panel restringido con el
      banner «Tu tienda no tiene un plan activo»— y el botón «Reactivar mi plan» de `/admin/plan` abre
      el modal de activación con la **tarjeta ya registrada** (no vuelve a pedir el registro completo).

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
- [ ] ⏭️ `facturacion.cortesia.e2e.003` — **La cortesía que llega a mitad del registro de tarjeta no
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
- [ ] ⏭️ `facturacion.plan.e2e.002` — **Cambiar tarjeta**: con el plan activo, «Cambiar tarjeta» lleva al
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

**Fuera del alcance de esta feature, anotado al pasar**: `npm run grandfather:tiendas` en seco lista
bien (`autora — candidata` cuando se le saca la exención, `nada que hacer` con todas exentas, «Nada se
escribió»). Y el seed de `prueba` guarda su `ProductFile` con la key `prueba/seed/…` — con prefijo de
**slug**, no de `tenantId`—, así que la defensa en profundidad de `manejarDescarga` la rechaza con el
404 neutral: un grant de esa tienda nunca podría descargarse. Es dato del seed, no de facturación.
