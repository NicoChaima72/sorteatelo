# CONTEXT — Glosario del dominio (libros-iselk / plataforma SaaS)

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
→ **suspendida** (retirada de operación por el Operador o por incumplimiento). Solo una Tienda
**publicada** vende; una **suspendida** no resuelve su subdominio hacia el storefront.

### Organizador
La persona (u organización) dueña de una [[Tienda]]: **tiene cuenta en la Plataforma** (login),
configura su tienda sobre la [[Plantilla]], sube sus [[Producto]]s, conecta su propia cuenta de Flow
([[CredencialFlow]]) y monta su [[Sorteo]], del cual es el **responsable legal** (ADR-0008).
_Evitar_: admin (ambiguo), vendedor, autora, tenant (para la persona — `Tenant` es la Tienda).

### Operador de plataforma
Quien administra la [[Plataforma]] entera (hoy: el freelancer que la desarrolla y mantiene). Da de
alta, supervisa y suspende [[Tienda]]s; no opera las tiendas de los Organizadores. _Evitar_:
superadmin, root.

### Autora (tenant piloto)
La clienta original del proyecto single-tenant. Tras el pivote es la **primera [[Organizador]]a**
y su Tienda es el **tenant piloto** (dogfooding real, hito propio del roadmap). Ya **no** es "LA
admin" del sistema.

### Subdominio
La dirección de una [[Tienda]] publicada: `<slug>.<dominio de la plataforma>`. La Tienda se resuelve
por el host del request (ADR-0007). El apex (`dominio` / `www`) queda reservado a la [[Plataforma]].

### Plantilla (tema configurable)
El **único** tema de storefront que ofrece la Plataforma: el [[Organizador]] configura logo, colores
y textos **sobre** la plantilla existente. NO es un editor visual: un builder drag-and-drop queda
explícitamente fuera del MVP. _Evitar_: builder, editor, tema custom.

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

## Producto y catálogo

### Producto (`Product`)
Un producto digital descargable (MVP: **PDF**) que una [[Tienda]] vende. Atributos: título,
descripción, precio (`Decimal`, CLP), portada, referencia al archivo en **storage privado**, flag de
activo, **flag `participaEnSorteo`** (ver [[Producto participante]]), y su `tenantId`. El archivo
**nunca** se expone por enlace público (ver [[Entitlement]] y ADR-0002). _Evitar_: Libro, `Book`,
e-book (términos del single-tenant; el primer Producto del piloto sigue siendo un e-book, pero el
modelo es genérico).

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
La **autoridad de acceso** a la descarga de un [[Producto]]: liga una [[Orden]] pagada a un producto,
con un token firmado y expiración. Sin Entitlement vigente no hay descarga. Se crea al confirmarse el
[[Pago]]. La descarga se sirve por **URL firmada con expiración corta** o endpoint autenticado, nunca
por enlace público (ADR-0002).

---

## Sorteo

### Sorteo (`Raffle`)
La promoción que una [[Tienda]] monta sobre su venta: entre quienes compran productos participantes se
sortea un premio definido por el [[Organizador]] (piloto: 2 entradas a un recital de BTS). Atributos:
nombre, premio, fechas, estado, referencia a las **bases**, `tenantId`. Cada compra genera cero o más
[[Ticket]]s. El ganador se elige **entre tickets** (más tickets = más chance), de forma auditable
(ganador, fecha, quién ejecutó). A lo sumo un Sorteo ACTIVO por Tienda (S5).

### Ticket
La **unidad de chance** en un [[Sorteo]]. Una compra genera **un Ticket por cada unidad de
[[Producto participante]]** en la [[Orden]]: tickets = suma de `cantidad` de los [[ÍtemDeOrden]] cuyo
producto participa (ADR-0012). Ej.: participante×3 ⇒ 3 tickets; solo productos no participantes ⇒ 0
tickets (ninguna [[Participación]], la venta no se compromete). Hoy 1 ticket por unidad; un
multiplicador por unidad es puerta abierta (ADR-0012). Cada Ticket se materializa como una
[[Participación]].

### Participación (`RaffleEntry`)
La materialización de **un** [[Ticket]]: una fila por ticket en el [[Sorteo]] ACTIVO de la [[Tienda]]
de la [[Orden]], con el **correo** del comprador (snapshot) y un `ordinal` 0..K-1 dentro de la orden.
Se crean **al confirmarse el pago**, junto con el [[Entitlement]], dentro de la misma `$transaction`;
K = tickets de la orden. Idempotentes por `@@unique([raffleId, orderId, ordinal])` (exactly-once ante
replay del webhook, ADR-0001/0012). El [[Organizador]] ve las participaciones (puede agruparlas por
correo, mostrando tickets por participante) y ejecuta el sorteo de forma auditable. _Nota_: "una
Participación = un ticket", NO "una por orden" (semántica pre-ADR-0012, ya obsoleta).

### Bases del sorteo
El documento legal del [[Sorteo]] (quiénes participan, cómo se elige, fechas, premio). Son
**del [[Organizador]]**: él las redacta/protocoliza y las sube a su Tienda; la Plataforma las
publica y exige que existan para publicar un sorteo, pero no las redacta ni responde por ellas
(ADR-0008). **No es código.**

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
