---
slug: storefront-carrito-total-y-drawer
status: testing
owner: nicolas
created: 2026-07-27
related_adrs: [ADR-0004, ADR-0005, ADR-0007, ADR-0012]
related_context: [Tienda, Comprador, Producto, Orden]

features:
  - id: F01
    behavior: "El total del carrito se calcula SERVER-SIDE (Decimal, tenant del host) y el cliente solo lo pinta"
    state: active

  - id: F02
    behavior: "El drawer del carrito tiene lista scrolleable arriba y footer FIJO abajo (total + Ir a pagar + Vaciar)"
    state: active

  - id: F03
    behavior: "Cada ítem del drawer y del checkout muestra la miniatura del producto (portada o degradado de marca)"
    state: active

  - id: F04
    behavior: "El detalle «por pack de N» aparece solo cuando N ≥ 2; con N = 1 dice «c/u»"
    state: active

  - id: F05
    behavior: "La página de entrega muestra la portada del producto como visual de las copias sin miniatura"
    state: active
---

# Carrito del storefront: total server-side, drawer con footer fijo y miniaturas

## Contexto

Feature acotada de UX del flujo de compra del storefront, **especificada directo por el usuario con
screenshots** (sin grill previo — el spec ES el prompt del usuario, transcrito acá). Se registra como
task chica para que la Bitácora y las Validaciones vivan donde vive el resto del harness.

Cuatro defectos observados sobre el modelo packs v2 recién deployado:

1. El drawer del carrito **no muestra el total** — dice «El total a pagar se calcula de forma segura al
   continuar». Es literal y honesto respecto de I4, pero el Comprador quiere ver cuánto va a pagar
   ANTES de irse a Flow.
2. El drawer flota: la CTA «Ir a pagar» queda a media altura con aire muerto abajo.
3. Los ítems del carrito y del checkout son texto pelado: no se ve qué producto es.
4. Un producto normal muestra «$3.000 **por pack de 1**», que confunde.

Bonus del mismo pase: en `/entrega/[token]`, las copias de un producto ESTANDAR (el libro PDF) se ven
como un ícono genérico — se les pone la portada del producto.

## Decisiones

- **D1: el total se calcula en el server, en `Decimal`, y el cliente SOLO lo pinta.** Query pública
  tenant-scoped `checkout.cotizarCarrito({items:[{productId,cantidad}]})` que relee los precios
  vigentes de la DB. Razón: I4 intacto — el cliente sigue sin sumar ni multiplicar plata, y el número
  que ve el Comprador es el mismo que va a cobrar `iniciarCheckout` (que recalcula igual dentro de su
  `$tx`). El carrito de `localStorage` deja de ser la fuente del precio mostrado.
- **D2: la cotización devuelve strings de `Decimal`, no `number`.** `precioUnitario` / `subtotal` /
  `total` como `Decimal.toFixed(0)`. Razón: `clp()` ya acepta el string del server
  (frontend-conventions § Formato de dinero) y así ningún borde invita a aritmética en el cliente.
  (`listarProductos` sigue devolviendo `precio: number` — es catálogo, no cotización, y no se toca.)
- **D3: un ítem que ya no se puede comprar simplemente NO viene en la cotización.** Sin lista paralela
  de "no disponibles": la ausencia ES el reporte. Razón: es el patrón más simple y evita dos fuentes
  de verdad que se desincronizan (mismo criterio que `resolverCatalogo`, que descarta en silencio).
  El drawer/checkout renderizan desde el carrito y marcan el ítem sin línea como «Ya no disponible»
  (dimmed + «Quitar»), y el total —que es del server— no lo incluye.
- **D4: la cotización usa la MISMA regla de vendibilidad que `iniciarCheckout`** (`activo` +
  `seVendeDirecto` + `esProductoEntregable` sobre `SELECCION_PRODUCTO_ENTREGABLE`). Razón: si el drawer
  cotizara con una regla más laxa, mostraría un total con un producto que el checkout va a rechazar.
- **D5: la cotización NO consulta el gate de venta por facturación.** Razón: una Tienda en pausa ni
  siquiera sirve el storefront (el SSR devuelve `/en-pausa`) y el gate real se recomputa dentro de la
  `$tx` de `iniciarCheckout`. Meter el gate acá agregaría un **cuarto** lector (hoy son SSR del
  storefront, checkout y guard del panel) a un predicado que el repo mantiene deliberadamente acotado.
  **Ventana conocida que esto deja abierta** (levantada por el `backend-reviewer`, aceptada): si la
  Tienda entra en pausa **con la pestaña ya abierta**, el drawer sigue cotizando y muestra un total
  que `iniciarCheckout` va a rechazar con `INACTIVE`. No es fuga de plata ni de tenancy —es UX en una
  carrera angosta— y queda anotada acá para que no se re-litigue en el próximo review.
- **D6: un solo hook comparte la cotización entre drawer y checkout** (`useCotizacionCarrito`). Razón:
  las dos superficies tienen que mostrar EL MISMO total; dos llamadas escritas por separado son el
  drift garantizado.
- **D7: debounce de 350 ms sobre el carrito + `placeholderData` que conserva el total previo.** Razón:
  un burst de «+ + +» en el stepper haría N requests, y sin `placeholderData` el total parpadearía a
  vacío en cada cambio de cantidad. Mientras recalcula, el total anterior queda visible atenuado.
- **D8: `ItemCarrito.portadaUrl?` es display-only y opcional**, poblado en `agregar()` desde la
  tarjeta del catálogo, con rehidratación tolerante para carritos viejos (mismo patrón que
  `unidadesPorPack`). La cotización TAMBIÉN devuelve `portadaUrl`, y **gana la del server** cuando ya
  llegó (igual que el precio): el `localStorage` solo sirve para pintar al instante.
- **D9: la miniatura degrada al mismo dibujo que el catálogo** (`gradientePortadaDeterminista` por
  título) — design.md §5.2: nunca un `<img>` roto, nunca un hueco.
- **D10: `unidadesPorPack === 1` no es un pack.** El copy pasa a `«c/u»` salvo cuando
  `unidadesPorPack >= 2`. Es exactamente el criterio que ya usa la tarjeta del catálogo
  (`producto.unidadesPorPack > 1`), que hoy está desalineado con el drawer y el checkout.

## Plan

1. `cotizarCarrito` en `src/server/domain/checkout/` + `cotizarCarritoInput` reusando el array de
   ítems de `iniciarCheckoutInput` (misma forma y mismos topes, sin cambiar el contrato existente) +
   procedure `checkout.cotizarCarrito` (`tenantProcedure`, query). (F01)
2. Hook `useCotizacionCarrito` en `src/components/storefront/` con debounce, `placeholderData` y los
   4 estados (cargando / recalculando / error / sincronizada). (F01)
3. Rediseño del drawer: `styles.content` + `styles.body` en flex-columna, lista `flex-1 overflow-y-auto`
   y footer fijo con separador, total server-side, «Ir a pagar» y «Vaciar carrito». (F02)
4. Miniatura en el ítem del drawer y en el resumen del checkout; `portadaUrl?` en `ItemCarrito`,
   poblado desde la tarjeta del catálogo y rehidratado tolerante. (F03)
5. Total server-side también en el resumen del checkout, con los mismos estados. (F01, F02)
6. Copy «por pack de N» condicionado a `N >= 2` en drawer y checkout. (F04)
7. `portadaUrl` de la línea en `getEntregaDeOrden` + visual del archivo en `/entrega/[token]`
   (sin tocar la miniatura presignada de los archivos IMAGEN). (F05)

## Validaciones

### F01 — Total server-side

**Vitest** (integration):
- [ ] La cotización usa el precio VIGENTE de la DB, no el que trae el cliente (precio cambiado en la DB ⇒ manda el de la DB) — `src/__tests__/server/checkout/cotizarCarrito.test.ts::carrito.cotizar.005`
- [ ] El total es Σ (precio × cantidad) en Decimal, y cada línea trae su subtotal — `src/__tests__/server/checkout/cotizarCarrito.test.ts::carrito.cotizar.001`
- [ ] Un `productId` inexistente no aparece en las líneas y no suma al total — `src/__tests__/server/checkout/cotizarCarrito.test.ts::carrito.cotizar.002`
- [ ] Un producto de OTRA Tienda no aparece en las líneas ni suma al total (aislamiento cross-tenant, I1) — `src/__tests__/server/checkout/cotizarCarrito.test.ts::carrito.cotizar.002`
- [ ] Un producto inactivo, una colección y un pack no entregable quedan fuera (misma regla que `iniciarCheckout`) — `src/__tests__/server/checkout/cotizarCarrito.test.ts::carrito.cotizar.003`
- [ ] La cotización devuelve `portadaUrl` y `unidadesPorPack` de la fila vigente, y ninguna key de bucket — `src/__tests__/server/checkout/cotizarCarrito.test.ts::carrito.cotizar.004`
- [ ] El input rechaza cantidad 0/negativa/sobre el tope y productIds repetidos (mismo contrato que `iniciarCheckout`) — `src/__tests__/server/checkout/cotizarCarrito.test.ts::carrito.cotizar.006`

**E2E** (browser):
- [ ] Abrir el drawer con productos muestra el total real (y coincide con lo que cobra Flow)
- [ ] Cambiar cantidades con el stepper recalcula el total mostrado

### F02 — Drawer con footer fijo

**Vitest**:
- [ ] (no aplica — layout puro, se verifica en navegador)

**E2E**:
- [ ] Con muchos ítems, la lista scrollea y el bloque total + «Ir a pagar» + «Vaciar carrito» queda fijo abajo
- [ ] A **320 px y 375 px** el título del ítem sobrevive al ancho (medir `clientWidth`/`scrollWidth`, no a ojo) — pedido explícito del `frontend-reviewer`

### F03 — Miniatura del producto

**Vitest**:
- [ ] `agregar()` persiste `portadaUrl` y el carrito viejo (sin la clave) rehidrata sin romperse — `src/__tests__/components/carrito-rehidratacion.test.ts::carrito.rehidratar.001` + `::carrito.rehidratar.002`
- [ ] Un `localStorage` corrupto o con la cantidad manipulada no rompe ni miente — `src/__tests__/components/carrito-rehidratacion.test.ts::carrito.rehidratar.003` + `::carrito.rehidratar.004` *(cobertura extra que no estaba en el plan — al extraer `rehidratarCarrito` como función pura quedó testeable y valía la pena; confirmar o sacar)*

**E2E**:
- [ ] Cada ítem del drawer y del checkout muestra su portada; un producto sin portada muestra el degradado de marca

### F04 — Copy «por pack de N»

**Vitest**:
- [ ] Un producto con `unidadesPorPack` 1/0/ausente dice «c/u», y uno con N ≥ 2 nombra el pack — `src/__tests__/components/leyenda-precio-carrito.test.ts::carrito.leyenda.001` + `::carrito.leyenda.002` *(el plan decía «no aplica»; al extraer la regla a `leyendaPrecioUnitario` —para que catálogo, drawer y checkout no puedan volver a divergir— quedó pura y testeable)*
- [ ] El monto se formatea igual venga string `Decimal` del server o `number` del localStorage — `src/__tests__/components/leyenda-precio-carrito.test.ts::carrito.leyenda.003`

**E2E**:
- [ ] Un producto con `unidadesPorPack = 1` dice «c/u»; un pack de 4 dice «por pack de 4»

### F05 — Portada en la página de entrega

**Vitest**:
- [ ] `getEntregaDeOrden` devuelve la `portadaUrl` de cada línea y sigue sin filtrar ninguna key — `src/__tests__/server/entrega/getEntregaDeOrden.test.ts::entrega.pagina.004` (portada presente + cero key) y `::entrega.pagina.001` (producto sin portada ⇒ `null`, no `undefined`)

**E2E**:
- [ ] Las copias de un libro PDF muestran la portada del producto; los archivos IMAGEN de un sobre siguen con su miniatura presignada
- [ ] Una IMAGEN cuya miniatura presignada NO carga cae al gradiente temático y **no** a la portada del producto (edge case que cazó el `frontend-reviewer`)

## Invariantes

- I1: **el `tenantId` de la cotización sale del contexto (host), jamás del input** (ADR-0005).
- I2: **el cliente NUNCA suma ni multiplica plata.** La cotización es display-only; el monto que se
  cobra lo sigue calculando `iniciarCheckout` dentro de su `$tx` sobre `Product.precio` (Decimal).
- I3: la cotización es una **query pura**: no crea Order, no toca Flow, no escribe nada.
- I4: montos en UI con `clp()` de `~/lib/formato` + `tabular-nums`. Cero `Intl` inline, cero `$` a mano.
- I5: cero hex inline; color por tokens del theme / CSS vars del tenant.
- I6: la miniatura degrada, nunca se rompe (design.md §5.2).
- I7: no se toca la miniatura presignada de los archivos IMAGEN de `/entrega/[token]` ni su
  `keyServerOnly` (que sigue sin serializarse al navegador).

## Out of scope

- Cambiar el contrato de `iniciarCheckout` (input, snapshots, total).
- Persistir el carrito en DB (sigue en `localStorage`, ADR-0004).
- Cupones, descuentos, envío, IVA desglosado.
- Rediseñar el catálogo o el checkout más allá del resumen de ítems.
- Tocar archivos de los carriles en vuelo (correos, focos de ambiente, facturación).

## Especialistas a consultar

- `backend-reviewer` — al cerrar F01 (query nueva, tenancy, dinero) y F05 (select de la entrega).
- `frontend-reviewer` — al cerrar F02–F04 (drawer + checkout) y F05 (visual de la entrega).

## Bitácora

- [2026-07-27 00:00] [feature-implementer] Spec recibido del usuario directo (4 cambios + bonus), sin
  planner previo por decisión del usuario. Task file creado con el template; el contenido de
  Contexto/Decisiones/Plan/Invariantes es la transcripción estructurada del prompt, no invención.
- [2026-07-27 00:05] [feature-implementer] Arranca implementación. Features pendientes: F01, F02, F03, F04, F05.
- [2026-07-27 00:55] [feature-implementer] **F01 implementada** (TDD, 6 ciclos rojo→verde). Archivos:
  `src/server/domain/checkout/cotizarCarrito.ts` (nuevo), `src/server/domain/checkout/schemas.ts`
  (extraído `itemsDeCarrito` compartido + `cotizarCarritoInput`), `src/server/api/routers/checkout.ts`
  (procedure `cotizarCarrito`, `tenantProcedure` query), `src/components/storefront/use-cotizacion-carrito.ts`
  (nuevo hook compartido). Notas tácticas:
  (a) el use case reusa `seVendeDirecto` + `esProductoEntregable` + `SELECCION_PRODUCTO_ENTREGABLE`
  del checkout (D4) — cotizar con una regla más laxa mostraría un total que el checkout rechaza;
  (b) el array de ítems del checkout se EXTRAJO a una constante compartida en vez de duplicarse, sin
  cambiar su contrato (los 27 tests de `iniciarCheckout` siguen verdes);
  (c) montos como string de `Decimal` (D2), que es lo que `clp()` ya consume;
  (d) **mutation test** corrido: quitando los dos guards de vendibilidad, `carrito.cotizar.003` se
  pone rojo ⇒ el test no es vacuo. Restaurado.
  Vitest filtrado `src/__tests__/server/checkout/` **61/61 verde** (6 nuevos + 55 de regresión del
  área, incluidos los 27 de `iniciarCheckout`). `tsc --noEmit` limpio en todo el repo.
- [2026-07-27 01:05] [feature-implementer] **`backend-reviewer` F01: APPROVE** (0 blockers; rúbrica
  A/B/B/A). Verificó sin fugas cross-tenant, `select` sin filtrar pool/keys/`pdfPath` al payload
  público, regla de vendibilidad literalmente la misma que `iniciarCheckout`, aritmética 100 %
  `Decimal`, y que la extracción de `itemsDeCarrito` es mecánica (contrato de `iniciarCheckoutInput`
  intacto). **3 NITs**, ninguno bloqueante:
  1. *D5 (gate de facturación)*: de acuerdo con omitirlo, pero corrigió el conteo (son 4 lectores, no
     3) y pidió que la **ventana de carrera** quede escrita en vez de implícita — **APLICADO**: D5
     reescrito arriba con la ventana nombrada.
  2. *Naming `cotizarCarrito`*: defendible (hay precedente parcial en `estadoOrden`) pero es la
     primera query «verbo-cómputo» del repo ⇒ sugiere una línea en `backend-conventions.md § Routers`.
     **NO APLICADO** — es drift de doc y requiere permiso del usuario (ver Step 4.5 más abajo).
  3. *Array de ítems sin `.max()`*: preexistente y compartido con `iniciarCheckoutInput`; más
     explotable desde una query pública que desde la mutation. **NO APLICADO** a propósito: cambiar el
     contrato de `iniciarCheckout` está en Out of scope, y el reviewer coincide en que corresponde un
     task de hardening aparte que toque los dos consumidores a la vez. **Queda para el usuario.**
- [2026-07-27 01:20] [feature-implementer] **F02 + F03 + F04 implementadas** (una sola pasada de UI:
  las tres tocan los mismos dos archivos y son un rediseño coherente del mismo bloque). Archivos:
  `src/components/storefront/carrito-ui.tsx` (reescrito), `fila-carrito.tsx` (nuevo, compartido),
  `miniatura-producto.tsx` (nuevo), `leyenda-precio.ts` (nuevo, la regla de F04 una sola vez),
  `carrito.tsx` (`portadaUrl?` + `rehidratarCarrito` extraída PURA), `catalogo.tsx` (+4 líneas en el
  `agregar()`), `src/pages/checkout/index.tsx`.
  **Auto-chequeo contra `docs/design.md` antes del reviewer**: tokens semánticos únicamente
  (`--mantine-color-default-border` / `--mantine-color-body` / `--mantine-radius-md`, gradiente por
  CSS vars de la escala del tenant) — cero hex, cero clase de color Tailwind; montos con `clp()` +
  `tabular-nums`; sin `motion` (§7, el storefront solo lo permite vía `animar.tsx`); degradación de
  imagen al gradiente de marca (§5.2); voz chilena sobria sin urgencia (§8).
- [2026-07-27 01:35] [feature-implementer] **`frontend-reviewer` F02–F04: APPROVE** (0 blockers;
  Naming B / Tests B). Verificó tokens, montos, `styles` vs `classNames`, a11y y los 4 estados. Le
  pedí explícitamente que cuestionara la desviación del error en `dimmed` en vez de `red` y **compró
  el argumento** (el contenido SÍ cargó; lo que falta es un número auxiliar no bloqueante), pero la
  marcó como **patrón nuevo sin documentar** ⇒ candidato a drift de `frontend-conventions.md`.
  **6 NITs, LOS 6 APLICADOS**:
  1. *Trampa real que yo no había visto*: la clase `content` del `Drawer` de Mantine trae
     `overflow-y: auto` por default (su modelo es «scrollea el drawer entero con el header sticky»).
     Mi `styles.content` solo pisaba `display`/`flexDirection` ⇒ quedaban DOS regiones scrolleables
     anidadas, y el rebote elástico de iOS podía arrastrar header+footer fuera de pantalla, o sea
     **devolver el bug que F02 vino a cerrar**. Fix: `overflow: "hidden"` en `styles.content`.
  2. Campo `cargando` huérfano en el hook (nadie lo consumía; `TotalDelCarrito` re-derivaba la misma
     condición inline) ⇒ ahora se usa.
  3. Orden de hooks en `checkout/index.tsx` (query antes del `useForm`) ⇒ movida después del form.
  4. Faltaba `aria-label` con el nombre del producto en el «Quitar» del checkout ⇒ puesto.
  5. Copy: «No pudimos calcular el total **por ahora**» (más idiomático).
  6. **320 px**: midió los fijos de la fila (miniatura 56 + stepper ~104 + basura + gaps) y calculó
     que al título le quedaban ~50 px. En vez de recortar píxeles, **reestructuré la fila a DOS
     líneas** (texto arriba a todo el ancho menos la miniatura; stepper + quitar abajo) y extraje
     `FilaCarrito` compartido por drawer y checkout — el título pasa de ~50 px a ~228 px. De paso el
     resumen del checkout, que era MÁS angosto que el drawer (card con padding dentro del container),
     queda cubierto por el mismo fix. La medición en vivo a 320/375 quedó agregada como checkbox E2E.
  Gate tras aplicar los 6: `tsc --noEmit` limpio, `next lint` de los 7 archivos **0 warnings**,
  Vitest filtrado `components/` + `server/checkout/` **211/211 verde**. Smoke curl en :3001:
  `/checkout` 200 en `prueba`/`autora`/`iselk` y el copy viejo («El total a pagar se calcula de forma
  segura») ya no aparece en el HTML.
- [2026-07-27 01:36] [feature-implementer] **Nit PREEXISTENTE que decidí NO tocar**: `catalogo.tsx`
  tiene un `import Link from "next/link"` sin usar (quedó de cuando murió `/producto/[id]`, ENMIENDA
  v2 — está así en HEAD, no lo introduje). Es un warning de lint en un archivo que sí toqué; lo dejo
  para no ensuciar el diff con limpieza de otro carril. Anotado por si el `change-set-reviewer` lo ve.
- [2026-07-27 01:37] [feature-implementer] **Carril paralelo detectado, sin conflicto**: mientras
  trabajaba, `storefront-verificador-tickets` landeó `verificarTickets` en los MISMOS dos archivos
  (`routers/checkout.ts` y `domain/checkout/schemas.ts`). Los dos cambios convivieron limpio (mi
  `cotizarCarrito` + su `verificarTickets`); no toqué ni una línea suya. Vale que el
  `change-set-reviewer` lo sepa al mirar el diff de esos dos archivos.
- [2026-07-27 01:30] [feature-implementer] **F05 implementada** (TDD: test rojo contra la DB real
  antes del cambio). Archivos: `src/server/entrega/getEntregaDeOrden.ts` (+`portadaUrl` en
  `LineaEntregada`, en el `select` del `product` y en el push), `src/pages/entrega/[token].tsx`
  (cascada de 3 escalones en `TarjetaArchivo`), `src/__tests__/server/entrega/getEntregaDeOrden.test.ts`
  (2 aserciones nuevas dentro de tests existentes — contra Supabase remota cada fixture cuesta ~20 s,
  así que se reusan en vez de sembrar uno nuevo).
  Decisión táctica: la línea muestra la portada del producto **COMPRADO** y no la de su fuente,
  aunque sea un pack. Razón: el título de la línea también es el del pack y es la misma imagen que el
  Comprador vio en el catálogo; el catálogo tampoco hace ese fallback, así que agregarlo acá sería la
  única asimetría entre las dos superficies. (El `backend-reviewer` verificó el criterio y coincidió.)
- [2026-07-27 01:40] [feature-implementer] **`backend-reviewer` F05: APPROVE** (0 blockers; A/A/B).
  Confirmó lo que más me preocupaba: **no confundí los buckets** — `portadaUrl` es del bucket PÚBLICO
  de marca (ADR-0013), la misma URL que ya sirve el catálogo sin auth, y las `keyServerOnly` del
  bucket privado (ADR-0002) siguen muriendo en el borde (el loop arma el objeto campo a campo, sin
  spread). Sin vía nueva de enumeración: el `product` cuelga del árbol que el token ya autoriza.
  **1 NIT NO APLICADO**: no hay test que ejercite el mapeo del `getServerSideProps` de la página con
  una línea NO vacía (`temaEntregaPorGrant.test.ts` mockea `getEntregaDeOrden` con `lineas: []`).
  No lo apliqué porque ese archivo es de un carril CERRADO (`storefront-tema-paginas-plataforma`) y
  el propio reviewer lo marcó como no bloqueante: `string | null` no tiene la trampa de
  `Date`/`Decimal`/`undefined`, y el hueco lo tapa el checkbox E2E de F05. **Queda para el usuario.**
- [2026-07-27 01:41] [feature-implementer] **`frontend-reviewer` F05: APPROVE** (0 blockers; B/B/B).
  **3 NITs APLICADOS**:
  1. **Gap real entre el comentario y el código**: `usarPortada` no excluía `esImagen`, así que una
     IMAGEN con la miniatura caída (R2 sin configurar, URL de 5 min vencida, glitch) mostraba la tapa
     genérica del pack **en el lugar donde va el sticker que te tocó** — chiquito pero es una mentira
     visual en un sobre sorpresa. Fix: `!esImagen &&` en `usarPortada`, + checkbox E2E nuevo.
  2. **Asimetría de `alt` sin fundamento**: la miniatura llevaba `alt={nombreArchivo}` y la portada
     `alt=""`, pero el caption con el nombre se renderiza SIEMPRE para las dos ramas ⇒ un lector de
     pantalla anunciaba el nombre dos veces sobre la miniatura. Unificado a `alt=""`.
  3. `color="white"` literal → `var(--mantine-color-white)` (los íconos Tabler no pasan por el
     resolver de tokens de Mantine; regla explícita de frontend-conventions).
  **2 hallazgos NO aplicados, para el usuario** (ver el resumen de cierre): el chip de tipo de
  archivo sobre la portada (decisión de producto) y un bug PREEXISTENTE del catálogo.
  Gate tras aplicar: `tsc` limpio, `next lint` 0 warnings, `getEntregaDeOrden` **4/4 verde contra la
  DB real**, regresión `components/` + `server/checkout/` + `temaEntregaPorGrant` **218/218**, y
  `/entrega/<token>` renderiza 200 en :3001.
- [2026-07-27 01:45] [feature-implementer] **Implementación completa. F01..F05 escritas, 4 pasadas de
  reviewer verdes** (backend ×2, frontend ×2; 0 blockers en total, 12 nits de los que apliqué 9).
  Gate final del alcance: `tsc --noEmit` limpio en todo el repo; `next lint` de los 10 archivos
  tocados con 0 warnings (salvo el `Link` huérfano PREEXISTENTE de `catalogo.tsx`, ver arriba);
  Vitest **filtrado** verde — `server/checkout/` 61/61, `components/` (incluye los 7 nuevos)
  y `server/storefront/temaEntregaPorGrant` 218/218, `server/entrega/` 4/4 contra la DB real.
  **La suite completa NO se corrió: es del `feature-tester`.** Tampoco invoqué `change-set-reviewer`
  —su gate es `npm run check`, que incluye la suite entera— por la misma razón y porque el usuario
  acotó los reviewers de este pase a backend (query) + frontend (drawer/checkout). Sin commits.
  **Verificación en vivo hecha (curl, :3001, una sola instancia de dev server)**: `checkout.cotizarCarrito`
  devuelve el total correcto en `prueba` (36.000 = 10.000×3 + 3.000×2) descartando en silencio un id
  fantasma; el MISMO id de producto desde `autora` devuelve `{lineas: [], total: "0"}` (aislamiento
  cross-tenant en vivo); `/checkout` 200 en `prueba`/`autora`/`iselk`/`demo-noche` y el copy viejo
  («El total a pagar se calcula de forma segura») ya no está en el HTML; `/entrega/<token>` 200.
  Lo que NO puedo verificar y queda para el `feature-tester`: **todo lo visual** (el footer fijo, las
  miniaturas, el copy del pack, la medición a 320/375 px que pidió el `frontend-reviewer`) — no tengo
  driver de navegador.
- [2026-07-27 01:46] [feature-implementer] **Step 4.5 — 3 drifts de doc DETECTADOS y NO aplicados**,
  esperando permiso del usuario (los diffs propuestos van en el mensaje de cierre):
  (a) `frontend-conventions.md § Data fetching` — el patrón «dato auxiliar async que no bloquea ni
      alarma» (error en `dimmed`, no en `red`), que el `frontend-reviewer` marcó como variante nueva
      del default documentado;
  (b) `frontend-conventions.md § Mantine` — el gotcha del `Drawer` con footer fijo (hay que APAGAR el
      `overflow-y: auto` que Mantine le pone a `content`, o quedan dos regiones scrolleables anidadas
      y el rebote de iOS puede volver a despegar el footer);
  (c) `backend-conventions.md § Routers` — la tercera categoría de naming de queries: «cómputo sobre
      el input», que es lo que justifica `cotizarCarrito` sin prefijo `get`.
  **Fuera de mi alcance, solo SUGERIDO**: nada para `CONTEXT.md`, ADRs ni `CLAUDE.md` — esta feature
  no introdujo vocabulario nuevo del dominio ni una decisión arquitectónica load-bearing (la
  cotización es el espejo de lectura de un cálculo que ya existía en `iniciarCheckout`).
