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

- [ ] **marca.paleta.001** (F01) — El chrome usa la paleta violeta (primario) y la tipografía Manrope:
  botones/acentos primarios en **violeta `#7239d5`** (NO el azul default de Mantine) y los headings en
  Manrope. Verificable YA en `/login` sin OAuth (wordmark + CTA violeta + font); en el panel requiere sesión.
- [ ] **marca.badges.001** (F02) — En `/admin/ventas` y `/admin/operador` los badges de estado se pintan
  con la semántica nueva (pagado→teal, pendiente→ámbar, fallido/suspendida→rojo ladrillo) y no queda ningún
  hex inline en `src/components/admin/estado-*.tsx` (grep + visual). Requiere sesión.
- [ ] **marca.chrome.001** (F03) — El navbar corona con el **wordmark Sortéatelo** arriba y la tienda como
  **chip con swatch** de su color; el **menú de avatar** (arriba a la derecha) abre con email/rol y permite
  **cerrar sesión**; **"Ver mi tienda"** abre `<slug>.<host>` en pestaña nueva. Requiere sesión.
- [ ] **marca.chrome.002** (F03) — Un **Operador sin tienda propia** NO ve el chip ni "Ver mi tienda" y el
  resto del chrome no se rompe (avatar + menú siguen funcionando). Requiere sesión (cuenta Operador sin membresía).
- [ ] **marca.pageheader.001** (F04) — Las **6 páginas** del admin muestran título/descripción/acciones
  DENTRO del contenido (no en la barra superior), sin solaparse con el header liviano, en **mobile y desktop**.
  Requiere sesión.
- [ ] **marca.login.001** (F05) — `/login` muestra el **wordmark** y la marca de plataforma (card centrada +
  fondo sutil del primario), ya no la página cruda sin marca. Verificable YA sin OAuth.
- [ ] **marca.empty.001** (F05) — Los estados vacíos (dashboard sin ventas, ventas, participantes del sorteo,
  tiendas del operador) muestran **ícono + mensaje + CTA** cuando corresponde. Requiere sesión.
- [ ] **marca.meta.001** (F05) — La pestaña del navegador muestra `<página> · Sortéatelo` y el **favicon** de
  plataforma (la "S" violeta). Login verificable sin OAuth; panel requiere sesión.
- [ ] **marca.spotlight.001** (F07) — **Cmd+K** abre el Spotlight y navega a cada página del panel; el **toggle
  de dark mode** conmuta y el chrome (crema→oscuro) sigue legible. Requiere sesión.
