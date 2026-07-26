# E2E — Landing del apex reposicionada (sorteo-first + SEO)

Checks de navegador para la landing oficial de la plataforma en el APEX
(`tasks/26-07-25-landing-reposicionamiento.md`). Los ejecuta el `feature-tester` con la skill
`browser-verify`. Cada check tiene un ID que el plan referencia desde sus Validaciones. Marcado
`[x]` solo por el feature-tester.

> **Dev server**: un `next dev` en **:3001** (NO :3000 — ahí corre OTRO proyecto del usuario). Un
> solo dev server (memoria del proyecto). Host de esta superficie: **apex `localhost:3001`** — los
> subdominios de tienda (`autora.localhost:3001`, `prueba.localhost:3001`) sirven storefront, NO la
> landing, y sirven de control negativo para los checks de metadata.
>
> **Nota de dominio**: canonical, `og:image` y `sitemap.xml` apuntan a `https://sorteatelo.cl` (el
> dominio de producción, ADR-0014) también en dev — es correcto y esperado: son URLs absolutas de
> la superficie pública, no del host local.

## F01 — Copy sorteo-first

> **⚠ Host real de la landing en dev (descubierto por el feature-tester 2026-07-26)**: `src/config.ts`
> tiene `devTienda.enabled: true` con slug `autora` (F09d, y es el estado COMMITEADO del repo), así que
> el **apex pelado `localhost:3001` impersona la Tienda `autora`** — ahí NO se sirve la landing. La
> landing de plataforma se alcanza en **`http://www.localhost:3001/`**: `parsearHost()` mapea el prefijo
> `www` a `{zona:"plataforma"}`, la MISMA zona que el apex, así que es equivalente y no requiere tocar
> config. La otra salida sería apagar `devTienda.enabled`, pero eso cambia el entorno del usuario.

- [x] **landing.hero.001** — ✅ 2026-07-26 — eyebrow, titular con plumón sobre «sorteo» y «Hoy»
  (`span.plumon` ×2), bajada del "sin programadores ni cotizaciones", nota "Gratis para partir · Sin
  tarjeta" y **3** CTAs "Crea tu tienda gratis" → `/login` (header, hero, boleto). Barrido del texto
  visible: `\brifa\b` = **0** y "Flow" = **1** (respuesta 4 de la FAQ). Ojo para futuras corridas: un
  `includes("rifa")` sin límite de palabra da **falso positivo** — la página dice "ta**rifa**" 2 veces.
  En el apex (`localhost:3001`) el hero muestra: eyebrow "Organiza
  sorteos online · Chile", el titular sorteo-first "Monta tu **sorteo** online. **Hoy** mismo." con
  el plumón amarillo sobre «sorteo» y «Hoy», la bajada del "todo en un día, sin programadores ni
  cotizaciones", la nota "Gratis para partir · Sin tarjeta" y el CTA "Crea tu tienda gratis"
  apuntando a `/login` (también el del header). En toda la página NO aparece la palabra "rifa" ni
  la palabra "Flow" fuera de la respuesta de la FAQ "¿Cómo me llega la plata?". (Plan F01 E2E)

## F02 — Secciones nuevas + secuencia de bandas

- [x] **landing.bandas.001** — ✅ 2026-07-26 — **COMPLETO en dos tramos.** El residuo móvil lo cerró la
  **sesión principal** por el carril Playwright (a pedido del usuario, una vez que los agentes paralelos
  liberaron el lock): viewport **375×812**, `getComputedStyle` sobre las 10 bandas top-level ⇒ AZUL
  `rgb(43,63,191)` (header) → AZUL (hero) → transparente/blanca ("De cero a tu sorteo andando…") →
  AMARILLA `rgb(255,197,48)` ("El sorteo corre frente a todos…") → blanca ("No necesitas que nadie te lo
  monte") → AMARILLA ("Un solo plan, todo incluido") → blanca ("Tu comunidad confía en ti…") → GRIS
  `rgb(238,240,245)` (FAQ) → AZUL (boleto) → TINTA `rgb(25,27,34)` (footer): **orden D8 exacto y cero
  blancas adyacentes, confirmado por color computado y no solo por nombre de clase**. **Sin desborde
  horizontal**: `scrollWidth` ≤ `innerWidth` (376), bandas a 361px. Screenshot `tmp/landing-375-hero.png`
  leído a ojo: plumón sobre «sorteo» y «Hoy», bajada sin Flow, nota "Gratis para partir · Sin tarjeta".
  Tramo previo (feature-tester, DOM servido + `landing.module.css`):
  las 9 bandas salen en el orden D8 **exacto** — `bandaAzul` (hero) → sin modificador = BLANCA (cómo
  funciona, con el remate "Todo esto, **en una tarde.**" en `span.plumon`) → `bandaAmarilla` (momento) →
  BLANCA (hazlo tú mismo) → `bandaAmarilla` (precio) → BLANCA (confianza) → `bandaGris` (FAQ) →
  `bandaAzul` (boleto) → `bandaTinta` (footer); **cero blancas adyacentes**. Los modificadores mapean a
  `--azul`, `--amarillo`, `--gris-banda` y negro en el CSS module, y `.banda` sin modificador no declara
  fondo (queda el papel). Copy de precio completo: "Un solo plan", "$25.000", "IVA incluido", los ítems,
  "Configura tu tienda gratis. El plan corre cuando publicas.", "Cero comisión por venta", "mitad de
  precio" y el remate "Menos de mil pesos al día." — que es `span.plumon` DENTRO de `.bandaAmarilla`, y
  la regla `.bandaAmarilla .plumon` conmuta a `plumon-blanco.svg` ⇒ **plumón blanco confirmado**.
  **PENDIENTE: el viewport móvil ~375px** (apilado de las dos columnas y no-desborde de la card), que
  exige layout real — los dos carriles MCP de navegador estaban tomados por agentes paralelos.
  En el apex, las secciones se suceden en el orden D8 exacto y con el
  color declarado: AZUL (hero) → BLANCA (cómo funciona, con el remate "Todo esto, **en una tarde.**"
  con plumón) → AMARILLA (momento clave) → BLANCA (hazlo tú mismo) → AMARILLA (precio) → BLANCA
  (confianza) → GRIS (FAQ) → AZUL (boleto CTA) → TINTA (footer). **Ninguna banda blanca queda pegada
  a otra blanca.** La sección precio muestra "$25.000 al mes", "IVA incluido", los 4 ítems del plan,
  "Configura tu tienda gratis. El plan corre cuando publicas.", "Cero comisión por venta — pagas el
  plan fijo y punto.", el remate "Menos de mil pesos al día." (con plumón BLANCO, porque va sobre la
  banda amarilla) y la línea de la segunda tienda a mitad de precio. Verificar en desktop (~1280px)
  y en móvil (~375px): en móvil las dos columnas de precio se apilan y la card no se desborda.
  (Plan F02 E2E)

## F03 — FAQ nueva

- [x] **landing.faq.001** — ✅ 2026-07-26 — **COMPLETO en dos tramos.** El click lo ejerció la **sesión
  principal** por Playwright: click real sobre el primer `.mantine-Accordion-control` («¿Cuánto
  cuesta?») ⇒ `aria-expanded` pasa a `true` y el panel queda visible con `offsetHeight` 237, abriendo
  con "Configurar tu tienda es gratis: el plan corre cuando publicas. Son $25.000 al mes, IVA incluido.
  Si abres una segunda tienda, esa y las que sigan quedan a mitad de precio. No te cobramos comisión por
  venta…" — el modelo aprobado, **verbatim**. Los 9 controls presentes.
  Tramo previo (feature-tester, HTML servido): la banda `bandaGris`
  trae **9** `Accordion-item`, **9** `Accordion-control` con las 9 preguntas en el orden aprobado
  (idénticas 1:1 a los `name` del `FAQPage`) y **9** `Accordion-panel` ya presentes en el DOM SSR. La
  respuesta 1 dice "$25.000 al mes, IVA incluido" y la cadena "en definición" **no existe en toda la
  página**. La respuesta 4 es la **única** de la página con "Flow". **PENDIENTE: el click que expande**
  (comportamiento stock del `Accordion` de Mantine) — sin navegador no lo ejercí.
  En la banda GRIS de la FAQ, el `Accordion` muestra las **9** preguntas en
  este orden: ¿Cuánto cuesta? · ¿Qué puedo vender? · ¿Necesito saber de páginas web? · ¿Cómo me llega
  la plata? · ¿Cómo sabe el comprador que su compra entró al sorteo? · ¿Cómo se elige al ganador? ·
  ¿Puedo hacer más de un sorteo? · ¿Qué pasa si un pago falla o queda a medias? · ¿Necesito iniciar
  actividades en el SII o dar boleta? Al hacer click, cada una expande su respuesta. Verificar en la
  respuesta 1 que aparece "$25.000 al mes, IVA incluido" y NO aparece "en definición"; en la
  respuesta 4, que es la ÚNICA de toda la página donde se lee "Flow". (Plan F03 E2E)

## F04 — JSON-LD + metadata

- [x] **landing.jsonld.001** — ✅ 2026-07-26 — **4** scripts `application/ld+json` en el HTML servido
  (no el DOM hidratado), en el orden `Organization` → `WebSite` → `SoftwareApplication` → `FAQPage`; los
  4 pasan `JSON.parse`; el `FAQPage` trae 9 `Question` cuyos `name` coinciden EXACTAMENTE con las 9
  preguntas del Accordion; `SoftwareApplication.offers.price = 25000` con `priceCurrency: "CLP"`.
  Verificado además que ningún bloque inyecta `</script`.
  En el HTML SERVIDO del apex (`view-source:` o `fetch` del SSR, no el
  DOM ya hidratado) hay **4** scripts `application/ld+json`, en este orden: `Organization`,
  `WebSite`, `SoftwareApplication`, `FAQPage`. Cada uno parsea como JSON válido (probar
  `JSON.parse` sobre el contenido de cada `<script>`). El `FAQPage` trae 9 `Question` cuyos `name`
  coinciden EXACTAMENTE con las 9 preguntas visibles del Accordion, y el `SoftwareApplication` trae
  `offers.price = 25000` con `priceCurrency: "CLP"`. (Plan F04 E2E)

- [x] **landing.metadata.001** — ✅ 2026-07-26 — `canonical = https://sorteatelo.cl/`, `og:locale =
  es_CL`, `og:image = https://sorteatelo.cl/og.png` con `og:image:width` 1200 y `og:image:height` 630,
  y `<meta name="keywords">` con "rifa online, rifas online". `<title>` ("Sortéatelo · Monta tu sorteo
  online tú mismo, en un día.") y `description` (156 chars) **sin** "rifa"; `og:title`/`og:description`
  tampoco. **Control negativo `autora.localhost:3001`: limpio** — cero `application/ld+json`, cero
  canonical del apex y cero "sorteatelo.cl" en su `<head>`.
  El `<head>` del apex incluye `<link rel="canonical"
  href="https://sorteatelo.cl/">`, `og:locale = es_CL`, `og:image` apuntando a una URL ABSOLUTA
  `https://sorteatelo.cl/og.png` (con `og:image:width` 1200 y `og:image:height` 630), y
  `<meta name="keywords">` (la única superficie visible-para-máquinas donde aparece "rifa"). El
  `<title>` y la `meta description` NO contienen "rifa". **Control negativo obligatorio**: cargar
  `autora.localhost:3001` (storefront de tenant) y confirmar que NADA de esto aparece ahí — ni los
  `ld+json` de plataforma, ni el canonical del apex. (Plan F04 E2E)

## F05 — robots + sitemap + OG raster

- [x] **landing.robots.001** — ✅ 2026-07-26 — `/robots.txt` responde **200** `text/plain` (321 B) con
  `User-agent: *` + `Allow: /` + `Sitemap: https://sorteatelo.cl/sitemap.xml`; `/sitemap.xml` responde
  **200** `application/xml` con un `<urlset>` válido que lista `<loc>https://sorteatelo.cl/</loc>`.
  Ambos pasan por el matcher del middleware y se sirven igual (no 404 ni HTML de la app). Nota: durante
  la corrida estos dos paths fueron el mejor detector de que el middleware estaba caído — cuando revienta,
  devuelven 500 aunque sean archivos estáticos.
  `GET http://localhost:3001/robots.txt` responde **200** con
  `User-agent: *` + `Allow: /` + `Sitemap: https://sorteatelo.cl/sitemap.xml`, y
  `GET http://localhost:3001/sitemap.xml` responde **200** con un `<urlset>` válido que lista
  `<loc>https://sorteatelo.cl/</loc>`. Ojo con el middleware: ambos paths caen dentro de su matcher,
  así que hay que confirmar que igual se sirven (no un 404 ni un HTML de la app). (Plan F05 E2E)

- [x] **landing.og.001** — ✅ 2026-07-26 — `/og.png` responde **200** `image/png`, 1200×630, 40.253 B
  **byte-idéntico** al archivo de disco. Leído a ojo: wordmark «Sortéatelo», titular "Tu tienda. Tu
  sorteo." con el plumón **DEBAJO** del texto (el tachado que reportó el implementer está corregido),
  tagline "Monta tu sorteo online tú mismo, en un día." y chip mono "N° 000428", todo en fuentes de
  marca (nada de serif de sistema). El `og:image` del `<head>` apunta a la URL absoluta de producción.
  **Nit de redacción de ESTE check**: pide «la «éa» en amarillo», pero en el PNG la «é» es amarilla y la
  «a» va en tinta — coincide con la gramática del wordmark; conviene ajustar el texto del check, no el
  diseño. Queda pendiente lo opcional (validador de tarjetas de Twitter/LinkedIn, post-deploy).
  `GET http://localhost:3001/og.png` responde 200 con
  `Content-Type: image/png`, y la imagen mide 1200×630. Abrirla y confirmar a ojo que se lee el
  wordmark «Sortéatelo» con la «éa» en amarillo, el titular "Tu tienda. Tu sorteo." con el plumón
  **debajo** del texto (NO cruzándolo como tachado), el tagline nuevo "Monta tu sorteo online tú
  mismo, en un día." y el chip mono "N° 000428" — todo en las fuentes de marca (Bricolage /
  Instrument Sans / IBM Plex Mono), no en una serif de sistema. El `og:image` del `<head>` apunta a
  la URL absoluta de producción `https://sorteatelo.cl/og.png` (correcto también en dev). Opcional:
  pasar la URL de producción por el validador de tarjetas de Twitter/LinkedIn cuando esté
  deployado. (Plan F05 E2E)

## Ajustes post-review pedidos por el usuario (2026-07-26)

- [x] **landing.honestidad.001** — ✅ 2026-07-26 — Barrido sobre el texto visible servido: **cero**
  afirmaciones de que alguien ve un *número* (probados «ve/ven su número», «número en pantalla»,
  «talonario que … comunidad», «mi comunidad lo ve», «toda tu comunidad puede ver» y número + verbo de
  ver: todos AUSENTES). La banda amarilla del momento dice ahora "aprietas sortear en pleno live y el
  ganador aparece al instante en **tu pantalla**" — la del Organizador, no un talonario público. El
  boleto final dice "Admite a 1 (una) tienda", sin "nueva". **Observación (no es fallo)**: esa misma
  banda tiene un bloque decorativo `role="img" aria-label="Ejemplo de talonario de sorteo"` que dibuja
  "Serie A · N° 301 M.P. · N° 302 CATA · N° 303…". Es la gramática talonario de la marca y está marcado
  como ilustración *de ejemplo*, así que no afirma nada; pero es la versión visual del claim que se
  acaba de borrar del copy — decisión de producto del usuario si quiere revisarlo.
  Barrido de claims de visibilidad en la landing servida: en NINGUNA
  parte de la página se afirma que alguien ve un *número* de participación (ni el Comprador en
  pantalla/correo, ni el Organizador en su panel). Verificar en particular la banda amarilla del
  momento clave —debe hablar de que el **ganador** aparece al instante en la pantalla del
  Organizador cuando aprieta sortear, NO de un talonario público— y el testimonio de la banda de
  confianza. El boleto final dice "Admite a 1 (una) tienda" (sin "nueva": nada de cupo limitado).

- [x] **login.og.001** — ✅ 2026-07-26 — `/login` sirve `og:image = https://sorteatelo.cl/og.png`
  (absoluto, PNG) y **cero** `content="/og.svg"` en la página. Sin otros cambios en el login.
  `http://localhost:3001/login`: el `<head>` trae
  `og:image = https://sorteatelo.cl/og.png` (absoluto, PNG), NO el `/og.svg` relativo de antes.
  El resto del login (copy y layout) queda igual — solo cambió esa meta.
