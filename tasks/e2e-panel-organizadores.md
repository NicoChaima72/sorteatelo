# E2E — Panel de Organizadores (fase F05 del roadmap)

Checks de navegador para el panel de administración (`tasks/26-07-16-panel-auth-organizadores.md`).
Los ejecuta el `feature-tester` con la skill `browser-verify`. Cada check tiene un ID que el plan
referencia desde sus Validaciones. Marcado `[x]` solo por el feature-tester.

> **Bloqueo mayoritario — OAuth real (I9)**: casi todos los flujos con sesión requieren el **OAuth
> client de Google Cloud** (los `GOOGLE_CLIENT_ID/SECRET` de `.env` son placeholders). Crear ese client
> es trámite del usuario; el tester PARA con **AWAITING USER** al llegar a la pantalla de Google. El
> ÚNICO check verificable HOY sin OAuth es el redirect sin sesión.
>
> **Dev server**: hay un `next dev` en **:3001** (NO :3000 — ahí corre otro proyecto del usuario). Un
> solo dev server (memoria del proyecto). Login/host per `browser-verify`.

## Verificable ahora (sin OAuth)

- [ ] **panel.auth.redirect.001** — Visitar las 5 rutas del panel SIN sesión redirige a `/login`.
  Navegar (sin cookie de sesión) a `/admin`, `/admin/productos`, `/admin/ventas`, `/admin/sorteo`,
  `/admin/configuracion` en el apex (`localhost:3001`). Cada una ⇒ redirect 307/302 a `/login`
  (lo aplica `requireSession` en `getServerSideProps`). No requiere OAuth: solo verifica el guard.
  > ⏳ [feature-tester 2026-07-17] NO verificado en esta corrida (instrucción "NO browser"). El guard
  > está cubierto por Vitest `authPolicy.resolverGuard` (sin sesión ⇒ redirect `/login`) y el login en
  > vivo de la sesión principal arrancó en `/login`; el barrido explícito de las 5 rutas sin cookie
  > queda para una corrida browser.

## AWAITING USER — requieren OAuth client real + una cuenta con membresía

Prerequisito para todos: crear el OAuth client de Google, poblar `GOOGLE_CLIENT_ID/SECRET` reales en
`.env`, y otorgar membresía a la cuenta de prueba con `npm run otorgar:membresia -- <email> autora`
(la cuenta debe haber iniciado sesión al menos una vez antes).

- [x] **panel.auth.membresia.001** — Login con Google de una cuenta CON membresía aterriza en el panel
  y ve SU tienda (nombre real en el sidebar). Una cuenta SIN membresía obtiene sesión pero ve el empty
  state "tu cuenta no tiene una tienda asignada" (D2/fail-closed). Cero acceso cross-tenant.
  > ✅ [feature-tester 2026-07-17] Verificado por el E2E en vivo de la sesión principal + evidencia DB
  > read-only: login Google real (`/login` → "Entrar con Google" → OAuth client `sortealo-dev` →
  > `/admin` con sesión, "Resumen · Panel"); Operador SIN membresía en `/admin/sorteo` → empty state
  > "tu cuenta no tiene una tienda asignada" (fail-closed, sin datos de ningún tenant); tras CLI
  > `otorgar-membresia nikochaima72@gmail.com autora` → panel "Tienda de la Autora (piloto)". DB:
  > user `nikochaima72@gmail.com` con **1** membresía → tenant `autora`.

- [ ] **panel.productos.crud.001** — En `/admin/productos`: crear un producto (título, precio, ruta PDF)
  y verlo aparecer en la lista real; editarlo (cambiar precio / desactivar) y ver el cambio reflejado.
  El producto persiste con el `tenantId` de la sesión (verificable en Prisma Studio). El catálogo del
  storefront (`<slug>.localhost:3001`) deja de listarlo al desactivarlo.
  > ⏳ [feature-tester 2026-07-17] NO cubierto por la evidencia de esta corrida (el E2E en vivo cubrió
  > login + sorteo, no el CRUD de productos). Backend verde por Vitest. Queda para una corrida browser
  > con sesión.

- [ ] **panel.ventas.dashboard.001** — `/admin/ventas` muestra las órdenes reales del tenant (la venta
  pagada de `autora` del E2E de F01, con su total CLP formateado y el neto = total − comisión); "Cargar
  más" pagina sin repetir. `/admin` muestra KPIs coherentes con la DB (ventas pagadas, ingresos).
  > ⏳ [feature-tester 2026-07-17] NO cubierto por la evidencia de esta corrida. La orden real que debería
  > aparecer SÍ existe en DB (order `cmrogl4pi0002egexv45st4a5` PAGADO de `autora`, fee=96). Queda para
  > una corrida browser con sesión.

- [ ] **panel.config.credencial.001** — En `/admin/configuracion`: cargar una credencial Flow y ver el
  estado "Configurada · sandbox · <fecha>" SIN que ningún secreto aparezca en la UI ni en la respuesta
  de red (revisar la pestaña Network: ni apiKey/secretKey ni sus ciphertexts). Guardar bases del sorteo
  + descripción y verlas persistidas al recargar.
  > ⏳ [feature-tester 2026-07-17] NO cubierto por la evidencia de esta corrida. Backend verde por Vitest
  > (write-only, sin fuga de secretos). Queda para una corrida browser con sesión + revisión de Network.

- [ ] **panel.productos.sorteo-toggle.001** — En `/admin/productos`, abrir el form de un producto, activar
  el switch "Participa en el sorteo" y guardar ⇒ el producto muestra el badge **Sorteo** en la lista;
  reabrir el form y ver el switch encendido (persistió, hidratado desde `listarProductos`). Desactivarlo lo
  quita del badge. El flag es del `tenantId` de la sesión (ADR-0012/D1). (Plan F04 E2E — sorteo-por-producto)

- [ ] **panel.sorteo.tickets.001** — En `/admin/sorteo`, con participaciones de grano fino (varios tickets
  de un mismo correo, ej. una compra ×N de un producto participante): la tarjeta "Participaciones" muestra
  el total de **tickets** (no de órdenes) y la tabla de Participantes agrupa por correo mostrando su
  **conteo de tickets** + su última participación. (Plan F04 E2E — sorteo-por-producto, ADR-0012)

- [ ] **panel.sorteo.ejecutar.001** — Con un Raffle ACTIVO sembrado por F02 (`npm run seed:raffles` u
  origen equivalente) y participaciones reales: `/admin/sorteo` muestra el sorteo activo + los
  participantes; "Ejecutar sorteo" (con confirmación) elige un ganador, lo muestra con fecha y ejecutor,
  y deja el sorteo CERRADO. Re-cargar/reintentar NO cambia el ganador (idempotente).
  > ⏳ [feature-tester 2026-07-17] PARCIAL. La mitad "ver sorteo activo + participaciones" SÍ está
  > verificada en vivo por la sesión principal (`/admin/sorteo` → "Sorteo · Tienda de la Autora (piloto)",
  > sorteo "Sorteo de lanzamiento" ACTIVO con 1 participante + botón Ejecutar). DB read-only:
  > `ejecutadoAt=null`, `ganadorEmail=null`, 1 `RaffleEntry` de `nikochaima72+e2ef02@gmail.com`. La
  > EJECUCIÓN **NO se corre** (irreversible; el usuario quiere presenciarla). Queda [ ] hasta que el
  > usuario ejecute el sorteo.

## Rediseño del chrome + identidad de marca (admin-marca F01–F07)

Checks del plan `tasks/26-07-17-admin-marca.md` (ruta C · violeta). Los de marca en `/login` NO
requieren OAuth (el login es público); los del panel sí requieren sesión con membresía (mismo bloqueo I9).

- [ ] ❌ **marca.paleta.001** (F01) — El chrome usa la paleta violeta (primario) y la tipografía Manrope:
  botones/acentos primarios en **violeta `#7239d5`** (NO el azul default de Mantine) y los headings en
  Manrope. Verificable YA en `/login` sin OAuth (wordmark + CTA violeta + font); en el panel requiere sesión.
  > ❌ [feature-tester 2026-07-18] PALETA OK / TIPOGRAFÍA ROTA. Nota: la paleta ya NO es violeta «En Vivo»
  > sino **cobalto «El Talonario» `#2b3fbf`** (superseded por `identidad-talonario`). El CTA sale `rgb(43,63,191)`
  > = cobalto, NO azul default Mantine ✓. PERO las fuentes de marca NO cargan: login + panel renderizan en
  > **Times New Roman**. HTML server-rendered: 0 `@font-face`, `--font-instrument/display/mono` vacías,
  > `document.fonts.size=0`; los classNames `__variable_*` sí están en `<html>`. Causa: next/font referenciado
  > SOLO en `src/pages/_document.tsx:18` (pitfall pages-router — no colecta el `<style>` de font-face). Cascada a
  > `--mantine-font-family` inválida ⇒ fallback serif. Bug estructural, no auto-retryable. Fix: aplicar en `_app.tsx`.
- [x] **marca.badges.001** (F02) — En `/admin/ventas` y `/admin/operador` los badges de estado se pintan
  con la semántica nueva (pagado→teal, pendiente→ámbar, fallido/suspendida→rojo ladrillo) y no queda ningún
  hex inline en `src/components/admin/estado-*.tsx` (grep + visual). Requiere sesión.
  > ✅ [feature-tester 2026-07-18] ventas: Pagado=teal, Pendiente=ámbar. operador: Publicada=teal, acción
  > «Suspender»=rojo-ladrillo. Grep `src/components/admin/`: 0 hex inline. (suspendida→rojo cubierto por Vitest,
  > no exercitado en vivo — no mutar estado de tenant).
- [x] **marca.chrome.001** (F03) — El navbar corona con el **wordmark Sortéatelo** arriba y la tienda como
  **chip con swatch** de su color; el **menú de avatar** (arriba a la derecha) abre con email/rol y permite
  **cerrar sesión**; **"Ver mi tienda"** abre `<slug>.<host>` en pestaña nueva. Requiere sesión.
  > ✅ [feature-tester 2026-07-18] Wordmark arriba, chip «Tienda de la Autora (piloto)» con swatch ROSA
  > (colorPrimario del tenant, D2). Menú de avatar: «Nicolás Chaima / nikochaima72@gmail.com / Operador de
  > plataforma» + Cerrar sesión. «Ver mi tienda» abrió `http://autora.localhost:3001/` en pestaña nueva.
- [ ] ⏭️ **marca.chrome.002** (F03) — Un **Operador sin tienda propia** NO ve el chip ni "Ver mi tienda" y el
  resto del chrome no se rompe (avatar + menú siguen funcionando). Requiere sesión (cuenta Operador sin membresía).
  > ⏭️ [feature-tester 2026-07-18] Data-blocked: la cuenta piloto es dueña Y Operador; `/api/dev/login` solo
  > crea sesión para dueños de tienda. Sin fixture de Operador sin membresía.
- [x] **marca.pageheader.001** (F04) — Las **6 páginas** del admin muestran título/descripción/acciones
  DENTRO del contenido (no en la barra superior), sin solaparse con el header liviano, en **mobile y desktop**.
  Requiere sesión.
  > ✅ [feature-tester 2026-07-18] DESKTOP: las 6 (Resumen/Productos/Ventas/Sorteo/Configuración/Operador) con
  > PageHeader (h1 + descripción) en el contenido; header liviano (`bannerHasH1=false`). MOBILE no exercitado:
  > ningún carril MCP (chrome-devtools/Playwright) expone tool de viewport/emulación. Residual sin rotura observada.
- [x] **marca.login.001** (F05) — `/login` muestra el **wordmark** y la marca de plataforma (card centrada +
  fondo sutil del primario), ya no la página cruda sin marca. Verificable YA sin OAuth.
  > ✅ [feature-tester 2026-07-18] Wordmark «Sort·éa·telo» (éa en plumón amarillo) + split cobalto con arte de
  > talonario (N°312 «TÚ» en amarillo) + CTA «Continuar con Google» cobalto. Muy por encima de "página cruda".
- [ ] ⏭️ **marca.empty.001** (F05) — Los estados vacíos (dashboard sin ventas, ventas, participantes del sorteo,
  tiendas del operador) muestran **ícono + mensaje + CTA** cuando corresponde. Requiere sesión.
  > ⏭️ [feature-tester 2026-07-18] Data-blocked: todas las superficies del tenant piloto tienen datos sembrados;
  > `prueba` no tiene dueño (dev-login 404). `EmptyState` existe + frontend-reviewer APPROVE, pero no se pudo
  > surfacear en vivo. Queda para una corrida con un tenant fresco/vacío.
- [x] **marca.meta.001** (F05) — La pestaña del navegador muestra `<página> · Sortéatelo` y el **favicon** de
  plataforma (la "S" violeta). Login verificable sin OAuth; panel requiere sesión.
  > ✅ [feature-tester 2026-07-18] Tab titles «Entrar/Resumen/Productos/Ventas/Sorteo/Configuración/Operador ·
  > Sortéatelo». Favicon `/favicon.svg` (SVG; la "S" es cobalto, no violeta — supersession).
- [x] **marca.spotlight.001** (F07) — **Cmd+K** abre el Spotlight y navega a cada página del panel; el **toggle
  de dark mode** conmuta y el chrome (crema→oscuro) sigue legible. Requiere sesión.
  > ✅ [feature-tester 2026-07-18] Ctrl+K abre el dialog «Buscar en el panel…» con 7 acciones (5 rutas + Operador
  > + Ver mi tienda); click «Ventas» navegó a `/admin/ventas`. Dark toggle conmuta a `scheme=dark`; navbar/main
  > oscuros con wordmark/chip/nav/KPIs/badges legibles (rama dark de `light-dark()` RESUELTA). Fondo hundido, no crema.
- [x] **panel.bases.subir.001** (admin-bases-pdf F02) — ✅ 2026-07-25 (parcial: ver ⏭️). En el sorteo **ACTIVO**
  de `autora`, el `BasesUploader` arranca con badge **«Bases pendientes»** («Te las pediremos antes de
  publicar») y un `FileInput` «Elegir el archivo PDF» con `accept="application/pdf"`. Subido un PDF real
  ⇒ badge **«Bases cargadas»** + enlace **«Ver el PDF»** (`target=_blank`) a
  `…r2.dev/<tenantId>/sorteo/<raffleId>/bases.pdf?v=<ts>` — key per-tenant/per-raffle generada server-side;
  `curl` al objeto ⇒ **200 `application/pdf`**. (b) Re-subir otro PDF **REEMPLAZA** sobre la MISMA key con
  `?v=` nuevo (la DB y el bucket sirven el 2º archivo — el visor de `/bases` muestra «BASES REEMPLAZADAS -
  VERSION 2») y el badge sigue «Bases cargadas». (c) El form de **EDICIÓN** del sorteo tiene exactamente 3
  campos (Nombre, Premio, Fecha de cierre): **ningún** campo de bases ni «Enlace a las bases», 0 `input[type=file]`.
  ⏭️ Caso (a) «form de CREACIÓN» NO ejercitable: `autora` (y los otros 5 tenants) ya tiene sorteo ACTIVO, así
  que el form de creación no se renderiza; cerrarlo para verlo sería destructivo. Cubierto por Vitest
  `panel.sorteo.crear.006`. — En `/admin/sorteo`, las **bases del sorteo son un PDF
  que se SUBE**, no un enlace de texto: (a) el form de creación ya NO muestra «Enlace a las bases» sino un
  `FileInput` «Bases del sorteo (PDF)»; adjuntar un PDF real al crear lo sube tras crear el sorteo (diferido,
  key per-raffle) y el panel del sorteo activo queda con el badge **«Bases cargadas»** + enlace «Ver el PDF»
  que abre el PDF servido por el bucket público; (b) en el sorteo ACTIVO, re-subir otro PDF lo REEMPLAZA
  (misma key, `?v=` distinto) y el badge sigue en «Bases cargadas»; (c) el form de EDICIÓN del sorteo no tiene
  ningún campo de bases. Requiere sesión + bucket público R2 configurado (CORS del subdominio).
- [x] **panel.bases.gate.001** (admin-bases-pdf F03, ADR-0008) — ✅ **2026-07-25 (2ª pasada, CERRADO)**. La
  1ª pasada quedó PARCIAL porque `autora` tenía `tosAceptadoAt: null` y el gate frenaba en el requisito
  ANTERIOR; con los ToS aceptados en la DB dev (autorización explícita del usuario, espejando `aceptarTos`)
  el requisito de bases quedó **aislado** como único blocker posible, que es una verificación más fuerte que
  la original. Despubliqué `autora` por la UI y la dejé **PUBLICADA** al terminar.
  (a) ✅ Con el PDF quitado del Raffle ACTIVO —y **todo lo demás cumplido**— el checklist muestra «Sube las
  bases de tu sorteo» («Tu sorteo está activo: su PDF de bases es obligatorio») como **único** ítem pendiente,
  con botón **«Ir al sorteo»** → `/admin/sorteo` (NO Configuración), «Publicar mi tienda» **`disabled`** y
  «Completa los pasos pendientes para poder publicar». **Gate real (I3) probado en vivo**: disparando
  `panel.publicarTienda` por HTTP con la sesión viva —esquivando el botón deshabilitado— el server responde
  **400** con «Tu sorteo está activo: antes de publicar debes subir el PDF con sus bases.» y la Tienda **no**
  transiciona (sigue `CONFIGURACION`). (b) ✅ Restaurado el PDF, los **4 ítems** quedan en `circle-check` teal
  (`#1d7a70`, token `exito`), el botón se habilita y **«Publicar mi tienda» FUNCIONA**: toast «¡Tu tienda está
  publicada!», badge «Publicada», `estado: PUBLICADA` en DB y storefront + `/bases` en 200.
  (c) ⏭️ «sin sorteo activo» sigue sin ser ejercitable (los 6 tenants tienen sorteo ACTIVO) ⇒ cubierto por
  Vitest `tenants.publicacion.001`. (d) ✅ `/admin/configuracion` ya **no** tiene el textarea «Bases del
  sorteo». — El **gate de publicación** exige el PDF de
  bases del sorteo ACTIVO, ya no un texto en Configuración: (a) con un sorteo activo SIN bases, el checklist
  de `/admin` muestra el ítem **«Sube las bases de tu sorteo»** en rojo con el botón **«Ir al sorteo»** (que
  navega a `/admin/sorteo`, NO a Configuración) y **Publicar falla** con «antes de publicar debes subir el PDF
  con sus bases»; (b) tras subir el PDF, el ítem queda verde y **Publicar funciona**; (c) sin sorteo activo el
  ítem de bases no aparece y publicar funciona igual; (d) `/admin/configuracion` ya **no** tiene el textarea
  «Bases del sorteo». Requiere sesión.
- [x] **panel.admin.limpio.001** (admin-bases-pdf F06) — ✅ 2026-07-25. (a) La card «Tu tienda» tiene solo
  Logo / Descripción / **Color de marca** / **Color de acento** / Redes y contacto: **cero** «Título del hero»,
  «Subtítulo del hero», «Aviso (banner)» e «Imagen de hero», y el copy dice «El contenido de la portada (hero,
  textos, avisos) se edita en el editor». (b) El rail muestra **«Editor de la tienda»** al pie (arriba de
  Configuración, con `IconExternalLink`); el click abrió una **pestaña nueva** en
  `autora.localhost:3001/editor` y el panel se quedó en `/admin/configuracion` (no navega adentro). Es un
  `<button>` con `window.open(…, "_blank", "noopener")`, no un `<a href>` — decisión declarada en
  `admin-layout.tsx:70-77`. (c) **Ctrl+K** también ofrece «Editor de la tienda» («Edita el contenido de tu
  tienda (hero, textos, secciones)») con el MISMO handler `abrirEditor` (su click sintético lo frena el
  bloqueador de popups por falta de user-activation, artefacto de automatización, no del producto).
  ⏭️ (d) «sin tienda» no ejercitable con esta sesión (el usuario tiene membresía); guardado por
  `{tiendaSlug && …}` en `admin-layout.tsx:310`. — El admin deja de mentir y gana puente al editor:
  (a) `/admin/configuracion` → la card «Tu tienda» ya **NO** muestra «Título del hero», «Subtítulo del hero»,
  «Aviso (banner)» ni el uploader «Imagen de hero» (los 4 campos que guardaban con toast de éxito sin
  efecto); sí siguen logo, color de marca, descripción y redes/contacto, y el texto de la card explica que
  el contenido de la portada se edita en el editor (mismo copy en loading, error y éxito);
  (b) el rail del admin muestra **«Editor de la tienda»** al pie (junto a Configuración) con ícono de enlace
  externo, y al hacer click abre `<slug>.<host>/editor` en una **pestaña nueva** (no navega dentro del panel);
  (c) **Cmd/Ctrl+K** también ofrece «Editor de la tienda» y hace lo mismo;
  (d) sin tienda (usuario sin membresía) el ítem no aparece. Requiere sesión.
- [x] **panel.admin.color-acento.001** (admin-bases-pdf F06/D12) — ✅ 2026-07-25. (a) «Color de marca» y «Color
  de acento» salen **lado a lado** en la misma fila (`y=518`, `x=1032` / `x=1386`), los dos como
  `mantine-ColorInput-input` con **la misma paleta de 7 swatches** (`SWATCHES_MARCA`); el acento trae
  placeholder «Sin acento (usa el color de marca)». (b) Precargado: tras un reload, el input rehidrató
  `#00b8d9` desde la columna (`getConfiguracionTienda`). (c) Acento nuevo + «Guardar» ⇒ toast **«Cambios
  guardados.»** y, recargando el **storefront publicado** de `autora` (sin tocar el editor ni «Publicar»),
  `--mantine-color-acento-6: #00b8d9` con su rampa de 10 tonos derivada. (d) Vaciar + «Guardar» ⇒ desaparecen
  las vars `--mantine-color-acento-*` y **cero** rastro de `#00b8d9`: la tienda vuelve a derivar todo de
  `colorPrimario` (`#e11d48`). (e) El panel **Tema del editor** mostró el MISMO `#00b8d9` con el mismo
  placeholder — una sola columna, no dos ajustes.
  ↩️ Branding de `autora` **RESTAURADO** al valor original (`colorPrimario #e11d48`, `colorAcento null`).
  — Los DOS colores de marca se editan juntos en
  la card «Tu tienda» y **aplican al instante** (sin publicar nada): (a) `/admin/configuracion` muestra «Color
  de marca» y **«Color de acento»** lado a lado, ambos como selector de color con la misma paleta de atajos;
  (b) el acento llega **precargado** con el valor que la tienda ya tenía (si se había puesto desde el editor);
  (c) elegir un acento nuevo + «Guardar» ⇒ toast «Cambios guardados.» y al recargar el **storefront publicado**
  (no solo la preview del editor) el acento nuevo ya se ve — sin pasar por el editor ni por «Publicar»;
  (d) vaciar el campo + «Guardar» ⇒ la tienda vuelve a derivar todo del color de marca;
  (e) el mismo valor se ve reflejado en el panel **Tema del editor** (es la misma columna, no dos ajustes).
  Requiere sesión.
- [ ] **panel.campos.crud.001** (checkout-campos-configurables F03) — En `/admin/configuracion`, la sección
  **«Campos del checkout»** administra los datos extra que la Tienda le pide al Comprador: (a) la lista
  arranca con la fila **«Correo»** con badge **«Fijo»** y candado, SIN switch ni acciones (I2/ADR-0004: el
  correo no es un campo configurable), y con el estado vacío «Por ahora solo pides el correo»; (b) «Agregar
  campo» crea **uno de cada tipo** — Texto, Teléfono, Número, Lista de opciones (el form muestra el
  `TagsInput` «Opciones` solo para este tipo) y Casilla sí/no (muestra «Viene marcada por defecto» y **NO**
  muestra «Es obligatorio», D4/I5) — y cada uno aparece en la lista con su tipo y su clave en mono;
  (c) las flechas ↑/↓ reordenan y el nuevo orden **persiste al recargar** (el server reasigna `posicion`);
  (d) el switch de una fila la desactiva ⇒ badge **«Inactivo»**, y se puede volver a activar;
  (e) el tacho abre la confirmación «Eliminar campo» que avisa que **las respuestas ya recibidas se
  conservan**, y al confirmar el campo desaparece de la lista. Requiere sesión.
- [ ] **panel.campos.candado.001** (checkout-campos-configurables F03, D4/D5) — Los dos guardrails de la
  sección son visibles: (a) el **texto anti-consentimiento** («No los uses para que acepten términos o
  condiciones: eso ya va en las bases de tu sorteo y en los términos de la plataforma») aparece tanto en la
  lista como dentro del modal de crear/editar; (b) al **editar** un campo existente, «Tipo» está
  **deshabilitado** con candado y explica que hay que borrar y crear de nuevo, y aparece «Nombre interno»
  **deshabilitado** con la clave en mono (D5: `clave` y `tipo` inmutables tras crear); al **crear**, en
  cambio, «Tipo» es editable y no hay campo de clave; (c) con **10 campos activos** el botón «Agregar campo»
  queda deshabilitado, el contador dice «10 de 10 campos activos» y aparece el aviso de que hay que desactivar
  uno; los switches de los campos inactivos quedan apagados hasta liberar cupo (D6/I6). Requiere sesión.
- [ ] **panel.ventas.detalle.001** (checkout-campos-configurables F06, D8/I7/I9) — En `/admin/ventas`, cada fila
  tiene el botón **«Detalle»** (también en las órdenes NO pagadas, donde antes había un «—») que abre un
  **Drawer** por la derecha: (a) arriba, el correo del Comprador, la fecha y el badge de estado;
  (b) **«Lo que compró»** con una línea por producto en `cantidad × precio unitario` y, abajo, el **Total**,
  la **Comisión** (con su signo −) y **«Te queda»** — los tres en CLP, y los dos últimos SOLO si la venta
  está pagada (en una PENDIENTE aparece únicamente el Total). Esta es la única vía para ver comisión y neto
  en un teléfono: en la tabla esa columna se esconde bajo `md`; (c) **«Respuestas del checkout»** con la
  **etiqueta congelada → valor** de cada campo que el Comprador respondió — una Casilla sí/no se lee
  **«Sí»/«No»** (nunca `true`/`false`) y un Número se muestra **CRUDO, sin separador de miles** (un
  `8320000` se lee `8320000`, no `8.320.000`); (d) el Drawer cierra sin dejar la tabla alterada, y
  reabrir otra venta muestra los datos de ESA venta. Requiere sesión + al menos una compra con campos
  respondidos (la deja `storefront.campos.persistencia.001`).
- [ ] **panel.ventas.detalle.002** (checkout-campos-configurables F06, I9) — **Degradación limpia**: una venta
  ANTERIOR a la feature (o de una Tienda que nunca configuró campos) abre el mismo Drawer **sin la sección
  «Respuestas del checkout»** — no un bloque vacío ni un «—», directamente no está. El resto del detalle
  (compra + total) se ve igual. Requiere sesión.

- [ ] **panel.ventas.csv.001** (checkout-campos-configurables F07, D9/I7) — En `/admin/ventas`, el header de la
  página tiene el botón **«Exportar CSV»** (solo el ícono bajo `sm`), habilitado únicamente si hay ventas.
  Al hacer click **se descarga un archivo `ventas-<AAAA-MM-DD>.csv`** (el día de hoy en Chile). Abriéndolo
  con un editor de texto: (a) la **primera fila** es `Fecha,Correo,Total,Comisión,Te queda,Estado,Productos`
  seguida de **una columna por cada campo de checkout respondido**, titulada con su etiqueta; (b) hay **una
  fila por venta**, TODAS las de la tienda y no solo las 15 de la primera página (si hay más de 15, cargar
  más en la pantalla NO cambia el archivo); (c) los montos van **crudos** (`5000`, no `$5.000`), una casilla
  va `true`/`false` (no «Sí») y un Número va sin separador de miles; una venta pendiente deja **vacías** las
  celdas de Comisión y Te queda; (d) la venta que no respondió un campo deja esa celda vacía, y todas las
  filas tienen la misma cantidad de columnas. Requiere sesión + al menos una compra con campos respondidos.
- [ ] **panel.ventas.csv.002** (checkout-campos-configurables F07, D9) — **El archivo abre bien en Excel**:
  abrir el CSV descargado con Excel/LibreOffice y verificar que (a) los **acentos** se ven correctos
  («Teléfono», «Comisión» — si sale «TelÃ©fono» falta el BOM); (b) un título de producto con **coma o
  comillas** queda en UNA sola celda; (c) un **teléfono con `+`** se lee completo (`+56912345678`) y NO
  convertido en número, y una respuesta de texto que empiece con `=` se muestra como texto **sin
  ejecutarse**; (d) la columna **Total suma** con una fórmula (`=SUMA(...)`) — o sea que Excel la reconoció
  como números y no como texto. Requiere sesión + una compra con esos datos (se puede sembrar respondiendo
  el checkout con un `+569…` y un producto con coma en el título).
