---
slug: guia-conecta-tu-ia
status: testing
owner: nicolas
created: 2026-07-26
related_adrs: [ADR-0025, ADR-0011, ADR-0018]
related_context: [Organizador, Conexión MCP, Tienda]

features:
  - id: F01
    behavior: "Botón «¿Cómo conecto una app de IA?» en el header de la card Conexiones IA abre un Drawer con la guía (SettingCard gana slot opcional de acción en el header)"
    state: active

  - id: F02
    behavior: "Motor de la guía + carril Claude: guion en 6 beats numerados como DATA (con selector de carril), capturas reales WebP lazy, y la URL de conexión derivada de la config (con botón copiar)"
    state: active

  - id: F03
    behavior: "Secciones complementarias del Drawer: «Qué puedes pedirle» (prompts reales sobre la whitelist + qué NO puede hacer), Claude Code en acordeón técnico, troubleshooting mínimo"
    state: active

  - id: F04
    behavior: "Carril ChatGPT completo (D9, decisión del usuario): su propio paso a paso real —modo desarrollador + conector con la URL + dance OAuth— con sus requisitos de plan/modo documentados honestos, igual de digno que el de Claude"
    state: active

  - id: F05
    behavior: "Política de `redirect_uri` del AS extendida para habilitar ChatGPT (D12, opción A del usuario): caso nuevo de prefijo ANCLADO sobre la URL parseada (origin exacto + prefijo de path + id no vacío + sin query) + el callback legacy de OpenAI como exact-match, con addendum al ADR-0025"
    state: active
---

# Guía «Conecta tu IA» — manual con capturas para el Organizador

## Contexto

El MCP del Organizador (ADR-0025) ya está en producción: `https://sorteatelo.cl/api/mcp`, OAuth 2.1 + DCR, consent en `/mcp-consent`, 27 tools. Pero un Organizador no técnico no tiene cómo saber que esto existe ni cómo enchufarlo a Claude: la card «Conexiones IA» de `/admin/configuracion` solo muestra conexiones ya hechas (o el estado vacío «cuando autorices una app… aparecerá acá», que hoy es un callejón sin salida — no dice CÓMO autorizar).

Este plan produce el **manual con capturas**: una guía paso a paso que vive DENTRO del panel como Drawer, abierta desde la card Conexiones IA, que lleva al Organizador desde «no sé qué es esto» hasta «le pedí un cambio a Claude y lo hizo, y sé cómo cortarle el acceso». El guion queda estructurado en beats numerados para que la futura cápsula de video (skill `capsula-video`, fase 2 post-F07) lo mapee 1:1 sin re-escribir nada.

## Decisiones

- **D1 (usuario, Q1)**: la guía vive dentro del panel como **Drawer** abierto desde la card Conexiones IA en `/admin/configuracion`. Sin página pública ni URL compartible (aceptado). Razón: el Organizador la va a buscar donde están sus conexiones; una página pública era superficie extra sin audiencia clara pre-F08. La cápsula de video tendrá su propio destino (R2) — fuera de este plan, pero el guion debe quedar reutilizable.
- **D2 (usuario, Q2)**: capturas reales de **TODO** el flujo — incluidos los pasos en la UI de Claude web/desktop (Ajustes → Conectores → agregar conector → pegar URL), el consent de Sortéatelo y el resultado (un chat pidiendo un cambio). **Costo de mantenimiento aceptado explícitamente**: si Claude rediseña su UI, se re-capturan. Mitigación de peso: WebP livianos en `/public/guia-ia/`, `loading="lazy"` dentro del Drawer (no cargan hasta abrirlo).
- **D3 (planner, cierre delegado)**: anclaje exacto = **botón subtle «¿Cómo conecto una app de IA?»** en el header de la card Conexiones IA. `SettingCard` no tiene slot de acción en el header (solo icon+title+description) ⇒ se le agrega prop opcional `headerAction?: ReactNode`, alineada a la derecha del título. Razón: es la variante mínima que no duplica la gramática del header (la razón por la que SettingCard existe); un link suelto bajo la descripción competiría con el EmptyState.
- **D4 (planner, cierre delegado) — SUPERSEDED PARCIALMENTE POR D9**: alcance v1 de carriles — **Claude web/desktop como carril principal** (el guion de 6 beats con capturas), **Claude Code como carril técnico dentro de un acordeón** (el comando `claude mcp add` + login OAuth, sin capturas — audiencia técnica no las necesita), ~~**ChatGPT como «próximamente»**~~. Razón original: Claude es el cliente contra el que el MCP se probó E2E; documentar un flujo no verificado sería inventar. **Lo que sobrevive**: Claude sigue siendo el carril por defecto y Claude Code sigue en el acordeón técnico. **Lo que cae**: el «próximamente» de ChatGPT (ver D9).
- **D5 (planner, cierre delegado)**: estructura del guion = **6 beats numerados**, pensados para mapear 1:1 a los 6 beats de una cápsula HyperFrames:
  1. **Qué es esto** — conectas una app de IA a tu cuenta y le pides cambios conversando; tú sigues al mando.
  2. **Copia la dirección de conexión** — la URL del MCP con botón copiar (derivada de la base URL de la app, nunca hardcodeada).
  3. **Agrégala en Claude** — Ajustes → Conectores → Agregar conector personalizado → pegar la URL. (Capturas de la UI de Claude.)
  4. **Autoriza en Sortéatelo** — la pantalla de consent: qué estás autorizando y a quién. (Captura del consent.)
  5. **Pídele algo** — ejemplo real en el chat; el cambio queda hecho en la tienda. (Captura del chat.)
  6. **El control es tuyo** — la conexión aparece en Conexiones IA y se revoca cuando quieras. (Captura de la card.)

  El guion vive como **estructura de datos** (array de beats: número, título, cuerpo, capturas) en un módulo propio, y el Drawer lo renderiza. Razón: es el seam que la cápsula reutiliza — un spec de video se arma leyendo el módulo, no raspando JSX.
- **D6 (planner, cierre delegado)**: sección «Qué puedes pedirle» con **5 prompts de ejemplo** que mapean a tools reales de la whitelist, + un bloque de límites que nombra lo que el agente NO puede hacer (publicar, ejecutar el sorteo, borrar, leer credenciales de Flow) — porque esos límites son diseño (ADR-0018/0025) y contarlos genera confianza. Ejemplos v1 (el implementer puede pulir el copy, no las capacidades):
  - «¿Cómo van las ventas de mi tienda esta semana?» (`listar_ventas`)
  - «Cambia el precio del pack de 3 a $5.000» (`actualizar_producto`)
  - «Agrega una sección de preguntas frecuentes a mi página» (`agregar_seccion` — y que el cambio queda como borrador, publicar sigue siendo tuyo)
  - «Cambia el color principal de mi tienda» (`cambiar_tema_pagina`)
  - «Agrega un campo de RUT al checkout» (`crear_campo_checkout`)
- **D7 (planner, cierre delegado)**: troubleshooting mínimo, 2 ítems: (a) **«Mi plan de Claude no trae conectores»** — los conectores personalizados requieren un plan pagado de Claude (una línea, sin prometer precios de terceros); (b) **revocar y reconectar** — si la app se comporta raro o pierde acceso, revocar desde la card y repetir el beat 3. Nada más en v1.
- **D9 (usuario, 2026-07-26, al aprobar el plan)**: **ChatGPT NO va como «próximamente» — va HABILITADO como segundo carril completo**, con su propio paso a paso real y sus capturas, «igual de digno que el de Claude». Si su flujo tiene requisitos de plan o de modo, se documentan **honestos** en la guía (igual que el requisito de plan de Claude), y el copy queda fácil de corregir. Consecuencia estructural: la guía deja de ser un guion único y pasa a tener un **selector de carril** (Claude / ChatGPT); el guion sigue siendo 6 beats por carril, y **la cápsula de video mapea el carril Claude** (D5 intacto). Se abre **F04** para el carril nuevo en vez de inflar F02/F03: así el trabajo de ChatGPT tiene sus propias validaciones y no se cuela como nota al pie de otra feature.
- **D10 (implementer, verificación de flujos reales)**: los pasos de ambos carriles se verificaron contra **documentación oficial de primera parte** el 2026-07-26 (Anthropic: `support.claude.com/en/articles/11175166`, `claude.com/docs/connectors/building/authentication`, `modelcontextprotocol.io/docs/develop/connect-remote-servers`; OpenAI: `developers.openai.com/api/docs/guides/developer-mode`, `developers.openai.com/plugins/deploy/connect-chatgpt`, `developers.openai.com/plugins/build/auth`, `help.openai.com/en/articles/12584461`). Hallazgos que CORRIGEN supuestos del plan:
  1. **D7 estaba equivocado en un hecho**: los conectores personalizados de Claude **NO requieren plan pagado** — *«available … for users on Free, Pro, Max, Team, and Enterprise plans. Free users are limited to one custom connector»*. El ítem de troubleshooting se reescribe con la verdad (Free sirve, con **un** conector; en Team/Enterprise **solo el Owner** puede agregarlo, y por Configuración de la organización). Repetir el «necesitas plan pagado» habría mandado a Organizadores a pagar por algo que ya tienen.
  2. **La ruta de menú de Claude es «Personalizar → Conectores»** (`claude.ai/customize/connectors`) → `+` → `Añadir conector personalizado` → URL → `Añadir`. Los strings literales salen de la versión ES del artículo oficial. En el chat, el conector se habilita con el botón `+` → `Conectores`. NO existe en doc oficial el string «Buscar y herramientas» ⇒ no se usa.
  3. **ChatGPT: dos pasos separados** — `Settings → Security and login → Developer mode` (toggle) y después `Settings → Plugins` (`chatgpt.com/plugins`) → botón `+` → nombre + descripción + **URL del servidor MCP con el path `/mcp` incluido** → crear → revisar las tools. Es **beta declarada**, solo web, y las acciones de escritura piden confirmación. Los nombres de menú **en español no se pudieron verificar** (help.openai.com responde 403 a fetch automatizado) ⇒ el copy los deja en inglés con la traducción entre paréntesis y queda marcado como lo primero a corregir con una captura real.
  4. **Requisitos de plan de ChatGPT: hay contradicción entre dos fuentes oficiales** — `developers.openai.com` dice que el modo desarrollador está en *«Pro, Plus, Business, Enterprise, and Education»*, mientras el help center dice que *«full MCP support, including modify/write actions, is rolling out in beta to ChatGPT Business, Enterprise, and Edu plans»*. En **Free no está** (las dos fuentes coinciden). La guía dice exactamente eso: plan pagado y modo desarrollador, con la advertencia de que la escritura puede estar limitada a los planes de organización. No se inventa una lista limpia que ninguna fuente sostiene.
  5. **Deep research NO sirve**: los conectores de deep research solo admiten `search`/`fetch`. Nuestras 27 tools solo corren por modo desarrollador. La guía lo dice.
- **D11 (implementer, BLOQUEANTE — pendiente de respuesta del usuario)**: **el AS de la Plataforma hoy RECHAZA el callback de ChatGPT.** `esRedirectUriPermitida` (`src/server/mcp/redirectUris.ts`, D9 de ADR-0025) hace **exact-match** contra una allowlist que solo tiene los dos callbacks de Claude, y ChatGPT redirige a **`https://chatgpt.com/connector/oauth/{callback_id}`** — un path **dinámico por conector** (más el legacy fijo `https://chatgpt.com/connector_platform_oauth_redirect`, que sigue funcionando solo para apps ya publicadas). Con la allowlist actual, el registro dinámico (DCR) de ChatGPT se rechaza y el carril muere en el primer paso. **No se toca `redirectUris.ts` sin visto bueno explícito** (I5 + es política de seguridad del AS): la pregunta va al usuario con el diff propuesto. Mientras no se resuelva, el carril ChatGPT queda escrito y renderizado pero **la conexión real no funciona en prod**. **RESUELTA por D12.**
- **D12 (usuario, 2026-07-26 — respuesta a D11: «opción A»)**: **se extiende la política de `redirect_uri` del AS para habilitar ChatGPT**, como cambio revisado con su propio rigor ⇒ **F05**. Forma exacta aprobada:
  - **Caso nuevo de prefijo ANCLADO sobre la URL ya parseada**: `url.origin` **exacto** (`https://chatgpt.com`) + `url.pathname` que empiece con `/connector/oauth/` + **algo después** del prefijo (el `callback_id`, nunca el prefijo pelado) + **sin query** (el fragmento ya lo rechaza la función para todos los casos). Nunca `startsWith` sobre el string crudo — eso aceptaría `https://chatgpt.com.evil.com/connector/oauth/x`.
  - **El callback legacy de OpenAI** (`https://chatgpt.com/connector_platform_oauth_redirect`) entra a la allowlist **exact-match**, no al prefijo: es un string fijo y no necesita relajación ninguna.
  - **Addendum al ADR-0025** explicando por qué se relaja el exact-match, qué anclaje lo mantiene seguro, y el **riesgo documentado del `aud`/`resource`**: los tokens del AS son **opacos** (no JWT, no llevan `aud`), y la doc de OpenAI dice que ChatGPT manda `resource=` en `/authorize` y `/token` y espera ese valor en el `aud` del access token. Si ChatGPT lo exige duro, **la conexión falla igual y no es un bug nuevo** — es este límite conocido. Se sabrá al probar con una cuenta real.
  - Consecuencia en el checklist: `#guia.carril.003` deja de estar «bloqueado por decisión» y pasa a **«pendiente de prueba con cuenta real del usuario»**.
- **D8 (operativa)**: las capturas de la UI de Claude las produce la **implementación con el navegador del usuario** (carril `claude-in-chrome` o el que esté libre según `browser-verify`) sobre claude.ai real. **Fallback**: si el flujo requiere la cuenta del usuario (login, plan), el usuario captura a mano y las deja en una carpeta acordada. Las capturas propias (consent, card Conexiones IA, chat de resultado) ya tienen precedente E2E (`tmp/ft-mcp-consent.png`, `tmp/ft-mcp-conexiones-ia.png`) — re-capturarlas curadas es trivial. Todas se optimizan a WebP (ancho máx ~1280px, objetivo <150 KB c/u) antes de entrar a `/public/guia-ia/`.

## Plan

1. Agregar prop opcional `headerAction?: ReactNode` a `SettingCard` (render a la derecha del título, sin alterar las cards existentes). (F01)
2. Crear el módulo de guion (beats como data: número, título, cuerpo, pasos, refs de captura; **`guionDe(app)` devuelve el guion del carril elegido**) + componente Drawer `GuiaConectaIa` (Mantine Drawer, lazy — no monta contenido hasta abrirse). Botón «¿Cómo conecto una app de IA?» en el header de la card Conexiones IA que lo abre. (F01, F02)
3. Producir las capturas: re-capturar curadas las pantallas propias (consent con un cliente de nombre presentable, card con conexión activa) y capturar el flujo en claude.ai / chatgpt.com con el navegador del usuario (D8, con su fallback: lo que exija acciones de cuenta —login, pagos, activar el modo desarrollador— lo captura el usuario). Optimizar a WebP y dejarlas en `/public/guia-ia/`. (F02, F04)
4. Renderizar el carril: 6 beats numerados con sus capturas (`loading="lazy"`), URL de conexión derivada de la config de la app con botón copiar (CopyButton de Mantine), y el **selector de carril** (Claude / ChatGPT) arriba. (F02, F04)
5. Secciones complementarias del Drawer: «Qué puedes pedirle» (5 prompts + bloque de límites), acordeón «¿Usas Claude Code?» (comando `claude mcp add` + login), troubleshooting. (F03)
6. Carril ChatGPT: sus beats propios (modo desarrollador → conector con la URL → dance OAuth → usarlo), sus requisitos honestos de plan/modo (D10.3/D10.4) y su ítem de troubleshooting. (F04)
7. Tests Vitest de lo testeable data-side + checklist E2E del flujo del Drawer; copy final en voz chilena sobria. (F01–F04)
8. Extender `esRedirectUriPermitida` con el caso de **prefijo anclado** + el legacy de OpenAI en la allowlist, con los tests de los casos maliciosos escritos primero (TDD), y escribir el **addendum al ADR-0025** con el riesgo del `aud`/`resource`. (F05)

## Validaciones

### F01 — Botón en la card abre el Drawer de la guía

**Vitest** (integration):
- [ ] (no aplica — UI estática sin lógica de servidor; la prop `headerAction` de SettingCard no altera el render de las cards existentes se verifica en E2E/review)

**E2E** (browser):
- [ ] En `/admin/configuracion`, la card Conexiones IA muestra el botón «¿Cómo conecto una app de IA?» en su header sin romper el layout de la card (con y sin conexiones listadas) — `tasks/e2e-guia-conecta-tu-ia.md#guia.boton.001`
- [ ] Click en el botón abre el Drawer de la guía; se puede cerrar y el estado de la card queda intacto — `tasks/e2e-guia-conecta-tu-ia.md#guia.boton.002`
- [ ] Las demás SettingCards de la página no cambian visualmente (la prop es opcional) — `tasks/e2e-guia-conecta-tu-ia.md#guia.cards.001`

### F02 — Motor de la guía + carril Claude: 6 beats con capturas reales

**Vitest** (integration):
- [ ] El guion exporta exactamente 6 beats numerados 1..6, cada uno con título y cuerpo no vacíos — `src/__tests__/components/guia-ia.test.ts::guia.ia.guion.001`
- [ ] La URL de conexión que muestra la guía se deriva de la base URL configurada de la app (en prod resuelve a `https://sorteatelo.cl/api/mcp`), nunca de un string hardcodeado en el componente — `src/__tests__/components/guia-ia.test.ts::guia.ia.url.001` + `guia.ia.url.002` + `guia.ia.url.004` (este último lee los archivos y falla si el dominio aparece tipeado a mano) + `guia.ia.url.003` (la ruta client-safe es espejo de `PATH_MCP_PUBLICO` del server)
- [ ] Toda captura declarada en el guion existe como archivo en `/public/guia-ia/` (una captura declarada y ausente no puede llegar a producción) — `src/__tests__/components/guia-ia.test.ts::guia.ia.capturas.001` + `guia.ia.capturas.002` (WebP con alt y medidas) + `guia.ia.capturas.003` (una pendiente no puede estar declarada)

**E2E** (browser):
- [ ] El Drawer muestra los 6 beats en orden con sus capturas; las imágenes no cargan hasta abrir el Drawer (lazy) y ninguna llega rota (404) — `tasks/e2e-guia-conecta-tu-ia.md#guia.drawer.001` + `#guia.drawer.002`
- [ ] El botón copiar deja la URL del MCP en el portapapeles — `tasks/e2e-guia-conecta-tu-ia.md#guia.copiar.001`
- [ ] El peso total de las capturas servidas es razonable (WebP, cada una bajo el objetivo acordado) — verificado en implementación: 4 WebP, **126 KB en total** (18–47 KB c/u, objetivo era <150 KB c/u); re-chequeo en `#guia.drawer.002`

### F03 — Secciones complementarias

**Vitest**:
- [ ] Cada prompt de ejemplo de «Qué puedes pedirle» referencia una tool que existe en la whitelist real del MCP (si una tool se renombra o quita, el test falla) — `src/__tests__/components/guia-ia.test.ts::guia.ia.prompts.001` + `guia.ia.prompts.002` (son 5 y ninguno promete algo prohibido) + `guia.ia.prompts.003` (los límites siguen siendo verdad: no existe tool de publicar/sortear/borrar) + `guia.ia.prompts.004` (el comando de Claude Code lleva la dirección derivada)

**E2E**:
- [ ] La sección «Qué puedes pedirle» muestra los prompts y el bloque de límites (publicar / sorteo / borrar / credenciales Flow como cosas que NO hace) — `tasks/e2e-guia-conecta-tu-ia.md#guia.secciones.001`
- [ ] El acordeón «¿Usas Claude Code?» está colapsado por defecto y al expandirlo muestra el comando de conexión — `tasks/e2e-guia-conecta-tu-ia.md#guia.secciones.002`
- [ ] El troubleshooting muestra sus ítems, y el de «mi plan no trae conectores» dice la verdad verificada (Claude Free sirve con un conector; ChatGPT exige plan pagado + modo desarrollador) — `tasks/e2e-guia-conecta-tu-ia.md#guia.secciones.003`

### F04 — Carril ChatGPT completo

**Vitest**:
- [ ] `guionDe("chatgpt")` devuelve también 6 beats numerados 1..6 con título y cuerpo no vacíos (el carril nuevo no es un stub) — `src/__tests__/components/guia-ia.test.ts::guia.ia.carriles.001`
- [ ] Los dos carriles comparten los beats que NO dependen de la app y difieren exactamente en los que el guion marca como propios del carril (el guion no duplica prosa, y una edición del copy común no se desincroniza entre carriles) — `src/__tests__/components/guia-ia.test.ts::guia.ia.carriles.003` (invariante en las DOS direcciones: lo marcado difiere, lo no marcado es idéntico) + `guia.ia.carriles.004` (el beat de «agrégala» trae pasos literales, no prosa suelta)
- [ ] El carril declara sus requisitos (plan/modo) no vacíos — un carril sin requisitos declarados sería un carril que promete de más — `src/__tests__/components/guia-ia.test.ts::guia.ia.carriles.002` (+ exige `fuente`: contra qué se verificó el paso a paso)

**E2E**:
- [ ] El selector de carril cambia entre Claude y ChatGPT dentro del Drawer, y cada uno muestra sus propios pasos, requisitos y capturas — `tasks/e2e-guia-conecta-tu-ia.md#guia.carril.001`
- [ ] El carril ChatGPT nombra el modo desarrollador y la URL con `/mcp`, y advierte que deep research no sirve — `tasks/e2e-guia-conecta-tu-ia.md#guia.carril.002`
- [ ] (desbloqueado por D12/F05; ahora **pendiente de prueba con cuenta real del usuario**) La conexión real de punta a punta con ChatGPT — `tasks/e2e-guia-conecta-tu-ia.md#guia.carril.003`

### F05 — Política de `redirect_uri` extendida para ChatGPT

**Vitest** (función pura):
- [ ] El callback dinámico de ChatGPT se acepta con cualquier `callback_id` (el caso feliz que hoy rechaza el AS) y el legacy de OpenAI se acepta por exact-match — `src/__tests__/server/mcp/redirectUris.test.ts::mcp.oauth.004`
- [ ] El anclaje aguanta los casos maliciosos: `chatgpt.com.evil.com`, host ajeno con el mismo path, subdominio de chatgpt.com, prefijo pelado sin id, path que solo CONTIENE el prefijo, query colada, fragmento, `http://`, traversal que sale del prefijo y userinfo embebido — `src/__tests__/server/mcp/redirectUris.test.ts::mcp.oauth.005`
- [ ] Lo que ya valía sigue valiendo (loopback + los dos callbacks de Claude exact-match, y todo lo demás afuera): sin regresión en `mcp.oauth.001` / `002` / `003` — `src/__tests__/server/mcp/redirectUris.test.ts`

**E2E** (browser, con cuenta real):
- [ ] La conexión real de punta a punta con ChatGPT — `tasks/e2e-guia-conecta-tu-ia.md#guia.carril.003` (mismo check de F04; **el riesgo del `aud`/`resource` está documentado en el addendum del ADR-0025**: si el dance falla ahí, no es un bug nuevo)

## Invariantes

- I1: **sin página pública ni ruta nueva** — la guía vive únicamente dentro del panel (D1). No crear pages en el apex ni rutas compartibles.
- I2: la **URL de conexión nunca hardcodeada** en el componente: se deriva de la configuración/base URL de la app (mismo origen de verdad que usa el resto del código para construir URLs absolutas).
- I3: los **prompts de ejemplo solo prometen capacidades de la whitelist real** (27 tools). Nada de «pídele que publique tu tienda» ni «que ejecute el sorteo» — esos límites son diseño (ADR-0018/0025) y la guía los cuenta como tales.
- I4: capturas **WebP en `/public/guia-ia/`**, lazy dentro del Drawer, sin datos reales sensibles en pantalla (usar tienda demo / datos curados; jamás credenciales, correos de compradores ni montos reales de un tenant ajeno al demo).
- I5: **cero cambios al servidor MCP, al consent ni al flujo OAuth** — este plan es solo la guía. Si algo del flujo real contradice el guion, parar y preguntar (no «arreglar» el flujo de pasada).
  - **Carve-out único, autorizado por el usuario en D12 y acotado a F05**: `src/server/mcp/redirectUris.ts` (la política de `redirect_uri` del AS). Es exactamente el camino que I5 manda seguir —se paró, se preguntó, el usuario respondió— y por eso va con su propia feature, sus propios tests y addendum de ADR. **Sigue prohibido** tocar el resto: tools, consent, emisión de tokens, `decidirAuthorize`, discovery.
- I6: copy en **voz chilena sobria** (sin posesivos empalagosos, medio corporativo sin usted); Mantine 7 y convenciones de `docs/agents/frontend-conventions.md`.
- I7: el guion vive como **data (beats) separada del render** — es el contrato de reutilización con la cápsula de video (D5). No inlinear la prosa en JSX suelto.

## Out of scope

- La **cápsula de video** (skill `capsula-video`) — fase futura; este plan solo deja el guion mapeable 1:1.
- **Página pública** o URL compartible de la guía.
- ~~Carril **ChatGPT operativo**~~ — **entra al alcance por D9**. ~~Lo que SIGUE fuera: el **cambio de política de `redirect_uri`** que ChatGPT necesita para conectar de verdad (D11)~~ — **también entra por D12**, con permiso explícito del usuario y como cambio revisado propio: **F05**. Lo que sigue fuera del carril de la política: cualquier otro cliente de IA que quiera sumarse (se agrega ACÁ cuando exista, no antes) y darle `aud` a los tokens del AS (ver el addendum del ADR-0025).
- Cambios al MCP server, consent, OAuth, o a la lista de tools.
- i18n / versiones en otros idiomas.
- Marketing del feature (landing, correo de anuncio a Organizadores).

## Especialistas a consultar

- `frontend-reviewer` — el Drawer, la prop `headerAction` de SettingCard y la gramática visual del guion (beats numerados) contra design.md §4.
- `backend-reviewer` — **F05**: la política de `redirect_uri` del AS es la única barrera entre el DCR público y «el AS entrega un code en un host arbitrario». Es lo más caro de equivocarse en todo el plan.
- `change-set-reviewer` — review final del diff (incluye verificar que no entraron PNG pesados a `/public`).
- `feature-tester` — recomendado: toca UI del panel; E2E asistido del flujo botón → Drawer → capturas → copiar URL.

## Bitácora

- [2026-07-26 00:00] [planner-grill] Arranco grill. Contexto cargado: MCP del Organizador (ADR-0025) en prod (`https://sorteatelo.cl/api/mcp`, OAuth 2.1 + DCR, consent en `/mcp-consent`, 27 tools); card «Conexiones IA» en `/admin/configuracion` (`src/components/admin/conexiones-ia.tsx`, SettingCard con lista+revocar — ancla natural para el link). Apex tiene páginas públicas conviviendo con despacho por subdominio (`bases.tsx`, `en-pausa.tsx` como precedente). Screenshots E2E reales en `tmp/` (`ft-mcp-consent.png`, `ft-mcp-conexiones-ia.png`). Decisión previa del usuario: DOS formatos — manual con capturas (este plan) + cápsula de video después (skill `capsula-video`, reusa el guion; fuera de este plan salvo dejar el guion reutilizable). Copy: voz chilena sobria, `APP_CONFIG`, Mantine 7.
- [2026-07-26 00:00] [planner-grill] Q1: ¿dónde vive el manual — página pública del apex, dentro del panel, o ambas? Recomendada: página pública `/conecta-tu-ia` en el apex + link desde la card Conexiones IA.
- [2026-07-26 00:00] [planner-grill] Q1 answered: opción (b) con variante — la guía vive DENTRO del panel como modal/Drawer, abierta desde un link en la card Conexiones IA de `/admin/configuracion` (punto exacto de anclaje delegado al planner). Sin página pública, sin URL compartible (aceptado). La cápsula de video tendrá su propio destino (R2 post-F07); el guion debe quedar reutilizable para ella.
- [2026-07-26 00:00] [planner-grill] Q2: formato de capturas dentro del Drawer. Recomendada: híbrido — screenshots reales SOLO de pantallas propias (consent Sortéatelo, card Conexiones IA) como WebP en `/public/guia-ia/`; la UI de Claude/ChatGPT va en pasos de texto numerados con nombres literales de menú (UI de terceros cambia y no la controlamos — cero mantenimiento de screenshots ajenos).
- [2026-07-26 15:13] [planner-grill] Q2 answered: opción (a), contra la recomendación — capturas reales de TODO el flujo, incluida la UI de Claude web/desktop (Ajustes → Conectores → agregar → pegar URL), el consent y el chat con el resultado. Costo de mantenimiento (re-capturar si Claude rediseña) aceptado explícitamente por el usuario. Mitigación: WebP livianos + lazy en el Drawer.
- [2026-07-26 15:13] [planner-grill] Usuario en modo cierre: delega las decisiones restantes (alcance v1 y estructura del guion) al planner con su recomendación como base. Cerradas como D3 (anclaje: botón en header de la card + prop `headerAction` en SettingCard — verificado en código que SettingCard no tiene slot de acción), D4 (carriles: Claude web/desktop principal, Claude Code en acordeón, ChatGPT próximamente), D5 (guion como data de 6 beats, seam para la cápsula), D6 (5 prompts mapeados a tools reales de la whitelist — verificada contra `src/server/mcp/tools/*`: 27 tools, sin publicar/sortear/borrar — + bloque de límites), D7 (troubleshooting: plan de Claude sin conectores + revocar/reconectar), D8 (capturas de Claude con navegador del usuario, fallback captura manual).
- [2026-07-26 15:13] [planner-grill] Plan escrito. Features F01–F03, status sigue `planning` a la espera del visto bueno del usuario.
- [2026-07-26 16:05] [feature-implementer] Visto bueno del usuario **con una modificación**: ChatGPT deja de ser «próximamente» y pasa a ser **segundo carril completo** («dejar claude y chatgpt habilitados»). Plan actualizado antes de tocar código: D4 marcada superseded parcial, **D9** (carril ChatGPT + selector de carril + F04 nueva), status `planning → implementing`. Features pendientes: F01, F02, F03, F04.
- [2026-07-26 16:05] [feature-implementer] Verificación de flujos reales contra doc oficial (subagente de investigación, 9 fuentes de primera parte) ⇒ **D10**. Tres correcciones al plan escrito: (1) **D7 afirmaba un hecho falso** — los conectores personalizados de Claude SÍ están en Free (limitado a 1), y en Team/Enterprise solo el Owner los agrega; el troubleshooting se reescribe con la verdad en vez de mandar a nadie a pagar de más; (2) la ruta de menú de Claude hoy es «Personalizar → Conectores» + botón `+`, no «Ajustes → Conectores» como suponía D5 beat 3; (3) ChatGPT necesita DOS pasos (`Security and login → Developer mode` y después `Plugins → +`), es beta declarada, solo web, y **deep research no sirve** para nuestras tools. Los nombres de menú de ChatGPT en español NO se pudieron verificar (help.openai.com responde 403 a fetch automatizado) ⇒ quedan en inglés con traducción entre paréntesis y marcados como lo primero a corregir con una captura real.
- [2026-07-26 16:40] [feature-implementer] **F01 implementada**. Archivos: `src/components/admin/setting-card.tsx` (prop `headerAction?: ReactNode`; el header pasa a `Group justify="space-between"` con ícono+título en un Group anidado `min-w-0` y la acción en `shrink-0` — el mismo recorte que ya mordió al badge «Con acc…» y al botón «Revoca» de esta card), `src/components/admin/conexiones-ia.tsx` (botón subtle «¿Cómo conecto una app de IA?» + `useDisclosure` + montaje del Drawer). Sin Vitest por decisión del plan (UI estática).
- [2026-07-26 16:40] [feature-implementer] **F02 implementada** (TDD, ciclos rojo→verde). Archivos: `src/lib/urlMcp.ts` (nuevo — `RUTA_MCP` + `urlMcpPublica()`, client-safe, deriva de `APP_CONFIG.dominio`), `src/components/admin/guia-ia/guion.ts` (el guion como DATA), `src/components/admin/guia-ia/guia-conecta-ia.tsx` (render), `src/__tests__/components/guia-ia.test.ts`. **Decisión táctica sobre I2**: la dirección sale de `APP_CONFIG.dominio` y NO del host actual (`hrefApex`), porque la guía documenta el servicio PÚBLICO — con `window.location` un Organizador mirando el panel en dev copiaría `localhost:3001`, que ninguna app de IA de terceros puede alcanzar. **No se tocó `discovery.ts`** (I5): `RUTA_MCP` queda como espejo DECLARADO de `PATH_MCP_PUBLICO` con un test que ata los dos lados (`guia.ia.url.003`), patrón ya usado en el repo para `MAX_CANTIDAD_POR_ITEM`.
- [2026-07-26 16:40] [feature-implementer] **F03 implementada**: «Qué puedes pedirle» (5 prompts como data, cada uno con la tool real que lo atiende) + bloque de límites que **repite palabra por palabra** los 4 «No va a poder» de `/mcp-consent` (la guía y el consent no pueden prometer cosas distintas), acordeón «¿Usas Claude Code?» colapsado con el comando derivado, y troubleshooting de 2 ítems **reescrito con la verdad de D10.1**. El botón de copiar lleva etiqueta de texto y no `ActionIcon`: el panel no usa `Tooltip` en icon-only, y adivinar qué copia un ícono es justo lo que la guía viene a evitar.
- [2026-07-26 16:40] [feature-implementer] **F04 implementada**: selector de carril (`SegmentedControl`) + `guionDe(app)`. Los beats 1, 2, 4 y 6 son COMPARTIDOS y solo cambian el 3 («dónde se agrega») y el 5 («dónde se enciende»), con el flag `variaPorApp` como contrato testeado en las dos direcciones. Requisitos de cada app arriba del todo, **antes del paso 1**: enterarse de que tu plan no alcanza después de seguir cuatro pasos es la peor forma de enterarse.
- [2026-07-26 17:05] [feature-implementer] **Capturas: 4 producidas, 3 pendientes del usuario.** Las de terceros salieron del Chrome real del usuario (carril `claude-in-chrome`) **sin tocar ninguna configuración de sus cuentas** — nada de login, nada de interruptores, ningún formulario enviado. **Hallazgo que corrigió el copy escrito desde la doc (D10.2 quedaba corto)**: en la pantalla real en español el botón dice **«Agregar»** (no «+» ni «Añadir»), y el diálogo pide un campo **«Nombre»** que la documentación no menciona; la ruta al modo desarrollador de ChatGPT se entra por **Ajustes → Complementos**, con badge **«RIESGO ELEVADO»**. Los pasos se reescribieron contra la pantalla, no contra la doc. **Riesgo de privacidad encontrado y cerrado**: las capturas crudas de claude.ai y chatgpt.com mostraban en su barra lateral los **títulos de los chats privados del usuario** y su nombre; se recortaron con `ffmpeg` a la zona del modal antes de que ningún byte entrara a `/public` (I4). La del consent se re-sacó con el correo reemplazado por `tucorreo@gmail.com` en el DOM (sin tocar DB). Resultado: 4 WebP, 126 KB en total (18–47 KB c/u). Para el consent se registró un cliente OAuth de dev llamado «Claude» (DCR, `client_id da7a1a64-…`) — **no otorga nada** sin consentimiento y **no se apretó «Autorizar»**; borrable cuando el usuario quiera.
- [2026-07-26 17:05] [feature-implementer] **Beat 6 queda sin captura a propósito**: la lista de Conexiones IA está literalmente detrás del Drawer. Fotografiar una card que el Organizador tiene a 40 píxeles no enseña nada y agrega una imagen más que re-capturar cada vez que esa card cambie.
- [2026-07-26 17:30] [feature-implementer] **`frontend-reviewer`: APPROVE** (dimensiones naming/tests/documentación en A). Cero blockers. Su hallazgo real: `LIMITES` de la guía y `NO_PUEDE` del consent eran copias manuales **sin nada que las atara** — el comentario del código prometía que decían lo mismo y nada lo garantizaba. Cerrado con `guia.ia.prompts.005`, que parsea el array del `.tsx` del consent y exige igualdad exacta. No se extrajo a un módulo común a propósito: eso obligaba a editar el consent, que I5 protege. Sus otros dos apuntes (ancho angosto del header, drift de conventions) se resolvieron abajo.
- [2026-07-26 17:55] [feature-implementer] **Pasada visual en navegador real (no screenshots reducidos — memoria del proyecto) y 3 defectos REALES corregidos**, ninguno visible en el código:
  1. **BLOCKER de layout**: el botón del header mide 224 px fijos y no cede, así que en una sola línea el que se comía el recorte era el TÍTULO: medido, a 375 px la card decía «Co…» y **a 320 px el título desaparecía entero** (`clientWidth 0`), dejando la card sin encabezado. Corregido con `wrap="wrap"` en el header de `SettingCard`: cuando no entran juntos, la acción baja a una segunda línea. Re-verificado: a 320 y 375 el título se lee completo (`scrollWidth 108 = clientWidth 108`), sin scroll horizontal, y a 1280 el botón sigue en la misma línea. Las otras tres cards, intactas.
  2. **Captura estirada**: `chatgpt-modo-desarrollador.webp` (463 px nativos) se renderizaba a 533 px — el texto de la UI ajena, que es justo lo que se vino a leer, salía blando. Corregido con un tope de ancho NATIVO por captura; re-medido en 1:1.
  3. **Listas sin marcador**: el preflight de Tailwind apaga `list-style` en todo `ul`/`ol`, así que las `List` de Mantine salían **sin viñeta y sin número** — los 5 sub-pasos del beat 3 se leían como párrafos sueltos. Corregido con `icon` explícito (mismo motivo por el que el consent pasa `IconCheck`/`IconLock`), y después con `styles={{ itemWrapper: { alignItems: "flex-start" } }}` porque Mantine centraba el marcador contra el ítem entero y en un ítem de 3 líneas el número quedaba al lado de la SEGUNDA. Queda `#guia.drawer.003` para que el tester lo mire de cerca.
- [2026-07-26 17:55] [feature-implementer] Gates de la tanda: **Vitest filtrado 18/18 verde** (`src/__tests__/components/guia-ia.test.ts`), `tsc` sin errores propios (los 5 de `layoutCorreo`/`plantillaDescarga` son del carril AJENO de correos, in-flight), `eslint` 0 errores (1 warning `<img>`, el mismo que ya tienen los componentes del storefront: el repo no usa `next/image`). NO se corrió la suite completa (rol del `feature-tester`). Sin commit.
- [2026-07-26 17:10] [feature-implementer] **D11 — el único bloqueo abierto, y es real** (detectado antes de escribir una línea de copy; queda al final del log porque es lo que espera respuesta): el AS rechaza hoy el callback de ChatGPT. `esRedirectUriPermitida` hace exact-match contra `CALLBACKS_HTTPS_PERMITIDOS` (solo Claude) y ChatGPT redirige a `https://chatgpt.com/connector/oauth/{callback_id}`, **dinámico por conector** ⇒ su DCR se rechaza y el carril nuevo no conecta en prod. NO se toca `redirectUris.ts` (I5 + política de seguridad del AS, D9 de ADR-0025): se implementa el carril completo y la decisión sube al usuario con diff propuesto.
- [2026-07-26 18:00] [feature-implementer] **Diff PROPUESTO para D11 (NO aplicado, espera respuesta del usuario)** sobre `src/server/mcp/redirectUris.ts`. La allowlist hoy es exact-match y ChatGPT usa un path dinámico por conector, así que el exact-match no alcanza; la forma mínima que lo habilita sin abrir la política es **anclar host + prefijo de path sobre la URL YA PARSEADA** (nunca `startsWith` sobre el string crudo, que aceptaría `https://chatgpt.com.evil.com/...`):

  ```diff
   export const CALLBACKS_HTTPS_PERMITIDOS: readonly string[] = [
     // Claude web / Claude Desktop (conectores MCP remotos).
     "https://claude.ai/api/mcp/auth_callback",
     "https://claude.com/api/mcp/auth_callback",
  +  // ChatGPT — callback LEGACY, sigue vigente solo para apps ya publicadas.
  +  "https://chatgpt.com/connector_platform_oauth_redirect",
   ];
  +
  +/**
  + * Callbacks HTTPS con **path dinámico por conector**: ChatGPT redirige a
  + * `https://chatgpt.com/connector/oauth/{callback_id}`, y el `{callback_id}` es distinto por cada
  + * instalación ⇒ no hay string exacto que listar. Se compara contra la URL YA PARSEADA (origin
  + * exacto + prefijo de path), nunca sobre el string crudo.
  + */
  +const PREFIJOS_HTTPS_PERMITIDOS: readonly { origin: string; path: string }[] = [
  +  { origin: "https://chatgpt.com", path: "/connector/oauth/" },
  +];
   ...
     // Caso 2: allowlist HTTPS exact-match sobre la URI COMPLETA tal como vino.
     if (url.protocol !== "https:") return false;
  -  return CALLBACKS_HTTPS_PERMITIDOS.includes(uri);
  +  if (CALLBACKS_HTTPS_PERMITIDOS.includes(uri)) return true;
  +
  +  // Caso 3: prefijo anclado. Sin query (un `?` abre canal para colar parámetros propios) y con
  +  // algo DESPUÉS del prefijo (el id del conector), nunca el prefijo pelado.
  +  return PREFIJOS_HTTPS_PERMITIDOS.some(
  +    (p) =>
  +      url.origin === p.origin &&
  +      url.pathname.startsWith(p.path) &&
  +      url.pathname.length > p.path.length &&
  +      url.search === "",
  +  );
   ```

  **NOTA (2026-07-26 19:00): este diff dejó de ser propuesta — el usuario respondió «opción A» ⇒ D12 y F05. Lo implementado es esto con un rigor más: los tests van PRIMERO (TDD) y el ADR-0025 gana su addendum.**

  Lo que compra: el carril ChatGPT conecta de verdad. Lo que cuesta: es una **relajación de la política del AS** (D9 de ADR-0025 dice explícitamente que agregar un cliente es «un cambio revisado y deployado») y merece su propio addendum al ADR + tests de la función pura (caso feliz, `chatgpt.com.evil.com`, prefijo pelado, con query). **Segunda incógnita que el diff NO resuelve**: la doc de OpenAI dice que ChatGPT manda `resource=` en `/authorize` y `/token` y espera ese valor en el `aud` del access token; nuestros tokens son **opacos** (no JWT, no tienen `aud`). Si ChatGPT lo exige duro, la conexión puede fallar igual y habría que verificarlo contra la cuenta real. Por eso el checklist E2E marca `#guia.carril.003` como bloqueado por D11 y NO como falla de la guía.
- [2026-07-26 19:00] [feature-implementer] **Arranca la tanda de cierre: F05 (opción A de D11 ⇒ D12) + drift de `frontend-conventions` (opción 1).** El usuario respondió las dos preguntas abiertas: (a) extender la política del AS para habilitar ChatGPT, como cambio revisado con su propio rigor; (b) aplicar el drift tal cual. Status `testing → implementing` mientras F05 está en vuelo. Features pendientes: **F05**. F01–F04 quedan como estaban (implementadas, `frontend-reviewer` APPROVE) — esta tanda no las toca.
- [2026-07-26 19:25] [feature-implementer] **F05 implementada (TDD, 5 ciclos rojo→verde de verdad)**. Archivos: `src/server/mcp/redirectUris.ts` (+ `PREFIJOS_HTTPS_PERMITIDOS` con el caso 3 anclado, + el legacy de OpenAI en la allowlist exact-match, docstrings del módulo y de la función reescritos), `src/__tests__/server/mcp/redirectUris.test.ts` (`mcp.oauth.004` acepta / `mcp.oauth.005` anclaje), `docs/adr/0025-…md` (addendum). Los ciclos: (1) callback dinámico → impl mínima origin+prefijo; (2) **prefijo pelado** → rojo → `length >`; (3) **query colada** → rojo → `search === ""`; (4) **legacy exact-match** → rojo → entra a la allowlist; (5) guards del anclaje. Nada se escribió "por si acaso": cada condición del predicado la pidió un test que fallaba.
- [2026-07-26 19:25] [feature-implementer] **Dos hallazgos de la implementación de F05, ninguno visible en el diff propuesto**:
  1. **Una assertion mía sobre-especificaba y la corregí en vez de forzar el código**: escribí que `…/oauth/abc?` (interrogación sola) debía rechazarse, y falla — `new URL()` deja `search === ""` para una query VACÍA. Antes de "arreglarlo" verifiqué cómo el AS arma la vuelta: `decision.ts` y `authorize.ts` construyen la redirección con `new URL(redirectUri)` + `searchParams`, así que un `?` pelado es inerte y no rompe el `?code=…&state=…`. Lo que la política prohíbe es **query con parámetros**, no el signo; el test dice eso ahora. Escribir la condición sobre el string crudo para que ese caso pasara habría sido justo la clase de comparación que este cambio existe para evitar.
  2. **Sondeo adversarial contra el módulo real** (17 URIs, `npx tsx` en el scratchpad, fuera del repo) para no confiar en mi lectura del parser. Confirmado: `chatgpt.com:8443` rechazado (el `origin` incluye el puerto), `chatgpt.com.` (FQDN con punto) rechazado, `%2e`/`%2f@` rechazados, traversal normalizado antes de comparar, `//chatgpt.com/…` no parsea. Los **tres casos no obvios** —`%2f@evil.com`, `%2eevil.com` y el puerto no-default— quedaron como tests permanentes: son exactamente los que un `startsWith` sobre el string crudo deja pasar, porque el string ARRANCA con `https://chatgpt.com` y el host real es otro.
- [2026-07-26 19:25] [feature-implementer] **Lo que F05 NO afloja, y conviene tener a mano al revisar**: el caso 3 ensancha qué se puede **registrar** por DCR, no cómo se **verifica** cada `/authorize` — `redirectUriVerificada` sigue exigiendo que el `redirect_uri` esté entre los que ESE cliente registró (igualdad de string) **y** que cumpla la política hoy. Quedó escrito en el docstring de la función y en el addendum, porque leyendo solo el predicado nuevo se puede creer lo contrario. Gates: `redirectUris` 5/5 + regresión del área OAuth (`registroCliente` + `decidirAuthorize` + `danceOauth`) **18/18**, `tsc --noEmit` limpio, `eslint` de los dos archivos limpio. Los 3 rojos que aparecieron al correr `src/__tests__/server/mcp/` entero son **timeouts de contención de DB** (`audit`, `toolsEscritura`): re-corridos **solos pasan 3/3 y 4/4**, y ninguno de los dos importa `redirectUris`.
- [2026-07-26 19:45] [feature-implementer] **`backend-reviewer` de F05: APPROVE** (4 dimensiones en A, cero blockers). Hizo su propia auditoría adversarial en vez de leer el diff: host (`chatgpt.com.evil.com`, subdominio, `chatgpt.com.br`, puerto, FQDN con punto, punycode/IDN), userinfo, percent-encoding, traversal, backslash, query/fragmento, orden de los early-returns, y **verificó el addendum contra el código** (tokens opacos sin claims en `tokens.ts`, ningún endpoint lee `resource`, `discovery.ts` no anuncia `resource_indicators_supported`) ⇒ las tres afirmaciones son ciertas. Confirmó además el punto que más me importaba dejar claro: los **tres** bordes que verifican el `redirect_uri` (`/authorize`, el SSR de `mcp-consent.tsx` y `decision.ts`) delegan en la MISMA `redirectUriVerificada`, así que no hay política duplicada que se desincronice. **Sus 2 nits, los dos aplicados**: (1) el separador `\` de autoridad estaba razonado y no testeado — lo sondeé contra el módulo real antes de escribir la assertion y el hallazgo es más fino de lo que parecía: el backslash **no crea userinfo** (`username === ""`), manda `@evil.com` al PATH, así que lo que rechaza el caso es el prefijo y NO el guard de la arroba; quedó testeado con esa razón escrita, para que nadie crea que lo cubre otro check. (2) el addendum ahora nombra el carve-out de I5 y por qué existe, para quien lea el ADR sin el plan al lado. `redirectUris` sigue 5/5.
- [2026-07-26 20:00] [feature-implementer] **Drift de `docs/agents/frontend-conventions.md`: APLICADO (opción 1 del usuario, «aplicar tal cual»)**. Los 3 patrones que el usuario enumeró, cada uno donde le corresponde por tema y no todos juntos al final: (1) **`List` de Mantine SIEMPRE con `icon` explícito** + `styles={{ itemWrapper: { alignItems: "flex-start" } }}` → § Mantine, la regla central, pegado a las otras reglas de Styles API, porque es un choque del stack (el preflight de Tailwind apaga `list-style`) y no un patrón de una pantalla; con el corolario de que el defecto NO se ve en el código ni en un ítem de una línea. (2) **`headerAction` de `SettingCard` + `wrap="wrap"`** → § Chrome del panel, junto al peso de los botones del header; escrito con la medición real (a 320 px el título desaparecía, `clientWidth 0`) y con la regla general que deja: en una fila donde conviven un texto que identifica y un control que actúa, el que sobrevive al ancho es el texto. (3) **capturas nunca estiradas + `BloqueCopiable`** → **sección nueva «Guía con capturas dentro del panel (Drawer de ayuda)»**, siguiendo la costumbre del doc de consolidar por feature; incluye el guion-como-data, el tope de ancho NATIVO, el recorte por privacidad como parte de producir la captura (no un retoque opcional), y que la dirección pública sale de `APP_CONFIG` y no de `window.location`.
- [2026-07-26 20:00] [feature-implementer] **Nota honesta sobre el origen del diff del drift**: el diff LITERAL no estaba en esta Bitácora — la entrada de las 17:30 solo lo menciona («drift de conventions») y el texto quedó en el mensaje final del implementer anterior, que no sobrevivió. Lo reconstruí desde (a) los 3 patrones que el usuario enumeró explícitamente al encargarlo, (b) el código vivo (`setting-card.tsx`, `guia-conecta-ia.tsx`) y (c) las razones ya escritas en las entradas de las 17:55. No inventé patrones nuevos ni amplié el alcance: son esos 3 y nada más. Si el usuario tenía en mente una redacción distinta, esto se corrige leyéndolo, no rehaciéndolo.
- [2026-07-26 20:00] [feature-implementer] ⚠️ **`frontend-conventions.md` tenía cambios sin commitear de OTRO carril** cuando llegué (el archivo se modificó en disco entre mi lectura y mi primera edición). Las 3 ediciones se aplicaron por match de string exacto, así que no pisaron nada: el `git diff` del archivo son **65 inserciones y 2 deleciones**, de las cuales lo mío son ~16 líneas y las 2 deleciones son las dos líneas que expandí. El resto es trabajo ajeno, intacto.
- [2026-07-26 20:05] [feature-implementer] **Tanda cerrada.** F05 implementada con `backend-reviewer` APPROVE y drift aplicado ⇒ status `implementing → testing` otra vez. Lo que queda para el `feature-tester`: los 13 checks de `tasks/e2e-guia-conecta-tu-ia.md` (F01–F04) más el desbloqueado `#guia.carril.003`, que **necesita al usuario** (cuenta ChatGPT con plan pagado + modo desarrollador, y contra PRODUCCIÓN — ChatGPT no alcanza `:3001`). Vitest de F05 corre en cualquier momento: es función pura. **NO corrí la suite completa** (es del tester) ni toqué nada fuera de los 6 archivos de esta tanda.
