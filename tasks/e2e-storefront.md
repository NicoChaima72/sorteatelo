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
