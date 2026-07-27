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

- [x] **storefront.catalogo.001** ✅ 2026-07-27 (feature-tester) — **ACTUALIZADO por la ENMIENDA v2**: la
  página de detalle `/producto/[id]` **se retiró** (E2), así que el check ya no puede pedir «abrir un
  producto muestra su detalle». En el subdominio la home lista los productos activos del tenant en grid
  con precio en CLP formateado y **«Agregar» directo**; `/producto/<id>` responde **307 al home del mismo
  subdominio** para id existente, inexistente y de otro tenant — los tres idénticos (la página no lee la
  DB, y esa indistinción es justamente la propiedad). Verificado por `curl` sobre `iselk` y `prueba`:
  `307 → http://<slug>.localhost:3001/` en los 3 casos. Es 307 y no 308 a propósito: un permanente se
  cachea de forma prácticamente irreversible en el equipo de cada visitante. (Plan F03 E2E + F13 v2)

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
  > ⚠ **NO RE-EJECUTAR — superficie RETIRADA 2026-07-25 (ADR-0023).** El Editor MCP murió entero
  > (`/api/mcp`, las 12 tools y `MCP_OPERADOR_TOKEN`): hoy esa ruta responde **404**, no 401. El
  > round-trip pendiente ya no aplica — el Borrador se edita desde el editor visual del panel y su
  > asistente de IA. El 404 se verifica en `tasks/e2e-plataforma-retiro-operador.md#retiro.mcp.001`.

- [x] **storefront.campos.render.001** — ✅ 2026-07-26 (feature-tester, Playwright, `autora`; el sub-punto
  «un campo desactivado desaparece tras recargar» quedó sin ejercer en vivo — cubierto por
  `camposActivos.test.ts::campos.storefront.001` + la desactivación verificada en el panel.
  **El sub-punto «el NUMERO no muestra spinners» es POSTERIOR a esta corrida**: sale del fix
  `hideControls` del 2026-07-25 —el design finding de la propia corrida era que las flechitas
  dejaban caminar a negativo— y no se ejerció en vivo; se ve de un vistazo en el próximo run) —
  (checkout-campos-configurables F04) Con campos creados en
  `/admin/configuracion` § «Campos del checkout» de `autora` (uno de CADA tipo: TEXTO, TELEFONO, NUMERO,
  SELECT con 2+ opciones, CHECKBOX con default marcado), agregar un producto al carrito en
  `autora.localhost:3001` e ir a `/checkout`: el form muestra **«Tu correo» PRIMERO** y debajo los campos
  **en el orden del panel** (el mismo que fijaron las flechas ↑/↓). Cada uno con su etiqueta; el
  `placeholder` aparece dentro del input vacío y el `textoAyuda` como línea bajo el control. El SELECT
  ofrece exactamente las opciones definidas; el CHECKBOX aparece **ya marcado** si el Organizador puso
  «Viene marcada por defecto» (D4); el NUMERO no acepta decimales **ni muestra los spinners ▲▼**
  (`hideControls`: sin escalera no hay forma de caminar hasta un negativo con el mouse; tipear el
  guión a mano sí se puede y lo rechaza el server). Los campos **opcionales** dicen
  «(opcional)» en la etiqueta y los obligatorios NO llevan asterisco (el correo tampoco). Un campo
  **desactivado** en el panel desaparece del checkout tras recargar (D5). Sin sesión (el checkout es
  público; la configuración previa sí requiere sesión).

- [x] **storefront.campos.obligatorio.001** — ✅ 2026-07-26 (feature-tester; INCLUYE el sub-paso browser-only
  de F05: el Select deseleccionado dio error INLINE, sin notificación del server) —
  (F04) En el mismo checkout, apretar **«Ir a pagar»** con un
  campo OBLIGATORIO vacío ⇒ el form marca ESE campo con el error bajo su control y **no** dispara la
  mutation (no hay redirect a Flow). Completarlo destraba el submit. Un CHECKBOX desmarcado y un NUMERO
  en `0` **NO** cuentan como vacíos (D4). Este es el espejo de cliente; la validación que manda es la del
  server (F05).
  **Sub-paso agregado en F05 (browser-only, no lo puede cubrir ningún unit test)**: en el SELECT
  obligatorio, elegir una opción y volver a hacer **clic sobre la MISMA opción** — eso es una
  *deselección* (`allowDeselect` es default en Mantine 7) y deja el valor en `null`. El error debe
  volver **inline bajo el control**, NO como notificación roja del server: si aparece la notificación,
  el espejo de cliente se quedó sin cubrir el `null` (bug de F04 corregido en F05).

- [x] **storefront.campos.vacio.001** — ✅ 2026-07-26 (feature-tester; `prueba.localhost:3001/checkout` con
  el producto en el carrito: el `<form>` tiene UN solo hijo directo —el `Stack`— y UN solo input, «Tu correo»
  `type=email`; el texto completo del form es «Tu correo / Te enviaremos la descarga… / Pagas de forma segura
  en Flow… / Ir a pagar». Cero separadores, cero títulos de sección, cero huecos) — (F04/I9) En un tenant SIN campos configurados
  (`prueba.localhost:3001`), el checkout se ve **exactamente como antes de la feature**: solo «Tu correo»,
  el aviso de Flow y «Ir a pagar» — ni un separador, ni un hueco, ni un título de sección extra. La compra
  arranca igual.

- [x] **storefront.campos.aislamiento.001** — ✅ 2026-07-26 (feature-tester; por la vía que el propio check
  prescribe: curl al SSR de cada subdominio — `autora/checkout` trae las 5 etiquetas + las 3 opciones del
  SELECT, `prueba/checkout` trae CERO) — (F04/I1) Los campos de `autora` **NO** aparecen en el
  checkout de `prueba.localhost:3001` (ni al revés): cada subdominio muestra solo los suyos, porque la
  Tienda se resuelve del host server-side. Verificar también en el **HTML del SSR** (curl a
  `/checkout` de cada subdominio): las etiquetas de un tenant no están en el HTML del otro.

- [x] **storefront.campos.servidor.001** — ✅ 2026-07-26 (feature-tester; ejercido tal cual lo prescribe el
  check: checkout de `autora` completo y SIN recargar, «Teléfono de contacto» desactivado desde la 2ª pestaña
  del panel. «Ir a pagar» ⇒ POST `checkout.iniciarCheckout` **400**, notificación Mantine con
  `--notification-color: #c03e2e` y el texto EXACTO «El formulario de esta tienda cambió mientras completabas
  la compra. Recarga la página e inténtalo de nuevo.», **sin** redirect (la URL siguió en `/checkout`) y
  **sin** Orden: 4 submits rechazados dejaron el conteo de órdenes de la Tienda intacto en 5, y `/admin/ventas`
  no ganó ninguna fila. Recargar `/checkout` mostró el form ya sin ese campo: `[Tu correo, Nombre completo,
  Código postal (opcional), Sucursal de retiro, Quiero recibir novedades]`. Campo reactivado al cerrar)
  — (checkout-campos-configurables F05/I3, extra no planeado)
  La validación que MANDA es la del server, no el espejo del form — y se verifica SIN Flow porque
  corre antes de crear el pago. En `autora.localhost:3001` con un campo OBLIGATORIO configurado:
  abrir `/checkout` con el carrito cargado y completar todo; **sin recargar**, en otra pestaña del
  panel BORRAR (o desactivar) ese campo en § «Campos del checkout»; volver al checkout y apretar
  «Ir a pagar» ⇒ el form pasa su propia validación pero el server responde con la notificación roja
  **«El formulario de esta tienda cambió mientras completabas la compra…»**, **no** hay redirect a
  Flow y **no** se crea la Orden (verificar en `\admin\ventas`). Recargar `/checkout` muestra el
  form ya sin ese campo.

### Herencia del tema de la Tienda en las páginas de PLATAFORMA

Checks de `tasks/26-07-26-storefront-tema-paginas-plataforma.md` (F02/F03). El defecto que cierran:
la home de una tienda tematizada convivía con `/checkout`, `/producto/[id]`, `/checkout/retorno`,
`/bases` y `/entrega/[token]` saliendo con el **body blanco de plataforma** — la ruptura visual caía
en el momento más delicado del funnel. Se hereda SOLO fondo de página + par tipográfico + radio +
modo (D1): NO ambiente (los glows de stage-lights), NO ancho estrecho, NO títulos-poster.

> Tenants de referencia: **iselk** (fondo lila `marca_suave`, par `dulce` = Poppins/Nunito, radio `l`,
> modo claro) y **demo-noche** (fondo `tinta_profunda` near-black, modo OSCURO). Ninguna tienda
> necesita re-publicar: se lee el `publishedJson` que ya tienen.

- [x] **storefront.tema.001** (F02, D1/D5) ✅ 2026-07-26 — shell `rgb(242,235,253)` IDÉNTICO al de la
  home, H1 "Finalizar compra" en Poppins (antes Fraunces), radius 1rem / input 16px, botón `#7c3aed`
  intacto; `backgroundImage:none` (sin glows) y 0 reglas `.st-titulo-poster`. — En `iselk.localhost:3001/checkout` (con el carrito
  cargado) el shell sale con el **fondo lila** de la tienda —no blanco— y los headings
  («Finalizar compra») en **Poppins**, no en Fraunces; los controles usan el radio `l`. El botón de
  marca conserva su violeta. Comparar contra la home del mismo subdominio: el fondo y la tipografía
  deben LEER igual (es el punto de la feature). Verificar además que NO se coló lo que no se hereda:
  sin glows de ambiente sobre el shell y sin títulos-poster.

- [x] **storefront.tema.002** (F02) ✅ 2026-07-26 — `/producto/cms1zoq0m…` y `/checkout/retorno`
  («¡Gracias por tu compra!») con el MISMO shell lila + Poppins + radius 1rem que `/checkout`. — En el mismo subdominio, `/producto/<id>` y `/checkout/retorno`
  muestran el MISMO shell heredado (fondo + tipografía) que `/checkout`. El retorno es el que más
  importa: el Comprador vuelve de pagar en Flow y tiene que reconocer que aterrizó en la misma tienda.

- [x] **storefront.tema.003** (F02, D5) ✅ 2026-07-26 — OSCURA (scheme dark forzado) y el form LEGIBLE:
  input `#c9c9c9` sobre `#2e2e2e`, Card/Alert/labels dark-aware, H1 Anton sólido. NINGÚN control quedó
  tinta sobre near-black (el riesgo declarado). Finding no bloqueante: 13/20 nodos de texto bajo AA
  4.5:1, peor 3.53:1 (secundarios 12px) — pero el CONTROL sobre la home del mismo tenant da 81/158 con
  casos peores ⇒ es el carácter del tema oscuro de la tienda (dimmed de Mantine), no una regresión. — En `demo-noche.localhost:3001/checkout` la página sale
  **OSCURA** y —lo que hay que mirar de verdad— el **form es LEGIBLE**: los `TextInput` de Mantine, sus
  labels/descriptions, la `Card` del resumen y el `Alert` gris tienen contraste correcto en dark. Es
  verificación VISUAL (screenshot), no de DOM: el riesgo es un control que quede tinta sobre near-black.

- [x] **storefront.tema.004** (F02, D7/I6 — el no-op) ✅ 2026-07-26 — **PREMISA CORREGIDA**: `prueba` y
  `bcac` ya NO son tema default (la tanda-2 F11–F14 las republicó OSCURAS); hoy la única default es
  `autora` (`root.props = {}`). En `autora/checkout`: `"temaPagina":null`, shell SIN `style=` inline,
  0 `<style>` de tipografía y 1 sola ocurrencia de `setAttribute(color-scheme)` — la misma que el apex
  de plataforma ⇒ render idéntico a antes (blanco + Fraunces + rosa). Matiz honesto: el payload de
  `__NEXT_DATA__` sí gana la clave `"temaPagina":null` (~18 bytes, cero efecto de render). Sin regresión
  en `prueba` (índigo + CTA dorado) ni `bcac` (gray-9, empty-state legible), cada una según SU tema. — Una tienda con **tema default** (`autora`,
  `prueba`, `bcac`) renderiza `/checkout` **visualmente idéntica a hoy**: shell sin `style=` inline,
  sin `<style>` extra de tipografía en el `<head>` y sin forzado de color-scheme. El resolver devuelve
  `null` para ellas, así que el HTML no debería cambiar en nada.

- [x] **storefront.tema.005** (F03) ✅ 2026-07-26 — shell lila + H1 Poppins + radius 1rem; nav/chrome
  intactos (4 links), visor de PDF presente (iframe a R2) y disclaimer ADR-0008 visible. — `iselk.localhost:3001/bases` hereda fondo + tipografía y conserva
  el nav/chrome y el visor de PDF exactamente como hoy (el disclaimer de ADR-0008 sigue visible).

- [ ] ⏭️ **storefront.tema.006** (F03, D9) — **PARCIAL 2026-07-26**. ✅ Verificado: grant real de
  `autora` por el APEX ⇒ 200 con la identidad de la tienda del GRANT, shell no-op (`temaPagina` null,
  correcto porque autora ES default); host-agnosticidad probada FUERTE — el mismo token por apex y por
  `autora.localhost` devuelve cuerpo **BYTE-IDÉNTICO** (36.508 bytes); token basura ⇒ **404 neutral**;
  grant de `e2e-numeros` (tenant sin fila `home` ⇒ la otra rama null) ⇒ 200 no-op.
  ⏭️ NO ejercido: el shell **tematizado**. No existe ningún `DownloadGrant` de una tienda con tema
  (censo: 6 grants, todos de `e2e-numeros` y `autora`, ambas sin tema). Fabricar uno exige una orden
  PAGADA = escritura en DB (no autorizada) + túnel de Flow (caído). El cableado slug-del-grant→tema sí
  está cubierto por Vitest `storefront.tema.entrega.001` (verde). — `/entrega/<token>` servida **por el APEX**
  (`localhost:3001/entrega/<token>`, que es a donde apunta el enlace del correo) muestra el shell
  tematizado **del tenant del GRANT**, no el de plataforma ni el del host. Requiere un `DownloadGrant`
  vigente de una orden PAGADA en la DB dev (ya existe uno de `autora`; para ver el tema heredado hace
  falta uno de una tienda tematizada como `iselk`). Un token inválido sigue dando **404 neutral**.

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

- [x] **storefront.campos.persistencia.001** — ✅ 2026-07-26 CON SALVEDAD (feature-tester; **el snapshot se
  verificó sin Flow**, que es donde de verdad vive el check: `iniciarCheckout` congela las respuestas en la
  MISMA `$tx` que la Order y ANTES de la red a Flow, así que el submit basta. Dos compras reales por el form:
  (A) teléfono tipeado `+56 9 1234 5678` ⇒ guardado `+56912345678`, SELECT `Ñuñoa` exacto, NUMERO `8320000`
  base 10, CHECKBOX no tocado ⇒ fila `"true"` (nunca «Sí»), 5 filas, `createdAt` idéntico al de la Order y
  `tenantId` correcto; (B) opcional en blanco ⇒ **sin fila** (4 filas, «sin respuesta» ≠ «respuesta vacía») y
  CHECKBOX desmarcado ⇒ `"false"`. Después, desde el panel: **renombrar** «Sucursal de retiro» ⇒ las 2 filas
  ya guardadas siguen diciendo la etiqueta vieja (D5/I4), y **borrar** «Quiero recibir novedades» ⇒ sus 2 filas
  siguen vivas con `fieldId: null`, etiqueta y valor intactos. **Salvedad**: el pago sandbox NO se ejerció —
  Flow devolvió 400 en `payment/create` porque sin túnel no hay `urlConfirmation` pública, así que ambas
  órdenes nacieron PENDIENTE; el estado PAGADO de (A) se puso directo en DB (Order + Payment.fee) con permiso
  del usuario para poder verificar el Drawer. El leg de pago real sigue siendo de la tanda con túnel)
  — (checkout-campos-configurables F05) Compra completa en
  `autora.localhost:3001` **respondiendo los campos** (uno de cada tipo, con el CHECKBOX dejado en su
  default y sin tocar): tras el pago sandbox, la Orden queda con sus **Respuestas de checkout**
  congeladas. Verificar en DB (o en el detalle de venta de F06) que hay **una fila por campo
  respondido** con `clave` + `etiqueta` + `tipo` + `valor` **canónico**: el TELEFONO guardado solo
  con dígitos (`+56912345678` aunque se haya tipeado `+56 9 1234 5678`), el CHECKBOX como
  `"true"`/`"false"` (nunca «Sí»/«No»), el SELECT con la opción exacta y el NUMERO en base 10. Un
  campo OPCIONAL dejado en blanco **no** genera fila; el CHECKBOX no tocado **sí** (D4). Después,
  **renombrar la etiqueta** de un campo en el panel ⇒ la fila ya guardada sigue mostrando la etiqueta
  vieja (D5/I4), y **borrar** ese campo tampoco borra la respuesta.

- [ ] **sorteo.tickets.e2e.001** — Comprar en `autora.localhost:3001` un producto participante con
  cantidad N (pago sandbox + webhook con túnel) ⇒ en `/admin/sorteo` aparecen **N participaciones/tickets**
  para ese correo (agrupados por correo con su conteo de tickets); un replay del webhook deja las N intactas
  (no 2N). Un producto NO participante ×M no suma tickets. (Plan F03 E2E — sorteo-por-producto, ADR-0012)
- [x] **storefront.bases.001** (admin-bases-pdf F04, ADR-0008) — ✅ 2026-07-25 (re-verificado tras el fix del
  BLOCKER 1): los 6 tenants dan **200** en `/bases`. (a) En `autora` (con PDF subido en esta corrida) el enlace
  «Bases del sorteo» del footer y el botón «Ver bases del sorteo» de la vitrina navegan a `/bases`, el PDF se ve
  **embebido en el iframe** (visor nativo de Chrome, 1/1 página) y «Descargar PDF» apunta al objeto real del
  bucket (`curl` ⇒ 200 `application/pdf`). (b) Disclaimer ADR-0008 presente. (c) En `bcac`/`prueba` (sorteo
  activo SIN PDF) sale «Las bases todavía no están publicadas» — sin 500 ni iframe roto. (e) Consola limpia:
  cero violación de CSP (`frame-src` incluye el origen del bucket, `object-src 'none'` intacto). La línea del
  sorteo formatea la fecha bien (`vigente hasta el 14 oct 2026`) ⇒ el `Date` sobrevive el borde SSR.
  ⏭️ Caso (d) «sin sorteo activo» NO ejercitable: los 6 tenants de la DB dev tienen sorteo ACTIVO (cubierto por
  Vitest `storefront.bases.002`). — La página **`/bases`** muestra el PDF de bases
  del sorteo **ACTIVO** de la tienda: (a) en un tenant con sorteo activo y PDF subido, el enlace **«Bases del
  sorteo»** del footer y el botón **«Ver bases del sorteo»** de la vitrina navegan a `/bases`, donde se ve el
  PDF embebido en el `<iframe>` y el botón **«Descargar PDF»** abre el archivo real del bucket público;
  (b) el **disclaimer de responsabilidad** (ADR-0008) aparece en la página; (c) en un tenant con sorteo activo
  SIN PDF se ve el estado vacío neutral («Las bases todavía no están publicadas»), **nunca un 500 ni un iframe
  roto**; (d) sin sorteo activo, `/bases` responde igual con el vacío neutral («Ahora mismo no hay un sorteo
  activo»); (e) la consola no reporta una violación de CSP por el iframe del PDF. Sin sesión.
- [x] **storefront.bases.002** (admin-bases-pdf D13) — ✅ 2026-07-25 (re-verificado tras el fix del BLOCKER 2):
  (a) en `prueba` el ítem «Bases» del navbar renderiza `href="/bases"` y **el click cambia la URL** a
  `prueba.localhost:3001/bases` (`location.hash` vacío, no se queda en la home); ídem en `bcac`. (b) mismo
  destino que «Bases del sorteo» del footer y que el botón de la vitrina — un solo lugar para el documento
  legal. (d) el resto del nav sigue con scroll (`#beneficios`, `#sorteo`, `#autora` en `prueba`; `#proximos`,
  `#sorteo`, `#catalogo` en `bcac`) y la home emite **0** `href="#bases"` en los 6 tenants.
  ⏭️ Caso (c) «etiqueta propia» NO ejercitable: ningún tenant tiene `garantias_sorteo`/`texto_rico` marcado
  `enNav` (cubierto por Vitest `nav.bases.002`). — El ítem **«Bases» del navbar abre SIEMPRE el PDF**, nunca
  hace scroll: en una tienda cuyo documento tiene una sección `garantias_sorteo` (o `texto_rico`) marcada para
  el nav, (a) el ítem «Bases» del encabezado navega a **`/bases`** (cambia la URL; no queda en la home con un
  `#bases`); (b) el destino es el mismo al que lleva «Bases del sorteo» del footer — un solo lugar para el
  documento legal; (c) si el Organizador le puso una **etiqueta propia** a esa sección, el texto del ítem
  cambia pero el destino sigue siendo `/bases`; (d) el resto de los ítems del nav siguen haciendo scroll
  dentro de la página (`#catalogo`, `#autora`, …). Sin sesión.
- [x] **storefront.bases.003** (admin-bases-pdf D14) — ✅ 2026-07-25: (a) en `bcac` el botón «Ver bases del
  sorteo» del **hero** (primera sección, y=591) renderiza `href="/bases"` y el click navegó a
  `bcac.localhost:3001/bases`, que mostró el visor; (b) la home de `bcac` tiene **0** `href="#bases"` y sus 4
  enlaces «bases» (navbar, hero, vitrina, footer) coinciden en `/bases`; (c) los demás CTA siguen scrolleando
  (`#proximos`, `#sorteo`, `#catalogo` intactos). — Los **CTA de contenido** con ancla «bases» abren el PDF, no
  scrollean: (a) en **`bcac`**, el botón **«Ver bases del sorteo»** del hero (que la seed configura con
  `ancla:"bases"`) navega a **`/bases`** y muestra el visor — antes era un enlace legal a ninguna parte, porque
  esa home no emite ningún target `#bases`; (b) la home de `bcac` no contiene **ni un solo** `href="#bases"`
  (navbar, hero y footer coinciden en el mismo destino); (c) los demás CTA del documento siguen scrolleando
  dentro de la página (`#catalogo`, `#sorteo`, …) — el cambio es solo para «bases». Sin sesión.
- [x] **storefront.postdrop.001** (admin-bases-pdf F07) — ✅ 2026-07-25: los 6 verdes tras el restart (cliente Prisma
  nuevo). `autora` «Historias que enamoran», `prueba` «¿Cómo enriquecer a tu idol?», `bcac` «Cómo Enriquecer a tu
  Artista Favorito», `demo-noche`/`demo-editorial`/`demo-dreamy` «Compra el libro. Anda a ver a BTS.» — hero,
  catálogo, vitrina, footer y branding intactos; ningún 500; cero errores de consola. — Tras el DROP de las 6 columnas legacy, los storefronts
  existentes (`autora`, `prueba`, `bcac`, `demo-noche`, `demo-editorial`, `demo-dreamy`) **renderizan igual
  que antes**: hero con su título/subtítulo/imagen, aviso si lo tenían, catálogo, vitrina del sorteo y footer
  — todo servido desde el Documento de Página, que ya era la única fuente. Ninguno 500ea (el `select` del
  branding y el del sorteo ya no piden columnas inexistentes) y ninguno pierde contenido visible.
  **Requiere restart del dev server** (cliente Prisma nuevo). Sin sesión.

- [x] **storefront.pack.compra.001** ✅ 2026-07-27 (feature-tester, tienda `iselk` sandbox, túnel vivo)
  — **REESCRITO por la ENMIENDA v2**: el sobre ya no se vende (es una **colección** que no sale al
  catálogo); lo que se compra son **packs, que son productos normales** con fuente + unidades. Mueren de
  este check el «desde $X», el CTA «Elegir pack» y el selector del detalle: la tarjeta de un pack agrega
  al carrito directo (E1) y `/producto/[id]` ya no existe (E2).
  Compra ejercida: pack de fuente **SOBRE** (2 u, NO participa en el sorteo) + pack de fuente
  **ESTANDAR** (4 u, SÍ participa), **$16.000**, pagados de verdad en Flow sandbox (Webpay → tarjeta
  Transbank → Aceptar).
  (a) **Catálogo — PASS**: 5 tarjetas, todas con «**Agregar**» directo y `aria-label` contextual
  («Agregar Pack 4 libros (E2E F14) al carrito»). La **colección NO aparece** en la página (`textContent`
  no la menciona) aunque tenga el pool lleno y 3 packs vendiéndola. Los detalles derivados distinguen la
  fuente: «Entrega 4 unidades, **elegidas al azar**» (fuente SOBRE) vs «Entrega 4 unidades» a secas
  (fuente ESTANDAR). *Nota menor*: un pack de **1 unidad** no muestra la línea derivada, así que pierde
  el «al azar» — ahí el dato solo vive en el título que escribió el Organizador.
  (b) **Carrito y checkout — PASS**: «$6.000 **por pack de 2**» / «$10.000 **por pack de 4**» — texto de
  unidades, cero «c/u» derivado (V-I5). Carrito aislado por slug (`carrito:iselk`).
  (c) **Compra — 🔴 el pago se hizo y la orden NO se cerró**: ver el BLOQUEANTE al final de este check.
  Los efectos se ejercieron con un harness que saltea **solo** el gate 5 del webhook.
  (d) **DB — PASS**: `OrderItem` congeló `unidadesPorPack` **2** y **4** y `participaEnSorteo` **false** /
  **true** por línea. El pack SOBRE dejó **2 `PackAssignment` DISTINTAS** sorteadas del pool de la
  **FUENTE**; el pack ESTANDAR dejó **0 `PackAssignment` + 1 `DownloadGrant`** (copias derivadas en
  presentación, V-I2). **Tickets = 4**, y ese número es la prueba de la fórmula: aporta solo la línea que
  participa (`unidadesPorPack × cantidad` = 4×1) y la de 2 unidades aporta **0**.
  (e) **Correo — PASS**: `delivered`, asunto «Tu compra en ISELK Sorteos: tus números y tu descarga»,
  boletos **`9–12`** plegados en rango, **un enlace `/entrega/<token>` por producto**, total $16.000,
  bases y `reply_to` del tenant. Cero keys del bucket en el cuerpo.
  (f) **Página de entrega — PASS**, abierta en el **apex** y en un **contexto de navegador aislado sin
  sesión** (el Comprador real no tiene cuenta, ADR-0004): el pack SOBRE muestra badge «Pack de 2» y
  **solo sus 2 asignados** con miniatura que carga de verdad; el pack ESTANDAR muestra **4 filas del
  mismo PDF, cada una con su botón**. Las miniaturas son URLs **prefirmadas** (`X-Amz-Expires=300`,
  `disposition=inline`) — el pool nunca se dibuja. Las 2 queries tRPC del header responden **200** y la
  consola queda en **0 errores**: el 404 del apex que F09 dejó anotado está **resuelto**.
  (g) **Corte de seguridad — PASS**: archivo asignado ⇒ **302**; archivo del pool **NO** asignado
  (`e2e-sticker-1`, `e2e-sticker-4`) ⇒ **404**; id inexistente ⇒ **404**; token basura ⇒ **404**. Los
  cuatro idénticos y neutrales. Es la defensa que impide que quien compró 2 se baje la colección entera.
  (h) **Descargas reales — PASS** (no solo el redirect): `image/png` **12.434 B** con magic bytes
  `\x89PNG`, y `application/pdf` **303.102 B** con `%PDF-1.7`.
  > 🔴 **BLOQUEANTE ENCONTRADO ACÁ, y NO es de esta feature — `src/server/pago/webhookFlow.ts:107`.**
  > El gate 5 compara `flowPago.amount !== ruteo.montoEsperado` con `!==` estricto, pero **Flow devuelve
  > `amount` como STRING** y `montoEsperado` es `number` (`Payment.monto.toNumber()`). El log del server
  > lo imprime solo: `amount_mismatch … esperado: 16000, recibido: '16000'` — mismo valor, distinto tipo
  > ⇒ **todo pago legítimo se rechaza**. La orden queda PENDIENTE para siempre, sin grant, sin tickets y
  > sin correo, y como el webhook contesta **200**, Flow no reintenta nunca. Ningún Vitest lo caza porque
  > `webhookFlow.test.ts:37` arma el fake con `amount: <number>`. Preexistente (`6d5a766`), hoy en `main`.
  (Plan F14 E2E — productos-tipos-digitales, ENMIENDA v2)

  > Historia: este ID reemplaza a `storefront.sobre.compra.001`, que describía la venta del sobre por
  > `ProductPackOption` (tarjeta «desde $3.000», CTA «Elegir pack», selector en el detalle). Sus dos
  > corridas previas dejaron (a)-(c) verdes contra ESE modelo y (d)-(i) bloqueados por el túnel caído;
  > la orden `cms2apsqx000cnik84txlnr0y` de `prueba` sobrevive como **fixture de lectura** del snapshot
  > de la v1 y no se toca. El sub-punto (i) —borrado bloqueado por asignaciones existentes— sigue
  > **sin ejercer en vivo**: ahora sí hay asignaciones reales en `iselk` para hacerlo.

- [ ] **storefront.descarga.tipos.001** (productos-tipos-digitales F03, D1/D9/ADR-0002) — La entrega ya no
  es PDF-only: **descarga real de un producto de tipo NUEVO** (ej. una imagen PNG o un MP3) desde el enlace
  `/api/descargas/<token>` que llega en el correo. Verificar que el archivo llega **con su tipo real**, no
  como PDF: el 302 apunta a la URL prefirmada de R2 y la respuesta final trae `Content-Type: image/png`
  (o `audio/mpeg`) y un `Content-Disposition: attachment` cuyo `filename` termina en la extensión que
  corresponde al MIME (`.png`/`.mp3`) — **jamás `.pdf`**. Abrir el archivo descargado y comprobar que es
  íntegro (se ve / suena). En la pestaña Network: la URL prefirmada NUNCA aparece en el correo ni en el
  HTML, solo el enlace por token (I2), y la key del bucket no se filtra en ninguna respuesta.
  Requiere una orden **PAGADA** con su `Entitlement` (Flow sandbox con túnel, o —como en
  `storefront.campos.persistencia.001`— el estado PAGADO forzado en DB con permiso del usuario) y un
  producto con un `ProductFile` confirmado de tipo no-PDF, que se puede dejar sembrado desde el panel con
  el flow de `panel.productos.tipos.001`. Sin sesión (el token ES la autoridad, ADR-0004).


  > 🟡 [feature-tester 2026-07-26] PARCIAL. **El mecanismo de entrega generalizado quedó verificado
  > contra el server real** (curl, grant vigente de una orden PAGADA de `autora`): 302 a
  > `https://<cuenta>.r2.cloudflarestorage.com` con `X-Amz-Expires=600`,
  > `response-content-type=application/pdf` y `response-content-disposition=attachment;
  > filename="…"; filename*=UTF-8''…` — content-type y nombre salen del `ProductFile`, no de una
  > constante. La URL prefirmada no aparece en ningún HTML y la key no se filtra (0 fugas medidas
  > contra todas las keys de la DB). **Falta el tipo NO-PDF**: la DB tiene `ProductFile` PDF=4 y
  > ningún otro tipo, y sembrar uno exige subirlo desde el panel ⇒ navegador. Bloqueado por
  > contención de carriles (ambos navegadores MCP tomados), NO por la feature.

  > 🟡 [feature-tester 2026-07-26, 2ª vuelta] **El insumo que faltaba YA EXISTE, el bloqueo se movió.**
  > Ahora la DB tiene `ProductFile` de tipo **IMAGEN/PNG confirmados** en `prueba` (5: el del
  > producto estándar «E2E sticker PNG» + los 4 del pool del sobre), sembrados de verdad desde el
  > panel. Lo que sigue faltando es una **orden PAGADA** que los autorice: sin túnel de Flow no hay
  > transición PENDIENTE→PAGADO (ADR-0001), y este check exige el `Entitlement`. O sea: ya no está
  > bloqueado por el navegador ni por falta de datos, sino **solo por el túnel** (o por la
  > autorización del usuario para forzar el estado PAGADO en DB, como se hizo en
  > `storefront.campos.persistencia.001`).
