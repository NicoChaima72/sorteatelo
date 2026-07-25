---
slug: builder-tanda-3-arquitectura
status: planning              # planning | implementing | testing | done
owner: nicolas
created: 2026-07-25
related_adrs: [ADR-0016, ADR-0017, ADR-0018, ADR-0019, ADR-0020, ADR-0005, ADR-0008, ADR-0004]
related_context: [Tienda, Documento de página, Sección, Widget, Overlay, Editor MCP, Publicar, Organizador]

features:
  - id: F01
    behavior: "Motor de runs (texto rico estructurado, evolución B): RichTexto = { children: Run[], markDefs? } con marcas enum cerrado (fuerte/enfasis/acento/resaltado/escala) + links tipados discriminados (ancla|pagina|url validada); componente puro RunsTexto que renderiza runs a spans por token (jamás HTML del tenant); texto_rico migra string→runs on-read (v-bump lossless, look idéntico)"
    state: not_started

  - id: F02
    behavior: "Runs en hero y textos largos de widgets: hero.titulo/subtitulo aceptan runs con migrate-on-read que ABSORBE tituloAcento (palabra→run con marca acento/resaltado, lossless); lista curada de campos largos de otros widgets promovidos a runs; docs publicados renderizan byte-equivalente sin editar"
    state: not_started

  - id: F03
    behavior: "Editor de runs en el panel: contenteditable plaintext-only con toolbar de marcas (negrita/énfasis/acento/resaltado/escala) + diálogo de link tipado, que serializa DOM→runs y valida contra el MISMO Zod antes de mutar; pegar siempre texto plano; campos runs reemplazan a los TextInput/Textarea correspondientes en panel-edicion"
    state: not_started

  - id: F04
    behavior: "Multi-página backend + ruta: src/pages/[slug].tsx SSR anónimo cacheable (mismo pipeline que index, solo published, tienda PUBLICADA, 404 neutral) + use cases listar/crear/renombrar/eliminar página (slug validado + lista de reservados, tenant-scoped, $tx) + publicar/borrador por página (los use cases existentes parametrizados por slug) + columna StorefrontPage.enNav (schema-guardian) que suma la página al nav derivado"
    state: not_started

  - id: F05
    behavior: "Panel 'Páginas' en el editor (DockKey nuevo): lista de páginas del tenant con estado borrador/publicada, crear/renombrar/eliminar con slug validado, switch enNav, y switcher que recarga el editor+preview sobre ?pagina=<slug>; home no se puede eliminar ni renombrar"
    state: not_started

  - id: F06
    behavior: "Chrome editable (evolución C parte 2): Tenant.chromeJson (schema-guardian) validado por ChromeSchema Zod propio (header: layout/sticky/transparenteSobreHero/esquema + menu MenuItem[]; footer: columnas/links/texto) con nodos PINNED renderizados por plataforma fuera del doc (carrito/sesión en header; atribución + enlace a Bases ADR-0008 en footer — jamás removibles); menuItem discriminado ancla|pagina|url validada; chromeJson null ⇒ header/footer actuales byte-idénticos (no-op); ADR nuevo 'chrome global + nodo pinned' en estado propuesto"
    state: not_started

  - id: F07
    behavior: "Edición del chrome en el editor: panel 'Chrome' (DockKey nuevo) con forms de header/footer/menú que escriben chromeJson vía procedure tenant-scoped (validación Zod server-side); los pinned se muestran como items bloqueados con candado (visibles, no editables); el preview refleja el chrome"
    state: not_started

  - id: F08
    behavior: "Widget fila con slots tipados: nodoSeccion('fila') con reparto enum (50_50|66_33|33_66|33_33_33), columnas = arrays de nodos-HOJA de una union whitelist SIN fila (recursión imposible por construcción, profundidad máx 2); render Grid con spans del reparto que apila en móvil; hojas con id estable direccionable"
    state: not_started

  - id: F09
    behavior: "Editor de fila: el panel Secciones muestra la fila como sección con sub-lista por columna (agregar hoja desde whitelist, quitar, reordenar dentro del slot); seleccionar una hoja edita sus props con el mismo form-generator; todo emite mutaciones existentes (update_section_props sobre el nodo fila) o mutaciones dedicadas si el implementer lo justifica"
    state: not_started

  - id: F10
    behavior: "Responsive por nodo: EstiloSeccion gana movil? (Partial del subset de layout: padY/padTop/padBottom/altoMin/alinearVertical/ancho — mismos enums, jamás valores nuevos) + visibleEn (todos|desktop|movil, default todos); resuelto como CSS estático SSR-safe (custom props + media query en stylesheet, sin JS); defaults = render actual byte-idéntico"
    state: not_started

  - id: F11
    behavior: "Preview móvil en el editor: toggle desktop/móvil que encajona el iframe a 390px (solo preview, sin editar valores por breakpoint en canvas); el estado del toggle no afecta lo que se guarda"
    state: not_started

  - id: F12
    behavior: "Edición inline de texto sobre el canvas: contrato data-campo en los componentes de storefront (campos planos de 1er nivel), activo SOLO en modo preview tokenizado; click habilita contentEditable plaintext, blur emite postMessage al editor que dispara update_section_props (re-validado server-side); campos runs y anidados quedan fuera del inline (se editan en el panel)"
    state: not_started

  - id: F13
    behavior: "Undo/redo por snapshot-stack local (cap acotado, Ctrl+Z/Ctrl+Shift+Z) que restaura el documento vía mutación de reemplazo + patch en vivo; duplicar sección (mutación duplicate_section: clona el nodo con ids nuevos, incluye hojas de fila) con botón en la lista y atajo; Publicar jamás participa del stack"
    state: not_started

  - id: F14
    behavior: "Chat de IA como panel del dock (DockKey asistente): procedure tRPC server-side con tool-calling que traduce lenguaje natural a las MISMAS mutaciones/use cases del documento (nunca HTML/CSS libre, nunca publicar), gated por la membresía del editor, API key solo server-side; cada acción aplicada aparece en el canvas vía el patch en vivo; la selección actual viaja como contexto"
    state: not_started

  - id: F15
    behavior: "Cierre de tanda: una tienda demo ejercita TODO — página nueva ('sobre-mi') con fila 66/33 de texto_rico(runs con acento/link) + imagen, en el nav vía enNav/chrome editado, overrides móviles + visibleEn verificados a 390px, título editado inline, undo/redo y duplicar en vivo, y al menos una edición completa hecha SOLO por el chat de IA — validación E2E final del feature-tester"
    state: not_started
---

# Builder Tanda 3 — arquitectura: "se puede hacer de todo"

## Contexto

Las tandas 1 y 2 (`26-07-24-builder-tanda-1.md`, `26-07-25-builder-tanda-2-fidelidad.md`, ambas testing) cerraron la fidelidad visual: colorAcento, bicolor, ambiente, patrones, hero split con visual, carrusel, patch en vivo, auto-save y dnd ya existen. Lo que queda son las **evoluciones de ARQUITECTURA** del mapa `.scratch/page-builder/mapa-potencial-editores.md` (§3 A ya hecha; B/C/la 4ª pendientes + §4 segunda ola): texto rico estructurado con runs, multi-página + chrome editable, layout `fila` con slots, responsive por nodo, y la capa UX que falta (inline, undo/redo, duplicar, chat de IA). Directiva literal del usuario: *"la plataforma nos tiene que dejar hacer absolutamente de todo"* — dentro de los guardrails (§6 del mapa NO se re-litiga: cero CSS/HTML libre, todo enum/token curado).

El grill está delegado a la investigación multi-agente del mapa (mismo patrón que las tandas 1/2); este plan va **DIRECTO a implementación** por directiva. Las decisiones tácticas del planner van marcadas **REVISABLE** — no bloquean el arranque, pero el implementer debe registrar en Bitácora cualquier desvío. Estado del motor verificado en el read pass: schema de 2 niveles con 30 widgets, `EstiloSeccion` con overrides finos, migrate-on-read por nodo (`migrate.ts`), patch en vivo por postMessage con `MUTACIONES_QUE_RECARGAN`, dock genérico de 5 paneles, y **la DB YA soporta multi-página** (`StorefrontPage @@unique([tenantId, slug])` + `StorefrontPageVersion` anclada a `(tenantId, slug, revision)`).

## Decisiones

Tomadas del mapa (§2/§3/§4, aprobado por directiva) o por el planner (marcadas REVISABLE):

### Texto rico estructurado — runs (evolución B)

- **D1 — Subset propio estilo Portable Text, NO la librería.** `RichTexto = { children: Run[] (1–50), markDefs?: MarkDefLink[] (0–10) }.strict()`; `Run = { t: string 1–1000, m?: Marca[] (máx 4, sin duplicados), link?: id-de-markDef }.strict()`; `MARCAS_RUN = ["fuerte","enfasis","acento","resaltado","escala_lg","escala_xl"]` (enum CERRADO — la directiva pide fuerte/enfasis/acento/resaltado/escala; el planner desdobla escala en lg/xl, REVISABLE). `MarkDefLink = { id: string ≤64, destino: DestinoLink }` con `DestinoLink` discriminado: `{tipo:"ancla", ancla: enum CTA_ANCLAS}` | `{tipo:"pagina", slug: validado}` | `{tipo:"url", url: https ≤2048}` — jamás `<a href>` libre, jamás `javascript:` (la validación de URL reusa el criterio allowlist existente). Razón: mapa §3.B — un motor cierra negrita/itálica/palabra acentuada/highlight/precio destacado/links inline, y es MÁS seguro que HTML (Zod rechaza lo que no está en el enum).
- **D2 — Render por token, un solo componente puro.** `RunsTexto` (componente storefront puro) mapea marcas → estilos curados: `fuerte`=peso, `enfasis`=itálica, `acento`=token de la escala acento con fallback a marca (I-T2), `resaltado`=destacador como **background-image del propio span** (lección en memoria del proyecto — nunca capa aparte), `escala_*`=escala tipográfica relativa (em, jamás px). Links renderizan `<a>` SOLO desde el markDef resuelto (ancla→`#ancla`, pagina→`/slug`, url→href validado con rel noopener). Cero hex, cero style del tenant (I-A).
- **D3 — Migración on-read LOSSLESS `string → runs`, por widget con v-bump.** `texto_rico` v1→v2: cada bloque `texto: string` → `children: [{t: texto}]` (los límites de chars se conservan a nivel de suma, REVISABLE el detalle); `cita.autor` y `lista.items` quedan string (texto corto, sin ROI). Look publicado idéntico tras deploy sin editar (I-T3). El paso vive en `migrarNodo` (`migrate.ts`), patrón `aviso_barra` v1→v2.
- **D4 — Hero absorbe `tituloAcento` vía migrate (F02).** `hero.titulo`/`subtitulo` pasan a aceptar `RichTexto` (v-bump del hero): migrate-on-read convierte `titulo: string` + `tituloAcento: {palabra, estilo}` → runs donde la primera ocurrencia de la palabra lleva la marca equivalente (`acento`→`acento`, `resaltado`→`resaltado`, `gradiente`→ se conserva como caso especial del render del hero o marca propia, táctico REVISABLE). El campo `tituloAcento` desaparece del schema v nuevo (la migración lo consume — lossless). `destacado` (el "$3.000 + nota") **se CONSERVA como prop del hero** (es un slot de layout, no texto inline); su cifra se renderiza internamente con la marca `escala_xl` del sistema para unificar el motor. REVISABLE si el implementer encuentra más barato absorberlo del todo.
- **D5 (REVISABLE) — Qué otros campos se promueven a runs.** Criterio: campos de texto de límite ≥120 chars donde formatear tiene sentido editorial. Lista candidata mínima: `banner_cta.titulo`, `perfil_autora.bio` (si existe), `momento_ticket.nota`, `packs_precio.items[].descripcion` (si existe). El implementer confirma la lista contra `widgets.ts` real y la registra en Bitácora; cada promoción = v-bump lossless con migrate `string→[{t}]`. NO promover textos cortos (labels, etiquetas, ctas) — quedan string plano.
- **D6 — Editor contenteditable (F03), plaintext-only por construcción.** Un componente `EditorRuns` en el panel: contenteditable que solo admite texto + los spans de marca emitidos por NOSOTROS; toolbar aplica/quita marcas sobre la selección; pegar SIEMPRE pasa por `text/plain` (nunca HTML pegado); serialización DOM→runs normaliza (merge de runs adyacentes con marcas iguales, límites Zod) y el resultado se valida con el MISMO `RichTexto` schema client-side antes de emitir `update_section_props` (que re-valida server-side, I3). Diálogo de link: select de tipo + campo según rama (ancla=Select de CTA_ANCLAS, pagina=Select de páginas del tenant, url=TextInput validado). Sin lib nueva de rich-text (Tiptap/Lexical NO — I-T7): el caso es acotado (marcas planas, sin bloques anidados) y una lib entera contradice "simple y barato". REVISABLE con justificación escrita SOLO si el contenteditable nativo resulta inviable tras intento honesto.

### Multi-página + chrome (evolución C)

- **D7 — Ruta `src/pages/[slug].tsx`, mismo pipeline que `index.tsx`.** En el pages router las rutas estáticas (`checkout/`, `producto/`, `admin/`, `editor`, `login`, `dev*`, `api`) ganan precedencia sobre `[slug]` — igual se defiende server-side: lista de **slugs reservados** (todas las rutas estáticas + `home`, `api`, `www`, etc., reusando/ampliando el criterio de `slugTienda`/reservados existente) rechazada al CREAR la página (F04) y 404 en el SSR si alguien la tuviera. `getServerSideProps` reusa `getStorefrontProps` parametrizado por slug: tenant por subdominio server-side (I1/ADR-0005/0007), **solo `publishedJson`** (I5), tienda PUBLICADA, 404 neutral idéntico al de producto inexistente si no hay página publicada con ese slug. Modo preview tokenizado funciona igual que en home (`/{slug}?preview=...`).
- **D8 — Use cases de páginas, tenant-scoped y en $tx (F04).** `listarPaginas`, `crearPagina` (siembra `documentoInicial` como draft, slug validado kebab ≤64 + reservados, unique por `@@unique([tenantId, slug])` — carrera resuelta por el unique de DB), `renombrarPagina` (re-ancla el historial NO: las `StorefrontPageVersion` viejas quedan bajo el slug viejo — táctico REVISABLE: o se actualizan en la misma $tx o se documenta que el historial sigue al slug; el implementer decide con `schema-guardian` y lo registra), `eliminarPagina` (prohibido para `home`; borra la fila — el historial de versiones se conserva o cae en cascada según lo que decida con schema-guardian, REVISABLE). `getPagina`/`editarBorrador`/`publicarPagina`/`listarVersiones`/`rollback` existentes se **parametrizan por slug** (hoy asumen `home` por default — verificado que DB y versiones ya son per-slug). Todo gated por `exigirEditor` (misma membresía).
- **D9 — `enNav` = columna `StorefrontPage.enNav Boolean @default(false)`** (schema-guardian, aditiva no-op). El nav derivado (tanda 1 F05) se extiende: `derivarNav(secciones)` + páginas del tenant con `enNav=true` (label = nombre humano de la página, orden táctico REVISABLE) — así una tienda SIN chrome configurado igual puede tener "Sobre mí" en el menú. Cuando el chrome trae `menu` explícito (D10), **el menú del chrome manda** y `enNav` solo alimenta el modo derivado. Razón: no acoplar multi-página a chrome; cada evolución degrada sola.
- **D10 — Chrome global = `Tenant.chromeJson Json?`** (schema-guardian; Opción A del mapa). `ChromeSchema` Zod propio `.strict()`: `{ schemaVersion, header: { layout: enum, sticky: enum, transparenteSobreHero: bool, esquema: enum ESQUEMAS_FONDO, menu: MenuItem[] ≤8 }, footer: { columnas: enum, links: MenuItem[] ≤12, texto?: ≤200 } }` — enums exactos tácticos del implementer (REVISABLE), cero hex/URL libre. `MenuItem` = el `DestinoLink` de D1 + `etiqueta ≤20` (misma union — un solo vocabulario de destinos en toda la plataforma). Sub-menú de 2 niveles NO entra en esta tanda (1 nivel; el mapa lo permite pero no lo exige — REVISABLE). `chromeJson null` ⇒ el header/footer ACTUALES byte-idénticos (no-op, I-H). Lectura tolerante en render (patrón `leerDocumentoParaRender`): chrome podrido ⇒ chrome default, nunca 500.
- **D11 — Nodo pinned = render de PLATAFORMA, no nodo del doc.** El carrito + acción de sesión (header) y la atribución neutral + enlace a Bases del sorteo (footer, ADR-0008) **no existen dentro de `chromeJson`**: los renderiza `storefront-layout` incondicionalmente alrededor de lo configurable. No hay flag para apagarlos, no hay mutación que los toque — no-borrables por construcción (más fuerte que "protegidos"). En el editor se MUESTRAN como items con candado (F07) para que el Organizador entienda el layout completo. Esto + el chrome global son los dos conceptos nuevos de dominio → **ADR nuevo en estado `propuesto`** (el implementer lo redacta en `docs/adr/` al implementar F06; el usuario lo acepta o rechaza después).
- **D12 — El chrome se edita SOLO desde el editor (F07), sin tool MCP en esta tanda.** El chrome vive fuera del Documento de Página (columna de Tenant) ⇒ darle tool violaría I12 (MCP sin efectos fuera del documento) tal como está escrito. Procedure tRPC `setChrome` (o mutaciones finas, táctico) con validación Zod server-side + `exigirEditor`. Extender el alcance del MCP/asistente al chrome queda ANOTADO como candidato para cuando el ADR de D11 se acepte (REVISABLE — si el usuario quiere que el chat de IA edite el chrome, se decide ahí).

### Fila con slots tipados

- **D13 — `fila` es una SECCIÓN cuyo props contiene columnas de nodos-HOJA.** `filaProps = { reparto: enum ["50_50","66_33","33_66","33_33_33"], columnas: NodoHoja[][] }` con superRefine: `columnas.length` == columnas del reparto (2 o 3); cada slot 0–4 hojas. `NodoHojaSchema` = discriminated union **SEPARADA** que solo incluye la whitelist: `texto_rico`, `imagen_destacada`, `beneficios_grid`, `botones_sociales`, `estadisticas`, `separador`, `espaciador`, `banner_cta` (lista REVISABLE — el implementer la ajusta a lo que renderice bien angosto). `fila` NO está en `NodoHojaSchema` ⇒ **recursión imposible por construcción** (sección → fila → hoja, nunca 3 niveles — §6 del mapa). Cada hoja lleva `id` estable (direccionable para selección/inline/futuras mutaciones finas).
- **D14 — Render de fila: Grid con spans del reparto, stack en móvil.** Spans curados (50/50=6+6, 66/33=8+4, 33/33/33=4+4+4), `gap` del sistema; bajo el breakpoint móvil las columnas apilan en orden (comportamiento único, sin config). Las hojas se renderizan con el MISMO dispatch de widgets (reuso del switch de `render-pagina`, extraído a función si hace falta) pero SIN wrapper de sección propio (sin estilo de sección por hoja — el estilo vive en la fila; REVISABLE si alguna hoja necesita su fondo).
- **D15 — Editor de fila (F09): sub-lista, sin drag entre slots en esta tanda.** El panel Secciones muestra la fila expandible con sus columnas; por columna: agregar hoja (galería filtrada por whitelist), quitar, reordenar con ↑↓. Seleccionar una hoja abre sus props en el panel Editar (form-generator existente). Todas las escrituras van como `update_section_props` del nodo fila completo (el doc entero se re-valida igual, I3); mutaciones finas por-hoja SOLO si el implementer las justifica en Bitácora. Drag&drop de hojas entre slots queda para después (REVISABLE).

### Responsive por nodo

- **D16 — `movil` es un Partial del SUBSET de layout, mismos enums.** `EstiloSeccion.movil?: { padY?, padTop?, padBottom?, altoMin?, alinearVertical?, ancho? }.strict()` — solo layout; `fondo`/`entrada`/`divisor` NO se overridean por breakpoint (snowflake + rompe la simplicidad LLM, §6). `visibleEn: enum ["todos","desktop","movil"] default "todos"` como campo hermano. Ausentes ⇒ resolver actual byte-idéntico (I-H). El mapa §2 marca "overrides por breakpoint editables uno a uno" como no-deseado **en el canvas** — esto es coherente: el modelo/panel los soporta como sub-sección "Móvil" acotada; el canvas nunca edita por breakpoint (D18).
- **D17 (REVISABLE) — Implementación CSS estática, sin JS.** Inline styles no admiten media queries ⇒ el wrapper emite **CSS custom properties** (`--sx-pt`, `--sx-pt-m`, …) + clases de plataforma en stylesheet global con `@media (max-width: <breakpoint del sistema>)` que aplican `var(--sx-*-m, var(--sx-*))`. `visibleEn` = clases `display:none` por media query (estático, CLS controlado: el slot simplemente no existe en ese ancho, no aparece-tarde). SSR-safe, cero hidratación extra. El implementer alinea el breakpoint con los `screens` Tailwind↔Mantine existentes.
- **D18 — Preview móvil (F11) = SOLO visual.** Toggle desktop/390px que encajona el iframe (width fija + borde de dispositivo simple). No cambia qué se edita ni qué se guarda; no hay "modo edición móvil". Tablet 768px NO entra (el mapa lo lista pero la directiva pide móvil — REVISABLE agregarlo si sale gratis con el mismo toggle).

### UX del editor

- **D19 — Inline editing (F12) por contrato `data-campo`, MVP campos planos.** Los componentes de storefront anotan sus textos planos de 1er nivel con `data-campo="<nombre-prop>"` (y `data-nodo` ya existe vía id renderizado). SOLO en modo preview tokenizado, un hook del runtime activa: click → `contentEditable="plaintext-only"` (con fallback), blur/Enter → postMessage `{tipo:"inline", nodoId, campo, valor}` al editor (mismo canal same-origin del patch, I-T5 espejo: el EDITOR también valida origin y NUNCA confía — el valor pasa por el Zod del widget al emitir `update_section_props`, y el server re-valida, I3). Campos runs (D1) y objetos anidados quedan FUERA del inline en esta tanda (se editan en el panel) — REVISABLE en tanda futura. El SSR público anónimo no lleva ni el hook ni los atributos activos (data-campo inerte o ausente, táctico).
- **D20 — Undo/redo (F13) = snapshot-stack CLIENTE, cap ~30.** Cada mutación exitosa pushea el documento previo al stack; Ctrl+Z emite la mutación de reemplazo del documento (`apply_page` — ya existe y re-valida todo) con el snapshot anterior + patch en vivo (el implementer saca `apply_page` de `MUTACIONES_QUE_RECARGAN` SOLO para el camino undo/redo, o patchea manualmente — táctico REVISABLE); redo espejo. El stack vive en memoria del editor (se pierde al recargar — aceptable MVP, mapa §4: "snapshot-stack fácil, 95%"). Publicar/rollback de historial NO entran al stack. `duplicate_section`: mutación NUEVA en la union de `mutaciones.ts` (clona nodo con ids nuevos, incluidas hojas de fila; inserta después del original) + botón en la lista + Ctrl+D. MCP no gana tool (D16 tanda 1: el vocabulario de mutaciones internas ≠ tools; apply_page cubre al MCP).
- **D21 (REVISABLE, decisión del planner por directiva "decide y marca REVISABLE") — El chat de IA (F14) NO reusa el MCP server HTTP; es un procedure tRPC con tool-calling server-side.** Razones: (a) el MCP server autentica por Bearer de OPERADOR (`MCP_OPERADOR_TOKEN`) — exponerlo al navegador del Organizador rompería el modelo de auth; (b) el loop necesita la sesión/membresía del editor (mismo `exigirEditor`), que tRPC ya da; (c) las TOOLS son las mismas funciones de dominio — se reusa la IMPLEMENTACIÓN (use cases + `outlineDe`/`mcpListStyleOptions`/`mcpListWidgetTypes` de `tools.ts`), no el transporte. Diseño: procedure `pagebuilder.asistente` (input: historial acotado + página + seleccionId opcional como contexto), server-side llama a la API de Anthropic con tool-calling en loop acotado (~8 iteraciones), toolset = lecturas (outline/página/widgets/estilos/productos) + mutaciones del DOCUMENTO de la página abierta (add/move/remove/duplicate/update_props/set_style/set_page_theme/set_section_nav). **NUNCA publicar** (I6), nunca chrome/páginas/colorAcento en esta tanda (D12). API key en env server-side (`ANTHROPIC_API_KEY` o el nombre que el implementer fije con backend-reviewer), jamás al cliente. Modelo/costos/streaming: el implementer DEBE cargar la skill `claude-api` antes de elegir modelo y parámetros (no decidir de memoria); MVP sin streaming (respuesta = texto + lista de acciones aplicadas), REVISABLE. Client: `DockKey:"asistente"` con historial de chat; tras cada respuesta, refetch del borrador + los patches ya llegaron en vivo (las mutaciones pasaron por `mutar`… o por el use case directo — táctico: si el loop server-side aplica mutaciones fuera del procedure `mutar`, el editor hace refetch + postMessage patch manual al cerrar la respuesta).
- **D22 — Orden de fases**: runs primero (motor de contenido, F01→F02→F03), después multi-página (F04→F05) y chrome (F06→F07) que la consume (menuItem tipo pagina), después fila (F08→F09), responsive (F10→F11), y la capa UX (F12, F13, F14 — independientes entre sí; F14 puede adelantarse si conviene, solo depende del motor actual). F15 cierra. Cada fase termina con gate propio (tsc + vitest filtrado) + reviewers de la fase; `change-set-reviewer` al cierre de cada fase antes de commit.

## Plan

**Fase 0 — Runs, el motor (evolución B):**

1. `widgets.ts`: `MARCAS_RUN`/`RunSchema`/`MarkDefLinkSchema`/`DestinoLinkSchema`/`RichTextoSchema` (D1) + `texto_rico` v2 (bloques con `children`); `migrate.ts` paso `texto_rico` v1→v2 lossless (D3); componente `RunsTexto` + wiring en `texto-rico.tsx` (D2); vocabulario en `mcpListStyleOptions`/descripciones (D16 tanda 1: tools existentes ya editan runs vía update_section_props). (F01)
2. Hero v-bump: `titulo`/`subtitulo` → `RichTexto`, migrate absorbe `tituloAcento` (D4); lista curada de campos largos promovidos (D5) con sus migrates; render de hero/banner/etc. vía `RunsTexto`; regresión de equivalencia sobre los docs seed/replicas. (F02)
3. `EditorRuns` (contenteditable + toolbar + diálogo de link, D6) + integración en `panel-edicion.tsx` (los campos runs dejan de caer al path "editar por asistente"); serialización DOM↔runs con normalización + validación client del mismo Zod. (F03)

**Fase 1 — Multi-página:**

4. Schema: `StorefrontPage.enNav` (D9) — `schema-guardian` + db push aditivo. Use cases `listarPaginas`/`crearPagina`/`renombrarPagina`/`eliminarPagina` (D8) + parametrización por slug de getPagina/editarBorrador/publicarPagina/historial; `src/pages/[slug].tsx` (D7) con reservados + 404 neutral + preview tokenizado; `derivarNav` extendido con páginas enNav (D9). (F04)
5. Panel "Páginas" (DockKey nuevo): lista + crear/renombrar/eliminar + switch enNav + switcher `?pagina=` que recarga editor+preview; home protegida. (F05)

**Fase 2 — Chrome:**

6. Schema: `Tenant.chromeJson Json?` (D10) — `schema-guardian`. `ChromeSchema` + `MenuItem` (D10) en `~/lib/pagebuilder` (o módulo `chrome.ts` propio); render: `storefront-layout` consume el chrome resuelto (SSR, lectura tolerante) con **pinned de plataforma** (D11) alrededor; null ⇒ byte-idéntico actual; menú del chrome manda sobre nav derivado. **ADR `propuesto`**: chrome global + nodo pinned (D11). (F06)
7. Panel "Chrome" (DockKey nuevo) + procedure `setChrome` tenant-scoped (D12); pinned visibles con candado; preview refleja el chrome (recarga o patch, táctico). (F07)

**Fase 3 — Fila:**

8. `NodoHojaSchema` whitelist + `filaProps` con reparto/superRefine (D13) + registro/union/`WIDGET_META`; render `fila.tsx` Grid con spans + stack móvil (D14), dispatch de hojas reusado. (F08)
9. Editor: sub-lista de fila en panel Secciones + selección de hoja → form-generator; galería filtrada por whitelist al agregar hoja; todo por `update_section_props` (D15). (F09)

**Fase 4 — Responsive:**

10. `EstiloSeccion.movil` + `visibleEn` (D16); resolver CSS custom props + clases con media queries en stylesheet (D17); sub-sección "Móvil" en el panel de estilo; vocabulario MCP. (F10)
11. Toggle preview móvil 390px en la barra del editor (D18). (F11)

**Fase 5 — UX:**

12. Inline editing: contrato `data-campo` en los componentes con campos planos + hook de preview + postMessage validado + `update_section_props` (D19). (F12)
13. Undo/redo snapshot-stack + atajos + mutación `duplicate_section` + botón duplicar (D20). (F13)
14. Chat de IA: procedure `asistente` con tool-calling (D21 — cargar skill `claude-api` antes de elegir modelo), env server-side, panel dock con historial + acciones aplicadas en vivo. (F14)

**Fase 6 — cierre:**

15. Demo integral sobre una tienda demo (NO autora): página "sobre-mi" con fila 66/33 (texto_rico con runs acento+link | imagen), enNav + chrome con menú explícito, overrides móviles + visibleEn, edición inline, undo/redo, duplicar, y una edición completa dictada SOLO al chat de IA. Verificación lado a lado desktop/390px + regresión de las tiendas existentes (no-op). (F15)

## Validaciones

### F01 — motor de runs + texto_rico v2

**Vitest**:
- [ ] `RichTextoSchema` parsea runs con marcas del enum y links por markDef; marca fuera del enum, HTML en `t`, markDef huérfano/duplicado, url `javascript:`/http-no-https, campo extra ⇒ rechazo `.strict()`
- [ ] `RunsTexto` renderiza cada marca a su estilo por token (acento con fallback a marca; resaltado como background del propio span; escala en em) y los 3 tipos de link a su href seguro — cero hex, cero HTML del tenant
- [ ] Migrate `texto_rico` v1→v2 es lossless: un doc v1 publicado migra on-read y renderiza texto idéntico (mismo contenido visible); el paso normaliza sin escribir a DB
- [ ] Un doc v2 con runs inválidos en render público se descarta tolerante (sección omitida, página viva — patrón leerDocumentoParaRender)

**E2E**:
- [ ] Una sección texto_rico con palabra en acento + highlight + link a ancla se ve correcta en preview y publicada (sin regresión de las tiendas seed)

### F02 — runs en hero y textos largos

**Vitest**:
- [ ] Migrate del hero absorbe `tituloAcento`: hero viejo con `{palabra, estilo}` migra a runs con la marca equivalente sobre la primera ocurrencia; hero sin tituloAcento migra a `[{t}]` plano; ambos lossless
- [ ] Los docs de las réplicas/seeds actuales parsean tras el v-bump y su render es equivalente (regresión de equivalencia)
- [ ] Cada campo promovido de la lista D5 parsea runs y su migrate string→runs es lossless

**E2E**:
- [ ] La réplica `prueba` (landing_idol) sigue mostrando "enriquecer" dorado tras el deploy SIN editar (migración no-op visible)

### F03 — editor contenteditable de runs

**Vitest**:
- [ ] La serialización DOM→runs normaliza (merge de runs adyacentes iguales, sin spans vacíos) y el resultado parsea contra `RichTextoSchema`; pegar HTML entrega solo texto plano
- [ ] Aplicar/quitar una marca sobre una selección produce los runs esperados (helpers puros testeados)

**E2E**:
- [ ] En el editor: escribir un título, marcar una palabra en acento, resaltar otra, insertar link a ancla — el canvas lo refleja en vivo (patch) y publicar lo hace visible en el SSR público

### F04 — multi-página backend + [slug].tsx

**Vitest**:
- [ ] `crearPagina` valida slug (kebab, ≤64, reservados rechazados: admin/api/checkout/producto/editor/login/home/…), respeta el unique (tenantId, slug) y siembra draft con `documentoInicial`; sin membresía ⇒ FORBIDDEN
- [ ] `eliminarPagina`/`renombrarPagina` prohíben `home`; renombrar decide y testea el destino del historial de versiones (D8)
- [ ] El SSR de `[slug]` sirve SOLO published de tienda PUBLICADA del tenant del subdominio; página inexistente/despublicada/slug reservado ⇒ 404 neutral; cross-tenant imposible por construcción (tenant server-side)
- [ ] `derivarNav` incluye páginas con `enNav=true` y las excluye con false; sin páginas extra el nav es idéntico al actual (no-op)

**E2E**:
- [ ] `demo.localhost:3001/sobre-mi` publicada responde 200 con el chrome del tenant; el mismo slug en OTRO tenant da 404

### F05 — panel Páginas

**Vitest**:
- [ ] (los use cases quedan cubiertos en F04; UI sin vitest si es solo wiring — el implementer decide y anota)

**E2E**:
- [ ] Crear página desde el panel, editarla (el switcher cambia editor+preview a `?pagina=`), publicarla, toggle enNav la mete al menú; home no ofrece eliminar/renombrar

### F06 — chromeJson + render con pinned

**Vitest**:
- [ ] `ChromeSchema` parsea header/footer/menu con enums y MenuItem discriminado; url no-https, etiqueta >20, item extra, hex ⇒ rechazo `.strict()`
- [ ] `chromeJson null` ⇒ el layout resuelto es byte-idéntico al actual (regresión de equivalencia); chrome podrido ⇒ chrome default tolerante (nunca 500)
- [ ] El render del header/footer SIEMPRE incluye carrito+sesión y atribución+enlace a Bases sin importar el contenido de chromeJson (pinned por construcción — no existe input que los quite)
- [ ] Menú del chrome presente ⇒ manda sobre el nav derivado; menuItem tipo pagina resuelve a `/slug`, tipo ancla a `#ancla`

**E2E**:
- [ ] Tienda demo con header sticky + esquema oscuro + menú explícito (ancla+página+url externa) renderiza el chrome en home Y en `/sobre-mi` (consistencia entre páginas); carrito/sesión/Bases visibles siempre

### F07 — edición del chrome en el editor

**Vitest**:
- [ ] `setChrome` valida contra `ChromeSchema` server-side y exige membresía; input inválido no escribe

**E2E**:
- [ ] Editar el menú y el esquema del header desde el panel Chrome se refleja en el preview; los pinned aparecen con candado y no son editables

### F08 — widget fila

**Vitest**:
- [ ] `filaProps` parsea reparto+columnas coherentes (superRefine: 2 columnas para 50_50/66_33/33_66, 3 para 33_33_33); slot con >4 hojas, hoja fuera de la whitelist, y **una fila dentro de una fila ⇒ rechazo** (recursión imposible)
- [ ] El render emite los spans del reparto y las hojas por el dispatch existente; en móvil apila (clase/estructura verificable)
- [ ] Migración no-op: docs sin fila no cambian; `MAX_SECCIONES`/límites globales siguen respetados

**E2E**:
- [ ] Fila 66/33 con texto_rico + imagen_destacada se ve en 2 columnas desktop y apilada a 390px

### F09 — editor de fila

**E2E**:
- [ ] Desde el panel: agregar fila, poblar sus slots desde la galería filtrada, reordenar hojas con ↑↓, seleccionar una hoja y editar sus props; todo visible en vivo; la galería NO ofrece fila dentro de fila

**Vitest**:
- [ ] Helpers puros de manipulación de columnas (agregar/quitar/reordenar hoja → props nuevos del nodo fila) testeados

### F10 — responsive por nodo

**Vitest**:
- [ ] `EstiloSeccion.movil` acepta SOLO el subset de layout (fondo/entrada en movil ⇒ rechazo); `visibleEn` default `todos`; ausentes ⇒ resolver byte-idéntico al actual (no-op)
- [ ] El resolver emite las custom props desktop y móvil correctas; `visibleEn:"desktop"` emite la clase de ocultamiento móvil (y viceversa); todo CSS estático sin hex

**E2E**:
- [ ] Sección con padY distinto en móvil + otra con `visibleEn:"desktop"`: a 390px el padding cambia y la segunda no existe; en desktop todo igual

### F11 — preview móvil

**E2E**:
- [ ] El toggle encajona el iframe a 390px y de vuelta; no altera el documento ni el auto-save

**Vitest**:
- [ ] (no aplica — UI pura del editor)

### F12 — edición inline

**Vitest**:
- [ ] El mensaje inline entrante al editor se valida (origin + shape + campo permitido del widget) antes de emitir la mutación; valor con HTML se aplana a texto plano; campo no-plano ⇒ ignorado
- [ ] El SSR público anónimo no activa contentEditable (el hook solo corre en preview tokenizado)

**E2E**:
- [ ] Click en el título del hero en el canvas → editar → blur: el borrador se actualiza (panel en sync) y el canvas no recarga; en la tienda pública el texto NO es editable

### F13 — undo/redo + duplicar

**Vitest**:
- [ ] `duplicate_section` clona el nodo con ids NUEVOS (incluidas hojas de fila) e inserta después del original; el doc resultante parsea; ids únicos verificados
- [ ] El stack de snapshots (helper puro) pushea/pop con cap y no incluye publicar

**E2E**:
- [ ] Editar → Ctrl+Z revierte en el canvas en vivo → Ctrl+Shift+Z rehace; duplicar una sección la repite debajo con contenido idéntico y edición independiente

### F14 — chat de IA

**Vitest**:
- [ ] El procedure exige membresía; el toolset NO contiene publicar ni efectos fuera del documento; el loop corta en el máximo de iteraciones; sin API key configurada ⇒ error limpio sin volcar secretos
- [ ] Cada tool-call de mutación pasa por el MISMO borde Zod/use case que el editor (test de que una instrucción que produce props inválidas rechaza sin escribir)

**E2E**:
- [ ] En el dock: "ponle fondo bicolor a la sección del sorteo y destaca la palabra sorteo en el título" ⇒ el asistente aplica las mutaciones, el canvas las muestra en vivo, y el historial lista las acciones; el borrador queda consistente (undo disponible)

### F15 — cierre integral

**E2E**:
- [ ] El recorrido completo de la Fase 6 (página nueva + fila + runs + chrome + responsive + inline + undo + duplicar + chat) pasa en una tienda demo; las tiendas existentes (`autora`, `prueba`, `bcac`, `demo-*`) renderizan idéntico a antes de la tanda (migración no-op end-to-end)

**Vitest**:
- [ ] Suite completa del área pagebuilder/editor/styles verde (regresión total)

## Invariantes

Heredados INTACTOS: I1–I12 del plan padre (`26-07-17-page-builder.md`), I-A..I-I del v2, I-T1..I-T8 de la tanda 1 — tenancy server-side, referencias-no-copias, sin HTML/CSS/URL libre, público solo desde published, publicar humano explícito, migrate-on-read lazy, $tx + lock optimista, aditivo, MCP sin efectos fuera del documento, cero hex/fuente libre, reduced-motion colapsa todo, CLS=0, SSR-visible, theming per-tenant, editor sin lógica de dominio. Además:

- I-U1: **Los runs son MÁS seguros que HTML, siempre.** `t` es texto plano; marcas y destinos son enums/uniones cerradas; el contenteditable jamás persiste HTML (pegar = text/plain; serializar = normalizar + validar con el mismo Zod). Ninguna rama del sistema de runs emite `dangerouslySetInnerHTML`.
- I-U2: **Pinned por construcción**: carrito, acción de sesión, atribución y enlace a Bases (ADR-0008) se renderizan por plataforma FUERA de `chromeJson` — no existe input, mutación ni doc que los quite o esconda. El checkout/carrito/disclaimer JAMÁS son editables ni removibles.
- I-U3: **`[slug].tsx` fail-closed**: solo published, solo tienda PUBLICADA, tenant del subdominio server-side, slugs reservados rechazados al crear Y al servir, 404 neutral idéntico al resto.
- I-U4: **Recursión imposible**: `NodoHojaSchema` no contiene `fila`; profundidad máx 2 (sección → fila → hoja). Nunca box-model libre.
- I-U5: **Responsive con los MISMOS enums**: `movil` solo overridea el subset de layout; jamás valores nuevos, px, ni fondo por breakpoint. `visibleEn` es CSS estático (nunca render condicional client-side que rompa SSR/CLS).
- I-U6: **El asistente de IA solo habla mutaciones**: mismo borde Zod + mismos use cases + misma membresía que el editor; nunca publicar, nunca efectos fuera del documento de la página abierta, API key exclusivamente server-side (jamás en respuesta, log ni cliente — patrón FlowCredential ADR-0006).
- I-U7: **ZONA PROHIBIDA intacta**: cero ediciones en `src/pages/admin/*` y `src/components/admin/*`. `dev-ref/` tampoco se toca.
- I-U8: **Migración no-op total**: todo v-bump (texto_rico, hero, campos D5) lleva migrate-on-read LOSSLESS; `chromeJson`/`enNav` null/default ⇒ comportamiento actual byte-idéntico; ningún tenant publicado cambia visualmente por el deploy sin editar y publicar. `db push` solo aditivo, con `schema-guardian` antes.
- I-U9: **Mapa §6 "Lo que NUNCA" no se re-litiga**: sin CSS/HTML/JS libre, sin posicionamiento absoluto, sin anidamiento N-niveles, sin gradiente/mesh libre, sin SVG/Lottie del tenant, sin timelines, sin captura de emails, sin overrides por breakpoint editables uno a uno en canvas.
- I-U10: **Sin libs nuevas salvo justificación escrita en Bitácora.** Candidatas previsibles: SDK de Anthropic (F14 — autorizada por diseño, elegir con la skill `claude-api`). Tiptap/Lexical/ProseMirror NO (D6). dnd para fila NO en esta tanda (D15).

## Out of scope

- **Todo lo del mapa §6** (nunca) — cerrado, no se re-argumenta.
- Objeto-asset con srcset responsivo, parallax por elemento, ken burns, reveal mask, escenas sticky, video de fondo, templates al crear, preview compartible con expiración, zoom del canvas, breakpoint tablet en el toggle (salvo que salga gratis, D18), submenús de 2 niveles (D10), drag de hojas entre slots (D15), inline editing de campos runs/anidados (D19), 404 temática, modal de bienvenida, FAB generalizado.
- Tool MCP para chrome/páginas/colorAcento (D12, I12) — ANOTADO como candidato post-ADR.
- Streaming/persistencia del historial del chat de IA (MVP en memoria del panel, REVISABLE).
- Pack de tickets (decisión de producto pendiente del usuario, tanda 2 F08).
- Campos nuevos en el panel admin (zona prohibida; el input admin de colorAcento sigue ANOTADO de tanda 1).
- Validación legal/abogado del contenido de páginas nuevas (F10 del roadmap, ajeno).

## Especialistas a consultar

- `schema-guardian` — `StorefrontPage.enNav` (F04), `Tenant.chromeJson` (F06), y el destino del historial en renombrar/eliminar página (D8).
- `backend-reviewer` — use cases de páginas + SSR de `[slug].tsx` (F04), `setChrome` (F07), el procedure del asistente + manejo de API key + toolset acotado (F14), superficie postMessage inline (F12).
- `frontend-reviewer` — `RunsTexto` y el `EditorRuns` (F01/F03), chrome render + pinned con candado (F06/F07), fila desktop/móvil (F08/F09), responsive resolver + preview móvil (F10/F11), inline/undo/duplicar (F12/F13), panel del chat (F14).
- `change-set-reviewer` — cierre de cada fase antes de commit.
- `troubleshooter` — bugs de contenteditable/selección/serialización (F03) y de postMessage/hidratación (F12).
- `feature-tester` — Vitest completo + E2E browser por fase; F15 es SU validación integral de cierre.
- Skill `claude-api` — OBLIGATORIA para el implementer antes de elegir modelo/parámetros del asistente (F14). Skill `tdd` para la descomposición red→green de cada fase.

## Bitácora

- [2026-07-25 21:30] [planner-grill] Arranque Tanda 3 (arquitectura). Directiva del usuario: las 4 evoluciones (runs, multi-página+chrome, fila, responsive) + UX (inline, undo/redo, duplicar, chat IA), "la plataforma nos tiene que dejar hacer absolutamente de todo", plan DIRECTO a implementación, todo táctico REVISABLE — grill delegado al mapa `.scratch/page-builder/mapa-potencial-editores.md` (§2 matriz, §3 evoluciones B/C/4ª, §4 UX, §6 nunca — no re-litigado), mismo patrón que tandas 1/2. Read pass: INDEX, mapa completo, `_template.md`, tanda-1 completa (D1–D17, I-T1..T8, Bitácora con los 11 diffs de fidelidad), tanda-2 (D1–D10, F01–F13), `schema.ts` (union 30 widgets, TemaSchema, nodoSeccion con estilo+nav), `widgets.ts` (EstiloSeccionSchema con padTop/padBottom/altoMin/anchoFondo, BloqueTexto, heroProps con tituloAcento/eyebrow/destacado), `migrate.ts` (migrarNodo/migrarOverlay, leerDocumentoParaRender tolerante), `editor-pagebuilder.tsx` (DockKey ×5, MUTACIONES_QUE_RECARGAN, patch postMessage), `prisma/schema.prisma` (Tenant.colorAcento/chrome-no-existe; StorefrontPage @@unique[tenantId,slug] + versiones per-slug ⇒ DB multi-página LISTA), `src/pages/**` (rutas estáticas que ganan a [slug]), `src/app/api/mcp/[transport]/route.ts` (15 tools reales, no 12).
- [2026-07-25 21:30] [planner-grill] Decisiones propias del planner (todas REVISABLES, registradas en D*): escala desdoblada en escala_lg/escala_xl (D1); `destacado` del hero se CONSERVA como prop (slot de layout) y solo su render usa la marca escala (D4); `enNav` como columna de StorefrontPage y no como sugar del chrome — multi-página degrada sin chrome (D9); pinned = render de plataforma FUERA de chromeJson, no flag "no-borrable" (D11 — más fuerte por construcción); chrome sin tool MCP por I12 hasta que el ADR se acepte (D12); whitelist de hojas de fila (D13); responsive vía custom props + media queries en stylesheet porque inline styles no admiten @media (D17); **chat de IA = procedure tRPC con tool-calling reusando use cases, NO el MCP server HTTP** (D21 — el Bearer de operador no puede viajar al navegador del Organizador; decisión pedida explícitamente por la directiva, marcada REVISABLE).
- [2026-07-25 21:30] [planner-grill] Candidato a ADR detectado y encargado al implementer en F06: "chrome global + nodo pinned" en estado `propuesto` (dos conceptos de dominio nuevos, mapa §3.C). El usuario lo acepta/rechaza tras verlo.
- [2026-07-25 21:30] [planner-grill] Plan escrito (15 features, 7 fases, gates por fase). Por directiva va DIRECTO a implementación; decisiones nuevas no cubiertas por D1–D22 ni por los invariantes ⇒ el implementer PARA y pregunta, o marca REVISABLE en Bitácora si es puramente táctico.
