# E2E — Storefront con plantilla (F06 del roadmap)

Checks de navegador para el storefront del Comprador (`tasks/26-07-17-storefront-plantilla.md`).
Los ejecuta el `feature-tester` con la skill `browser-verify`. Cada check tiene un ID que el plan
referencia desde sus Validaciones. Marcado `[x]` solo por el feature-tester.

> **Dev server**: un `next dev` en **:3001** (NO :3000 — ahí corre OTRO proyecto del usuario). Un solo
> dev server (memoria del proyecto). Tenants seed: `npm run seed:tenants` (crea `autora` y `prueba`
> PUBLICADAS). Sorteo seed: `npm run seed:raffles` (Raffle ACTIVO por tenant). Hosts:
> `autora.localhost:3001`, `prueba.localhost:3001`, apex `localhost:3001`.
>
> **Bloqueo conocido — checkout real contra Flow**: el redirect a Flow sandbox y el retorno requieren
> credenciales Flow reales por tenant en `.env` (`FLOW_<TENANT>_API_KEY/SECRET_KEY`) + un túnel para el
> webhook. Sin ellas, el flujo llega hasta el POST a Flow. El resto del storefront es verificable sin Flow.

## Verificables sin Flow

- [ ] **storefront.theming.001** — En `autora.localhost:3001` y `prueba.localhost:3001` el storefront
  renderiza con el logo/nombre y el color primario de ESA Tienda (header con la marca, botones/acentos en
  el color del tenant); el chrome es coherente mobile-first en viewport angosto (~375px). Los dos tenants
  se ven DISTINTOS (marca + color). (Plan F01 E2E)

- [ ] **storefront.zonas.001** — `localhost:3001` (apex) muestra el placeholder neutral de plataforma
  (sin marca inventada, con el link a `/login`); un subdominio inexistente/no publicado
  (`nope.localhost:3001`) da respuesta neutral (404), NO un storefront ni el theme de otro tenant.
  (Plan F01 + F06 E2E)

- [ ] **storefront.plantilla.001** — El Organizador edita hero (título/subtítulo) y aviso en
  `/admin/configuracion` (con sesión); el storefront de su subdominio refleja el hero y muestra el banner
  de aviso; al vaciar `avisoTexto` el banner desaparece. (Plan F02 E2E — requiere sesión/OAuth)

- [ ] **storefront.catalogo.001** — En el subdominio, la home lista los productos activos del tenant en
  grid; abrir un producto (`/producto/<id>`) muestra su detalle con precio formateado (CLP); un
  `/producto/<id>` de OTRO tenant da respuesta neutral (404). (Plan F03 E2E)

- [ ] **storefront.carrito.001** — El carrito NO cruza tiendas: productos agregados en
  `autora.localhost:3001` no aparecen en `prueba.localhost:3001` (origins distintos + clave
  `carrito:<slug>`). El contador del header y el drawer reflejan lo agregado. (Plan F04 E2E)

- [ ] **storefront.sorteo.001** — En un subdominio con sorteo ACTIVO (`seed:raffles`), la home muestra la
  sección del sorteo (premio/fechas/conteo) y el **disclaimer del sorteo es visible** (ADR-0008); sin
  sorteo activo, no aparece ni sección ni disclaimer. Nunca se muestran correos de participantes. (Plan F05 E2E)

- [ ] **storefront.apex.001** — El apex muestra el placeholder neutral; las rutas `/dev/checkout` y
  `/dev/checkout/retorno` ya no existen (404). (Plan F06 E2E)

- [x] **storefront.pagebuilder.render.001** ✅ 2026-07-18 (feature-tester browser-verify) — Tras el switch a `publishedJson` (page builder, F05):
  `autora.localhost:3001` y `prueba.localhost:3001` renderizan las 4 secciones (hero → catálogo →
  vitrina sorteo → cómo funciona) VISUALMENTE EQUIVALENTES al storefront pre-pivote, cada una con la
  marca/color de SU tenant (aislamiento intacto, los dos se ven distintos). El backfill produjo el
  published 1:1 con las columnas. (Plan F05 E2E — page-builder) — *implementer smoke-verificó SSR: HTTP
  200 + hero title del seed ("Historias que enamoran" / "Tienda de Prueba") + "Catálogo" + "Cómo
  funciona"; falta la comparación visual pixel con browser-verify.*

- [x] **storefront.pagebuilder.preview.001** ✅ 2026-07-18 (feature-tester browser-verify) — `autora.localhost:3001/?preview=<STOREFRONT_PREVIEW_TOKEN>`
  abre el Borrador con un banner "Vista previa del borrador" y `robots noindex`; `?preview=<incorrecto>`
  ⇒ 404 neutral; sin `?preview` ⇒ published sin banner. (Plan F05 E2E — page-builder) — *implementer
  smoke-verificó vía curl: token válido→200+banner+noindex, token malo→404, sin token→200 sin banner.*

- [x] **pagebuilder.embeds.001** ✅ 2026-07-18 (feature-tester browser-verify) — (F11) Con el MCP agregar a autora un `video` (youtube) y un
  `embed_social` (tiktok/instagram) + un `testimonios`/`ganadores`/`faq`, publicar: el subdominio
  muestra el FACADE (póster + play) del video/embed; al hacer CLICK carga el iframe con el sandbox
  EXACTO de ADR-0018 (sin `allow-forms`/`allow-top-navigation`) y SIN violaciones CSP en consola. Los
  widgets de texto (testimonios/ganadores/faq) renderizan texto plano. (Plan F11 E2E — page-builder) —
  *implementer verificó vía preview del draft: video (facade lazy) + faq + testimonios renderizan en
  autora; falta el click-carga-iframe + barrido de consola CSP con browser-verify.*

- [x] **pagebuilder.widgets-pro.001** ✅ 2026-07-18 (feature-tester browser-verify) — (F10) Con el MCP, agregar a autora un `contador_tickets` +
  `urgencia_countdown` (`add_section`) y publicar: el subdominio con sorteo activo muestra el conteo de
  tickets (sin correos) y la cuenta regresiva al cierre; al vencer el sorteo el countdown desaparece.
  Sin sorteo activo, ambos se auto-ocultan. El `whatsapp_flotante` (FAB) y el `aviso_barra` aparecen si
  tienen dato (número/texto) y se ocultan si no. El `avisoTexto` de autora ya se ve como barra de aviso
  (overlay migrado). (Plan F10 E2E — page-builder) — *implementer verificó: migración de aviso corrida
  en DB real (autora), render muestra el overlay `aviso_barra`; falta el flujo MCP-agregar-widget +
  auto-oculto con browser-verify.*

- [x] **pagebuilder.banner.001** ✅ 2026-07-18 (feature-tester browser-verify, parcial — ver task F09) — (dev lvh.me) Tras `GET lvh.me:3001/api/dev/login?slug=autora`,
  abrir `autora.lvh.me:3001`: aparece el banner "Estás viendo tu tienda publicada · Ir a mi panel"
  (chrome oscuro neutro, NO el color del tenant) POST-hidratación. En `prueba.lvh.me:3001` (tienda
  ajena) el banner NO aparece. Un visitante ANÓNIMO (sin cookie) nunca lo ve, y el HTML SSR es idéntico
  con/sin cookie (cacheable). (Plan F09 E2E — page-builder) — *implementer verificó: banner ausente del
  SSR anónimo (count 0), `pagebuilder.puedoEditar` anónimo → `{puedeEditar:false}`; falta el flujo
  dueña-logueada-ve-banner con browser-verify.*
  > ⚠️ **ACTUALIZADO por F09c** (2026-07-19): el banner ya NO tiene un único link "· Ir a mi panel".
  > Ahora la acción PRIMARIA es "**Editar mi página**" → `/editor` (relativo, misma tienda) y "Mi panel"
  > (→ apex `/admin`) es SECUNDARIA. Re-verificar con `configSession` activo (dueña ve ambas CTAs). El
  > `[x]` histórico describe la UI vieja — el feature-tester lo refresca.

- [x] **pagebuilder.login-entry.001** ✅ 2026-07-19 (feature-tester browser-verify Playwright) — (F09b) En `autora.localhost:3001` y `prueba.localhost:3001`, el
  FOOTER muestra POST-HIDRATACIÓN un enlace discreto "Iniciar sesión" (chrome neutro, no el color del
  tenant); su `href` apunta al APEX `/login?callbackUrl=<URL actual de la tienda, encodeada>`. Con sesión
  (dev lvh.me tras `/api/dev/login`) el enlace cambia a "Mi panel" → apex `/admin`. El HTML SSR anónimo NO
  contiene ni "Iniciar sesión" ni "Mi panel" (idéntico con/sin cookie ⇒ cacheable, I5). En lvh.me/prod el
  ciclo completo (click → login apex → volver logueada a la tienda → ver banner F09) funciona; en localhost
  la cookie es host-only (el enlace apunta bien pero la sesión no cruza). (Plan F09b E2E — page-builder) —
  *VERIFICADO en el DOM post-hidratación: ANÓNIMO en `prueba.localhost:3001` ⇒ footer "Iniciar sesión" →
  `http://localhost:3001/login?callbackUrl=http%3A%2F%2Fprueba.localhost%3A3001%2F` (apex + callbackUrl
  encodeado de la tienda actual); LOGUEADO (dev-login) en `autora.localhost:3001` ⇒ footer "Mi panel" →
  `http://localhost:3001/admin` (apex, NO el subdominio). SSR anónimo de ambos tenants: 0 "Iniciar
  sesión"/0 "Mi panel" (curl, I5 cacheable ✓). El banner de dueño "Ir a mi panel" es feature aparte (F09).*
  > ⚠️ **SUPERSEDED por F09c** (2026-07-19): el usuario VETÓ el footer-only. La puerta de sesión ya NO
  > vive en el footer sino en el HEADER (`acceso-sesion.tsx`), ahora con TRES estados. Este ítem describe
  > una UI removida — reemplazado por `pagebuilder.session-header.001` (abajo). El feature-tester decide
  > si lo marca como obsoleto.

- [ ] **pagebuilder.session-header.001** — (F09c, reemplaza a `login-entry.001`) En `autora.localhost:3001`
  con `configSession` (`src/configSession.ts` `enabled: true`), el HEADER del storefront (junto al carrito)
  muestra POST-HIDRATACIÓN la acción de sesión con chrome NEUTRO (no el color del tenant), en 3 estados:
  (a) **anónimo** (con `enabled: false`, sin cookie) ⇒ "Iniciar sesión" → apex `/login?callbackUrl=<URL
  actual de la tienda, encodeada>`; (b) **dueña/Operador de ESTA tienda** ⇒ "Editar mi página" → `/editor`
  (relativo); (c) **logueada NO dueña** ⇒ "Mi panel" → apex `/admin`. En móvil (<sm) es ícono-only con
  `aria-label`. El HTML SSR anónimo NO contiene "Editar mi página"/"Iniciar sesión"/"Mi panel" (idéntico
  con/sin sesión ⇒ cacheable, I5). El banner de dueña muestra "Editar mi página" (primaria) + "Mi panel"
  (secundaria). Con `configSession` activo TODO esto aparece sin login ni cookies. (Plan F09c E2E —
  page-builder) — *implementer verificó por curl (:3001, configSession enabled): `/api/auth/session` en
  `autora.localhost` devuelve la sesión fake (id REAL del User); `/editor` responde 200 sin cookie; con
  `enabled:false` ⇒ session `{}` + `/editor` 404; SSR de la home = 0 ocurrencias de los 3 labels (I5 ✓).
  Falta la verificación VISUAL en el DOM post-hidratación con browser-verify (los 3 estados + ícono-only
  mobile + banner de 2 CTAs).*

- [ ] ⏭️ **pagebuilder.wildcard.001** — PENDIENTE (feature-tester 2026-07-18: requiere `NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me` + reinicio del server; no ejecutado para no alterar la config del usuario) — (dev con `NEXT_PUBLIC_PLATFORM_DOMAIN=lvh.me` + hosts) `GET
  lvh.me:3001/api/dev/login?slug=autora` setea la cookie `next-auth.session-token` con `Domain=.lvh.me`;
  luego `autora.lvh.me:3001` resuelve la sesión (cookie compartida) — se ve el banner "Editar mi tienda"
  (F09). El endpoint `/api/dev/login` responde 404 con `NODE_ENV=production`. El `callbackUrl` a un host
  ajeno tras el login NO redirige fuera de la plataforma. (Plan F08 E2E — page-builder) — *implementer
  verificó en localhost: app bootea con la config de cookie nueva, endpoint crea sesión DB + cookie
  (autora → dueño nikochaima72); el Domain wildcard requiere lvh.me (en localhost es host-only por diseño).*

- [x] **pagebuilder.csp.001** ✅ 2026-07-18 (feature-tester browser-verify) — Navegar el storefront (`autora.localhost:3001`, incluyendo una tienda
  con sorteo activo) y el panel `/admin/*` con la consola abierta: NO hay violaciones CSP reportadas
  (fase Report-Only) — ni por los estilos inline de Mantine ni por el HMR de dev. El header
  `Content-Security-Policy-Report-Only` está presente con `frame-ancestors 'none'` + `object-src 'none'`
  + `frame-src` allowlist. (Plan F07 E2E — page-builder) — *implementer verificó vía curl que el header
  sale en `/` de autora/prueba/apex con las directivas correctas; falta el barrido de consola con
  browser-verify. NOTA: se corrigió un bug — el middleware NO corría en el root `/` (matcher sin `"/"`).*

- [x] **pagebuilder.mcp.001** ✅ 2026-07-18 (feature-tester browser-verify) — Con un cliente MCP real (o `curl` JSON-RPC) contra `/api/mcp/mcp` con
  `Authorization: Bearer <MCP_OPERADOR_TOKEN>`: `get_page {storeSlug:"autora"}` devuelve el outline; una
  mutación (`add_section`/`move_section`/`update_section_props` con el `expectedVersion` de get_page)
  cambia el Borrador (NO el publicado); `publish_page {storeSlug:"autora"}` publica; recién ENTONCES el
  cambio se ve en `autora.localhost:3001`. Sin/mal Bearer ⇒ 401. (Plan F06 E2E — page-builder) —
  *implementer verificó vía curl: 401 sin Bearer, `initialize` OK (serverInfo sorteatelo-pagebuilder),
  `tools/list` devuelve las 10 tools. Falta el round-trip mutar→publicar→ver-en-subdominio con browser-verify.*

## Requiere Flow (credenciales sandbox reales por tenant + túnel del webhook)

- [ ] **storefront.cantidad.001** — En `autora.localhost:3001`, agregar un producto al carrito y subir la
  cantidad con el stepper **+/−** a 3 (el número refleja 3; el `−` se deshabilita en 1; el `+` en 99); el
  drawer y el checkout muestran el stepper y el precio UNITARIO (`c/u`). Ir a pagar con correo ⇒ el monto que
  recibe Flow = precio × 3. La interacción del stepper (carrito/detalle/checkout) es verificable SIN Flow; el
  total en Flow requiere credenciales sandbox. (Plan F02 E2E — sorteo-por-producto, ADR-0012)

- [ ] **storefront.checkout.001** — Agregar productos al carrito en `autora.localhost:3001` → checkout con
  correo → redirect a Flow (sandbox); tras pagar, el retorno con marca dice que el pago se confirma por
  correo (NO es prueba de pago, ADR-0001). La orden queda bajo el tenant correcto; la URL de retorno es
  del subdominio de la Tienda (`autora.localhost:3001/checkout/retorno`), no el apex ni la env global. (Plan F04 E2E)

- [ ] **sorteo.tickets.e2e.001** — Comprar en `autora.localhost:3001` un producto participante con
  cantidad N (pago sandbox + webhook con túnel) ⇒ en `/admin/sorteo` aparecen **N participaciones/tickets**
  para ese correo (agrupados por correo con su conteo de tickets); un replay del webhook deja las N intactas
  (no 2N). Un producto NO participante ×M no suma tickets. (Plan F03 E2E — sorteo-por-producto, ADR-0012)
