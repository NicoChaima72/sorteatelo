---
slug: storefront-plantilla
status: testing               # planning | implementing | testing | done
owner: nicolas
created: 2026-07-17
related_adrs: [ADR-0001, ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008, ADR-0011]
related_context: [Plataforma, Tienda, Organizador, Subdominio, Plantilla, Producto, Catálogo, Carrito, Orden, Pago, Sorteo, Participación, Bases del sorteo, Disclaimer del sorteo, Comprador]

features:
  - id: F01
    behavior: "Resolución de branding del tenant server-side + theming per-tenant (mergeThemeOverrides con datos del Tenant, ADR-0011) + shell mobile-first del storefront; hosts sin Tienda publicada dan respuesta neutral"
    state: active
  - id: F02
    behavior: "Campos de plantilla aditivos en Tenant (heroTitulo/heroSubtitulo/avisoTexto, nullable) + edición desde el panel (getConfiguracionTienda/guardarConfiguracionTienda + form del Organizador)"
    state: active
  - id: F03
    behavior: "Catálogo (grid de productos activos del tenant) + página de detalle de producto, tenant-scoped server-side"
    state: active
  - id: F04
    behavior: "Carrito client-side per-tenant (sin cuenta de comprador, no cruza tiendas) + checkout (correo → iniciarCheckout → redirect a Flow con URL de retorno del subdominio) + página de retorno con marca; reemplaza /dev/checkout*"
    state: active
  - id: F05
    behavior: "Sección del sorteo activo (query pública tenant-scoped, sin exponer participantes) + disclaimer del sorteo visible y obligatorio cuando hay sorteo activo (ADR-0008)"
    state: active
  - id: F06
    behavior: "Apex = placeholder neutral de la Plataforma (sin inventar marca) + limpieza de las dev pages throwaway y maquetas mock que F06 reemplaza"
    state: active
---

# F06 — Storefront del comprador con plantilla configurable

## Contexto

Fase F06 del roadmap SaaS (`tasks/26-07-16-saas-roadmap.md`). F01–F05 + entrega (F03 storage) + correo (F04)
ya están hechas y pusheadas: la resolución de tenant por subdominio funciona (`src/server/tenancy/*`,
ADR-0007), el checkout está scopeado por tenant y cobra con la cuenta Flow del Organizador
(`checkoutRouter` sobre `tenantProcedure`, BYO-Flow ADR-0006), los efectos post-pago crean
`DownloadGrant`/`RaffleEntry`, la entrega de PDF por URL firmada existe (ADR-0002) y el correo
transaccional de descarga se envía post-pago (Resend, ADR-0010). El Organizador ya edita la config de
plantilla de su Tienda en el panel (`getConfiguracionTienda`/`guardarConfiguracionTienda`:
descripcion/logoUrl/colorPrimario/basesSorteo). Hermes está **retirado** — no hay copy IA en el producto.

Lo que falta es la **cara del Comprador**: hoy el único punto de entrada al circuito de compra es
`src/pages/dev/checkout.tsx`, una página throwaway sin marca que F06 reemplaza. F06 construye el
**storefront mobile-first** que vive en el subdominio de cada Tienda publicada (`<slug>.localhost:3001`
en dev, ADR-0007), **tematizado por tienda** vía theme override de Mantine con datos del `Tenant`
(ADR-0011): catálogo → detalle → carrito → checkout → retorno, más la sección del sorteo activo y el
disclaimer legal obligatorio (ADR-0008). La marca que ve el Comprador es la de **la Tienda** (logo,
color, textos del Organizador) sobre un theme base casi-default de Mantine; **la marca de la
PLATAFORMA sigue pendiente y no se inventa acá** (`docs/design.md`) — el apex queda con un placeholder
neutral. El comprador **no tiene cuenta** (ADR-0004): su identidad es el correo; el carrito es estado
de cliente y no cruza tiendas (cada subdominio es un origin distinto).

## Decisiones

- **D1 — El storefront vive en las páginas del subdominio; el apex es zona plataforma.** El mismo
  `src/pages/index.tsx` (routing por path, agnóstico al host) despacha por zona resuelta server-side
  en `getServerSideProps`: subdominio con Tienda **publicada** ⇒ home del storefront; apex/`www` ⇒
  placeholder de plataforma; subdominio sin Tienda publicada (inexistente/en configuración/suspendida)
  ⇒ **respuesta neutral** (`notFound`, ADR-0007). Las páginas exclusivas del comprador
  (`/producto/[id]`, `/checkout`, `/checkout/retorno`) responden `notFound` neutral fuera de un
  storefront. Razón: reusa la resolución de host ya probada (`resolverTenantDesdeHost`) y respeta D6
  del roadmap (panel en apex, subdominio solo storefront).

- **D2 — Theming per-tenant = dato, no código (ADR-0011).** El branding del `Tenant` se resuelve
  server-side por request y el storefront arma su theme con
  `mergeThemeOverrides(themeBase, overrideDesdeBranding(branding))`. `colorPrimario` (hex) se expande a
  una tupla de 10 tonos Mantine y se fija como `primaryColor`; si es `null`, no hay override (queda el
  theme base de plataforma). Jamás hex inline en componentes ni clases de color Tailwind
  (`frontend-conventions.md` § Theming). El override se aplica en `_app.tsx`, que lee un
  `tenantBranding` opcional de `pageProps` (poblado por el `getServerSideProps` de las páginas del
  storefront); las páginas del panel/apex no lo setean ⇒ theme de plataforma intacto.

- **D3 — Branding para el theme se resuelve a nivel página (SSR), no en el contexto tRPC.** El contexto
  tRPC (`TenantDeContexto`) sigue cargando solo `{id, slug}` — suficiente para scopear queries (I1). El
  theme necesita los datos de marca **antes de renderizar** (SSR, en `_app`), así que un helper de
  `getServerSideProps` (`getStorefrontProps`) resuelve el branding con un repo que selecciona las
  columnas de marca. No se infla el contexto tRPC con branding que la mayoría de los procedures no
  necesita. Razón: separación limpia entre "scoping de queries" (contexto) y "chrome visual" (page SSR).

- **D4 — Campos de plantilla: se agregan 3 columnas aditivas nullable al `Tenant`.** Hoy existen
  `nombre`, `slug`, `descripcion`, `logoUrl`, `colorPrimario`, `basesSorteo`. Para que la plantilla sea
  configurable de verdad (hero/descripción/aviso, pedido del scope) se agregan **`heroTitulo`**,
  **`heroSubtitulo`** y **`avisoTexto`** (todas `String?`), coordinado con `schema-guardian` (aditivo,
  `db push`, sin migración — S7/I8). Mapeo de secciones del storefront:
  - **hero** → `heroTitulo` (fallback a `nombre`) + `heroSubtitulo` (fallback a `descripcion`);
  - **descripción/acerca de** → `descripcion`;
  - **aviso** → `avisoTexto` (banner opcional; si `null`, no se muestra);
  - **sorteo** → `Raffle` (nombre/premio/fechas) + `basesSorteo` (texto del Organizador) + disclaimer.
  Todas nullable ⇒ los tenants seed y el piloto siguen funcionando sin tocar datos; la UI degrada con
  fallbacks. Razón: sin campos propios el hero sería idéntico al nombre/descripcion y la plantilla no
  se sentiría configurable; 3 columnas nullable es el mínimo que da flexibilidad real sin sobre-modelar
  (NO builder visual — decisión cerrada). **Modifica superficie ya testeada de F05**
  (`getConfiguracionTienda`/`guardarConfiguracionTienda`/`configuracion.tsx` + sus tests): se extienden,
  no se rompen.

- **D5 — Carrito = estado de cliente per-tenant, sin cuenta (ADR-0004).** El carrito vive en el cliente
  (localStorage con clave namespaced por slug de tienda + estado React/context); no hay modelo `Cart`
  ni sesión de comprador. No cruza tiendas: cada subdominio es un origin distinto, así que el
  localStorage ya está aislado por construcción (defensa adicional: la clave incluye el slug). El
  checkout envía `productIds` (el backend `iniciarCheckout` ya acepta múltiples) + correo. Razón:
  ADR-0004 + "simple y barato"; el backend multi-ítem ya existe.

- **D6 — URL de retorno de Flow = subdominio del tenant, derivada server-side.** El comprador vuelve de
  Flow a `<slug>.<dominio-plataforma>/checkout/retorno` (una página **con marca del tenant**), no al
  apex ni a la env global `FLOW_URL_RETURN`. El borde del checkout construye esa URL desde
  `ctx.tenant.slug` + la config de plataforma (`configPlataforma`), y la pasa como `urls.urlReturn` a
  `construirFlowDeCredencial` (que ya acepta `urls`). El `urlConfirmation` del **webhook** queda GLOBAL
  e intacto (rutea por token⇒tenant, ADR-0006) — no se toca. El retorno **no es prueba de pago**
  (ADR-0001): la página solo informa "estamos confirmando tu pago, te llega el correo con la descarga".
  Razón: aterrizar al comprador en otro origin (apex) rompería contexto y marca; derivar del slug es
  totalmente server-side y no reabre la decisión de dominio #4.

- **D7 — El disclaimer del sorteo es obligatorio y no configurable por tenant (ADR-0008).** Cuando la
  Tienda tiene un `Raffle` **ACTIVO**, el storefront muestra un disclaimer fijo (texto de plataforma)
  dejando claro que el responsable del sorteo es el Organizador, no la Plataforma. No es un campo del
  tenant ni se puede desactivar. Razón: ADR-0008 lo exige como parte de la plantilla en toda tienda con
  sorteo activo.

- **D8 — Query pública del sorteo activo, sin exponer participantes.** `getSorteoDelPanel` es
  panel-scoped (exige membresía) y devuelve los correos de los participantes: NO sirve al comprador. Se
  crea `getSorteoActivoStorefront`, tenant-scoped por contexto (`tenantProcedure`), que devuelve solo
  datos públicos del `Raffle` ACTIVO (nombre, premio, fechas, `basesSorteo`) y a lo sumo un **conteo**
  de participantes — nunca correos (privacidad, ADR-0004). Razón: separar la vista pública de la de
  gestión evita filtrar identidades de compradores.

- **D9 — El apex es un placeholder neutral; no se inventa la marca de la plataforma.** La marca de la
  Plataforma (nombre/paleta/tipografía) sigue PENDIENTE (`docs/design.md`, decisiones abiertas #4).
  F06 pone en el apex un placeholder mínimo (mensaje neutral, sin logo ni paleta inventada). Razón:
  instrucción permanente de CLAUDE.md/design.md — no inventar dirección visual de marca.

- **D10 — Sin grill** (instrucción explícita del usuario): decisiones resueltas por criterio y marcadas
  como **Supuestos revisables** (S1–S8). Ninguna resultó estructuralmente imposible de asumir.

## Plan

Pasos en orden de dependencia. F01 es fundación (theming + shell); F03–F05 cuelgan de ella; F02 y F06
son laterales.

1. **Branding server-side + theming per-tenant** (F01). Núcleo: repo/resolución de branding del host
   (reusa `resolverTenantDesdeHost`; repo que selecciona `nombre/slug/descripcion/logoUrl/colorPrimario`
   + los 3 campos de D4) → `getStorefrontProps` helper de `getServerSideProps` (devuelve
   `{ props: { tenantBranding } }` o `notFound` neutral). Builder puro `overrideDesdeBranding(branding)`
   (hex→tupla de 10 tonos + `primaryColor`; `null`⇒sin override). `_app.tsx` pasa a ser tenant-aware:
   `mergeThemeOverrides(theme, override)` cuando llega `pageProps.tenantBranding`. (F01)
2. **Shell del storefront** (F01). `src/components/storefront/` — `StorefrontLayout` mobile-first
   (header con logo/nombre del tenant + acceso al carrito; footer con disclaimer de plataforma neutral),
   estados vacíos/carga per `frontend-conventions.md`. `index.tsx` despacha zona (D1): storefront home |
   apex placeholder | neutral. (F01, F06)
3. **Campos de plantilla aditivos + panel** (F02). `schema-guardian`: `heroTitulo/heroSubtitulo/avisoTexto`
   nullable en `Tenant`. Extender `getConfiguracionTienda` (select+return), `guardarConfiguracionTienda`
   (update+schema Zod), `panel/schemas.ts`, y el form `src/pages/admin/configuracion.tsx` (3 inputs
   nuevos). Actualizar sus tests. Cablear los campos al render del hero/aviso del storefront. (F02)
4. **Catálogo + detalle** (F03). Home del storefront = grid de productos activos (reusa
   `checkout.listarProductos`, ya tenant-scoped). Nuevo use case público `getProductoStorefront`
   (tenant-scoped, producto activo de ESA tienda; otro tenant/inactivo/inexistente ⇒ `NOT_FOUND`
   neutral) + router en `checkoutRouter`. Página `src/pages/producto/[id].tsx` (detalle + botón "agregar
   al carrito"). Montos con `~/lib/formato` (`clp`). (F03)
5. **Carrito + checkout + retorno** (F04). Carrito client-side per-tenant (context + localStorage
   namespaced por slug, D5); drawer/resumen. Página `src/pages/checkout/index.tsx`: resumen + input de
   correo (mostrar/confirmar antes de pagar, mitigación ADR-0004) → `checkout.iniciarCheckout` →
   redirect a Flow. Borde del checkout construye `urls.urlReturn` del subdominio (D6). Página con marca
   `src/pages/checkout/retorno.tsx` ("confirmando tu pago, te llega el correo"). Eliminar
   `src/pages/dev/checkout.tsx` y `src/pages/dev/checkout/retorno.tsx`. (F04, F06)
6. **Sorteo + disclaimer** (F05). `getSorteoActivoStorefront` (público, tenant-scoped, sin correos, D8)
   + router. Sección del sorteo en la home (nombre/premio/fechas/bases) + disclaimer obligatorio
   (ADR-0008/D7) visible cuando hay sorteo ACTIVO. (F05)
7. **Apex placeholder + limpieza** (F06). Placeholder neutral de plataforma en el apex (D9). Retirar las
   maquetas mock (`src/components/landing/*`, `index.tsx` viejo con variantes) que F06 reemplaza; revisar
   deps huérfanas (`embla-carousel-*` — las usaban las maquetas, ADR-0011 dejó su destino a F06). NO
   tocar `/dev/descargas` (herramienta de operador, concern separado). (F06)
8. Cierre: `frontend-reviewer` (storefront + theming + mobile-first), `backend-reviewer` (branding
   resolver, queries públicas del sorteo/producto, URL de retorno), `change-set-reviewer` con la lista
   de archivos de la sesión; luego `feature-tester`.

## Validaciones

### F01 — Branding + theming per-tenant + shell

**Vitest** (integration):
- [ ] La resolución de branding desde un host de Tienda **publicada** devuelve sus campos de marca; host de apex/`www` ⇒ zona plataforma sin branding; slug inexistente/en configuración/suspendida ⇒ respuesta neutral sin branding (no filtra el motivo). — `src/__tests__/server/storefront/resolverBranding.test.ts::storefront.branding.001-004`
- [ ] `overrideDesdeBranding` con `colorPrimario` hex produce un override con `primaryColor` apuntando a una tupla de 10 tonos derivada del hex; con `colorPrimario` null no produce override (theme base intacto). — `src/__tests__/styles/tenantTheme.test.ts::storefront.theming.override.001-003` (+ escala.001-003)
- [ ] El override es función pura y determinista (mismo branding ⇒ mismo theme; sirve SSR + cliente sin divergencia). — `src/__tests__/styles/tenantTheme.test.ts::storefront.theming.override.004`

**E2E** (browser):
- [ ] En `autora.localhost:3001` y `prueba.localhost:3001` el storefront renderiza con el logo/nombre y el color primario de ESA Tienda; el chrome es coherente mobile-first (viewport angosto). — `tasks/e2e-storefront.md#storefront.theming.001`
- [ ] `localhost:3001` (apex) muestra el placeholder de plataforma; un subdominio inexistente/no publicado da respuesta neutral (no un storefront, no el theme de otro tenant). — `tasks/e2e-storefront.md#storefront.zonas.001`

### F02 — Campos de plantilla aditivos + panel

**Vitest** (integration):
- [ ] `guardarConfiguracionTienda` persiste `heroTitulo/heroSubtitulo/avisoTexto` (vacío ⇒ `null`), scopeado al tenant de `acceso` (server-side), sin membresía ⇒ `FORBIDDEN`. — `src/__tests__/server/panel/configuracionTienda.test.ts::panel.config.guardar.001-003`
- [ ] `getConfiguracionTienda` devuelve los 3 campos nuevos del tenant autorizado. — `src/__tests__/server/panel/configuracionTienda.test.ts::panel.config.get.001`

**E2E** (browser):
- [ ] El Organizador edita hero/aviso en el panel (`/admin/configuracion`); el storefront de su subdominio refleja el hero y muestra el banner de aviso (y lo oculta cuando `avisoTexto` queda vacío). — `tasks/e2e-storefront.md#storefront.plantilla.001`

### F03 — Catálogo + detalle

**Vitest** (integration):
- [ ] `getProductoStorefront` devuelve un producto **activo** de la Tienda del contexto; producto de otra Tienda / inactivo / inexistente ⇒ `NOT_FOUND` (aislamiento por construcción, I1). — `src/__tests__/server/checkout/getProductoStorefront.test.ts::checkout.producto.storefront.001-004`
- [ ] El catálogo (`listarProductos`) solo devuelve productos activos del tenant del contexto (regresión — cobertura ya existente de F01, revalidar tras el consumo del storefront). — `src/__tests__/server/checkout/listarProductos.test.ts::checkout.listar.storefront.001` (consumo sin modificar el use case)

**E2E** (browser):
- [ ] En el subdominio: la home lista los productos activos del tenant en grid; abrir un producto muestra su detalle con precio formateado (CLP); un `/producto/<id>` de otro tenant da neutral. — `tasks/e2e-storefront.md#storefront.catalogo.001`

### F04 — Carrito + checkout + retorno

**Vitest** (integration):
- [ ] `iniciarCheckout` con varios `productIds` crea la orden con sus ítems y snapshot de precio (regresión — cobertura de F01, revalidar en el flujo de carrito multi-ítem). — `src/__tests__/server/checkout/iniciarCheckout.test.ts::checkout.iniciar.001` (multi-ítem p1+p2, sin modificar el use case)
- [ ] El borde del checkout construye la `urlReturn` a partir del slug del tenant + config de plataforma (no la env global), y la pasa al service Flow. — `src/__tests__/server/pago/urlRetorno.test.ts::checkout.urlretorno.construir.001-003 + origen.001-004` (derivada del host del request = `<slug>.<dominio>`; wiring en `routers/checkout.ts` vía `ctx.origin`)

**E2E** (browser):
- [ ] Agregar productos al carrito en `autora.localhost:3001` → checkout con correo → redirect a Flow (sandbox); tras pagar, el retorno con marca dice que el pago se confirma por correo. La orden queda bajo el tenant correcto. — `tasks/e2e-storefront.md#storefront.checkout.001`
- [ ] El carrito NO cruza tiendas: ítems agregados en `autora.localhost:3001` no aparecen en `prueba.localhost:3001` (origins distintos + clave namespaced). — `tasks/e2e-storefront.md#storefront.carrito.001`

### F05 — Sorteo + disclaimer

**Vitest** (integration):
- [ ] `getSorteoActivoStorefront` devuelve el `Raffle` ACTIVO de la Tienda del contexto (nombre/premio/fechas/bases + conteo), **sin correos de participantes**; sin sorteo activo ⇒ `null`; nunca devuelve el sorteo de otro tenant. — `src/__tests__/server/checkout/getSorteoActivoStorefront.test.ts::checkout.sorteo.storefront.001-003`

**E2E** (browser):
- [ ] En un subdominio con sorteo ACTIVO, la home muestra la sección del sorteo y el **disclaimer del sorteo es visible** (ADR-0008); sin sorteo activo, no aparece ni sección ni disclaimer. — `tasks/e2e-storefront.md#storefront.sorteo.001`

### F06 — Apex placeholder + limpieza

**Vitest** (integration):
- [ ] (no aplica — cambio de páginas/limpieza; cubierto por tsc/lint + E2E)

**E2E** (browser):
- [ ] El apex muestra el placeholder neutral de plataforma (sin marca inventada); las rutas `/dev/checkout` y `/dev/checkout/retorno` ya no existen (404). — `tasks/e2e-storefront.md#storefront.apex.001`

## Invariantes

- **I1 — Tenancy server-side**: toda query del storefront (catálogo, producto, sorteo, checkout) se
  scopea por el tenant resuelto **server-side** (subdominio, `ctx.tenant`), nunca por input del cliente
  (ADR-0005; lección H1). Ningún `tenantId`/slug del cliente decide qué se lee o escribe.
- **I2 — Respuesta neutral (ADR-0007)**: host sin Tienda publicada ⇒ `notFound`/neutral indistinguible
  entre inexistente / en configuración / suspendida. El storefront no filtra el motivo ni el branding.
- **I3 — Theming = dato, no código (ADR-0011)**: colores/logo/textos salen del modelo `Tenant` vía
  `mergeThemeOverrides`; PROHIBIDO hex inline, clases de color Tailwind o un theme hardcodeado por tenant.
- **I4 — Dinero (Decimal)**: el storefront solo **muestra** montos, siempre con `~/lib/formato` (`clp`),
  cruzando a `number` únicamente en el borde de presentación; jamás aritmética de dinero en el cliente ni
  reenvío de montos al server (`CLAUDE.md` § Regla de oro).
- **I5 — Sin cuenta de comprador (ADR-0004)**: identidad = correo; carrito es estado de cliente; no hay
  modelo `Cart` ni sesión de comprador. Confirmar el correo antes de pagar.
- **I6 — Confirmación de pago server-side (ADR-0001)**: la página de retorno NO marca la orden ni es
  prueba de pago; la confirmación es del webhook. El retorno solo informa.
- **I7 — Entrega segura (ADR-0002)**: el storefront NUNCA linkea el PDF ni el path del bucket; la entrega
  es por correo + `DownloadGrant` (F03/F04 ya hechas), fuera del alcance visual de F06.
- **I8 — Disclaimer obligatorio (ADR-0008)**: con sorteo ACTIVO, el disclaimer es visible y no
  desactivable por tenant.
- **I9 — Marca de plataforma PENDIENTE**: no inventar nombre/paleta/tipografía de la Plataforma; el apex
  es placeholder neutral; la marca visible del storefront es la del **tenant** sobre el theme base.
- **I10 — Layering / Mantine (D8 roadmap, ADR-0011)**: router fino → `domain/` → `services/`; UI 100%
  `@mantine/core` + `@tabler/icons-react`, Tailwind solo layout (`frontend-conventions.md`).
- **I11 — schema aditivo**: antes de tocar `schema.prisma`, `schema-guardian`; columnas nuevas nullable,
  `db push` sin migración versionada (S7/I8 del roadmap, hasta F10).

## Out of scope

- Builder / editor visual de tiendas (solo plantilla configurable con campos — decisión cerrada del
  pivote).
- Mecanismo de **subida** del logo del tenant (hoy `logoUrl` es string editable en el panel; si se quiere
  upload tipo PDF/R2, es trabajo de panel/F05, no de F06). F06 consume `logoUrl` como URL; si es `null`,
  usa el `nombre` como wordmark.
- Identidad de marca de la **Plataforma** (nombre/paleta/tipografía — pendiente, sesión `frontend-design`).
- Cuentas/login de compradores, biblioteca personal, re-descarga con sesión (ADR-0004).
- UI de entrega/descarga del PDF y de reenvío para el comprador (F03/F04 ya cubren la entrega por correo;
  el storefront no muestra enlaces de PDF, I7).
- Dark mode toggle, dominios custom por tenant, self-service de alta (F08), panel del Operador.
- Cerrar decisiones abiertas #4/#5 (dominio/hosting con wildcard) — el retorno se deriva del slug sin
  fijar el dominio de producción.

## Especialistas a consultar

- `schema-guardian` — columnas aditivas `heroTitulo/heroSubtitulo/avisoTexto` en `Tenant` (nullable,
  `onDelete` n/a, sin índice — no son queriables; F02).
- `backend-reviewer` — resolución de branding server-side, `getProductoStorefront` /
  `getSorteoActivoStorefront` (scoping y no-fuga de participantes), construcción de la URL de retorno por
  slug, layering.
- `frontend-reviewer` — componentes del storefront, theme override per-tenant, mobile-first,
  estados loading/error/vacío, consumo de montos (`~/lib/formato`).
- `feature-tester` — Vitest (branding/override/producto/sorteo) + E2E de navegador del flujo completo
  (catálogo → carrito → checkout → Flow sandbox → retorno) en 2 subdominios, más apex y host neutral.
- `change-set-reviewer` — diff completo de la fase antes de commit.

## Supuestos (resueltos por criterio, revisables)

- **S1**: Dev en puerto **3001** (`<slug>.localhost:3001`, por el scope del pedido) — los comentarios de
  las dev pages de F01 dicen 3000; si el dev server corre en otro puerto, la URL de retorno lo toma de la
  config de plataforma, no hardcodeado.
- **S2**: Campos de plantilla = `heroTitulo`, `heroSubtitulo`, `avisoTexto` (3 columnas nullable). Si el
  piloto (F07) pide más secciones (galería, testimonios, FAQ), son columnas aditivas nuevas en su momento
  — no se sobre-modela ahora.
- **S3**: `colorPrimario` se guarda como hex (`#RRGGBB`) y se expande a la escala Mantine con un
  generador de tonos (p. ej. `@mantine/colors-generator`); si el implementer prefiere un helper propio
  lighten/darken sin dependencia, es equivalente mientras sea puro y determinista.
- **S4**: El carrito se persiste en `localStorage` con clave namespaced por slug (`carrito:<slug>`) +
  estado React (context/provider); TTL/limpieza no es MVP.
- **S5**: La URL de retorno de Flow se deriva `https://<slug>.<dominio-plataforma>/checkout/retorno`
  desde `ctx.tenant.slug` + `configPlataforma`; el `urlConfirmation` del webhook queda global e intacto.
- **S6**: El storefront resuelve el branding por página vía `getServerSideProps` (SSR); las queries de
  datos (catálogo/producto/sorteo) van por tRPC con el contexto ya scopeado — no se prefetch en SSP para
  no acoplar el render a un pipeline de SSG/prefetch.
- **S7**: Las maquetas mock (`src/components/landing/*`, `index.tsx` con variantes) son throwaway
  (pre-F06) y se retiran; sus deps de carrusel (`embla-carousel-*`) se evalúan para baja en el mismo PR.
- **S8**: El disclaimer del sorteo es un texto fijo de plataforma (español neutro) embebido en el
  componente; su redacción legal fina se ajusta al validar ToS/bases con abogado (F10, ADR-0008), sin
  bloquear F06.

## Bitácora

- [2026-07-17 00:00] [planner-grill] Plan de F06 escrito SIN grill (instrucción explícita del usuario:
  resolver por criterio, marcar Supuestos, cero preguntas AWAITING salvo imposibilidad estructural).
  Contexto reconstruido leyendo: roadmap SaaS (F06 coarse), CONTEXT.md, ADR-0002/0004/0007/0008/0011,
  docs/design.md, frontend-conventions.md, `schema.prisma` (branding del `Tenant`), `src/server/tenancy/*`,
  `checkout/{iniciarCheckout,listarProductos,schemas}`, `panel/{get,guardar}ConfiguracionTienda`,
  `panel/getSorteoDelPanel`, `pago/flowDeTenant`, `services/flow`, `api/trpc`, `api/root`, `_app.tsx`,
  `styles/theme.ts`, y las dev pages `dev/checkout*`. 6 features (F01 theming+shell, F02 campos de
  plantilla, F03 catálogo+detalle, F04 carrito+checkout+retorno, F05 sorteo+disclaimer, F06
  apex+limpieza). Decisiones por criterio: D4 agrega 3 columnas aditivas (`heroTitulo/heroSubtitulo/
  avisoTexto`) y toca la superficie ya testeada de F05 (get/guardarConfiguracionTienda + `configuracion.tsx`
  + sus tests) — se extienden, no se rompen; D6 deriva la URL de retorno del slug (no reabre decisión
  #4). Ninguna pregunta resultó estructuralmente imposible de asumir. **AWAITING USER APPROVAL** — la
  implementación no arranca sin visto bueno explícito.
- [2026-07-17 02:00] [feature-implementer] Arranca implementación (visto bueno del usuario — contrato
  nocturno delegado). Features pendientes: F01, F02, F03, F04, F05, F06. Read pass completo hecho:
  CLAUDE.md, task file completo, ADR-0001/0002/0004/0006/0007/0008/0011, docs/design.md,
  frontend/backend/prisma-conventions, y el código de `src/server/tenancy/*`, `checkout/*`, `panel/*`,
  `pago/flowDeTenant`, `services/flow`, `_app`/`theme`/`_document`, `index.tsx`, `dev/checkout*`,
  `configuracion.tsx`, `middleware`, `env.js`. **Decisión de orden**: la columna aditiva del `Tenant`
  (F02 schema) es prerequisito RUNTIME de F01 (el repo de branding selecciona heroTitulo/heroSubtitulo/
  avisoTexto), así que schema-guardian + `db push` van PRIMERO, antes de F01. Reviewers a puerta CERRADA
  (nota 6 del usuario): schema-guardian antes del schema; backend+frontend+change-set al final.
- [2026-07-17 02:30] [feature-implementer] Prerequisito schema: schema-guardian APPROVE de 3 columnas
  aditivas nullable en `Tenant` (`heroTitulo/heroSubtitulo/avisoTexto`), con nota inline que separa
  `avisoTexto` (banner opcional) del Disclaimer del sorteo (ADR-0008, obligatorio). Aplicado con
  `npm run db:push` (aditivo, DB en sync, sin `--accept-data-loss`). `prisma generate` chocó con EPERM
  por el `next dev` de :3001 que tenía la DLL del query engine tomada → detuve ESE dev server (PID 37480;
  el :3000 es OTRO proyecto del usuario, intacto), regeneré el client limpio (v5.22.0). Un solo dev
  server: el de :3001 se relanza recién en la verificación visual del cierre.
- [2026-07-17 03:15] [feature-implementer] F01 implementada (TDD red→green en los cores puros). Archivos
  NUEVOS: `src/styles/tenantTheme.ts` (TenantBranding + `generarEscalaColor` hex→tupla 10 tonos con base
  en índice 6 = primaryShade.light, helper PURO sin dependencia — S3, no instalé @mantine/colors-generator
  para no meter dep + `overrideDesdeBranding`), `src/server/storefront/resolverBranding.ts` (núcleo puro,
  espeja `resolverTenantDesdeHost` pero devuelve marca; variante `sin-storefront` sin motivo, I2),
  `repoBranding.ts` (borde Prisma, select de marca sin FlowCredential), `getStorefrontProps.ts` (helpers
  SSR `getPropsHome`/`getPropsPaginaComprador`), `src/components/storefront/storefront-layout.tsx` (shell
  mobile-first: header marca + footer nota neutral; slot `right` para el carrito de F04). MODIFICADOS:
  `_app.tsx` (tenant-aware: `mergeThemeOverrides(theme, override)` cuando llega `pageProps.tenantBranding`),
  `index.tsx` (despacho por zona D1: storefront home con hero heroTitulo??nombre / apex placeholder neutral
  D9; ya NO importa las maquetas landing — quedan huérfanas hasta F06). Vitest cores: theming 7/7 +
  branding 4/4 verdes (filtrados). tsc limpio. Auto-chequeo design.md: sin hex inline (color vía token del
  theme + CSS vars `--mantine-color-*`), montos N/A en F01, motion default Mantine. Reviewers a puerta
  cerrada (nota 6). NOTA REVISABLE: identidad de marca de plataforma PENDIENTE ⇒ apex neutral sin nombre.
- [2026-07-17 03:40] [feature-implementer] F02 implementada (TDD: extendí primero el test, luego el código
  — D4 "se extienden, no se rompen"). MODIFICADOS: `domain/panel/schemas.ts` (guardarConfiguracionTiendaInput
  +heroTitulo/heroSubtitulo/avisoTexto, opcionales, vacío⇒null, max 200/500/500), `guardarConfiguracionTienda.ts`
  (update +3 campos vía `textoOpcionalANull`), `getConfiguracionTienda.ts` (select+return +3 campos),
  `admin/configuracion.tsx` (sección "Portada del storefront": TextInput hero título/subtítulo + Textarea
  aviso, con `description` que explica el fallback; hidratación + submit ya cubren los 3 por spread).
  `configuracionTienda.test.ts` extendido (guardar.001/002/003 + get.001 cubren los 3 campos: persistencia,
  vacío⇒null, FORBIDDEN sin membresía). El WIRE al render del hero/aviso del storefront YA quedó hecho en
  F01 (`index.tsx` lee branding.heroTitulo??nombre / heroSubtitulo??descripcion / avisoTexto banner). Vitest
  config 5/5 verde. tsc limpio. Auto-chequeo design.md: inputs Mantine, sin hex inline, español neutro.
- [2026-07-17 04:20] [feature-implementer] F03 implementada (TDD backend red→green). Backend NUEVO:
  `domain/checkout/getProductoStorefront.ts` (tenant-scoped por contexto; otra Tienda/inactivo/inexistente
  ⇒ NOT_FOUND neutral; precio→number display-only I4) + input en `checkout/schemas.ts` + query
  `checkout.getProductoStorefront` en `routers/checkout.ts`. `listarProductos` se REUSA SIN modificar
  (plan). Frontend NUEVO: `components/storefront/catalogo.tsx` (grid mobile-first cols base1/sm2/md3,
  3 estados loading/error/vacío, `clp`+tabular-nums, tarjeta con "Agregar"/"Quitar") + `pages/producto/[id].tsx`
  (detalle buyer-only; fuera de storefront ⇒ notFound; portada opcional, NOT_FOUND ⇒ estado neutral).
  `index.tsx` monta `<CatalogoStorefront/>` bajo el hero. **Traje adelantado el carrito de F04** (dependencia:
  las tarjetas/detalle "agregan al carrito"): `components/storefront/carrito.tsx` (CarritoProvider+useCarrito,
  localStorage `carrito:<slug>` D5/S4, hidratación post-mount sin mismatch, dedup por id) + `carrito-ui.tsx`
  (BotonCarrito con Indicator + CarritoDrawer, precios por ítem + conteo, SIN total en cliente I4) +
  `storefront-layout.tsx` refactor (envuelve en CarritoProvider, monta botón+drawer). Vitest producto 4/4
  verde. tsc limpio. **Nota I4 (REVISABLE)**: el carrito muestra precios POR ÍTEM + cantidad, NO un
  subtotal sumado en cliente (I4 prohíbe aritmética de dinero en el cliente); el total lo calcula el server
  en iniciarCheckout y lo muestra Flow. Si el usuario prefiere ver subtotal, es enmienda de I4.
- [2026-07-17 05:00] [feature-implementer] F04 implementada (TDD: urlRetorno red→green). Backend NUEVO:
  `server/pago/urlRetorno.ts` (`origenDeRequest` proto+host, http para *.localhost / https resto / respeta
  x-forwarded-proto; `construirUrlRetorno` origen⇒`<origen>/checkout/retorno`, sin origen⇒fallback env).
  MODIFICADOS: `api/trpc.ts` (contexto expone `origin` derivado del host del request — SOLO para la URL de
  retorno, jamás scopea queries), `pago/flowDeTenant.ts` (`crearFlowServiceDeTenant` acepta `urlReturn` que
  GANA a la env; `urlConfirmation` del webhook SIGUE global e intacto, D6/ADR-0006), `routers/checkout.ts`
  (iniciarCheckout pasa `construirUrlRetorno(ctx.origin, env.FLOW_URL_RETURN)`). Frontend NUEVO:
  `pages/checkout/index.tsx` (resumen del carrito + correo con @mantine/form + confirmación visible antes de
  pagar mitigación ADR-0004 → iniciarCheckout → vaciar carrito → redirect a Flow; sin total en cliente I4) +
  `pages/checkout/retorno.tsx` (página con marca del tenant; SOLO informa "confirmando tu pago, te llega el
  correo" — I6/ADR-0001, no linkea PDF I7). ELIMINADOS: `pages/dev/checkout.tsx` + `pages/dev/checkout/retorno.tsx`
  (+ dir). `.env.example`: FLOW_URL_RETURN ahora documentado como fallback (el retorno se deriva del subdominio).
  `/dev/descargas` intacto (herramienta de operador, fuera de scope). Vitest urlRetorno 7/7 verde; regresión
  iniciarCheckout intacta. tsc limpio. Auto-chequeo design.md: Mantine + `clp`/tabular-nums, español neutro,
  sin hex inline, motion default.
- [2026-07-17 05:30] [feature-implementer] F05 implementada (TDD backend red→green). Backend NUEVO:
  `domain/checkout/getSorteoActivoStorefront.ts` (público, tenant-scoped por contexto; SOLO datos públicos:
  nombre/premio/fechas + `_count.entries` como conteo + `tenant.basesSorteo` texto; NUNCA correos/entries,
  privacidad ADR-0004; sin ACTIVO⇒null) + query `checkout.getSorteoActivoStorefront` en el router. Frontend
  NUEVO: `components/storefront/sorteo.tsx` (sección "Sorteo activo" con premio/fechas/conteo/bases + DISCLAIMER
  OBLIGATORIO fijo de plataforma I8/D7/ADR-0008; solo aparece con sorteo ACTIVO; si falla/no hay ⇒ no renderiza,
  sección opcional de la home). `index.tsx` monta `<SorteoStorefront/>` entre hero y catálogo. Helper NUEVO
  `~/lib/formato::fecha` (date-only es-CL para el rango del sorteo) — genera DRIFT en frontend-conventions
  (documenta clp/num/fechaHora; ahora +fecha), a proponer en Step 4.5. Vitest sorteo 3/3 verde. tsc limpio.
  Auto-chequeo design.md: Alert Mantine color gray (NO rojo — el disclaimer no es error), sin hex inline.
- [2026-07-17 05:50] [feature-implementer] F06 implementada. El apex placeholder neutral (D9/I9) YA quedó
  en F01 (`index.tsx` PlaceholderPlataforma: sin nombre/paleta/logo inventados, link discreto a /login).
  Limpieza: ELIMINADO `src/components/landing/` completo (variant-concert/dreamy/editorial, book-carousel,
  mock.ts, use-countdown.ts — maquetas throwaway pre-F06; `index.tsx` ya no las importaba desde F01) +
  `pages/dev/checkout*` (ya en F04). embla-carousel-react/auto-scroll REMOVIDOS de package.json
  (`npm uninstall`, 4 paquetes; único importador era book-carousel — S7). `recharts` CONSERVADO (ADR-0011,
  futuro @mantine/charts). `/dev/descargas` intacto (operador, fuera de scope). GATES verdes: tsc EXIT 0,
  next lint "No warnings or errors" (corregí GetServerSideProps tipados con PropsHome/PropsStorefront para
  matar el `any` inferido, + mapeo explícito del branding para no filtrar `estado` sin unused-var), **vitest
  run COMPLETO 215 passed + 1 skip / 43 files, 0 fallos** (baseline 190 + 25 nuevos del storefront; cero
  regresión en trpc/flowDeTenant/checkout).
- [2026-07-17 06:10] [feature-implementer] Reviewers de cierre (nota 6 del usuario). **backend-reviewer
  APPROVE** (0 blockers): I1/I2 scoping OK, no fuga cross-tenant, getSorteoActivoStorefront sin correos
  (solo `_count`), `urlConfirmation` del webhook GLOBAL intacto (no pasa por crearFlowServiceDeTenant),
  `ctx.origin` no scopea queries; nit: Host header como origen (aceptado, misma superficie que la
  resolución de tenant ya existente, ADR-0007). **frontend-reviewer APPROVE** (0 blockers): cero hex
  inline / clases de color Tailwind, I4 sin suma en cliente, disclaimer gray (no rojo), apex sin marca
  inventada, 3 estados en catálogo. Levanté 3 nits baratos: (1) `catalogo.tsx` tipo de producto ahora
  `RouterOutputs["checkout"]["listarProductos"][number]` (patrón de admin/productos), (2) gutter del
  storefront `px={{base:"md",lg:"xl"}}` alineado a design.md §4, (3) `producto/[id].tsx` distingue
  NOT_FOUND (neutral) de error de red (Reintentar). Nits 5-6 (drift docs) → propuesta en el resumen final.
  change-set-reviewer NO invocado: no está en la lista de cierre del usuario (schema-guardian+backend+frontend)
  y el gate ya está verde por mano propia. tsc+lint verdes tras los fixes.
- [2026-07-17 06:20] [feature-implementer] Verificación visual (nota 7). Detuve el dev server viejo de :3001
  (stale, PID 37480) al inicio; levanté UNO nuevo (`next dev -p 3001`, con el código F06 + prisma client
  regenerado). Puse branding demo en los tenants seed (`prisma db execute`: autora `#e11d48`+hero+aviso,
  prueba `#0d9488`+hero — REVISABLE, se limpia desde el panel) para que el theming sea VISIBLE (el seed los
  crea con colorPrimario=null ⇒ theme base). Resultados (curl con Host header, SSR + tRPC):
  `autora.localhost:3001` 200 con hero/aviso/nombre propios + color `#e11d48` inyectado en el SSR;
  `prueba.localhost:3001` 200 con SU hero + `#0d9488`, SIN el contenido de autora (aislamiento); apex
  `localhost:3001` 200 placeholder neutral; `nope.localhost:3001` 404 neutral; `/dev/checkout(/retorno)` 404.
  tRPC tenant-scoped: catálogo de autora solo su producto ($3000), prueba solo el suyo ($5000);
  getSorteoActivoStorefront de autora ⇒ sorteo ACTIVO con `totalParticipantes:2` y CERO correos (privacidad);
  apex ⇒ NOT_FOUND. Dev server queda CORRIENDO en :3001 (instancia única) para que el usuario lo vea.
- [2026-07-17 06:22] [feature-implementer] Implementación completa. F01..F06 escritas, tsc+lint verdes,
  vitest completo 215/216 (+1 skip), backend+frontend-reviewer APPROVE, verificación visual OK. Status ⇒
  `testing`. Sin commit/push/feature-tester (instrucción del usuario).
