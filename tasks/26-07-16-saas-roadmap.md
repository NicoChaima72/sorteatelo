---
slug: saas-roadmap
status: testing               # planning | implementing | testing | done
owner: nicolas
created: 2026-07-16
related_adrs: [ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008]
related_context: [Plataforma, Tienda, Organizador, Operador de plataforma, Autora, Subdominio, Plantilla, CredencialFlow, Términos de Servicio, Disclaimer del sorteo, Producto, Catálogo, Carrito, Orden, ÍtemDeOrden, Pago, Entitlement, Sorteo, Participación, Bases del sorteo, Comprador, Hermes]

features:
  - id: F01
    behavior: "Fundación multi-tenant + circuito de pago BYO-Flow: modelo Tenant + scoping por tenantId, resolución por subdominio (middleware), CredencialFlow cifrada, checkout y webhook ruteados al tenant correcto, verificado con 2 tenants sandbox"
    state: done
  - id: F02
    behavior: "Efectos post-pago per-tenant: DownloadGrant + Raffle/RaffleEntry scopeados, creados idempotentemente en la transacción del webhook"
    state: not_started
  - id: F03
    behavior: "Storage privado + entrega de PDF: bucket privado con paths per-tenant, URL firmada con expiración autorizada por Entitlement"
    state: not_started
  - id: F04
    behavior: "Correo transaccional: envío del enlace de descarga firmado al confirmar el pago, con remitente/branding coherente per tenant"
    state: not_started
  - id: F05
    behavior: "Auth de Organizadores + panel de tienda: Google OAuth, membresía User↔Tenant, guard por tenant, CRUD de productos (+PDF), ventas, gestión y ejecución auditable del sorteo, carga de bases y CredencialFlow"
    state: not_started
  - id: F06
    behavior: "Plantilla configurable + storefront del comprador: catálogo/carrito/checkout mobile-first tematizado (logo/colores/textos del tenant) + disclaimer del sorteo"
    state: not_started
  - id: F07
    behavior: "HITO — tienda de la autora (tenant piloto) operativa: hosting con wildcard subdomains, dominio, Flow producción de la autora, correo real, contenido y bases cargados, primera venta real"
    state: not_started
  - id: F08
    behavior: "Self-service de tenants: registro de Organizadores, alta y wizard de configuración de Tienda, aceptación de ToS registrada, publicación; panel del Operador (alta/suspensión/supervisión)"
    state: not_started
  - id: F09
    behavior: "RETIRADA (2026-07-17, decisión del usuario): Hermes salió del producto — no construir copy IA"
    state: removed
  - id: F10
    behavior: "Go-live de la plataforma pública: ToS/disclaimer validados por abogado, migraciones versionadas, hardening, backups/monitoreo, primeros tenants externos"
    state: not_started
---

# Roadmap paraguas — pivote a SaaS multi-tenant de tiendas con sorteo

## Contexto

**El proyecto pivotea** (decisión del usuario, 2026-07-16): de tienda single-tenant de e-books para
la autora a **SaaS multi-tenant** donde Organizadores crean su cuenta, configuran su Tienda sobre una
plantilla (logo/colores/textos — NO builder visual) y venden productos digitales con sorteo
promocional, cada tienda en su **subdominio**. La autora pasa a ser el **tenant #1 / piloto**, y su
tienda operativa sigue siendo un **hito con fecha propia** (F07) — no se difiere indefinidamente por
construir plataforma. Decisiones de arquitectura del pivote: ADR-0005 (multi-tenant por `tenantId` en
DB compartida), ADR-0006 (BYO-Flow: credenciales por tenant cifradas, la plataforma nunca mueve plata
de terceros), ADR-0007 (resolución por subdominio), ADR-0008 (responsabilidad legal del sorteo = del
Organizador).

Momento del pivote: el más barato posible. El commit base (4eb69d7) tiene scaffold T3 + maquetas mock
+ docs; el trabajo parcial single-tenant de F01/F05 (sin commitear) es **adaptable**: el service Flow
ya recibe config inyectada (basta instanciarlo con la `CredencialFlow` del tenant), el núcleo del
webhook ya es testeable con deps inyectables (se le agrega el ruteo por tenant), la política de auth
pura (`authPolicy.ts`) sirve de base para la membresía, y el patrón núcleo+wrapper / layering /
convenciones quedan intactos. Lo que muere: el supuesto mono-tienda (allowlist mono-usuario como
autorización del panel, seeds single-tenant, uniques globales).

Este documento reemplaza (**supersede**) a `tasks/26-07-08-mvp-roadmap.md`,
`tasks/26-07-08-auth-admin-google.md` y `tasks/26-07-08-efectos-post-pago.md`. Solo la **Fase 1
(F01)** se detalla a nivel ejecutable; F02–F10 quedan coarse y cada una parirá su propio task file al
ejecutarse. Restricciones que NO cambian: T3 stack actual, dinero `Decimal` + `$transaction`,
ADR-0001/0002/0003/0004 (re-scopeados por tenant, ver ADR-0005). Las 6 decisiones abiertas siguen
abiertas; el pivote endurece el criterio de #4/#5 (wildcard subdomains — anotado en
`docs/decisiones-abiertas.md`, sin cerrarlas).

## Decisiones

- **D1 — Fase 1 = fundación multi-tenant + circuito de pago.** No se escribe ni se rescata código de
  dominio sin que exista `Tenant` + scoping + resolución por subdominio + BYO-Flow. Razón: el scoping
  por `tenantId` atraviesa TODO modelo y query (ADR-0005); meterlo después = migración dolorosa. Se
  incluye el circuito de pago en la misma fase porque (a) es el trabajo adaptable ya hecho (F01
  viejo), (b) el ruteo del webhook por tenant es EL mecanismo nuevo más riesgoso del pivote y hay que
  probarlo primero, (c) "dos tenants cobrando con credenciales distintas en sandbox" es la prueba de
  fuego de toda la fundación.
- **D2 — Término canónico: Tienda (`Tenant`).** El modelo se llama `Tenant`; en prosa del dominio,
  "Tienda". La persona es el **Organizador** (tiene cuenta); el freelancer es el **Operador de
  plataforma**. Definidos en `CONTEXT.md`.
- **D3 — Rename `Book` → `Product` (Producto) ahora.** La plataforma vende productos digitales
  genéricos (MVP: PDF); el pivote llega antes del código de dominio comprometido, es el único momento
  en que el rename es gratis. `CONTEXT.md` marca `Libro`/`Book` como _Avoid_.
- **D4 — El hito del piloto (F07) va ANTES del self-service (F08).** La tienda de la autora se
  configura por el Operador/seeds + panel de Organizador (F05), sin necesitar registro self-service.
  Razón: compromiso de fecha con el tenant piloto; el onboarding self-service solo se justifica
  cuando hay un producto probado en producción real.
- **D5 — Hermes (F09) sale del camino crítico del piloto.** La tienda piloto puede operar (vender,
  entregar, sortear) sin generador de copy; Hermes se vuelve feature por-tenant post-piloto. Puede
  adelantarse en paralelo tras F05 si hay holgura.
- **D6 — El panel (Organizador y Operador) vive en el apex; el subdominio es solo storefront del
  Comprador** (ADR-0007, supuesto revisable). Razón: una sola cookie de sesión NextAuth, sin auth
  cross-subdominio.
- **D7 — Sin grill extenso** (instrucción explícita del usuario): las decisiones de implementación de
  F01 se resuelven por criterio y quedan como **Supuestos revisables**; las de F02–F10 se resuelven
  en el planning de cada fase. Ninguna pregunta resultó estructuralmente imposible de asumir.
- **D8 — Layering obligatorio estilo `heuristics-dtw` (datawalt-app) + F01 en 3 carriles paralelos**
  (usuario, 2026-07-16). (a) Arquitectura por capas ya documentada en
  `docs/agents/backend-conventions.md` § Layering: routers = adapters finos → seam `runDomain()`
  (`DomainError`→`TRPCError`) → use cases en `domain/<modulo>/` → `services/` = adapters externos con
  factory de config explícita; los endpoints Next (webhook) son borde con patrón núcleo+wrapper.
  Referencia viva: `datawalt-app/src/server/domain/heuristics-dtw/ARCHITECTURE.md`. (b) Ejecución de
  F01 dividida en carriles de archivos disjuntos: **A** = schema multi-tenant + service de cifrado +
  seeds (pasos 1, 2, 7); **B** = tenancy por subdominio: parser puro + middleware + contexto (paso 3);
  **C** = pago BYO-Flow: service Flow por credencial + checkout scoped + núcleo del webhook con ruteo
  (pasos 4, 5, 6 — adapta el rescate S8); **Integrador** al final = cableado + página dev + seeds
  corridos + E2E manual (pasos 8, 9). B y C escriben núcleos puros con deps inyectadas (no esperan el
  schema de A); el integrador cabla contra el Prisma Client generado. Zonas exclusivas: `schema.prisma`
  y `src/env.js` = A; `middleware.ts` y `src/server/api/trpc.ts` = B; `src/server/pago|domain|services/flow` +
  webhook = C. Bitácora: cada carril appendea con tag `[F01-A]`/`[F01-B]`/`[F01-C]`.

## Plan

Fases ordenadas por dependencia. Cada fase (salvo F01) es coarse y detona su propio task file.

1. **F01 — Fundación multi-tenant + circuito de pago BYO-Flow** (DETALLADA abajo).
2. **F02 — Efectos post-pago per-tenant**. Depende de F01. Adapta el plan superseded
   `26-07-08-efectos-post-pago.md` (contrato del hook post-pago sigue válido) agregando `tenantId`.
3. **F03 — Storage privado + entrega de PDF**. Depende de F02. Proveedor RESUELTO: **Cloudflare R2**
   (ADR-0009, 2026-07-16). Queda abierta solo #6 (marca de agua, se decide en su planning). Paths
   per-tenant.
4. **F04 — Correo transaccional**. Depende de F02/F03. Proveedor RESUELTO: **Resend** (ADR-0010,
   2026-07-16; la plataforma envía en nombre del tenant, reply-to del Organizador).
5. **F05 — Auth de Organizadores + panel de tienda**. Depende de F01 (tenants y datos reales que
   administrar); rescata Google OAuth + guard del superseded `26-07-08-auth-admin-google.md`,
   reemplazando allowlist mono-usuario por **membresía User↔Tenant** (+ rol Operador). Incluye CRUD
   de Productos (+subida PDF vía F03), ventas, sorteo (gestión/ejecución auditable), carga de bases y
   de CredencialFlow.
6. **F06 — Plantilla configurable + storefront del comprador**. Depende de F01 (resolución de
   tenant) y gana entrega real con F03/F04. Bloqueada por la identidad visual de la PLATAFORMA + el
   diseño de la plantilla base (sesión `frontend-design`; `docs/design.md` sigue PENDIENTE — ahora la
   marca es de la plataforma y el theming es per-tenant). Incluye el disclaimer del sorteo (ADR-0008).
7. **F07 — HITO: tienda de la autora (tenant piloto) operativa**. Depende de F01–F06. Bloqueada por
   decisiones abiertas #1/#2/#4/#5 y externas de la autora (SII, cuenta Flow producción, bases del
   sorteo). **Este es el hito con fecha propia del roadmap.**
8. **F08 — Self-service de tenants + panel del Operador**. Depende de F05/F06/F07 (producto probado).
   Registro, wizard de alta (credenciales Flow, productos, sorteo, plantilla), aceptación de ToS
   registrada, publicación; suspensión/supervisión por el Operador.
9. **F09 — Hermes por tenant**. **RETIRADA (2026-07-17)** — fuera del producto por decisión del usuario.
   correr en paralelo a F06–F08.
10. **F10 — Go-live de la plataforma pública**. Depende de todo. Bloqueada por la validación legal
    de ToS/disclaimer por abogado (ADR-0008, dependencia externa) + hardening (migraciones
    versionadas reemplazan `db push` antes de tener datos de terceros, backups, monitoreo).

### Detalle de fases (para el HTML del roadmap)

**F01 — Fundación multi-tenant + circuito de pago BYO-Flow** _(detallada)_
- Objetivo: que exista la mecánica esencial del SaaS — tenant, subdominio, scoping, credenciales
  cifradas, ruteo de webhook — probada de punta a punta con 2 tenants en Flow sandbox.
- Dependencias: ninguna (fundación). Rescata service Flow / núcleo webhook / use cases del F01 viejo.
- Decisiones abiertas que bloquean: ninguna (dev usa `*.localhost`).
- Criterio de hecho: dos tenants seed con credenciales sandbox distintas; comprar en
  `a.localhost` y `b.localhost` crea órdenes scoped al tenant correcto, el webhook rutea y confirma
  server-side con las credenciales del tenant dueño de la orden, idempotente; cero fuga cross-tenant.

**F02 — Efectos post-pago per-tenant** _(coarse)_
- Objetivo: al confirmar el pago, crear `DownloadGrant` + `RaffleEntry` (scopeados) en la misma
  transacción, idempotente.
- Dependencias: F01. | Bloqueos: ninguno duro.
- Criterio de hecho: pago confirmado ⇒ N grants + 1 entry del sorteo ACTIVO **de esa Tienda**, una
  sola vez; sin sorteo activo, la venta no se compromete.

**F03 — Storage privado + entrega de PDF** _(coarse)_
- Objetivo: bucket privado **Cloudflare R2** (ADR-0009) con paths per-tenant; descarga por URL
  prefirmada con expiración autorizada por Entitlement (ADR-0002).
- Dependencias: F02. | Bloqueos: solo #6 (marca de agua — se decide en su planning).
- Criterio de hecho: con Entitlement vigente hay URL firmada que expira; sin él, no; el path nunca se
  expone; un tenant jamás sirve archivos de otro.

**F04 — Correo transaccional** _(coarse)_
- Objetivo: enviar el enlace de descarga firmado al confirmar el pago (vía **Resend**, ADR-0010:
  la plataforma envía en nombre del tenant, reply-to del Organizador); reenvío si expira.
- Dependencias: F02, F03. | Bloqueos: ninguno duro en dev (la verificación del dominio remitente
  espera la decisión #4; en dev, remitente de prueba de Resend).
- Criterio de hecho: pago confirmado ⇒ correo al comprador con enlace válido; reenvío disponible.

**F05 — Auth de Organizadores + panel de tienda** _(coarse)_
- Objetivo: cuentas de Organizador (Google OAuth), membresía User↔Tenant + rol Operador, y el panel
  para operar la tienda: productos (+PDF), ventas, sorteo auditable, bases, CredencialFlow, config de
  plantilla.
- Dependencias: F01 (F03 para subir PDFs). Rescata OAuth/guard/authPolicy del plan superseded.
- Bloqueos: ninguno duro en dev (#4 dominio solo para `NEXTAUTH_URL` prod).
- Criterio de hecho: un Organizador solo ve y opera SU(s) tienda(s); el Operador ve todas; cero
  acceso cross-tenant.

**F06 — Plantilla configurable + storefront del comprador** _(coarse)_
- Objetivo: storefront mobile-first tematizado por tenant (logo/colores/textos sobre plantilla
  única), catálogo/carrito/checkout, disclaimer del sorteo (ADR-0008).
- Dependencias: F01 (F03/F04 para el flujo completo). | Bloqueos: identidad visual de la plataforma +
  diseño de la plantilla base (sesión `frontend-design`; `docs/design.md` PENDIENTE).
- Criterio de hecho: un comprador en el subdominio ve la tienda con SU marca, compra y llega a Flow;
  el disclaimer del sorteo es visible.

**F07 — HITO: tienda de la autora (tenant piloto) operativa** _(coarse — hito con fecha propia)_
- Objetivo: dogfooding real — la tienda de la autora vendiendo en producción.
- Dependencias: F01–F06. | Bloqueos: decisiones abiertas #1/#2/#4/#5 (storage, correo, dominio con
  wildcard, hosting con wildcard) + externas de la autora (SII, Flow producción, bases ante notario).
- Criterio de hecho: `<slug-autora>.<dominio>` en producción, primera venta real pagada, PDF
  entregado, participación del sorteo registrada.

**F08 — Self-service de tenants + panel del Operador** _(coarse)_
- Objetivo: que un tercero cree su tienda sin el Operador: registro, wizard (Flow, productos,
  sorteo, plantilla), aceptación de ToS registrada, publicación; panel del Operador
  (alta/suspensión/supervisión).
- Dependencias: F05, F06, F07 (producto probado). | Bloqueos: redacción de ToS (borrador operativo;
  validación legal formal puede correr en paralelo hasta F10).
- Criterio de hecho: un Organizador nuevo llega a tienda publicada sin intervención manual; sin ToS
  aceptados o sin bases no hay publicación con sorteo.

**F09 — Hermes por tenant** _(RETIRADA 2026-07-17)_
- **Fuera del producto por decisión del usuario.** No se construye. ADR-0003 queda histórico;
  decisión abierta #3 retirada. F10 pasa a depender de F01-F08 (sin F09).

**F10 — Go-live de la plataforma pública** _(coarse)_
- Objetivo: abrir la plataforma a tenants externos con respaldo legal y operativo.
- Dependencias: todas. | Bloqueos: validación por abogado de ToS/disclaimer (ADR-0008, externa);
  migraciones versionadas en lugar de `db push` antes de custodiar datos de terceros; backups y
  monitoreo.
- Criterio de hecho: plataforma pública con ≥1 tenant externo operando, legal validado, operación
  respaldada.

## Detalle ejecutable de la Fase 1 (F01)

Pasos en orden (todos F01):

1. **Schema multi-tenant** — invocar `schema-guardian` antes de tocar `prisma/schema.prisma`:
   modelo `Tenant` (slug único, nombre, estado del ciclo de vida — enum `alta/configuración/
   publicada/suspendida` —, timestamps), `FlowCredential` (1–1 con Tenant; apiKey y secretKey
   **cifradas**, flag sandbox/prod), y `Product`/`Order`/`OrderItem`/`Payment` (adaptados del F01
   viejo, renombrando `Book`→`Product`) todos con `tenantId` + `@@index([tenantId])` + uniques
   compuestos. `onDelete` explícito per prisma-conventions.
2. **Service de cifrado** (`src/server/services/`): encrypt/decrypt de credenciales (S2: AES-256-GCM,
   key en env via Zod). Núcleo puro testeable; la key jamás se loguea.
3. **Resolución de tenant por subdominio**: parser puro host→slug (apex/www ⇒ zona plataforma;
   `*.localhost` en dev) + middleware Next.js / helper SSR que resuelve slug→Tienda **publicada** y
   establece el contexto; contexto tRPC del storefront lleva el tenant resuelto server-side.
4. **Adaptar el service Flow rescatado**: factory instanciada con la `CredencialFlow` **descifrada**
   del tenant (la firma HMAC y `crearPago`/`getStatus` ya existen y no cambian).
5. **Adaptar `iniciarCheckout`**: scoped al tenant del contexto (solo productos de ESA tienda;
   snapshot de precio igual que antes); crea `Order`/`Payment` con `tenantId`.
6. **Webhook multi-tenant**: el núcleo rescatado gana el paso de **ruteo** — token/`commerceOrder` ⇒
   `Payment` ⇒ tenant ⇒ `getStatus` con las credenciales de ESE tenant ⇒ transición
   `pendiente→pagado|fallido` en `$transaction`, idempotente, hook post-pago intacto (contrato F02).
7. **Seeds** (`scripts/`): tenant piloto (autora) + tenant de prueba, cada uno con credenciales
   sandbox propias + 1 producto; idempotentes.
8. **Página dev throwaway tenant-aware** (sin marca): en el subdominio dev, elegir producto + email ⇒
   redirect a Flow sandbox.
9. Cierre: `backend-reviewer` + `change-set-reviewer` con la lista de archivos de la sesión.

## Validaciones

Solo F01 (fase detallada). F02–F10 definen las suyas en su propio task file.

### F01 — Fundación multi-tenant + circuito de pago BYO-Flow

**Vitest** (integration):
- [x] El parser de host resuelve `a.dominio` → slug `a`; apex y `www` → zona plataforma (sin tenant); host inválido/anidado no resuelve tenant. — [F01-B] `src/__tests__/server/tenancy/parsearHost.test.ts` (11 tests); [F01-INT] verificado además en vivo (curl por subdominio, ver Bitácora)
- [x] La resolución completa: slug existente y **publicada** ⇒ tenant en contexto; slug inexistente, en configuración o suspendida ⇒ sin storefront (respuesta neutral). — [F01-B] `src/__tests__/server/tenancy/resolverTenant.test.ts` (12 tests, repo fake); [F01-INT] repo real cableado (`crearRepoTenants`) y verificado en vivo: `autora.localhost`/`prueba.localhost` sirven SOLO su catálogo; apex y slug inexistente ⇒ `NOT_FOUND` neutral
- [x] Cifrado: roundtrip encrypt/decrypt recupera el secreto; el ciphertext no contiene el plaintext; descifrar con key incorrecta falla. — `src/__tests__/server/services/cifrado.test.ts::cifrado.001/002/003` (+ 004 IV aleatorio, 005 error sin filtrar clave) — PASSING 5/5
- [x] `iniciarCheckout` crea `Order` `pendiente` + `OrderItem`(s) con snapshot de precio, `total` = suma, correo persistido y `tenantId` del tenant del contexto. — [F01-C] `src/__tests__/server/checkout/iniciarCheckout.test.ts::checkout.iniciar.001` (fake db)
- [x] Aislamiento: `iniciarCheckout` en la tienda A con un producto de la tienda B ⇒ `NOT_FOUND`; los listados solo devuelven productos del tenant del contexto. — [F01-C] `iniciarCheckout.test.ts::checkout.iniciar.002/003` (producto de otra tienda ⇒ NOT_FOUND) + `listarProductos` scopea `where.tenantId` (query-level; E2E confirma el catálogo por subdominio)
- [x] El service Flow se instancia con las credenciales del tenant y `crearPago` firma con la secretKey de ESE tenant (dos tenants ⇒ firmas distintas para el mismo payload). — [F01-C] `src/__tests__/server/services/flow.test.ts::flow.crearPago.003` + `src/__tests__/server/pago/flowDeTenant.test.ts::flowDeTenant.001/002`
- [x] El webhook rutea: dado un token/commerceOrder, deriva la orden y su tenant, y consulta `getStatus` con las credenciales de ese tenant (nunca las de otro, nunca globales). — [F01-C] `src/__tests__/server/pago/enrutarPagoFlow.test.ts::ruteo.001/002/003` + `webhookFlow.test.ts::webhook.ruteo.pagado/unknown-token`
- [x] El webhook confirma server-side y avanza `pendiente→pagado` una sola vez, en `$transaction`; replay ⇒ ack sin re-efectos; resultado fallido ⇒ `pendiente→fallido`; método ≠ POST ⇒ 405 sin efectos. — [F01-C] `src/__tests__/server/pago/webhookFlow.test.ts::webhook.gate.405/getStatus-first/idempotencia/confirmacion.fallido/pendiente` + `confirmarPagoDeOrden.test.ts::confirmar.001..005` (fake db; atomicidad DB-level real la valida el E2E/feature-tester)
- [x] Los seeds son idempotentes y dejan 2 tenants con credenciales y producto propios. — `src/__tests__/scripts/seed-tenants.test.ts::seed.tenants.001/002` — [F01-INT] **PASSING 3/3 contra la DB real** (Supabase ya despausado) + `npm run seed:tenants` corrido idempotente (los 2 tenants ya existían; credenciales re-sembradas — hoy PLACEHOLDERS, pendientes las 2 cuentas sandbox reales)
- [x] Secretos (keys de Flow, key de cifrado) jamás aparecen en logs ni respuestas. — parcial [F01-A]: `cifrado.test.ts::cifrado.005` (mensaje de error sin filtrar la clave) + `seed-tenants.test.ts::seed.tenants.003` (ciphertext en DB sin plaintext); [F01-C]: `enrutarPagoFlow.test.ts::ruteo.004` (el ruteo + getStatus nunca loguean las creds del tenant, ni cifradas ni en claro) + el webhook responde solo `received/yaProcesado/transicion`/`ignorado` (nunca tenantId, creds ni token)

**E2E** (manual en sandbox — el checkout corre en el dominio de Flow):
- [x] En `autora.localhost` y `prueba.localhost`: elegir producto + email ⇒ pagar con tarjeta de prueba ⇒ cada `Order` queda `pagado` bajo SU tenant, confirmada con las credenciales de SU cuenta Flow sandbox, webhook procesado una sola vez (verificable en Prisma Studio). — [F01-INT] **EJECUTADO 2026-07-16** por la sesión principal + usuario (2 cuentas Flow sandbox reales + túnel cloudflared); **evidencia verificada en DB por el feature-tester** (read-only): `prueba` order `cmro6zik8000hwzaccvuppj1x` PAGADO/PAGADO total 5000 fee 160 (cuenta Flow 2); `autora` order `cmro6sgp00009wzacugpo4q45` PAGADO/PAGADO total 3000 fee 96 (cuenta Flow 1); orden rechazada por Flow (error 1620) `cmro6ojmg0002wzacbt9iwo4z` quedó PENDIENTE/PENDIENTE sin token (jamás confirmada server-side, I2/I3). Fees distintos = getStatus con la credencial propia de cada tenant; 4 secretKeys cifradas distintas en DB, cero fuga cross-tenant; conteo prueba=1 PAGADO / autora=1 PAGADO+1 PENDIENTE. **Prueba de fuego D1 CUMPLIDA**. ✅ 2026-07-16

### F02–F10
- [ ] (se definen en el task file de cada fase al planificarla)

## Invariantes

- **I1 — Tenancy**: todo modelo del dominio comercial lleva `tenantId`; toda query de dominio se
  filtra por el tenant resuelto **server-side** (subdominio o sesión), nunca por input del cliente;
  uniques compuestos con `tenantId` (ADR-0005).
- **I2**: Confirmación de pago SIEMPRE server-side contra `payment/getStatus` **con las credenciales
  del tenant dueño de la orden**; el redirect del navegador nunca es prueba de pago (ADR-0001/0006).
- **I3**: Webhook idempotente; transición `pendiente→pagado|fallido` una sola vez, en
  `prisma.$transaction`; el hook post-pago conserva el contrato `({tx, orderId}) => Promise<void>`.
- **I4**: Dinero `Decimal @db.Decimal(15,2)`, nunca `Float`; precio congelado en `OrderItem`.
- **I5**: `FlowCredential` cifrada at-rest; secretos y key de cifrado nunca en texto plano en DB,
  logs ni respuestas (ADR-0006).
- **I6**: La Plataforma nunca recibe ni mueve fondos de terceros ni hace split (ADR-0006).
- **I7**: Endpoints con patrón núcleo testeable + wrapper Next; env vía `src/env.js` (Zod) +
  `.env.example`; layering router fino → `domain/` → `services/`.
- **I8**: Antes de tocar el schema: `schema-guardian`. `onDelete` explícito, `@@index` en FKs
  queriables; `db push` sin migraciones versionadas **hasta F10** (revisar antes de datos de terceros).
- **I9**: PDFs jamás por enlace público; entrega solo vía Entitlement + URL firmada (ADR-0002) —
  rige desde F03 pero ninguna fase anterior puede violarlo "provisoriamente".

## Out of scope

- Cerrar decisiones abiertas #1–#6 (se resuelven con el usuario en la fase que las necesita).
- Builder/editor visual de tiendas (solo plantilla configurable — decisión cerrada del pivote).
- Split de pagos, custodia de fondos, comisión retenida en la pasarela (ADR-0006); el modelo de
  cobro de la Plataforma a los tenants es decisión de negocio abierta.
- Dominios custom por tenant (ADR-0007 — post-MVP).
- Cuentas de Comprador (ADR-0004), auto-posteo de Hermes, Mercado Pago directo, boletas SII
  automáticas.
- En F01: efectos post-pago, entrega, correo, UI con marca, panel, onboarding (fases posteriores).

## Supuestos (resueltos por criterio, revisables)

- **S1**: Dev multi-tenant vía `*.localhost` (`a.localhost:3000`) — browsers modernos lo resuelven
  sin DNS.
- **S2**: Cifrado de credenciales = AES-256-GCM app-level con key única en env
  (`CREDENTIALS_ENCRYPTION_KEY`); sin KMS por costo. Rotación = re-cifrado batch.
- **S3**: `Tenant.slug` = subdominio, único a nivel plataforma, inmutable tras publicación.
- **S4**: Apex reservado a la Plataforma; panel de Organizador/Operador en el apex (D6); el
  subdominio solo sirve storefront.
- **S5**: Rename `Book`→`Product` se ejecuta en F01 al adaptar el trabajo rescatado (D3).
- **S6**: Membresía mínima en el MVP: un Organizador dueño por Tienda (sin equipos/roles finos);
  el rol Operador es un flag/rol de plataforma. Se refina en el planning de F05.
- **S7**: `db push` sigue hasta F10; **antes del go-live público se migra a migraciones versionadas**
  (datos de terceros exigen evolución de schema no destructiva).
- **S8**: El trabajo parcial pausado de F01/F05 single-tenant se evalúa y rescata **dentro de F01/F05
  nuevos** (no se commitea tal cual): se conservan service Flow, núcleo webhook, DomainError/seams,
  authPolicy pura y tests puros; se adaptan schema, seeds, checkout y cableados al scoping.
- **S9**: El estado del ciclo de vida de la Tienda es un enum simple en el modelo `Tenant` (sin
  historial de transiciones en MVP).

## Especialistas a consultar

Para F01 (los demás en el planning de cada fase):

- `schema-guardian` — modelo `Tenant`/`FlowCredential` + re-scoping de `Product`/`Order`/`OrderItem`/
  `Payment` (uniques compuestos, `onDelete`, índices por `tenantId`).
- `backend-reviewer` — middleware/resolución de tenant, service de cifrado, ruteo del webhook,
  layering y env vars.
- `troubleshooter` — si el trabajo rescatado del F01 viejo pelea con el scoping.
- `feature-tester` — Vitest + E2E manual asistido con 2 tenants en sandbox.
- `change-set-reviewer` — diff completo de la fase antes de commit.

## Bitácora

- [2026-07-16 00:00] [planner-grill] (domain-planner) Pivote a SaaS multi-tenant registrado. Por
  instrucción explícita del usuario NO hubo grill: decisiones vinculantes ya cerradas por él
  (BYO-Flow, responsabilidad legal del organizador, plantilla configurable sin builder, subdominios,
  autora = tenant piloto); el resto resuelto por criterio y marcado como Supuestos S1–S9. Ninguna
  pregunta resultó estructural imposible de asumir.
- [2026-07-16 00:00] [planner-grill] Docs de dominio actualizados en la misma sesión: `CONTEXT.md`
  reescrito para el SaaS (Tienda/`Tenant`, Organizador, Operador de plataforma, Plataforma,
  Subdominio, Plantilla, CredencialFlow, ToS, Disclaimer, ciclo de vida; `Book`→`Product`; Autora →
  tenant piloto; regla transversal de scoping). ADRs nuevos: **ADR-0005** (multi-tenant `tenantId` DB
  compartida), **ADR-0006** (BYO-Flow + ruteo webhook), **ADR-0007** (subdominios), **ADR-0008**
  (responsabilidad legal del sorteo). Nivel 2 los cuatro (afectan modelo de datos, dinero y
  arquitectura; restringen features futuras). `docs/decisiones-abiertas.md` anotado (wildcard en
  #4/#5, correo multi-tenant en #2, costo LLM por tenant en #3) sin cerrar ninguna.
- [2026-07-16 00:00] [planner-grill] Superseded: `26-07-08-mvp-roadmap.md` (status testing→superseded),
  `26-07-08-auth-admin-google.md` (testing→superseded), `26-07-08-efectos-post-pago.md`
  (planning→superseded) — nota en cada Bitácora apuntando acá. Trabajo parcial F01/F05 pausado en
  terminales paralelas: NO se descarta; S8 define qué se rescata. INDEX actualizado.
- [2026-07-16 00:00] [planner-grill] Roadmap escrito: 10 fases, F01 detallada (fundación multi-tenant
  + circuito de pago BYO-Flow con 2 tenants sandbox como prueba de fuego), hito del piloto = F07,
  self-service = F08 (post-piloto, D4), Hermes = F09 (fuera del camino crítico, D5), go-live
  plataforma = F10 (gate legal + migraciones versionadas). **AWAITING USER APPROVAL** — la
  implementación de F01 no arranca sin visto bueno explícito del usuario.
- [2026-07-16 00:00] [orquestador] Usuario dio **visto bueno al roadmap SaaS** y cerró dos decisiones
  abiertas: #1 storage → **Cloudflare R2** (ADR-0009), #2 correo transaccional → **Resend**
  (ADR-0010). Referencia estudiada: `datawalt-app` (multi-tenant por subdominio en producción) —
  lecciones incorporadas: tenant SIEMPRE resuelto server-side en el context (su bug H1 de IDOR
  cross-tenant nació de pasar `domain` como input por procedure), membresía User↔Tenant con unique
  compuesto, un solo nombre de columna (`tenantId`) desde el día 1, fail-closed. F03/F04 quedan sin
  bloqueo de proveedor. F01 pasa a implementing.
- [2026-07-16 16:30] [F01-B] **Carril B (paso 3: resolución de tenant por subdominio) implementado**.
  Archivos NUEVOS: `src/server/tenancy/parsearHost.ts` (parser puro host→zona/slug, sin env/DB/IO),
  `src/server/tenancy/resolverTenant.ts` (resolución host→Tienda PUBLICADA con repo inyectado),
  `src/server/tenancy/configPlataforma.ts` (de dónde sale el dominio raíz),
  `src/server/tenancy/headerTenant.ts` (saneo de `x-tenant-slug`),
  `src/server/tenancy/repoTenants.ts` (seam del integrador), `src/middleware.ts` (borde edge) +
  tests `src/__tests__/server/tenancy/{parsearHost,resolverTenant,configPlataforma,headerTenant}.test.ts`.
  MODIFICADO: `src/server/api/trpc.ts` (solo AGREGA tenant al contexto + `tenantProcedure`; el service
  Flow global preexistente se preservó intacto — es del carril C re-scopearlo a BYO-Flow).
  Gates: **34/34 Vitest verdes**, eslint limpio en los 7 archivos, tsc sin errores en archivos del carril.
  Trazabilidad de las 2 Validaciones de este carril (NO marco checkboxes — es del feature-tester; y no
  toco esas líneas para no pisar ediciones concurrentes de A/C): parser ⇒ `parsearHost.test.ts` (11
  tests); resolución completa con repo fake ⇒ `resolverTenant.test.ts` (12 tests).
- [2026-07-16 16:30] [F01-B] **Decisiones tácticas** (cubiertas por plan/ADR/convenciones; ninguna
  cierra decisión abierta). (a) **Forma del slug = label DNS** (RFC 1035/1123: 1-63 chars `[a-z0-9-]`,
  sin guion al borde) — no es regla inventada, es consecuencia de S3/ADR-0007 ("el slug ES el
  subdominio"); exportada como `esSlugValido` para que el alta de Tiendas de F08 use ESTA definición y
  no una paralela. (b) **Respuesta neutral estructural**: `ResolucionTenant` tiene UNA sola variante
  `{ zona: "sin-storefront" }` **sin campo de motivo**, así inexistente / en-configuración / suspendida
  son indistinguibles *por construcción* (ningún caller puede filtrar el motivo aunque quiera) —
  ADR-0007. (c) **Defensa en profundidad**: el middleware sanea `x-tenant-slug` (lo pisa/borra siempre;
  el cliente nunca lo escribe), pero el contexto tRPC **NO lo lee**: re-parsea `req.headers.host` con el
  mismo parser puro, para no depender de que el `matcher` cubra el path (lección H1). (d)
  `tenantProcedure` nuevo en `trpc.ts`: garantiza `ctx.tenant` no-null y tira **`NOT_FOUND`** (no
  `FORBIDDEN`, que delataría "existe pero suspendida"). **Disponible para el carril C**: es el guard
  natural para `iniciarCheckout` scopeado (hoy `routers/checkout.ts` usa `publicProcedure`). (e) El
  parser distingue `plataforma` de `null`, pero el borde trata ambos como "sin tenant" (un host
  inválido no sirve storefront; tampoco se le 404ea el apex a `127.0.0.1` en dev). Cambiar eso a
  rechazo duro es una línea en el middleware si se decide.
- [2026-07-16 16:30] [F01-B] **HANDOFF 1 → carril A (`src/env.js`, zona exclusiva suya)**: falta declarar
  **`NEXT_PUBLIC_PLATFORM_DOMAIN`** (Zod `z.string().optional()` + `runtimeEnv` + `.env.example`). NO la
  agregué: `src/env.js` no es mi zona. Mientras tanto `configPlataformaDesdeEnv()` lee `process.env`
  **directo**, violando `backend-conventions.md` § Env vars — deuda **deliberada, confinada a esa única
  función** y documentada in-situ como HANDOFF; al declararla, es un cambio de UNA línea
  (`env.NEXT_PUBLIC_PLATFORM_DOMAIN`). El núcleo puro NO la toca: recibe el dominio raíz **inyectado**,
  así que la **decisión abierta #4 sigue ABIERTA** y ningún test presume el dominio (fixture
  `plataforma.test`, TLD reservado RFC 2606). Sin la var: dev cae a `localhost` (S1); **producción hace
  fail-fast (throw)** — sin dominio raíz `a.dominio` no se distingue del apex y el aislamiento por
  subdominio deja de significar algo (I1); mismo criterio que la factory de Flow. **Pregunta para el
  carril A (NIT del backend-reviewer, no la cierro yo)**: ¿`NEXT_PUBLIC_` o var de server? El prefijo
  solo hace falta si el valor debe llegar al bundle del browser; el middleware la lee server-side (edge)
  y funcionaría sin prefijo. No es secreto (está en la barra de direcciones). Decide A al fijar el schema.
- [2026-07-16 16:30] [F01-B] **HANDOFF 2 → integrador (pasos 8/9): cablear el repo, 1 línea.** Por D8
  ("B y C escriben núcleos puros con deps inyectadas; el integrador cabla contra el Prisma Client
  generado") NO cablé `db.tenant`. Hoy rige `repoTenantsSinCablear` (devuelve siempre `null` =
  **fail-closed**: ningún subdominio resuelve hasta que se cable). El circuito host→parser→resolución→
  contexto YA está cableado en `trpc.ts`; falta solo el repo. El snippet exacto está en el JSDoc de
  `repoTenants.ts`. **Contrato cross-carril VERIFICADO contra el schema que landeó A**: `Tenant.slug
  @unique` (S3) y `TenantStatus { ALTA CONFIGURACION PUBLICADA SUSPENDIDA }` coinciden **exacto** con
  mi `EstadoTienda`, el delegate `tenant` ya está generado, y probé con un archivo throwaway (borrado)
  que **el snippet compila tal cual** contra el client. El paso del integrador es mecánico.
- [2026-07-16 16:30] [F01-B] **`backend-reviewer`: APPROVE** (Compliance A / Naming A / Tests A) tras
  arreglar 1 **blocker que encontró y era real**: `middleware.ts` estaba en la RAÍZ del repo, donde Next
  **nunca lo habría ejecutado** — con `src/pages` presente, Next 14 solo detecta el middleware en el
  padre de `pagesDir`, o sea `src/` (`next/dist/build/index.js`: `rootDir = path.join(pagesDir || appDir,
  "..")`). Compilaba, no daba error y era **código muerto**: el saneo del header (que existe justamente
  para matar la clase de bug H1) no corría nunca. Movido a **`src/middleware.ts`** + comentario ⚠️
  UBICACIÓN in-situ para que nadie lo "corrija" de vuelta siguiendo la redacción genérica de los docs de
  Next. **Verificado empíricamente**: repliqué el predicado de detección de Next con sus PROPIOS módulos
  (`MIDDLEWARE_FILENAME`/`getFilesInDir`/`findPagesDir`) ⇒ `rootPaths: ['\src\middleware.ts']`,
  `hasMiddlewareFile: true` (antes: `[]` / `false`). NO corrí `next build` a propósito: hay procesos node
  vivos y `.next` presente (posible dev server de otro carril) y un build concurrente puede corromperlo.
  **PENDIENTE para el integrador**: confirmar en el E2E (paso 8/9) que el middleware corre de verdad
  (log `ƒ Middleware` en build, o `curl` en dev con `x-tenant-slug` forjado ⇒ debe ser ignorado). Vitest
  no puede atrapar un bug de ubicación — es el borde de cableado que el patrón núcleo+wrapper no testea.
- [2026-07-16 16:30] [F01-B] **Notas para el cierre de F01**. (a) **DRIFT propuesto, NO aplicado**
  (requiere OK del usuario y toca a los 3 carriles): `docs/agents/backend-conventions.md` § Procedures
  sigue diciendo "Hoy hay **2 procedures**" y describe la allowlist mono-usuario pre-pivote; al cerrar
  F01 debería documentar `tenantProcedure` y el módulo `src/server/tenancy/` (si no, F05/F06 reinventan
  el patrón). (b) **Hueco para F08**: el único subdominio reservado hoy es `www` (lo único que el plan
  declara). El alta self-service va a necesitar una lista de reservados (`api`, `admin`, `mail`, `app`…)
  — NO la inventé acá porque es decisión de producto, no de este carril. (c) **No son míos**: al cerrar,
  `tsc` reporta errores en `domain/checkout/*` y `pago/*` (`db.book`/`bookId` ya no existen) — los causó
  el rename `Book`→`Product` (D3/S5) que landeó A mientras yo trabajaba; son zona del carril C (paso 5).
  Los dejé intactos a propósito. (d) `src/server/api/trpc.ts` quedó tocado por B (contexto/tenant) y lo
  va a tocar C (Flow por tenant): al integrar, revisar que ambos cambios convivan.
- [2026-07-16 17:10] [feature-implementer] Arranca implementación **CARRIL C** de F01 (pasos 4, 5, 6 del
  Detalle ejecutable: service Flow por credencial de tenant + checkout scoped + núcleo del webhook con
  ruteo multi-tenant). Adapta el rescate S8. Zonas exclusivas del carril: `src/server/services/flow.ts`,
  `src/server/pago/`, `src/server/domain/`, `src/pages/api/webhooks/`, `src/server/api/routers/checkout.ts`
  + tests. Deps de A (schema Prisma generado) y B (`cifrado.ts`, `tenantProcedure`) ya landearon: tipo
  contra ellas. NO toco `schema.prisma`, `env.js`, `middleware`, `trpc.ts`, `scripts/`, auth/login.
- [2026-07-16 17:15] [feature-implementer] [F01-C] **Carril C implementado** (pasos 4/5/6). Archivos:
  NUEVOS — `src/server/pago/flowDeTenant.ts` (núcleo puro `construirFlowDeCredencial`: descifra la
  `FlowCredential` del tenant y arma su `FlowService` con baseUrl sandbox/prod por credencial; + borde
  `crearFlowServiceDeTenant` que lo cabla para el checkout + helper compartido `claveDeCifradoDeEnv`),
  `src/server/pago/enrutarPagoFlow.ts` (núcleo `crearEnrutadorFlow`: token→Payment→tenant→getStatus con
  las creds de ESE tenant, deps inyectadas; + borde `crearRepoRuteoFlow` Prisma), `listarProductos.ts`
  (rename de `listarLibros`, scoped por tenantId). MODIFICADOS — `services/flow.ts` (exporta
  `FLOW_SANDBOX_BASE_URL`/`FLOW_PROD_BASE_URL`; factory sin cambio de firma — ya recibía config, la firma
  HMAC ya es por-secretKey ⇒ por-tenant), `pago/webhookFlow.ts` (núcleo: reemplaza el `getStatus` global
  por `enrutarFlow`; agrega ack+ignore de token desconocido; confirma con `ruteo.orderId` autoritativo, no
  el `commerceOrder` del body de Flow), `pages/api/webhooks/flow.ts` (wrapper cablea enrutador + clave de
  env, fail-fast 500), `domain/checkout/iniciarCheckout.ts` (scoped por `tenantId`, `Product`, Order/
  OrderItem/Payment con tenantId, snapshot de precio intacto), `domain/checkout/schemas.ts`
  (`bookIds`→`productIds`, SIN tenantId en el input), `api/routers/checkout.ts` (`tenantProcedure` +
  Flow por tenant). ELIMINADO — `listarLibros.ts`. Toque courtesy — `pages/dev/checkout.tsx` (renombres
  mecánicos al router para no romper tsc; el integrador la rehace tenant-aware). Tests reescritos a FAKES
  (Supabase pausado, F01-A): `flowDeTenant.test.ts` (3), `enrutarPagoFlow.test.ts` (4), `webhookFlow.test.ts`
  (9), `confirmarPagoDeOrden.test.ts` (5, fake db con $transaction que revierte), `iniciarCheckout.test.ts`
  (4, fake db) + `flow.test.ts` (+1 firma por-tenant). **Vitest 31/31 PASSING**, `tsc --noEmit` exit 0
  (proyecto entero), `eslint` limpio en los archivos del carril.
- [2026-07-16 17:15] [feature-implementer] [F01-C] **Decisiones tácticas** (cubiertas por plan/ADR/
  convenciones; ninguna cierra decisión abierta). (a) **Un solo seam de instanciación BYO-Flow**
  (`construirFlowDeCredencial`) reusado por checkout (por tenantId) y webhook (por token) — el descifrado
  + armado del service vive en UN lugar (I5/I7). (b) **`orderId` autoritativo del ruteo**: el webhook
  confirma la orden que NUESTRA DB liga al token, NO el `commerceOrder` que devuelve Flow — así una
  respuesta de Flow manipulada no puede redirigir la confirmación a otra orden. `getStatus` sigue siendo
  la única prueba de PAGADO/FALLIDO+fee (I2). (c) **Token desconocido ⇒ ack+ignore (200)**, igual criterio
  que token faltante: notificación ajena/irreintentable, no 4xx que gatille reintentos infinitos. (d)
  **baseUrl sandbox/prod por credencial** (`FlowCredential.sandbox`), no global: cada tenant puede estar en
  distinto ambiente de Flow. (e) **`confirmarPagoDeOrden` NO recibe tenantId**: opera por `order.id` (PK
  global, único), y el tenant ya quedó fijado por el ruteo token→Payment→orderId — agregar tenantId sería
  redundante (el PK ya es tenant-safe). (f) **Tests a fakes, no DB-backed**: por el bloqueo de Supabase
  (F01-A) y la instrucción del carril ("usa fakes"); cubren toda la lógica de seguridad nueva (ruteo,
  firmas por-tenant, getStatus-antes-de-efecto, idempotencia, aislamiento cross-tenant, no-logueo de
  secretos). La atomicidad DB-level bajo carrera real y el snapshot-tras-cambio-de-precio quedan para el
  E2E/feature-tester con la DB real.
- [2026-07-16 17:17] [feature-implementer] [F01-C] `backend-reviewer`: **APPROVE** (Corrección A /
  Compliance A / Naming B / Tests B), cero blockers. Verificó los 6 focos de riesgo: sin fuga cross-tenant,
  confirmación server-side siempre antes de efecto, secretos nunca logueados/expuestos, dinero en Decimal,
  idempotencia atómica en $transaction con hook post-pago intacto, adapters externos solo en el borde.
  **NIT aplicado**: extraje el fail-fast duplicado de `CREDENTIALS_ENCRYPTION_KEY` a `claveDeCifradoDeEnv`
  (un solo mensaje, usado por checkout y webhook). Re-corridos gates tras el fix: 31/31 + tsc/eslint verdes.
  **NITs NO aplicados (fuera de scope de C o de fase posterior)**: (1) `ctx.flow` global en `trpc.ts:81-87`
  quedó MUERTO — nada lo consume (checkout usa Flow por tenant); es riesgo latente (un futuro procedure que
  lo use violaría BYO-Flow en silencio). **HANDOFF integrador/B**: retirar `ctx.flow` + la instanciación
  global de `FLOW_*` en el contexto. (2) `listarProductos` serializa `precio` como `number` (display-only,
  documentado; el monto autoritativo se re-lee como Decimal en checkout) — si F05 repite el patrón (panel/
  ventas), decidir un transformer de `Prisma.Decimal` en superjson. (3) Si `flow.crearPago` (red, fuera de
  la $transaction) falla, la Order/Payment PENDIENTE quedan huérfanas sin token — no mueve plata; limpieza
  para una fase posterior.
- [2026-07-16 17:17] [feature-implementer] [F01-C] **HANDOFFS al integrador (pasos 8/9)**. (a) El webhook
  YA cabla el repo real (`crearRepoRuteoFlow(db)`) y el checkout el Flow real por tenant — el circuito de
  pago está cableado de punta a punta salvo la resolución del subdominio (repo de tenancy = handoff de B) y
  **credenciales Flow sandbox REALES de DOS cuentas distintas** en los seeds (hoy placeholders; la "prueba
  de fuego" D1 exige dos cuentas Flow sandbox reales). (b) La `FLOW_URL_CONFIRMATION` debe apuntar al
  webhook `/api/webhooks/flow` (endpoint único de plataforma) y `FLOW_URL_RETURN` a la dev page — en dev
  con `*.localhost`, revisar que Flow sandbox acepte el host. (c) La dev page `pages/dev/checkout.tsx` la
  toqué solo mecánicamente (router renombrado); el integrador la rehace tenant-aware (hoy consume
  `tenantProcedure`, así que sin subdominio resuelto da NOT_FOUND — esperado). (d) Tests DB-backed: NO dejé
  ninguno DB-backed en el carril (todo a fakes); cuando Supabase vuelva, el feature-tester valida el
  circuito real + E2E con 2 tenants.
- [2026-07-16 17:17] [feature-implementer] [F01-C] **DRIFT de doc propuesto, NO aplicado (requiere OK del
  usuario, Step 4.5)** — a consolidar en el cierre de F01 junto con los drifts pendientes de A/B sobre el
  mismo archivo. `docs/agents/backend-conventions.md`: (i) § "Endpoints pages/api" describe UN cliente Flow
  global; con BYO-Flow el webhook es multi-tenant (ruteo token→Payment→tenant→getStatus con las creds de
  ESE tenant) — agregar el patrón de ruteo + el seam `construirFlowDeCredencial`/`crearFlowServiceDeTenant`
  (instanciación por-tenant de adapters con credenciales cifradas). (ii) § "Procedures" (ya lo marcó B):
  documentar `tenantProcedure` como el guard del borde de Comprador scoped por subdominio. NO lo apliqué
  yo. NO detecté vocabulario nuevo para CONTEXT (usé Product/Order/Payment/CredencialFlow/Tenant ya
  definidos) ni decisión nueva para ADR (BYO-Flow ya es ADR-0006, confirmación server-side ADR-0001).
- [2026-07-16 16:35] [feature-implementer] Arranca implementación **CARRIL A** de F01 (pasos 1, 2, 7 del
  Detalle ejecutable: schema multi-tenant + service de cifrado + seeds). Zonas exclusivas del carril:
  `prisma/schema.prisma`, `src/env.js`, `.env.example`, `src/server/services/cifrado.ts`, `scripts/` (seeds)
  + tests. Status global → implementing, F01 state → active. Carriles B/C corren en paralelo (no toco sus zonas).
- [2026-07-16 16:35] [feature-implementer] [F01-A] **Schema multi-tenant** (paso 1). Invocado `schema-guardian`
  ANTES de editar → APPROVED. Cambios en `prisma/schema.prisma`: nuevo enum `TenantStatus`
  (ALTA/CONFIGURACION/PUBLICADA/SUSPENDIDA), modelo `Tenant` (slug `@unique` global S3, `nombre`, `estado`,
  timestamps), modelo `FlowCredential` (1-1 con Tenant, `apiKeyCifrada`/`secretKeyCifrada` cifradas at-rest I5,
  flag `sandbox`, `onDelete: Cascade` = composición del agregado), rename `Book`→`Product` (D3/S5) y
  re-scoping de `Product`/`Order`/`OrderItem`/`Payment` con `tenantId` + FK a Tenant (`onDelete: Restrict` —
  un tenant se SUSPENDE, no se borra, S9) + índices compuestos `[tenantId, …]` (recomendación de
  schema-guardian: `Product [tenantId, activo]`, `Order [tenantId, email]`+`[tenantId, estado]`, `OrderItem`
  `[tenantId]`+`[productId]`, `Payment [tenantId]`). Uniques globales conservados donde el ruteo del webhook
  los necesita: `Payment.token` y `Payment.orderId` (token⇒Payment⇒tenant, confirmado por schema-guardian
  como REQUERIDO por Carril C). `@@unique([orderId, productId])` SIN tenantId (orderId ya es tenant-bound).
  `bookId`→`productId` en OrderItem. Refrescado el comentario-cabecera del schema a multi-tenant.
- [2026-07-16 16:35] [feature-implementer] [F01-A] **`prisma generate` corrido — B/C DESBLOQUEADOS en tipos.**
  El Prisma Client generado ya expone `Tenant`/`FlowCredential`/`Product`/`Order`/`OrderItem`/`Payment` +
  enum `TenantStatus`; `Book` eliminado. B/C compilan contra estos tipos. NOTA para B/C: sus archivos actuales
  (checkout/webhook/flow y sus tests) referencian `Book`/`bookId`/Order sin tenantId y quedan temporalmente
  rotos hasta que los adapten al rename+scoping — es esperado (S8).
- [2026-07-16 16:35] [feature-implementer] [F01-A] ⚠ **BLOQUEO DE INFRA (no del carril): el proyecto Supabase
  está pausado/inalcanzable.** `prisma db push` y toda query fallan con `FATAL: (ENOTFOUND) tenant/user
  postgres.ssdnivmwvwowulztftfe not found` en AMBOS endpoints (pooler 6543 y 5432) — confirmado con
  `prisma db execute` en los dos. Un typo de URL fallaría distinto; esto es el proyecto pausado (free-tier).
  Consecuencia: (a) el **`db push` del schema NO se aplicó a la DB** (el schema.prisma está escrito+validado y
  el client generado, pero la DB remota sigue con el schema viejo single-tenant); (b) el **seed test
  (DB-backed) no se pudo ejecutar** — sus 3 fallos son solo la conexión, no lógica. **Acción requerida del
  usuario**: restaurar/despausar el proyecto Supabase en el dashboard; luego correr `npm run db:push` y
  `npm run seed:tenants`, y `npx vitest run src/__tests__/scripts/seed-tenants.test.ts`. Esto también
  desbloquea los tests DB-backed de B/C.
- [2026-07-16 16:35] [feature-implementer] [F01-A] **Service de cifrado** (paso 2). `src/server/services/cifrado.ts`
  — AES-256-GCM puro (`cifrar`/`descifrar`/`parsearClave`), clave inyectada (Buffer 32 bytes), sin env ni I/O;
  empaqueta iv(12)+authTag(16)+ciphertext en un base64 (alineado con el String único del schema). Mensajes de
  error nunca incluyen el valor de la clave (I5). Env: agregado `CREDENTIALS_ENCRYPTION_KEY` a `src/env.js`
  (opcional, fail-fast al usar — mismo patrón que las Flow creds, I7) y a `.env.example` (placeholder inválido a
  propósito). Generada una key AES-256 REAL en `.env` local (gitignored; valor no expuesto). Tests:
  `cifrado.test.ts` **5/5 PASSING** (roundtrip, ciphertext sin plaintext, clave incorrecta falla, IV aleatorio,
  error sin fuga).
- [2026-07-16 16:35] [feature-implementer] [F01-A] **Seeds** (paso 7). `scripts/seed-tenants.ts` (núcleo+wrapper):
  núcleo `sembrarTenants({db, clave, specs})` idempotente (find-or-create por slug / tenantId / título), cifra
  las credenciales con `cifrado.ts` antes de persistir; wrapper lee env + `CREDENTIALS_ENCRYPTION_KEY`, no loguea
  secretos. Siembra 2 tenants **PUBLICADA** (para que el storefront resuelva en E2E dev; go-live real = F07):
  `autora` (piloto, producto "Cómo enriquecer a tu idol favorito" $3000) y `prueba` (producto "Guía de prueba
  del sorteo" $5000), con pdfPath per-tenant (`<slug>/seed/…`). **SUPUESTO tomado**: no hay `FLOW_API_KEY`/
  `FLOW_SECRET_KEY` en `.env` → el seed usa **placeholders sandbox DISTINTOS por tenant** (obviamente falsos);
  el E2E real contra Flow sandbox necesita credenciales reales (las cablea el integrador). Retirado el seed
  single-tenant obsoleto: eliminados `scripts/seed-book.ts` + `src/__tests__/scripts/seed-book.test.ts` (Book ya
  no existe); `package.json` script `seed:book`→`seed:tenants`. Tests: `seed-tenants.test.ts` (3: creación+cifrado,
  idempotencia, ciphertext sin plaintext) escritos pero **no ejecutables hasta despausar Supabase**.
- [2026-07-16 16:35] [feature-implementer] [F01-A] Cierre del carril: invocado `backend-reviewer` → **APPROVE**,
  cero blockers. NITs: (1) cuando el env trae UN solo par de creds Flow reales, ambos tenants reciben el MISMO par
  → **pendiente del Carril Integrador** cargar credenciales reales de DOS cuentas Flow sandbox distintas antes del
  E2E manual de F01 (la "prueba de fuego" de D1: firmas HMAC distintas por tenant); con nuestros placeholders
  actuales la propiedad SÍ se cumple (secretKeys distintas). (2) Aplicado: seed test compara precio con
  `Prisma.Decimal` (no `Number`). (3) `cifrado.ts` vive en `services/` per plan paso 2, aunque es util pura no-I/O;
  si crecen las utils puras, considerar `server/crypto/` — no bloquea. Aplicado también: `console.error` del seed
  loguea solo `e.message` (defensa I5). **NOTA (fuera de scope de A)**: `docs/agents/backend-conventions.md` sigue
  describiendo el modelo single-tenant/allowlist — lo actualizará Carril B (toca `trpc.ts`) o el change-set-reviewer
  al cierre. Drift de doc detectado: `docs/agents/prisma-conventions.md:22` cita `Book` como padre auditable
  (debería decir `Product`) — NO lo apliqué (requiere OK del usuario, Step 4.5); ver reporte final.
- [2026-07-16 17:45] [F01-INT] **Integrador (pasos 8/9): cableado completo, verificado en vivo.** Los 3
  handoffs de A/B/C aplicados. Archivos MODIFICADOS: `src/server/tenancy/repoTenants.ts` (placeholder
  fail-closed → `crearRepoTenants(db)` real, el snippet del JSDoc de B compiló tal cual),
  `src/server/api/trpc.ts` (cablea `crearRepoTenants(db)`; RETIRA `ctx.flow` global + instanciación
  `FLOW_*` muerta — nit del backend-reviewer de C: nada lo consumía y un procedure futuro que lo usara
  violaría BYO-Flow en silencio; queda comentario explicando por qué NO debe volver), `src/env.js`
  (+`NEXT_PUBLIC_PLATFORM_DOMAIN` como var PÚBLICA opcional en `client` — decisión del orquestador; el
  middleware edge la lee y no es secreto; −`FLOW_API_KEY`/`FLOW_SECRET_KEY`/`FLOW_API_URL`, huérfanas tras
  retirar `ctx.flow`: con BYO-Flow no hay credenciales globales y la baseUrl sale de `FlowCredential.sandbox`;
  `FLOW_URL_CONFIRMATION`/`FLOW_URL_RETURN` SIGUEN — las consume `flowDeTenant.ts` para `payment/create`),
  `src/server/tenancy/configPlataforma.ts` (deuda saldada: `process.env` directo → `env.NEXT_PUBLIC_PLATFORM_DOMAIN`),
  `.env.example` (+`NEXT_PUBLIC_PLATFORM_DOMAIN` documentada; sección Flow reescrita a BYO-Flow: −creds
  globales, +`FLOW_{AUTORA,PRUEBA}_{API,SECRET}_KEY` por-tenant para el seed), `scripts/seed-tenants.ts`
  (credenciales POR TENANT desde env — par completo ⇒ reales, ninguno ⇒ placeholder, a medias ⇒ error;
  throw si ambos tenants traen la MISMA secretKey — D1 exige cuentas distintas; credencial pasa de
  find-or-create a **UPSERT** para que re-correr el seed con creds reales pise los placeholders),
  `src/pages/dev/checkout.tsx` (tenant-aware de verdad: muestra el host, y `NOT_FOUND` neutral ⇒ hint de
  entrar por `autora.localhost`/`prueba.localhost` en vez de un error crudo). NUEVO:
  `src/pages/api/dev/echo-tenant.ts` (throwaway, muere con la dev page en F06: ecoa `x-tenant-slug` para
  poder OBSERVAR el middleware — el saneo es invisible desde afuera porque el contexto re-parsea el host).
  `.env` local: +`FLOW_URL_RETURN`, `FLOW_URL_CONFIRMATION` comentada (placeholder de túnel no pasa `z.url()`),
  scaffold comentado para las 4 vars de credenciales seed.
- [2026-07-16 17:45] [F01-INT] **Verificación (paso 9) — todo lo no-bloqueado, en verde.** (a) Gates:
  `tsc --noEmit` exit 0, `next lint` limpio, **Vitest COMPLETO 82/82 PASSING** — incluye los 3 tests
  DB-backed del seed que A dejó sin ejecutar: **Supabase ya está despausado** (la DB tiene el schema
  multi-tenant aplicado y los 2 tenants seed ya existían — alguien corrió `db push` + seed antes de esta
  sesión). `npm run seed:tenants` re-corrido: idempotente, credenciales re-sembradas (PLACEHOLDERS aún).
  (b) **Middleware verificado con requests reales** (cierra el PENDIENTE de B — bug de ubicación que Vitest
  no puede atrapar): dev server propio en **:3001** porque el :3000 lo ocupa OTRO proyecto del usuario
  («Grillos», app Mantine — no lo toqué; ojo feature-tester: `*.localhost:3000` NO es libros-iselk hoy).
  Con curl: apex + `x-tenant-slug: forjado` ⇒ header BORRADO (null en el echo); `autora.localhost` ⇒ header
  `autora` server-authored; `prueba.localhost` + header forjado ⇒ `prueba` (el spoof no sobrevive). (c)
  **Circuito completo host→middleware→contexto→repo real→catálogo scoped**: `checkout.listarProductos` vía
  curl devuelve SOLO el producto de su tenant en cada subdominio; apex y `nadie.localhost` ⇒ `NOT_FOUND`
  neutral idéntico. (d) Webhook: GET ⇒ 405 `method_not_allowed`; POST token desconocido ⇒ 200
  `{received, ignorado: unknown_token}` (ack+ignore). Dev server detenido al terminar (una sola instancia,
  y era mía).
- [2026-07-16 17:45] [F01-INT] **E2E manual: PENDIENTE, bloqueado por 2 externos** (per instrucción del
  orquestador, cierro igual el cableado). **AWAITING USER**: (1) **credenciales de DOS cuentas Flow sandbox
  DISTINTAS** (D1) — registrarlas en https://sandbox.flow.cl exige verificación de correo/datos personales,
  así que no las creé yo; van en `.env` como `FLOW_AUTORA_API_KEY`/`FLOW_AUTORA_SECRET_KEY` +
  `FLOW_PRUEBA_API_KEY`/`FLOW_PRUEBA_SECRET_KEY` (scaffold ya comentado en el `.env`), luego
  `npm run seed:tenants` (el upsert pisa los placeholders). (2) **Túnel público** (ngrok o similar) para que
  Flow sandbox alcance `/api/webhooks/flow` ⇒ descomentar `FLOW_URL_CONFIRMATION` en `.env` con esa URL.
  Con ambos: el E2E de Validaciones (pagar con tarjeta de prueba en los 2 subdominios) queda ejecutable por
  el feature-tester. **Nota adicional para el cierre**: el `.env` local NO tiene `GOOGLE_CLIENT_ID`/
  `GOOGLE_CLIENT_SECRET`/`ADMIN_ALLOWLIST` (que `env.js` exige como requeridas) — hoy `next dev`/`lint` solo
  arrancan con `SKIP_ENV_VALIDATION=1`; es pre-existente (scaffold trae DISCORD_*) y pega en F05 (auth), no
  en F01. Drifts documentales del cierre APLICADOS con OK del usuario: `prisma-conventions.md` (Book→Product
  + Tenant/FlowCredential en el criterio de cascades), `backend-conventions.md` § Procedures (tabla con
  `tenantProcedure` + defensa en profundidad del contexto) y § Endpoints/factory (webhook multi-tenant con
  ruteo por token + seam `construirFlowDeCredencial`/`crearFlowServiceDeTenant`, sin cliente Flow global).
  Status → **testing**; INDEX actualizado. Siguiente: feature-tester (lo orquesta la sesión principal).
- [2026-07-16 20:30] [feature-tester] **F01 validada — Vitest + evidencia E2E en verde.** (1) **Vitest completo
  `npx vitest run`: 14 archivos / 82 tests PASSING, exit 0** (71.99s; incluye los 3 DB-backed de
  `seed-tenants.test.ts` contra Supabase despausado). Marcados `[x]` los 10 checkboxes Vitest de Validaciones
  F01: parser de host, resolución completa (respuesta neutral ADR-0007), cifrado AES-256-GCM (roundtrip/no-plaintext/
  key-incorrecta), `iniciarCheckout` con snapshot+tenantId, aislamiento cross-tenant, Flow instanciado por credencial
  (firmas distintas), ruteo del webhook por token→tenant, confirmación server-side idempotente en `$transaction`,
  seeds idempotentes, secretos nunca en logs/respuestas. (2) **Evidencia E2E verificada directamente en la DB**
  (query read-only `npx tsx`, NO repetí el flujo en browser — el E2E lo ejecutó la sesión principal con el usuario):
  `prueba` order `cmro6zik8000hwzaccvuppj1x` → email `nikochaima72+e2eprueba@gmail.com`, total 5000, Order+Payment
  PAGADO, monto 5000, **fee 160**, token presente (cuenta Flow sandbox 2); `autora` order `cmro6sgp00009wzacugpo4q45`
  → email `nikochaima72+e2eautora@gmail.com`, total 3000, PAGADO/PAGADO, monto 3000, **fee 96**, token presente
  (cuenta Flow sandbox 1); orden rechazada por Flow (error 1620) `cmro6ojmg0002wzacbt9iwo4z` (email
  `comprador-e2e-autora@test.cl`, tenant autora) quedó **PENDIENTE/PENDIENTE sin token** — jamás confirmada
  server-side (I2/I3 sostenidos: el body/redirect nunca fue prueba de pago). (3) **Aislamiento cross-tenant
  confirmado**: 4 tenants con credencial (autora/prueba/test-seed-a/test-seed-b), **4 secretKeys cifradas DISTINTAS**
  (cero reuso), autora+prueba `sandbox=true`; conteo de órdenes prueba=1 PAGADO / autora=1 PAGADO + 1 PENDIENTE.
  Fees distintos (160 vs 96) = cada `getStatus` corrió con la credencial descifrada del tenant dueño de la orden,
  nunca cruzada (I5/ADR-0006). (4) **La prueba de fuego D1 (2 tenants, 2 cuentas Flow sandbox distintas, webhook
  ruteado por tenant, cero fuga cross-tenant) queda CUMPLIDA** — es el criterio de hecho de F01. Marcado `[x]` el
  checkbox E2E con la evidencia. NO cambié `status` ni `state` (decisión del usuario); NO hice commit; NO usé browser.
  Cierre con las 4 opciones estándar → orquestador. Log de la corrida en `tasks/.e2e-run.log` (gitignored).
- [2026-07-16 21:40] [orquestador] Usuario decidió cierre de F01: opción 4+2 — commit del tracking de
  validación y **F01 → state: done** (fase cerrada; el roadmap paraguas sigue activo hasta F10). E2E
  con la prueba de fuego D1 cumplida (2 tenants, 2 cuentas Flow sandbox, fees 96/160 con credenciales
  del tenant dueño, cero fuga). Se abren F02 (efectos post-pago) y F05 (auth Organizadores) en
  paralelo — planners despachados para sus task files propios.
- [2026-07-16 22:00] [planner-grill] [F02] **F02 pasó a planning** — task file propio:
  `tasks/26-07-16-pago-efectos-post-pago-tenant.md` (slug `efectos-post-pago-tenant`, registrado en
  INDEX). Adapta el plan superseded `26-07-08-efectos-post-pago.md` (contrato del hook post-pago
  intacto) con scoping por tenant: `DownloadGrant`/`Raffle`/`RaffleEntry` con `tenantId`, Raffle
  ACTIVO buscado en la Tienda de la orden, seed per-tenant vía `scripts/seed-raffles.ts`. Sin grill
  extenso (instrucción del usuario): Supuestos S1–S10 revisables. Coordinación con F05 en paralelo
  asentada como D8 del task file (`schema.prisma` append-only + releer antes de editar + anotar acá
  con tag `[F02]`; `trpc.ts`/auth/login/admin = territorio F05, F02 no los toca). **AWAITING USER
  APPROVAL** para pasar a implementación.
- [2026-07-16 22:10] [planner-grill] [F05] **F05 pasó a planning** — task file propio:
  `tasks/26-07-16-panel-auth-organizadores.md` (slug `panel-auth-organizadores`, registrado en
  INDEX). Parte del rescate F05 sin commitear del working tree (Google OAuth/authPolicy/guard del
  plan superseded `26-07-08-auth-admin-google.md`); muere la allowlist mono-usuario, nace
  `TenantMembership` (S6) + rol Operador por env var + `panelProcedure` fail-closed. Panel
  conectado a datos reales: productos (seam PDF para F03), ventas con cursor, CredencialFlow
  cifrada write-only, bases del sorteo como texto, config básica de plantilla en columnas
  opcionales de `Tenant` (append aditivo al schema — coordinado con F02 paralelo per zonas
  declaradas). Sub-feature Sorteo del panel BLOQUEADA hasta que F02 landee Raffle/RaffleEntry.
  AWAITING USER APPROVAL del plan.
- [2026-07-16 23:35] [F02] **Schema tocado (append-only, D8)** por el feature-implementer de F02.
  `schema-guardian`: **APPROVE**. Agregado al final de `prisma/schema.prisma`: enum `RaffleStatus`
  {ACTIVO, CERRADO} + modelos `Raffle`, `RaffleEntry`, `DownloadGrant` (los tres con `tenantId` + FK
  `Restrict` a Tenant; uniques de idempotencia `RaffleEntry @@unique([raffleId, orderId])` /
  `DownloadGrant @@unique([orderId, productId])` SIN tenantId redundante; `DownloadGrant.token @unique`
  global; `Raffle @@index([tenantId, estado])` para el lookup del ACTIVO). Back-relations append-only
  dentro de `Tenant` (raffles/raffleEntries/downloadGrants), `Order` (downloadGrants/raffleEntries),
  `Product` (downloadGrants). `npm run db:push` **aditivo OK** (DB en sync, sin `--accept-data-loss`).
  `prisma generate`: la regeneración del client TS incluyó los 3 modelos nuevos (index.d.ts), pero el
  copiado del query-engine `.dll.node` dio **EPERM** porque el `next dev` de :3001 lo tiene bloqueado
  (Windows) — inocuo: el binario del engine no cambia de versión y es schema-agnóstico (el datamodel se
  pasa en runtime desde el client generado). Si el dev server se reinicia, `prisma generate` termina
  limpio. **Zona F05 (`trpc.ts`/auth/login/admin) NO tocada.**
- [2026-07-17 00:00] [F05] **Schema tocado (append-only aditivo)** por el feature-implementer de F05
  (auth de Organizadores + panel, `tasks/26-07-16-panel-auth-organizadores.md`). Dos rondas, ambas con
  `schema-guardian` **APPROVE** ANTES de editar + re-lectura del schema justo antes (F02 había landeado
  sus modelos entre medio). Ronda 1: modelo nuevo `TenantMembership` (userId/tenantId, `@@unique([userId,
  tenantId])`, onDelete Cascade desde User / Restrict hacia Tenant, `@@index([tenantId])`) + back-relations
  en `User`/`Tenant` + columnas OPCIONALES nuevas en `Tenant` (`descripcion`/`logoUrl`/`colorPrimario`
  = config básica de plantilla F06; `basesSorteo String?` = TEXTO borrador de bases, distinto del
  `Raffle.basesUrl` de F02 —coexisten a propósito, D8/S4). Ronda 2 (al desbloquear el Sorteo del panel,
  porque F02 pasó a testing): 3 columnas nullable AGREGADAS a `Raffle` de F02 —**jamás editando sus
  campos**— para la ejecución auditable: `ganadorEmail String?`, `ejecutadoAt DateTime?`, `ejecutadoPor
  String?` (email del ejecutor, snapshot durable). `npm run db:push` **aditivo OK** ambas veces (DB en
  sync, sin `--accept-data-loss`); `prisma generate` regeneró los tipos TS (mismo EPERM inocuo del
  engine `.dll` por el lock de :3001). **Zona F02 (`domain/pago`, seeds de sorteo) NO tocada.** Detalle
  completo en la Bitácora del task file de F05.
- [2026-07-17 04:30] [orquestador] **F09 (Hermes) RETIRADA del producto** por decisión explícita del
  usuario ("quitar el hermes, ya no va"). Barrido documental: CLAUDE.md, CONTEXT.md (término marcado
  histórico), decisiones-abiertas #3 retirada, ADR-0003 queda como registro. F10 depende ahora de
  F01-F08. El turno nocturno sigue sin ese paso.
- [2026-07-17 05:00] [F05] **Fixes puntuales de cierre aplicados** por el feature-implementer (el usuario
  decidió los 4 pendientes; solo estos fixes, sin re-implementar). (1) **Lint del panel limpio**
  (`npx next lint` sin warnings ni errors): import muerto retirado, 3 `no-unsafe-argument` de tests con
  helper tipado, y 6 `prefer-nullish-coalescing` resueltos vía helper `textoOpcionalANull`
  (`domain/panel/_internal.ts`) — NO con `?? null`, que rompería la semántica "vacío ⇒ null". Vitest
  filtrado 29/29, `tsc --noEmit` exit 0. (2) **Drifts de doc APLICADOS** (con OK del usuario):
  `backend-conventions.md` § Auth reescrita (murió `ADMIN_ALLOWLIST` como gate; rige `TenantMembership`
  + Operador vía `PLATFORM_OPERATOR_EMAILS`) + § Procedures con `panelProcedure`; `frontend-conventions.md`
  (listas por cursor, formularios hidratados-desde-query, helpers `~/lib/formato`, input de monto). (3)
  **Cerrado sin código**: bases del sorteo QUEDAN en `Tenant.basesSorteo` (no migran a `Raffle`); el
  blocker del `Textarea` shadcn del frontend-reviewer se OMITE — el panel migra a **Mantine** en la
  próxima task (ADR-0011 vendrá), NO es gap para el change-set-reviewer. (4) `env.js`/`.env.example`
  verificados en sync con el `.env` real (OAuth `sortealo-dev` + `PLATFORM_OPERATOR_EMAILS`). Detalle
  completo en la Bitácora del task file de F05. **Sin commit/push; el feature-tester lo orquesta la
  sesión principal.**
- [2026-07-17 05:20] [F05] **Fix post-review del `change-set-reviewer`** (REQUEST_CHANGES: 1 blocker +
  3 nits) aplicado por el feature-implementer, exacto y acotado. Blocker: la grilla de KPIs del
  dashboard (`admin/index.tsx`) quedaba en skeleton perpetuo ante fallo de `getResumenTienda`
  (`retry:false` sin rama de error) — agregada rama `isError` con `text-destructive` + `Reintentar`
  espejando la tabla de ventas. Nits: `id` en el `select` de participaciones del sorteo + `key={p.id}`
  (evita keys duplicadas por email repetido en `RaffleEntry`); baja la rama muerta `AccessDenied` en
  `login.tsx` (resabio de la allowlist); fake `aggregate` de `getResumenTienda.test.ts` devuelve
  `_sum.total: null` sin filas (ejercita el coalesce Decimal). Diferido a la task Mantine: naming de
  procedures + voseo del CLI. Lint limpio, `tsc --noEmit` 0, Vitest filtrado 6/6. Detalle en la
  Bitácora del task file de F05. Sin commit/push.
- [2026-07-17 00:59] [feature-tester] **Validación conjunta F02 + F05 (roadmap).** `vitest run` COMPLETO
  **verde: 28 archivos / 145 tests, 0 fallos** (~162s, DB-backed contra Supabase real). **F02**
  (`efectos-post-pago-tenant`): 12/12 (seed-raffles 3 + aplicarEfectosPostPago 9). **F05**
  (`panel-auth-organizadores`): 23 checkboxes Vitest verdes (authPolicy 19, panel 35 con getAccesoActual/
  productos/ventas/config/sorteo, otorgar-membresia 5). Checkboxes Vitest de ambos task files marcados
  `[x]`. **E2E por evidencia DB read-only + el E2E en vivo de la sesión principal (NO browser, NO pagos,
  NO ejecuté el sorteo)**: F02 confirmado (order `cmrogl4pi0002egexv45st4a5` PAGADO/`autora`, 1
  DownloadGrant token+expiresAt, 1 RaffleEntry en "Sorteo de lanzamiento" del mismo tenant, una vez; 1
  Raffle ACTIVO por tenant seed). F05 `panel.auth.membresia.001` ✅ (login Google real → `/admin`;
  Operador sin membresía → empty state fail-closed; membresía `nikochaima72@gmail.com`↔`autora` en DB).
  **Quedan `[ ]`** (por instrucción, no por fallo): `panel.auth.redirect.001` + los CRUD/ventas/config con
  sesión (⏳ no cubiertos en vivo, backend verde) y `panel.sorteo.ejecutar.001` (⏳ PARCIAL: sorteo activo
  + participaciones visto en vivo; ejecución RESERVADA para el usuario — irreversible). **NO cambié
  `state`/`status`, NO commit** — el usuario/orquestador nocturno consolida. Detalle en las Bitácoras de
  ambos task files.
- [2026-07-17 05:12] [orquestador] Decisión nocturna delegada (turno autónomo): tester dio 145/145 +
  E2E por evidencia. Se ejecuta commit por fase (opción 4) y las fases quedan operativamente passing
  (opción 1) — cierre formal a done lo decide el usuario en la mañana. Los 5 ítems E2E de F05 con
  sesión (redirect/CRUD/ventas/config) se cubrirán DESPUÉS de la migración Mantine para no verificar
  dos veces la misma UI; la ejecución del sorteo queda RESERVADA al usuario (irreversible). R2 quedó
  configurado (bucket sortealo-dev + token; credenciales en .env) — F03 desbloqueada por completo.
- [2026-07-17 06:00] [planner-grill] (domain-planner) **Migración de UI a Mantine 7 planificada**
  (decisión cerrada del usuario 2026-07-17, sin grill por instrucción vigente): **ADR-0011** creado
  (`docs/adr/0011-migracion-ui-a-mantine-7.md`, nivel 2 — librería base de toda la UI + mecanismo de
  theming per-tenant de F06 vía `MantineProvider`/`mergeThemeOverrides`); `docs/design.md` y
  `docs/agents/frontend-conventions.md` reescritos Mantine-céntricos (marca sigue PENDIENTE, F06
  sigue bloqueada por identidad visual — el pipeline de theming ya no). Tailwind convive acotado a
  layout (supuesto S-TW, patrón datawalt-app); shadcn/radix/cva/lucide se retiran. Task ejecutable:
  `tasks/26-07-17-ui-migracion-mantine.md` (login + 5 páginas del panel + shell; los E2E-con-sesión
  diferidos de F05 se cierran en su testing). Dev pages `/dev/checkout*` NO se migran (mueren en
  F06). **AWAITING USER APPROVAL.**
- [2026-07-17 09:10] [feature-implementer] [MANTINE] **Migración de UI a Mantine 7 IMPLEMENTADA**
  (`tasks/26-07-17-ui-migracion-mantine.md`, F01..F04, status → testing). Mantine 7.17.8 (misma major
  que datawalt-app): core/hooks/form/modals/notifications. Migración 1:1 sin rediseño (marca
  PENDIENTE, theme casi-default). Gates verdes: `tsc`/`next lint` exit 0, `vitest run` **145/145**
  (I1 intacto — no se tocó `src/server/**`). frontend-reviewer **APPROVE** (0 blockers, 1 nit
  corregido). Sin commit/push/feature-tester (instrucción del usuario); E2E visual con sesión lo hace
  la sesión principal.
  **Archivos — nuevos**: `src/styles/theme.ts`, `src/pages/_document.tsx`.
  **Reescritos (infra)**: `src/pages/_app.tsx`, `tailwind.config.ts`, `src/styles/globals.css`,
  `package.json`/`package-lock.json` (+@mantine ×5, −radix ×6/cva/tailwindcss-animate/lucide-react).
  **Migrados (UI)**: `src/components/admin/admin-layout.tsx` (AppShell+Burger+NavLink),
  `estado-badge.tsx`, `stat-card.tsx`; `src/pages/login.tsx`; `src/pages/admin/{index,ventas,
  productos,sorteo,configuracion}.tsx`.
  **Eliminados**: `src/components/ui/` (11 componentes shadcn) + `components.json`.
  **Conservados** (D7): clsx, tailwind-merge, prettier-plugin-tailwindcss, @tabler/icons-react,
  recharts, embla. **NO tocados** (I5): landing maqueta (`src/components/landing/*`, `index.tsx`) y
  dev throwaway (`src/pages/dev/checkout*`) — solo compilan. **2 decisiones abiertas para el usuario**:
  (a) productos "desactivar/eliminar" con confirm (el Plan lo menciona pero el flujo 1:1 no lo tiene y
  el router no expone delete — preservé 1:1); (b) convención `ta` de Mantine vs `text-right` de
  Tailwind para alinear celdas de tabla (nit del reviewer).
- [2026-07-17 05:52] [orquestador] Migración Mantine 7 completa (ADR-0011): gates verdes (tsc/lint/
  145 vitest), frontend-reviewer APPROVE, verificación visual con sesión real — dashboard con KPIs
  reales y ventas con Decimal punta a punta ($3.000 | −$96 | $2.904). Decisiones nocturnas: flujo de
  productos queda 1:1 (sin botón destructivo nuevo — REVISABLE si el usuario quiere confirmación de
  desactivar); `text-right` blesseado como layout en frontend-conventions. E2E-con-sesión de F05
  cubiertos en este pase (dashboard/ventas en vivo; productos/config renderizan 200 + Vitest).
- [2026-07-17 01:56] [planner-grill] **F03 planificada** → task file propio
  `tasks/26-07-17-entrega-storage-r2.md` (SIN grill, instrucción nocturna: criterio + Supuestos
  revisables). Alcance: (1) `services/storage.ts` — adapter S3-compatible contra R2 (ADR-0009;
  factory config explícita patrón flow.ts, presign GET/PUT + headObject, aws-sdk v3); (2) subida
  real del PDF del panel por **presigned PUT desde el cliente** (S1 revisable) a la key
  determinística `<tenantId>/<productId>.pdf` computada server-side — cierra el seam `pdfPath` de
  F05, `Product.pdfPath` pasa a nullable (schema-guardian) y "sin PDF no hay producto activo";
  (3) endpoint público `GET /api/descargas/[token]`: DownloadGrant vigente ⇒ 302 a URL prefirmada
  ~10 min, cualquier fallo ⇒ 404 neutral idéntico (I9: cross-tenant imposible + defensa en
  profundidad por prefijo de key); (4) `/dev/descargas` (solo dev) como puente de E2E hasta el
  correo de F04. `GRANT_TTL_DIAS=30` RATIFICADO (el schema decía "política final en F03"). Marca
  de agua **#6 sigue ABIERTA** (diferida a propósito — blob opaco end-to-end). Infra lista: bucket
  `sortealo-dev` + token, creds en `.env` (declararlas en `env.js`/`.env.example` es paso 1 del
  plan). **AWAITING USER APPROVAL** para pasar F03 a implementing.
- [2026-07-17 02:34] [F03] **F03 IMPLEMENTADA** (feature-implementer, contrato nocturno; detalle
  completo en la Bitácora de `tasks/26-07-17-entrega-storage-r2.md`). Storage privado R2 operativo:
  `services/storage.ts` (adapter S3-compatible, factory config-explícita, presign PUT/GET 10 min +
  headObject, `keyDePdfProducto` per-tenant), subida real del PDF desde el panel por presigned PUT
  (cierra el seam `pdfPath` de F05 → `Product.pdfPath` nullable vía schema-guardian; `crearUrlSubidaPdf`
  + `confirmarPdfProducto`; FileInput Mantine con flujo crear→PUT→confirmar; guard "sin PDF no hay
  venta"), endpoint público `GET /api/descargas/[token]` (núcleo+wrapper; grant vigente ⇒ 302 a URL
  prefirmada, cualquier fallo ⇒ 404 neutral idéntico, defensa I9 por prefijo de tenant, sin sesión
  ADR-0004, no loguea token/path), `/dev/descargas` puente pre-F04. Deps `@aws-sdk/client-s3` +
  `s3-request-presigner`. Gates: tsc/lint/**vitest 165/165** (incl. roundtrip real contra R2; cero
  regresión). backend+frontend-reviewer APPROVE. Desbloquea F04 (correo con el enlace) y la entrega
  real del piloto (F07). **⚠ Pendiente operativo**: CORS del bucket a mano en Cloudflare (el token
  Object R&W no tiene `PutBucketCors` — S2); solo afecta el PUT de subida desde el navegador (el E2E
  de F02), NO la descarga ni el resto. Marca de agua #6 sigue DIFERIDA/ABIERTA. Sin commit/push/
  feature-tester (instrucción nocturna).
- [2026-07-17 06:45] [orquestador] F03 verificada E2E de punta a punta: PDF real subido a R2
  (key per-tenant), GET /api/descargas/<token> ⇒ 302 presignado ⇒ descarga 200 bytes PDF válidos;
  token inválido ⇒ 404 neutral. CORS del bucket configurado vía dashboard (el token API no tiene
  PutBucketCors — cubierto manualmente por el orquestador con la sesión del usuario). Gates 165/165.
  El circuito comercial completo (compra→pago→grant→descarga) está operativo en dev.
- [2026-07-17 07:20] [planner-grill] **F04 planificada** → task file propio
  `tasks/26-07-17-correo-transaccional-resend.md` (SIN grill, instrucción nocturna: criterio +
  Supuestos revisables S1–S9). Alcance: (1) `services/correo.ts` — adapter Resend por **fetch
  directo** (sin SDK ni react-email; cero deps nuevas), factory config-explícita patrón
  flow/storage, interfaz `enviarCorreo`; (2) al confirmar el pago, **decorator post-commit** del
  `confirmarPago` en el wrapper del webhook (núcleo webhookFlow + contrato EfectosPostPago
  INTACTOS): solo en `transicion === "PAGADO" && !yaProcesado`, try/catch log-and-continue — un
  fallo de Resend JAMÁS compromete la venta (el envío va FUERA de la $transaction); (3) UN correo
  por orden con todos los enlaces `/api/descargas/<token>`, español neutro texto+HTML mínimo,
  from "Tienda · vía Sortealo" (`onboarding@resend.dev` hasta decisión #4), reply-to = email de la
  membresía más antigua, disclaimer ADR-0008; (4) reenvío MVP = mutation `panelProcedure` + botón
  en admin/ventas que regenera grants expirados (token+TTL nuevos) — autoservicio público del
  Comprador DIFERIDO. URL base = nueva `APP_URL` opcional con fallback `NEXTAUTH_URL`. Infra lista:
  `RESEND_API_KEY` real en `.env` (declararla en env.js/.env.example es paso 1). Test real Resend
  opt-in por flag → nikochaima72+test@gmail.com. Sin cambio de schema. **AWAITING USER APPROVAL**
  para pasar F04 a implementing.
- [2026-07-17 03:30] [feature-implementer] **[F04] IMPLEMENTADA** (task file
  `tasks/26-07-17-correo-transaccional-resend.md` → status `testing`). F01 service correo (Resend fetch
  directo, factory config-explícita, fail-fast, error sin volcar la key) + F02 envío post-pago POST-COMMIT
  (`conCorreoPostPago` decora el webhook FUERA de la $tx, log-and-continue — la venta nunca se compromete;
  núcleo webhook + confirmarPagoDeOrden + contrato EfectosPostPago INTACTOS) + F03 reenvío desde el panel
  (mutation + botón Mantine en admin/ventas, regenera grants expirados en $tx). env `RESEND_API_KEY` + `APP_URL`.
  **Envío real de Resend verificado 1 vez** (id OK) — destino = email de la cuenta `nikochaima72@gmail.com`, NO
  `+test`: con `onboarding@resend.dev` sin dominio verificado (decisión abierta #4) Resend solo admite el email
  exacto de la cuenta. Gates: backend+frontend+change-set reviewer APPROVE; **vitest 190/190** (+1 skip opt-in),
  lint exit 0; `tsc` limpio salvo `tmp/e2e-descarga.ts` (scratch AJENO gitignored de F03 — decisión del usuario).
  Sin commit/push/feature-tester (instrucción). Pendiente usuario: resolver el tmp + 2 drafts de drift de docs +
  feature-tester (marcar `[x]` + E2E compra sandbox→inbox→descarga y reenvío).
- [2026-07-17 07:45] [orquestador] F04 verificada E2E de punta a punta (el CIRCUITO COMERCIAL COMPLETO):
  compra sandbox real (comprador nikochaima72@gmail.com) → webhook confirma → efectos post-pago
  (grant+participación) → correo Resend REAL entregado a la bandeja del comprador ("Tienda de la Autora
  (piloto) · vía Sortealo", enlace /api/descargas/<token>, disclaimer ADR-0008) → el enlace del correo
  entrega el PDF real (302 presignado R2 → 200 %PDF). Drift de docs aplicado (backend: correo
  post-commit; frontend: mutation por-fila). Gate npm run check verde (190/191, 1 skip = integración
  Resend opt-in). RESEND_API_KEY en .env. Remitente dev de Resend solo envía al email de la cuenta hasta
  verificar dominio (#4). Fases operativas del MVP: F01-F05 + entrega + correo. Falta: F06 storefront,
  F08 self-service, F07/F10 (externos).
- [2026-07-17 08:30] [planner-grill] **F06 (storefront del comprador con plantilla configurable)
  planificada** → task file propio `tasks/26-07-17-storefront-plantilla.md` (status `planning`, 6
  features). Sin grill (instrucción del usuario): resuelto por criterio, Supuestos S1–S8. Alcance:
  storefront mobile-first en el subdominio, tematizado por tienda con theme override de Mantine
  (ADR-0011) sobre los datos del `Tenant`, que reemplaza `dev/checkout*`; catálogo→detalle→carrito→
  checkout (reusa `iniciarCheckout`/`listarProductos` ya hechos) →retorno con marca; sección del sorteo
  activo + disclaimer obligatorio (ADR-0008); apex = placeholder neutral (marca de plataforma sigue
  PENDIENTE, no se inventa). **Campos de plantilla decididos (D4/S2)**: se agregan 3 columnas aditivas
  nullable al `Tenant` — `heroTitulo`, `heroSubtitulo`, `avisoTexto` — coordinadas con schema-guardian y
  con `get/guardarConfiguracionTienda` + `admin/configuracion.tsx` (superficie ya testeada de F05 se
  EXTIENDE, no se rompe); el resto de la plantilla reusa columnas existentes (`nombre`, `descripcion`,
  `logoUrl`, `colorPrimario`, `basesSorteo`). URL de retorno de Flow derivada del slug del tenant (D6, no
  reabre #4). INDEX actualizado. **AWAITING USER APPROVAL** — implementación no arranca sin visto bueno.
- [2026-07-17 06:22] [feature-implementer] [F06] **Storefront con plantilla IMPLEMENTADO**
  (`tasks/26-07-17-storefront-plantilla.md`, F01..F06, status → testing). Schema aditivo
  `heroTitulo/heroSubtitulo/avisoTexto` en `Tenant` (schema-guardian APPROVE + `db push`). Storefront
  mobile-first en el subdominio, tematizado per-tenant (helper puro `overrideDesdeBranding` hex→escala
  Mantine SIN dependencia nueva — S3; `mergeThemeOverrides` en `_app` con `pageProps.tenantBranding`
  resuelto SSR, ADR-0011). Catálogo (reusa `listarProductos`) + detalle (`getProductoStorefront`
  tenant-scoped) + carrito client-side per-slug (localStorage, sin cuenta ADR-0004, no cruza tiendas) +
  checkout → Flow con URL de retorno derivada del **host del request** = subdominio (D6; `urlConfirmation`
  del webhook GLOBAL intacto, ADR-0006) + retorno con marca que solo informa (I6/ADR-0001). Sorteo público
  `getSorteoActivoStorefront` (solo conteo, NUNCA correos — ADR-0004) + disclaimer OBLIGATORIO (ADR-0008).
  Apex = placeholder neutral (marca de plataforma sigue PENDIENTE, no se inventa). Limpieza: `dev/checkout*`
  + maquetas `landing/*` eliminadas, `embla-carousel-*` desinstalado (recharts conservado). Gates: tsc+lint
  verdes, **vitest completo 215/216 (+1 skip), 0 fallos**; backend+frontend-reviewer APPROVE. Verificación
  visual en :3001 (curl SSR+tRPC): 2 storefronts tematizados distintos (autora `#e11d48` / prueba `#0d9488`),
  aislamiento de catálogo/sorteo, apex neutral, 404s. Sin commit/push/feature-tester (instrucción). Detalle
  en la Bitácora del task file. **AWAITING USER + feature-tester.**
- [2026-07-17 10:50] [orquestador] F06 verificada en vivo: storefront mobile-first tematizado por
  tenant funcionando en el subdominio. autora.localhost:3001 con su color #e11d48 + hero + producto +
  sorteo + disclaimer ADR-0008; prueba.localhost:3001 con teal #0d9488 + su producto, CERO fuga
  cross-tenant; apex = placeholder neutral; subdominio inexistente = 404. Theming per-tenant vía
  mergeThemeOverrides (helper de escala propio, sin dep nueva). 3 columnas aditivas en Tenant
  (heroTitulo/heroSubtitulo/avisoTexto) editables desde el panel. Maquetas throwaway (landing/*,
  dev/checkout*) eliminadas. Gates 215/216 (1 skip). Drift de docs aplicado (helper fecha()).
  REVISABLE: identidad de plataforma sigue pendiente (apex neutral); branding demo de los seed;
  carrito sin subtotal client-side (respeta I4). El "mini-wix enfocado" está vivo.
