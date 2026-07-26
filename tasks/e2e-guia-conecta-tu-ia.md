# E2E — Guía «Conecta tu IA» (Drawer de la card Conexiones IA)

Checks de navegador para `tasks/26-07-26-onboarding-guia-conecta-tu-ia.md`. Los ejecuta el
`feature-tester` con la skill `browser-verify`. Cada check tiene un ID que el plan referencia desde
sus Validaciones. Marcado `[x]` solo por el feature-tester.

> **Dev server**: un `next dev` en **:3001** (única instancia; memoria del proyecto). La pantalla es
> `/admin/configuracion` **con sesión** — el panel vive en el subdominio de una tienda
> (`<slug>.localhost:3001/admin/configuracion`, ADR-0022). La card «Conexiones IA» es la de abajo a
> la derecha en la grilla de 2 columnas.
>
> **La guía se abre desde el header de esa card**, no desde el estado vacío.

## F01 — El botón en el header de la card

- [ ] **guia.boton.001** — En `/admin/configuracion`, la card «Conexiones IA» muestra en su header,
  a la derecha del título, el botón subtle **«¿Cómo conecto una app de IA?»**. Verificar el layout en
  los **dos** estados de la card: con conexiones listadas y sin ninguna (estado vacío) — el header no
  se rompe ni el título se recorta a media palabra. Medir a **1280 px** y a **390 px** de ancho: en
  móvil la card es de ancho completo y el botón no debe empujar el título fuera de la card
  (`clientWidth` vs `scrollWidth` del título, no a ojo).

- [ ] **guia.boton.002** — Click en el botón abre el Drawer por la derecha; se cierra con la X y con
  Escape, y al cerrarlo la card queda **igual que antes** (la lista de conexiones sigue ahí, sin
  refetch visible ni salto de layout).

- [ ] **guia.cards.001** — Las otras tres `SettingCard` de la página (**Pagos (Flow)**, **Tu tienda**,
  **Campos del checkout**) se ven **idénticas** a antes del cambio: el header de `SettingCard` ahora
  envuelve ícono+título en un Group anidado, y lo que se verifica es que eso NO movió un píxel donde
  no hay `headerAction`. Comparar contra un screenshot previo si existe.

## F02 — El guion: 6 beats con capturas

- [ ] **guia.drawer.001** — El Drawer muestra los **6 beats en orden 1..6**, cada uno con su número
  en un círculo, su título y su cuerpo. El paso 2 muestra la **dirección de conexión**
  (`https://sorteatelo.cl/api/mcp`) en mono dentro de un inset.

- [ ] **guia.drawer.002** — **Las capturas no cargan hasta abrir el Drawer.** Con la pestaña de red
  abierta y la página recién cargada, no hay ninguna request a `/guia-ia/*.webp`; recién al abrir el
  Drawer aparecen. Ninguna llega **404** y todas responden `image/webp`. (Hoy son 4:
  `consent.webp`, `claude-conectores.webp`, `claude-agregar-conector.webp` en el carril Claude, y
  `chatgpt-modo-desarrollador.webp` en el de ChatGPT.)

- [ ] **guia.drawer.003** — **Marcadores de lista y capturas, mirados de cerca.** Los sub-pasos del
  paso 3 llevan número (`1.`…`5.`) en mono y los requisitos de «Antes de empezar» llevan viñeta —
  el preflight de Tailwind apaga los marcadores nativos, así que van como `icon` explícito, y
  Mantine los centraba contra el ítem ENTERO (en un ítem de 3 líneas el número quedaba al lado de la
  segunda). Verificar en un ítem **de 2 y de 3 líneas** que el marcador está a la altura de la
  PRIMERA línea. Y que **ninguna captura se ve estirada**: cada `<img>` debe renderizarse a lo sumo
  a su `naturalWidth` (la de ChatGPT es de 463 px nativos y antes se estiraba a 533).

- [ ] **guia.copiar.001** — El botón **«Copiar»** del paso 2 deja la dirección en el portapapeles
  (verificar leyendo el portapapeles, no solo que el botón cambie a «Copiada») y el botón vuelve a su
  estado normal después. Mismo check para el botón del acordeón de Claude Code, que copia el comando
  `claude mcp add …` con la MISMA dirección.

## F03 — Secciones complementarias

- [ ] **guia.secciones.001** — «Qué puedes pedirle» muestra los **5 prompts** y el bloque **«Lo que no
  va a poder hacer»** con sus 4 límites (publicar / ejecutar el sorteo / borrar / leer credenciales de
  Flow). Los 4 límites dicen **lo mismo** que la pantalla de consentimiento (`/mcp-consent`): si
  alguien edita uno de los dos lados, acá se nota.

- [ ] **guia.secciones.002** — El acordeón **«¿Usas Claude Code?»** está **colapsado por defecto** y al
  expandirlo muestra el comando de conexión completo, copiable.

- [ ] **guia.secciones.003** — «Si algo no resulta» muestra sus 2 ítems, y el primero dice la verdad
  verificada: **Claude funciona en cualquier plan, incluido el gratis** (un conector), y **ChatGPT
  exige plan pagado + modo desarrollador**. Este check existe porque el plan original afirmaba lo
  contrario para Claude (D10.1).

## F04 — El carril ChatGPT

- [ ] **guia.carril.001** — El selector de arriba cambia entre **Claude** y **ChatGPT**. Al cambiar,
  cambian: los **requisitos** de «Antes de empezar», el **paso 3** completo (título, pasos, capturas) y
  la **nota del paso 5**. Los pasos 1, 2, 4 y 6 quedan **iguales** en los dos carriles.

- [ ] **guia.carril.002** — El carril ChatGPT nombra el **modo desarrollador**, avisa que ChatGPT lo
  marca como «RIESGO ELEVADO», pide pegar la dirección **con el `/mcp` incluido** y advierte que
  dentro de **deep research** los conectores solo pueden leer. Su captura
  (`chatgpt-modo-desarrollador.webp`) se ve nítida y **no muestra ningún dato privado** — el recorte
  existe justamente porque la barra lateral de ChatGPT lista los chats del usuario.

- [ ] **guia.carril.003** — **Conexión real de punta a punta con ChatGPT.** ~~Bloqueado por D11~~ ⇒
  **DESBLOQUEADO por D12/F05** (la política del AS ya acepta el callback dinámico
  `https://chatgpt.com/connector/oauth/{id}`; ver el addendum del ADR-0025). Ahora es un check
  **pendiente de prueba con cuenta real del usuario**: exige plan pagado + **modo desarrollador**
  activado por su dueño, y la conexión se hace **contra producción** (el AS que ChatGPT alcanza es
  `sorteatelo.cl`, no `:3001`).
  Recorrido: modo desarrollador → `Plugins` → `+` → pegar `https://sorteatelo.cl/api/mcp` → el dance
  OAuth debe llegar al consent de Sortéatelo → autorizar → la conexión aparece en la card
  «Conexiones IA» del panel → pedirle algo de la whitelist y ver el cambio en la tienda.
  ⚠️ **Modo de falla CONOCIDO que no es un bug nuevo**: ChatGPT manda `resource=` y espera ese valor
  en el `aud` del access token; los tokens del AS son **opacos y no llevan `aud`**. Si el dance muere
  ahí, es el límite documentado en el addendum del ADR-0025 — anotarlo tal cual y NO tratarlo como
  regresión de la guía ni de la política.
