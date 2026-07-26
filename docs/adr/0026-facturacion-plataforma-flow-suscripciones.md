# Facturación de la plataforma: Flow Suscripciones con cuenta propia; suscripción por Tienda anclada a un Pagador

> Aceptado 2026-07-26 (plan `tasks/26-07-26-plataforma-facturacion-suscripciones.md`).
> Nota de numeración: se saltó el 0025 (reservado por el grill en curso de sistema-correos-comprador)
> y existe un 0024 duplicado en disco pendiente de renumerar.

La Plataforma cobra su mensualidad a los Organizadores ($25.000 CLP/mes la primera tienda, $12.500 las
siguientes del mismo Pagador — montos brutos, IVA incluido, como promete la landing) mediante **Flow
Suscripciones con una cuenta Flow PROPIA de la plataforma**, completamente separada del BYO-Flow de los
tenants. Esto **no contradice ADR-0006** («la plataforma nunca mueve plata de terceros»): acá la plata es
propia — es la facturación de la Plataforma a sus clientes. Los dos mundos quedan separados por
construcción: las `FlowCredential` de un tenant jamás participan en el cobro de suscripción, y las
credenciales de plataforma (solo en env, jamás en DB) jamás cobran ventas de tiendas.

El **sujeto de facturación es la Tienda**: una suscripción por Tenant (1-1), anclada a un **Pagador**
(el User que registra la tarjeta al activar el plan). La suscripción **nace al publicar** — sin trial
temporal: la etapa de configuración es el gratis — y muere solo por **cancelación explícita**
(`cancel_at_period_end`, sin prorrateos); despublicar no toca la facturación. Entre las suscripciones
activas de un Pagador hay **exactamente una a precio full** (la más antigua): al cancelar la full, la
adicional más antigua se promueve vía `subscription/changePlan` programado.

Alternativas descartadas: **Transbank Oneclick** (habría que construir el motor de cobro recurrente
completo: calendario, reintentos, dunning), **Mercado Pago** (segundo proveedor sin necesidad),
**Stripe** (no opera para comercios chilenos).

## Consecuencias

- **Estados derivados, no copiados**: Flow no tiene `past_due` nativo (expone `status` 0/1/2/4 + flag
  `morose` + invoices con reintentos). La máquina de la plataforma (`AL_DIA → COBRO_PENDIENTE →
  EN_PAUSA_POR_PAGO → CANCELADA`) se deriva del **webhook idempotente verificado server-side** contra la
  API de Flow (mismo principio que ADR-0001), con `flowInvoiceId` único como ledger. El redirect del
  navegador jamás confirma nada.
- **La morosidad no toca `TenantStatus`**: la tienda morosa sigue `PUBLICADA`; el gate de venta es
  derivado server-side (`PUBLICADA && (al día || exenta)`). `SUSPENDIDA` conserva su semántica de
  incumplimiento (ADR-0023).
- **El Comprador nunca paga la mora del Organizador**: agotado el dunning de Flow, el storefront deja de
  vender (página neutral), pero los Entitlements, las descargas y el verificador de tickets siguen
  operativos, y el panel queda restringido a la página Plan con el `paymentLink` para regularizar
  (pagar ⇒ reactivación automática).
- **Exención** como mecanismo único (motivo `CORTESIA` o `GRANDFATHER`, fecha de término opcional,
  evaluación lazy): tienda exenta sin tarjeta ni suscripción Flow. Las tiendas ya publicadas al desplegar
  el cobro quedan GRANDFATHER a perpetuidad. Se administra por DB directa — esta decisión NO reabre la
  superficie superadmin diferida en ADR-0023.
- **Cupones**: Flow aporta el descuento (`couponId` aplicado por API) pero no el código canjeable — el
  código repartible con trazabilidad de canje (quién entró por cuál) es modelo propio espejo
  (`PlatformCoupon`/`PlatformCouponRedemption`), canjeable solo al activar el plan, creado por script CLI.
- **Comunicaciones propias** (Resend, ADR-0010): 7 correos al Pagador (comprobante, fallo con
  `paymentLink`, en pausa, regularizada, cancelación, expiración de exención, aviso previo de renovación).
  El aviso previo exige un **cron diario propio** (Vercel, ADR-0015) — Flow no avisa antes de cobrar.
- **Naming**: modelos Prisma con prefijo `Platform*` — entidades de plataforma, nunca confundibles con el
  dominio comercial tenant-scoped ni con futuros cupones de tienda a Compradores.
- Boleta/SII por la mensualidad: obligación tributaria del Operador de plataforma, fuera del producto.
- Puertas abiertas documentadas: canje sobre suscripciones vivas (`subscription/addCoupon`), transferencia
  de Pagador, migración de precio de planes vigentes, superficie superadmin para exenciones/cupones.
