# CONTEXT — Glosario del dominio (sorteatelo / plataforma SaaS)

Fuente de verdad del **vocabulario del dominio**. Cuando un agente nombra un concepto (en un
título de issue, un test, un modelo Prisma, una propuesta), usa el término **como está definido
acá** — no derives a sinónimos.

Es un **seed**: arranca chico y crece vía `domain-planner` (skill `domain-modeling`) a medida que
las decisiones cristalizan. Si un concepto que necesitas no está acá, es señal: o estás inventando
lenguaje que el proyecto no usa (reconsiderar), o hay un hueco real (anotarlo para `domain-modeling`).

> **Colisión de nombres**: `Account` en el schema es la **cuenta OAuth de NextAuth**, NO una
> entidad del dominio. Para entidades del dominio usar los nombres de este glosario (`Product`,
> `Order`, `Payment`...). Ver `docs/agents/prisma-conventions.md`.

> **Pivote 2026-07-16 (ADR-0005)**: el proyecto pasó de tienda single-tenant (la autora) a
> **SaaS multi-tenant de tiendas de productos digitales con sorteo**. Todo el dominio comercial
> (Producto, Orden, Pago, Entitlement, Sorteo) pertenece a exactamente una [[Tienda]].

---

## Plataforma y tenants

### Plataforma
El SaaS mismo: la infraestructura compartida sobre la que operan todas las [[Tienda]]s, administrada
por el [[Operador de plataforma]]. La Plataforma **orquesta** ventas y sorteos de terceros pero
**nunca custodia ni mueve dinero de terceros** (ADR-0006) ni asume la responsabilidad legal de los
sorteos (ADR-0008). _Evitar_: "el sitio", "la app" (ambiguos entre Plataforma y Tienda).

### Tienda (`Tenant`)
La **unidad de aislamiento** del SaaS: una tienda de productos digitales con sorteo, propiedad de un
[[Organizador]], que opera en su propio [[Subdominio]]. Todo registro del dominio comercial lleva su
`tenantId`. _Evitar_: sitio, shop, cuenta, cliente (para referirse a la tienda).

### Ciclo de vida de la Tienda
Los estados por los que pasa una [[Tienda]]: **alta** (creada) → **configuración** (el Organizador
carga productos, sorteo, credenciales, marca) → **publicada** (visible y vendiendo en su subdominio)
→ **suspendida** (retirada de operación por incumplimiento; hoy la aplica el [[Operador de
plataforma]] por DB directa, sin superficie en el producto — ADR-0023). Solo una Tienda
**publicada** vende; una **suspendida** no resuelve su subdominio hacia el storefront.
**Desde ADR-0026** la facturación es un eje SEPARADO que no cambia estos estados: una Tienda
publicada solo **vende** si su [[Suscripción de plataforma]] está al día o tiene [[Exención]]
vigente — la morosa entra "en pausa por pago" (sin venta, con descargas y verificador vivos)
sin dejar de estar `PUBLICADA`.

### Organizador
La persona (u organización) dueña de una [[Tienda]]: **tiene cuenta en la Plataforma** (login),
configura su tienda sobre la [[Plantilla]], sube sus [[Producto]]s, conecta su propia cuenta de Flow
([[CredencialFlow]]) y monta su [[Sorteo]], del cual es el **responsable legal** (ADR-0008).
_Evitar_: admin (ambiguo), vendedor, autora, tenant (para la persona — `Tenant` es la Tienda).

### Operador de plataforma
Quien administra la [[Plataforma]] entera (hoy: el freelancer que la desarrolla y mantiene): la
infraestructura (cuenta R2, Cloudflare, deploy, DB) y las operaciones que no tienen superficie en el
producto — hoy, suspender o reactivar una [[Tienda]] por UPDATE directo a la DB. **Es una persona
operativa, NO un sujeto autorizado dentro de la aplicación**: desde ADR-0023 no existe rol, allowlist
ni flag que le dé poder en el código — la única autorización es la membresía User↔Tienda, así que
para entrar a un panel necesita ser [[Organizador]] de esa Tienda como cualquiera. La supervisión
cross-tienda con superficie propia (**superadmin**) es una decisión diferida en ADR-0023.
_Evitar_: superadmin o root (para la persona de hoy), "el rol Operador" (ya no existe en código).

### Autora (tenant piloto)
La clienta original del proyecto single-tenant. Tras el pivote es la **primera [[Organizador]]a**
y su Tienda es el **tenant piloto** (dogfooding real, hito propio del roadmap). Ya **no** es "LA
admin" del sistema.

### Subdominio
La dirección de una [[Tienda]] publicada: `<slug>.<dominio de la plataforma>`. La Tienda se resuelve
por el host del request (ADR-0007). El apex (`dominio` / `www`) queda reservado a la [[Plataforma]].

### Plantilla (tema configurable)
El **único** tema de storefront que ofrece la Plataforma: el [[Organizador]] configura logo, colores,
textos e **imágenes** ([[Asset de marca]]) **sobre** la plantilla existente. NO es un editor visual: un
builder drag-and-drop queda explícitamente fuera del alcance actual. La plantilla es **estructura rica, no estética
fija**: un skin neutro-profesional de secciones (header con countdown, hero a 2 columnas, catálogo con
portadas, vitrina del sorteo/premio, cómo funciona, footer con redes) que **cada Tienda tematiza** con su
`colorPrimario` (que se expande a una escala de 10 tonos) y sus assets. Sirve igual a una tienda de fandom
o a una sobria. Regla dura de la plantilla: **degradación elegante** — todo dato de marca es opcional y,
si falta, la sección degrada limpio (sin imagen ⇒ gradiente temático, nunca un hueco; sin redes ⇒ se
oculta el ícono; sin sorteo ⇒ no aparece la sección), nunca un `<img>` roto ni un campo vacío. La
estructura oficial vive en `docs/design.md` §5 (fuente de verdad visual). _Evitar_: builder, editor,
tema custom, "múltiples plantillas" (hoy hay UNA; que sean varias seleccionables es puerta abierta a futuro).
**Evolución aceptada (2026-07-17, page builder — visto bueno del usuario):** la Plantilla pasa a ser
la **semilla** de la [[Página de tienda]]: el documento inicial con las secciones actuales, que después
se edita por [[Sección]]es sobre un catálogo cerrado de [[Widget]]s. Sigue SIN ser un builder visual
drag-and-drop (eso continúa fuera).

### Asset de marca (imagen pública de marketing)
Una **imagen pública** que personaliza el storefront de una [[Tienda]]: **logo**, **imagen de hero**,
**portada** de un [[Producto]] y **imagen del premio** del [[Sorteo]]. Son propaganda cacheable, servida
por CDN, y **categóricamente distinta del PDF** vendido: viven en un **bucket R2 público** separado del
bucket privado gated por [[Entitlement]] (ADR-0013). Las sube el [[Organizador]] desde su panel (presigned
PUT + confirmación, mismo patrón que el PDF de F03) y son **opcionales** (ver degradación elegante en
[[Plantilla]]). El bucket público admite un único PDF: el de las [[Bases del sorteo]] (destino `bases`,
addendum ADR-0013) — el invariante es «jamás un PDF de PRODUCTO». _Evitar_: confundirlas con el
PDF/archivo del producto (privado, nunca público, ADR-0002).

### CredencialFlow (`FlowCredential`)
Las credenciales (apiKey / secretKey) de la **cuenta Flow propia** del [[Organizador]], almacenadas
**cifradas** por la Plataforma y usadas exclusivamente para cobrar en SU [[Tienda]] (BYO-Flow,
ADR-0006). Nunca se exponen ni se loguean en texto plano.

### Términos de Servicio (ToS)
El contrato Plataforma ↔ [[Organizador]] que el Organizador acepta para operar su [[Tienda]]. Fija,
entre otras cosas, que la responsabilidad legal del [[Sorteo]] y del contenido vendido es del
Organizador (ADR-0008). _Evitar_: confundirlos con las [[Bases del sorteo]] (que son del sorteo, no
del contrato con la plataforma).

### Disclaimer del sorteo
El aviso **visible al [[Comprador]]** en el storefront de una Tienda con sorteo activo: el
responsable del sorteo es el [[Organizador]] detrás de la tienda, no la [[Plataforma]] (ADR-0008).

---

## Facturación de la plataforma

> **Aceptado 2026-07-26** (plan `tasks/26-07-26-plataforma-facturacion-suscripciones.md`, ADR-0026).
> Es el **otro mundo del dinero**: acá la [[Plataforma]] cobra SU mensualidad con SU cuenta de Flow
> (Flow Suscripciones). Las [[CredencialFlow]] BYO de un tenant JAMÁS participan en este cobro, ni las
> credenciales de plataforma (solo env) en las ventas de las tiendas. No contradice ADR-0006: esta
> plata es propia. Modelos Prisma con prefijo `Platform*`.

### Suscripción de plataforma (`PlatformSubscription`)
El cobro mensual de la Plataforma a una [[Tienda]]: 1-1 con el `Tenant`, anclada a un [[Pagador]] y
respaldada por una suscripción de Flow Suscripciones en la cuenta propia. **Nace al publicar** (sin
trial: la etapa de configuración es el gratis) y muere solo por **cancelación explícita** (fin de
período, sin prorrateos — despublicar NO la toca). Su estado es **derivado** del dunning de Flow
(que no tiene `past_due` nativo): al día → cobro pendiente (reintentos de Flow) → **en pausa por
pago** (dunning agotado: la tienda deja de vender, el [[Comprador]] conserva descargas y verificador)
→ cancelada. Precio: $25.000 la primera tienda del Pagador, $12.500 las siguientes (brutos, IVA
incl.); **exactamente una full entre las activas de un Pagador** — al cancelar la full se promueve
la adicional más antigua. _Evitar_: confundirla con el [[Pago]] (ventas de la tienda vía BYO-Flow),
"suscripción" a secas donde haya ambigüedad.

### Pagador (`PlatformBillingCustomer`)
El `User` que pone la tarjeta de una [[Tienda]]: dueño del cliente Flow (customer) en la cuenta de la
plataforma y **receptor único** de los correos de facturación. Quien activa el plan al publicar ES el
Pagador de esa Tienda. La regla "segunda tienda a mitad de precio" es relativa a él. _Evitar_: "el
dueño de la tienda" (la membresía es N:M — el Pagador es un rol de facturación, no de autorización),
facturar "al Organizador" en abstracto.

### Exención (`PlatformExemption`)
La marca que libera a una [[Tienda]] del cobro de la [[Suscripción de plataforma]]: motivo
**CORTESIA** (cuentas regaladas — ej. la [[Autora (tenant piloto)]]) o **GRANDFATHER** (publicadas
antes del despliegue del cobro, exentas a perpetuidad), con fecha de término opcional (null =
perpetua; expiración por evaluación lazy en el gate). Tienda exenta: sin tarjeta ni suscripción Flow;
su panel muestra "Plan cortesía". Se administra por **DB directa** (ADR-0023: sin superficie
superadmin). _Evitar_: "comped" en código/UI (el término del producto es cortesía), modelarla como
cupón de 100%.

### Cupón de plataforma (`PlatformCoupon`)
Un **código repartible** de descuento sobre la [[Suscripción de plataforma]] (ej. `ARMY2026`),
espejo de un cupón de Flow (`flowCouponId`): porcentaje o monto, duración una vez / N meses / para
siempre, expiración y máximo de canjes (`maxCanjes = 1` ⇒ código personal). Se canjea **solo al
activar el plan**; cada canje queda trazado en `PlatformCouponRedemption` (quién, cuándo, qué tienda
— el reporte "quién entró por cuál código"). Se crea por script CLI (Flow + fila local en la misma
corrida). _Evitar_: confundirlo con futuros cupones de una Tienda a sus [[Comprador]]es (no existen
hoy); usarlo para el descuento 100% (eso es una [[Exención]]).

---

## Página de la tienda (page builder)

> **Aceptado 2026-07-17** (plan `tasks/26-07-17-page-builder.md`, ADR-0016..0019) — visto bueno
> del usuario al plan del carril A (con Q1 = switch de render antes del piloto F07).

### Página de tienda (`StorefrontPage`)
La página pública de una [[Tienda]] en su [[Subdominio]], definida por un [[Documento de página]].
Existe en dos estados simultáneos: el [[Borrador]] (donde se edita) y la versión **publicada** (la
única que ve el [[Comprador]]). Hoy hay una por Tienda (la home); que haya varias es puerta abierta.
_Evitar_: landing, home page, "el sitio" (ambiguo con la Tienda).

### Documento de página
La descripción completa de una [[Página de tienda]]: su tema, sus [[Sección]]es ordenadas y sus
[[Overlay]]s. Referencia productos y sorteo **por identidad** — jamás copia precios, títulos ni datos
del dominio (ADR-0017): el catálogo y el dinero viven en sus tablas. _Evitar_: layout, template (la
[[Plantilla]] es la semilla, no el documento).

### Widget
Un **tipo** de bloque configurable del catálogo cerrado que ofrece la [[Plataforma]] (hero, catálogo,
vitrina del sorteo, cómo funciona…). Cada Widget define qué props admite y cómo degrada si falta un
dato; **no existe** Widget de HTML/CSS/código libre (ADR-0018). _Evitar_: plugin, bloque custom,
componente (término de implementación).

### Sección
La **instancia** de un [[Widget]] en el flujo vertical de una [[Página de tienda]], con su
configuración y una identidad estable (se edita "por nombre", sobrevive a reordenamientos). El orden
de las Secciones ES el orden de la página. _Evitar_: bloque, fila, módulo.

### Overlay
La instancia de un [[Widget]] que flota **fuera** del flujo vertical de la página: barra de aviso
arriba, botón flotante de WhatsApp. _Evitar_: popup, modal.

### Borrador (de la Página)
El estado editable del [[Documento de página]]: TODAS las ediciones (el [[Organizador]] desde el
editor visual, o su asistente de IA) ocurren sobre el Borrador. Invisible para el [[Comprador]];
visible solo vía preview autorizada.
_Evitar_: "guardar" como sinónimo de publicar.

### Publicar (la Página)
La acción **explícita y humana** que convierte el [[Borrador]] en la versión publicada — lo único que
el storefront público renderiza. Publicar es el checkpoint contra ediciones defectuosas o envenenadas
de un editor automático (ADR-0018). _Evitar_: autopublicar, deploy.

### Registro de widgets
El catálogo cerrado y versionado de los [[Widget]]s que existen, con su validación: la **única**
fuente de qué puede aparecer en un [[Documento de página]] (ADR-0016). Un contenido que el Registro
no reconoce no se guarda ni se renderiza. _Evitar_: whitelist informal, lista de componentes.

### Editor MCP (RETIRADO)
El primer editor de la [[Página de tienda]]: una superficie de herramientas tipadas que editaba el
[[Borrador]] por operaciones sobre [[Sección]]es — nunca HTML, nunca publicaba por sí solo.
**Se retiró entero el 2026-07-25** (ADR-0023) porque su auth era un token god-mode compartido. El
término queda para leer código e historia; su reemplazo es el [[MCP del Organizador]] (ADR-0025),
que invierte el modelo: tokens per-usuario scopeados a la membresía, no un secreto de entorno.
Hoy el Borrador se edita desde el **editor visual** del panel, su **asistente de IA**, o las tools
de página del [[MCP del Organizador]]. _Evitar_: usarlo en presente.

---

## MCP del Organizador

> **Aceptado 2026-07-26** (plan `tasks/26-07-26-mcp-organizador.md`, ADR-0025) — retoma la
> decisión diferida de ADR-0023. Patrón espejo del MCP de terranova_ADMIN (su ADR-0009).

### MCP del Organizador
El borde MCP remoto de la [[Plataforma]] (apex, un solo endpoint) al que un [[Organizador]] conecta
su **cliente de IA** (Claude Code, Claude Desktop, etc.) para operar su cuenta por chat: configurar
sus [[Tienda]]s, productos, sorteo, [[Borrador]] de página, y crear otra Tienda. La autorización de
CADA llamada sale de la `TenantMembership` viva del usuario dueño del token — el argumento de tienda
de una tool **selecciona, jamás autoriza** (ADR-0022/0025). No publica, no ejecuta sorteos, no borra
y no lee secretos. Es un borde hermano del panel: invoca los mismos use cases de `domain/`. El MCP
de administración de plataforma es OTRA superficie, diferida con el superadmin (ADR-0023). _Evitar_:
"el MCP" a secas cuando pueda confundirse con el [[Editor MCP (RETIRADO)]], y god-mode/token de
entorno (modelo muerto).

### Conexión MCP (`McpClient`)
Un cliente de IA registrado ante el AS OAuth propio de la Plataforma vía Dynamic Client Registration
(RFC 7591). El [[Organizador]] la autoriza en la **pantalla de consentimiento** del apex (con su
sesión NextAuth) y la ve/revoca desde su panel ("Conexiones IA"). _Evitar_: "integración" (vago),
confundir el cliente OAuth con el [[Token MCP]] que se le emite.

### Token MCP (`McpAccessToken` / `McpRefreshToken`)
La credencial **opaca y per-usuario** que el AS emite a una [[Conexión MCP]] tras el consentimiento
(Authorization Code + PKCE S256). En DB vive **solo su hash SHA-256** — el token plano no es
recuperable. Access corto (1 h) renovable por refresh; revocable individualmente. El token porta la
**identidad** (`User.id`); la **capacidad** se recalcula contra la membresía en cada llamada — sacar
a alguien de una Tienda lo desarma al instante sin tocar el token. _Evitar_: API key / PAT (modelo
descartado en el grill), guardar o loguear el token plano.

---

## Producto y catálogo

### Producto (`Product`)
Un producto digital descargable que una [[Tienda]] vende. Atributos: título, descripción, precio
(`Decimal`, CLP), portada, sus [[Archivo de producto|Archivos de producto]], flag de activo, **flag
`participaEnSorteo`** (ver [[Producto participante]]), **modalidad** (`modalidad`: estándar hoy; el
sobre sorpresa es el otro valor previsto) y su `tenantId`. El archivo **nunca** se expone por enlace
público (ver [[Entitlement]] y ADR-0002). _Evitar_: Libro, `Book`, e-book (términos del
single-tenant; el primer Producto del piloto sigue siendo un e-book, pero el modelo es genérico);
"el PDF del producto" como sinónimo del archivo (desde 2026-07-26 el tipo es uno de varios).

### Archivo de producto (`ProductFile`)
> **Aceptado 2026-07-26** (plan `tasks/26-07-26-productos-tipos-digitales.md`, F01).

El archivo entregable que respalda a un [[Producto]] — la unidad que el [[Comprador]] efectivamente
descarga. Vive como **fila propia**, no como columna del Producto: un producto estándar tiene
**exactamente uno** confirmado, y el diseño deja lugar a un **pool de varios** para la modalidad
sobre sorpresa. Atributos: `key` del objeto en el bucket **privado** (autoría del server, con prefijo
`<tenantId>/`, extensión derivada del **MIME validado** y jamás del nombre que mandó el cliente),
`contentType` + `tipo` dentro de una **allowlist cerrada** (PDF, EPUB, imagen PNG/JPEG/WebP, audio
MP3/M4A/WAV, ZIP), `bytes` (tamaño real, medido server-side contra el bucket — tope **20 MB por
archivo**), `nombreArchivo` (el nombre con que llega la descarga) y `confirmadoAt`.

**Confirmado vs. pendiente** es la distinción que importa: la fila nace al **presignar** la subida
(la key necesita existir antes de que haya bytes) y solo cuenta como entregable cuando el server
verificó el objeto en el bucket y le puso `confirmadoAt`. De ahí sale **entregable**, el requisito
que el gate de publicación (ver [[Ciclo de vida de la Tienda]]) mide sobre el Producto: una Tienda no
publica sin ≥1 Producto activo **entregable**. El [[Organizador]] nunca declara
el tipo: lo **deriva el server** del MIME. _Evitar_: "el PDF" (el tipo es uno de varios), "adjunto"
(no es correo), llamar `path` a la `key`, y confundirlo con un [[Asset de marca]] (bucket **público**:
logo, portada, hero, bases del sorteo — ADR-0013).

### Producto participante
Un [[Producto]] con el flag `participaEnSorteo = true`: comprarlo genera [[Ticket]]s para el
[[Sorteo]] ACTIVO de su Tienda (ADR-0012). El flag lo editable el [[Organizador]] en el panel; una
Tienda mezcla productos participantes y no participantes (ej. 4 productos, 1 participa). Default
`false` (opt-in: un producto no entra al sorteo sin que el Organizador lo decida). _Evitar_: "producto
del sorteo" (ambiguo con el premio).

### Catálogo
El listado de [[Producto]]s activos de **una** [[Tienda]] que ve el [[Comprador]] en su subdominio.
Mobile-first. No existe un catálogo cross-tienda.

### Carrito
Selección de uno o más [[Producto]]s **de la misma [[Tienda]]** que el [[Comprador]] va a comprar en
un mismo checkout. No cruza tiendas ni requiere cuenta (ver [[Comprador]]).

---

## Compra y pago

### Campo de checkout (`CheckoutField`)
Un dato ADICIONAL que una [[Tienda]] decide solicitarle al [[Comprador]] en su checkout (ej.
teléfono), definido por el [[Organizador]] en su panel: clave estable, etiqueta visible, tipo,
obligatorio u opcional, orden. Es **dato del dominio** (define qué PII se recolecta y qué valida el
server), tenant-scoped como todo el dominio comercial. El **correo NO es un Campo de checkout**: es
fijo y obligatorio siempre (identidad del comprador y vía de entrega, ADR-0004) — no configurable.
Las respuestas del Comprador se congelan como **snapshot en la [[Orden]]** (etiqueta incluida, mismo
espíritu que el precio del [[ÍtemDeOrden]]): renombrar o borrar un campo no altera órdenes
históricas. La validación de lo que el Comprador envía es server-side contra la definición vigente
del tenant resuelto por subdominio (I1/ADR-0005), nunca contra lo que diga el cliente. _Evitar_:
"campo custom", "campo extra del form" (informales), y confundirlo con la respuesta (el snapshot en
la Orden).

### Respuesta de checkout (`CheckoutFieldResponse`)
El valor que el [[Comprador]] entregó para un [[Campo de checkout]] en una [[Orden]] concreta:
**una fila por campo respondido**, snapshot **autocontenido** (`clave` + `etiqueta` + `tipo` + `valor`
congelados al comprar — el `tipo` viaja en la fila para renderizar el `valor` canónico sin consultar
la definición, que puede estar borrada o recreada con otro tipo; referencia `fieldId` nullable que
sobrevive si la definición se borra). El `valor` se guarda **canónico, sin humanizar** (`true`/`false`,
entero base 10, la opción exacta del SELECT); la presentación (`Sí`/`No`, formato) es de la UI/CSV.
Inmutable — sin `updatedAt`, como el [[ÍtemDeOrden]]. Se crea dentro de la **misma `$transaction`**
que la Orden en el checkout, tras validar server-side contra la definición vigente. Es **PII del
Comprador bajo custodia de la [[Tienda]]**: se muestra solo al [[Organizador]] dueño del tenant.
_Evitar_: "datos extra", "metadata de la orden" (esconden que es PII con snapshot).

### Orden (`Order`)
Una compra dentro de una [[Tienda]]. Registra el **correo** del comprador, el estado
(`pendiente | pagado | fallido`), el total (`Decimal`), timestamps, la referencia de pago de Flow y
su `tenantId`. Una Orden tiene uno o más [[ÍtemDeOrden]]. Es el ancla de la entrega y del sorteo.

### ÍtemDeOrden (`OrderItem`)
Una línea de una [[Orden]]: el [[Producto]] comprado, la **cantidad** (`Int`, ≥1) y su **precio
unitario** al momento de la compra (`Decimal`, snapshot). El subtotal de línea (`precio × cantidad`) y
el `total` de la Orden se calculan con `Decimal` server-side (I4), nunca en el cliente. Congela también
el flag `participaEnSorteo` del producto al comprar (snapshot), para que los [[Ticket]]s del sorteo
sean deterministas aunque el Organizador togglee el flag después (ADR-0012). Una línea por producto por
orden (`@@unique([orderId, productId])`); la cantidad vive en la línea, no en filas repetidas.

### Pago (`Payment`)
El registro del cobro vía **Flow** sobre una [[Orden]], ejecutado con la [[CredencialFlow]] de la
[[Tienda]] correspondiente. **La confirmación es server-side contra la API de Flow** (no el redirect
del navegador); el webhook es idempotente y **rutea la notificación a la Tienda correcta**
(ADR-0001, ADR-0006). Montos y comisiones en `Decimal`.

---

## Entrega

### Entitlement (derecho de descarga; `DownloadGrant`)
La **autoridad de acceso** a la descarga de un [[Producto]]: liga una [[Orden]] pagada a un producto
mediante un **token opaco** (32 bytes aleatorios — no va firmado ni codifica nada: se busca en la DB).
Sin Entitlement vigente no hay descarga. Se crea al confirmarse el [[Pago]].

**El acceso es permanente**: el token NO vence (`expiresAt` null) y el [[Comprador]] puede volver a
`/entrega/<token>` cuando quiera. Sin cuentas de comprador (ADR-0004), su correo de confirmación es la
llave, y matarla a plazo fijo lo dejaba sin camino de vuelta. `expiresAt` no-null es el **seam de
revocación** —un corte administrativo deliberado, con la misma respuesta neutral que un token
inexistente—, nunca un vencimiento automático (D2 de
`tasks/26-08-16-entrega-postpago-retorno-y-reacceso.md`; hasta esa tanda el grant moría a los 30 días).

Lo que sí expira corto es la **URL firmada del bucket**, regenerada POR VISITA (600 s la descarga,
300 s las miniaturas): esa ventana y el bucket privado son la seguridad real, no el plazo del grant.
El archivo jamás se sirve por enlace público (ADR-0002/0009).

---

## Sorteo

### Sorteo (`Raffle`)
La promoción que una [[Tienda]] monta sobre su venta: entre quienes compran productos participantes se
sortea un premio definido por el [[Organizador]] (piloto: 2 entradas a un recital de BTS). Atributos:
nombre, premio, fechas, estado, el PDF de sus [[Bases del sorteo]] (`basesPdfUrl`), `tenantId`. Cada compra genera cero o más
[[Ticket]]s. El ganador se elige **entre tickets** (más tickets = más chance), de forma auditable
(ganador, su [[Número del sorteo]], fecha, quién ejecutó — ADR-0024). A lo sumo un Sorteo ACTIVO
por Tienda (S5).

### Ticket
La **unidad de chance** en un [[Sorteo]]. Una compra genera **un Ticket por cada unidad de
[[Producto participante]]** en la [[Orden]]: tickets = suma de `cantidad` de los [[ÍtemDeOrden]] cuyo
producto participa (ADR-0012). Ej.: participante×3 ⇒ 3 tickets; solo productos no participantes ⇒ 0
tickets (ninguna [[Participación]], la venta no se compromete). Hoy 1 ticket por unidad; un
multiplicador por unidad es puerta abierta (ADR-0012). Cada Ticket se materializa como una
[[Participación]].

### Participación (`RaffleEntry`)
La materialización de **un** [[Ticket]]: una fila por ticket en el [[Sorteo]] ACTIVO de la [[Tienda]]
de la [[Orden]], con el **correo** del comprador (snapshot), un `ordinal` 0..K-1 dentro de la orden y
su [[Número del sorteo]]. Se crean **al confirmarse el pago**, junto con el [[Entitlement]], dentro
de la misma `$transaction`; K = tickets de la orden. Idempotentes por
`@@unique([raffleId, orderId, ordinal])` (exactly-once ante replay del webhook, ADR-0001/0012). El
[[Organizador]] ve las participaciones (puede agruparlas por correo, mostrando tickets por
participante) y ejecuta el sorteo de forma auditable. _Nota_: "una Participación = un ticket", NO
"una por orden" (semántica pre-ADR-0012, ya obsoleta). _Evitar_: confundir el `ordinal`
(discriminador interno de idempotencia, jamás visible) con el [[Número del sorteo]] (la identidad
pública del ticket).

### Número del sorteo
La **identidad pública de un [[Ticket]] dentro de su [[Sorteo]]**: un correlativo único por sorteo,
desde 1, asignado al confirmarse el pago (ADR-0024). Es lo que el [[Comprador]] conoce como "mis
números" y se le comunica **en rango** (`1043–1092`); el ganador se anuncia por su número. Una vez
asignado es **inmutable y no se reutiliza** — es una promesa pública. Sin prefijo de canal hoy: si
mañana existieran canales de venta adicionales (offline, bonus), el canal sería un dato aparte y el
número no se re-significa (ADR-0024). _Evitar_: "ordinal" (ese es el discriminador interno por
orden, plomería de idempotencia — dos compradores distintos comparten ordinal `0`, jamás comparten
Número del sorteo), "ticket number" / "correlativo de la orden" (el correlativo es POR SORTEO).

### Bases del sorteo
El documento legal del [[Sorteo]] (quiénes participan, cómo se elige, fechas, premio). Son
**del [[Organizador]]** y son **SIEMPRE un PDF**: él las redacta/protocoliza y las sube **al
Sorteo** (`Raffle.basesPdfUrl` — una por sorteo) desde el form de crear/editar sorteo del panel.
El PDF vive en el **bucket público** (la única excepción de PDF admitida ahí — addendum de
ADR-0013; las bases son un documento legal público por naturaleza, NO un producto). El **gate de
publicación** exige el PDF del sorteo **ACTIVO** (ADR-0008). El [[Comprador]] las ve **embebidas
en la página `/bases`** del storefront — siempre las del sorteo activo; sin sorteo activo o sin
PDF, la página muestra un estado vacío neutral. La palabra «Bases» en navbar/chrome/CTAs navega
**SIEMPRE a `/bases`** (nunca scroll a un ancla de la home). La Plataforma las publica y exige que
existan, pero no las redacta ni responde por ellas (ADR-0008). **No es código ni texto libre**
(el modelo viejo — texto en `Tenant.basesSorteo` o URL externa en `Raffle.basesUrl` — fue
eliminado el 2026-07-25, plan `admin-bases-pdf-y-limpieza`).

---

## Correos al Comprador

> **Aceptado 2026-07-26** (plan `tasks/26-07-26-correo-sistema-correos-comprador.md`, ADR-0027).
> Todo correo al [[Comprador]] habla **en voz de la [[Tienda]]** («Tienda X · vía Sortéatelo»,
> reply-to del [[Organizador]]) sobre un **layout compartido con identidad Sortéatelo** (la marca
> va en el chrome del correo, la Tienda es la protagonista), y toda plantilla que hable de un
> sorteo **nombra CUÁL** (una Tienda tiene n [[Sorteo]]s, solo uno activo). Regla dura:
> **transaccional ≠ marketing** — confirmación y resultado salen siempre; los recordatorios solo
> con [[Consentimiento de recordatorios]] y sin [[Supresión de correo]].

### Ledger de correos (`CorreoEnviado`)
El registro persistente de **cada correo que la Plataforma decide enviar** a un [[Comprador]],
escrito ANTES de enviar: una fila por envío con tipo, clave natural determinística, destinatario
snapshot, estado (pendiente/enviado/fallido) e intentos, idempotente por `[tipo, clave]`
(ADR-0027). Es la **fuente de verdad** de qué salió y qué falta — el cron horario drena lo
pendiente; la falla segura es que un correo no salga (recuperable), jamás que salga dos veces (el
dominio compartido es reputación de TODAS las Tiendas). Quedarse sin cuota del proveedor no es un
fallo: la fila espera al día siguiente sin gastar reintentos. _Evitar_: "cola" (no es una cola de
mensajes), "log de envíos" (no es un registro pasivo — es lo que decide qué se envía).

### Supresión de correo
La marca `(tenantId, email)` de que un [[Comprador]] pidió **no recibir más correos de avisos de
UNA [[Tienda]]** (vía one-click unsubscribe, RFC 8058, endpoint público sin login — ADR-0004). Es
**por Tienda**, no global, y **no bloquea los transaccionales** (confirmación de compra,
resultado del sorteo): esos salen siempre. _Evitar_: blacklist, "baja global de la plataforma".

### Consentimiento de recordatorios
El **opt-in verificable** que el [[Comprador]] da en el checkout para recibir recordatorios del
[[Sorteo]] de ESA [[Tienda]]: checkbox **jamás premarcado**, persistiendo timestamp + IP + el
texto exacto mostrado (Ley 21.719 exige consentimiento verificable; las casillas premarcadas
están prohibidas). Es **por Tienda**. Sin él no se envía ningún recordatorio; la confirmación y
el resultado no lo requieren (transaccionales). _Evitar_: "acepta marketing" (genérico),
consentimiento implícito o inferido de la compra, y modelarlo como [[Campo de checkout]] (es de
plataforma, no configurable por el Organizador).

---

## Actores

### Comprador
Quien compra en una [[Tienda]]. Entra por el [[Subdominio]], ve el [[Catálogo]], compra
[[Producto]]s, paga vía [[Pago]], descarga (vía [[Entitlement]]) y queda inscrito en el [[Sorteo]].
**No tiene cuenta** (ADR-0004): su identidad es el **correo**. Mayoritariamente mobile.

(El [[Organizador]] y el [[Operador de plataforma]] — los actores con cuenta — están definidos en
"Plataforma y tenants".)

---

## Marketing

### Hermes — RETIRADO (2026-07-17)
Era la herramienta de copy IA por tenant (ADR-0003). **Salió del producto por decisión del usuario**:
no construir features de generación de copy. El término queda solo como registro histórico — si
aparece en planes o código nuevos, es un error.

---

## Reglas transversales

### Dinero
Todo monto (precio, total, IVA 19%, comisión de Flow, neto al vendedor) es **`Decimal`, nunca
`Float`**. Las operaciones que mueven plata van en `prisma.$transaction`. Formato en UI con
`Intl.NumberFormat` (CLP). Ver `CLAUDE.md` § Regla de oro.

### Scoping por tenant
Todo registro del dominio comercial pertenece a exactamente una [[Tienda]] y **toda query de dominio
se filtra por su tenant** (resuelto server-side desde el subdominio o la sesión — nunca desde input
del cliente). El aislamiento cross-tenant es el invariante de seguridad #1 del SaaS (ADR-0005).
