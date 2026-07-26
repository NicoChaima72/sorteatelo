# Data fetching conventions

Reglas de data fetching del frontend de libros-iselk (tRPC + React Query, via los
hooks de `~/utils/api`). Complementa la sección "Data fetching (tRPC)" de
`frontend-conventions.md`: ahí están las reglas base (estados loading/error/empty,
paginación por cursor, debounce); acá vive el **patrón de mutations con optimistic
update**, que es más delicado.

> **Estado**: el doc nació como seed y sigue **creciendo con cada decisión aprobada** —
> no inventar reglas que el proyecto no decidió. Pero el proyecto ya tiene features vivas
> (panel del Organizador, storefront por subdominio, checkout con Flow), así que hay que
> leerlo en dos velocidades: las secciones ancladas a código real lo dicen con un **«Ej.
> vivo»** y su archivo (hoy: la acción de un solo tiro sobre un `.query()`), mientras que
> el **patrón optimista** todavía NO tiene un consumidor en `src/` —cero `onMutate`— y su
> ejemplo está escrito con vocabulario **pre-pivote** (`api.libro.*`, que no es un router
> de este repo: el término vigente es Producto, ver `CONTEXT.md`). Ese bloque ilustra el
> mecanismo, no describe código existente; cuando aparezca el primer uso real, re-anclarlo
> acá con su referencia.

## El default: invalidate en `onSuccess`

La mayoría de las mutations NO necesitan optimismo. El patrón por defecto es:

```ts
const utils = api.useUtils();
const crear = api.x.crear.useMutation({
  onSuccess: async () => {
    await utils.x.listar.invalidate();
  },
});
```

`invalidate()` marca la query como stale y la refetchea. Es simple, correcto y suficiente
cuando: el usuario tolera el pequeño delay del roundtrip, o la mutation puede afectar
varias queries de forma difícil de predecir (un delete con `SetNull` en cascada).
**Empieza siempre por acá**; sube a optimistic solo cuando el feedback instantáneo importa.

## Cuándo SÍ optimista / cuándo NO

El optimistic update pinta el resultado esperado en la cache ANTES de que el server
responda, y lo reconcilia después. Da feedback instantáneo a cambio de complejidad
(snapshot + rollback). Solo vale la pena cuando el resultado es **predecible desde el
cliente**:

| Caso | ¿Optimista? | Por qué |
|---|---|---|
| **Update de un campo conocido** (set FK, renombrar, editar) | **SÍ** | El valor nuevo lo conoce el cliente (lo acaba de elegir). |
| **Toggle / flag** (activar/desactivar un libro, marcar/desmarcar) | **SÍ** | El estado destino es binario y conocido. |
| **Delete** de una fila visible (quitar un ítem del carrito) | **SÍ** | Se sabe exactamente qué fila quitar. |
| **Create** (crear una orden, agregar un libro nuevo) | **NO** | El cliente NO puede predecir el `id`, `createdAt` ni los derivados del server. Esperar la respuesta y `invalidate`/`refetch`. |
| Mutation con efectos en cascada difíciles de predecir | **NO** | Adivinar el `where` del backend en el cliente es frágil; invalidar es la fuente de verdad. |

Regla práctica: **si para pintar el resultado tendrías que reimplementar lógica del
backend en el cliente, no lo hagas optimista.** Pinta solo lo que el usuario YA decidió
(el campo que cambió) y deja que el refetch reconcilie el resto (ver "Reconciliación con
filtros" abajo).

## El patrón canónico optimista: onMutate / onError / onSuccess

Las tres fases del ciclo (sobre una query plana — para `useInfiniteQuery` ver el gotcha
más abajo):

```ts
const utils = api.useUtils();

const actualizar = api.x.actualizar.useMutation({
  // 1) onMutate: cancelar refetches en vuelo, snapshot, pintar optimista, devolver el snapshot.
  onMutate: async (variables) => {
    // Cancelar para que un refetch en curso no pise el optimista al volver.
    await utils.x.listar.cancel(queryInput);
    // Snapshot del estado previo: es el rollback.
    const prev = utils.x.listar.getData(queryInput);
    // Pintar el resultado esperado en la cache.
    utils.x.listar.setData(queryInput, (old) =>
      old?.map((it) => (it.id === variables.id ? { ...it, campo: variables.campo } : it)),
    );
    // Lo que se retorna acá llega como `context` a onError/onSettled.
    return { prev };
  },
  // 2) onError: rollback al snapshot.
  onError: (_err, _variables, context) => {
    if (context?.prev) utils.x.listar.setData(queryInput, context.prev);
  },
  // 3) onSuccess: reconciliar con el server (refetch, NO invalidate — ver abajo).
  onSuccess: () => {
    void utils.x.listar.refetch(queryInput);
  },
});
```

Reglas duras:

- **`cancel` SIEMPRE primero** en `onMutate`. Si hay un refetch en vuelo y no se cancela,
  su respuesta (vieja) puede pisar el optimista cuando llegue.
- **Snapshot = rollback.** El `getData`/`getInfiniteData` del estado previo se devuelve
  como `context` (`return { prev }`) y `onError` lo restaura tal cual. Sin snapshot no hay
  forma honesta de revertir.
- **Pinta solo lo que el usuario decidió**, no el resto (ver reconciliación).
- **Limpiar selección / cerrar UI en `onSuccess`**, no en `onMutate` (si la mutation falla,
  el usuario conserva su contexto para reintentar).

## refetch, NO invalidate (en el optimista)

En el ciclo optimista, `onSuccess` usa **`refetch(queryInput)`**, no `invalidate()`:

- `refetch(queryInput)` recarga **exactamente la query activa** (la del `queryInput` que ya
  está pintada optimistamente) y reconcilia ese dato con el server.
- `invalidate()` marca como stale TODAS las queries que matcheen y dispara refetches en
  cascada — tumba más cache de la necesaria y puede provocar un flash si re-muestra el
  estado loading.

Como el optimista ya dejó la UI en el estado correcto, lo único que falta es reconciliar
esa misma query con la verdad del server: `refetch` puntual es lo preciso. (El default
no-optimista de arriba sí usa `invalidate` — ahí no hay un `queryInput` único pintado que
reconciliar.)

## GOTCHA — optimistic update sobre `useInfiniteQuery`

Las listas paginadas por cursor del repo usan `useInfiniteQuery` (ver
`frontend-conventions.md` § Paginación por cursor). Su cache **NO es un array plano**: es
una estructura `InfiniteData<TPage>` con forma `{ pages: TPage[], pageParams: [] }`, donde
cada `page` es lo que devuelve el selector (`{ items, nextCursor }`). Por eso el setData
optimista usa `setInfiniteData`/`getInfiniteData` (NO `setData`/`getData`) y hay que
**mapear `old.pages[].items[]`**:

```ts
const queryInput = /* el MISMO Omit<ListarInput, "cursor"> que alimenta el useInfiniteQuery */;

// Ejemplo: activar/desactivar libros del catálogo en lote.
const setActivo = api.libro.setActivo.useMutation({
  onMutate: async ({ libroIds, activo }) => {
    await utils.libro.listar.cancel(queryInput);
    const prev = utils.libro.listar.getInfiniteData(queryInput);
    const ids = new Set(libroIds);
    utils.libro.listar.setInfiniteData(queryInput, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((p) => ({
          ...p,
          items: p.items.map((it) =>
            ids.has(it.id) ? { ...it, activo } : it,
          ),
        })),
      };
    });
    return { prev };
  },
  onError: (_e, _v, ctx) => {
    if (ctx?.prev) utils.libro.listar.setInfiniteData(queryInput, ctx.prev);
  },
  onSuccess: () => {
    void utils.libro.listar.refetch(queryInput);
    limpiarSeleccion();
  },
});
```

Puntos que rompen si se descuidan:

- **`getInfiniteData` / `setInfiniteData`**, no `getData` / `setData`. Las versiones planas
  devuelven/escriben `undefined` sobre una infinite query — el optimista no se ve y el
  rollback no revierte.
- **Mapear `pages`**, no el array de items: el item buscado puede estar en cualquier página
  ya cargada. Inmutable: `{ ...old, pages: old.pages.map(p => ({ ...p, items: p.items.map(...) })) }`.
- **`if (!old) return old`**: la cache puede estar vacía (aún no cargó) — devolver `old` tal
  cual evita romper.

### La cache key: el `queryInput` debe ser EXACTAMENTE el de la query activa

tRPC + React Query arman la cache key con el `input` de la query. `useInfiniteQuery(input, …)`
crea una entrada de cache para ESE input. `cancel`/`getInfiniteData`/`setInfiniteData`/`refetch`
deben recibir **el mismo objeto `input`** (estructuralmente igual) para apuntar a esa misma
entrada. Si se pasa un input distinto (otra forma, otro orden de filtros), se apunta a otra
entrada y el optimista se pinta en una cache que nadie está mostrando — no se ve nada y el
bug es silencioso.

En la práctica: el componente que dispara la mutation debe recibir (por prop) el
`queryInput` que el componente dueño del `useInfiniteQuery` calcula (ej. el
`Omit<ListarInput, "cursor">` del `useMemo` de la lista). No reconstruirlo a mano en otro
lado.

### Reconciliación con filtros activos

Cuando la lista tiene filtros (ej. "solo activos", o por algún campo del libro) y la
mutation cambia un campo por el que se filtra, el item podría dejar de matchear el filtro.
**No quitar la fila optimistamente**: el optimista actualiza el campo in-place (el badge) y
deja la fila donde está. El `refetch` del `onSuccess` reconcilia — si el filtro vigente
excluye la fila tras el cambio, desaparece sola al llegar la data fresca del server.

Por qué: decidir en el cliente si la fila sigue matcheando exige reimplementar el `where`
del backend (que puede tener OR's complejos). Eso es frágil y duplica lógica. El optimista
pinta lo seguro (el campo que el usuario eligió); el server, vía refetch, es la fuente de
verdad sobre qué filas pertenecen al conjunto filtrado.

## Acción de un solo tiro sobre un `.query()` (dato sensible fuera de la caché)

Algunas acciones del panel **leen** del server —son `query`, no `mutation`— pero se disparan
desde un botón y su resultado se consume UNA vez: un export que se baja como archivo, un
documento que se abre. Hay tres formas de pedirlo y, cuando el payload trae PII, solo una sirve:

| Forma                                        | Qué deja en la caché de React Query                            | ¿Sirve? |
| -------------------------------------------- | -------------------------------------------------------------- | ------- |
| `useQuery({ enabled: false })` + `refetch()` | El payload completo, indexado por su input                     | **NO**  |
| `utils.<router>.<procedure>.fetch()`         | Idem — `fetch` de tRPC escribe en la caché                     | **NO**  |
| `utils.client.<router>.<procedure>.query()`  | Nada: es el cliente **crudo** de tRPC, no pasa por React Query | **SÍ**  |

```ts
const utils = api.useUtils();
const [exportando, setExportando] = useState(false);

const exportarCsv = async () => {
  setExportando(true);
  try {
    const { nombreArchivo, contenido } =
      await utils.client.panel.exportarVentasCsv.query();
    descargarArchivo({
      nombre: nombreArchivo,
      contenido,
      tipo: "text/csv;charset=utf-8",
    });
  } catch {
    notifications.show({
      color: "red",
      message: "No pudimos generar el archivo.",
    });
  } finally {
    setExportando(false);
  }
};
```

Por qué importa: cachear el resultado significa que el dato **sobrevive al click**. Un CSV de
ventas lleva el correo de todos los Compradores; dejarlo en la caché lo mantiene vivo en memoria
mientras dure la sesión y hace que una segunda descarga pueda servir el archivo VIEJO (la caché
responde antes de refetchear). El cliente crudo lo entrega y se va.

Lo que hay que asumir y no olvidar:

- **El loading es un `useState` propio**, no un `isPending`: `utils.client` no es un hook y no
  expone estado. El botón igual lleva `loading={…}`; es el costo del patrón.
- **No hay `onSuccess`/`onError`** — el manejo va en `try/catch/finally` y la notificación de
  error se dispara a mano.
- **Solo para LECTURAS de un tiro.** Si la acción cambia algo en el server es `useMutation` y
  aplica el default de invalidar de arriba.
- **Ojo con el input**: una `query` de tRPC viaja por **GET con el input serializado en la URL**
  (queda en logs de server y proxies). Con `.query()` sin input el punto no aplica; si la acción
  necesitara filtrar por un dato identificatorio, eso ya no es una query de un tiro.
- La plomería del DOM (Blob → `<a download>` → revoke) va **aislada** en `src/lib/descargar.ts`,
  no inline en la página: el criterio es aislar el DOM, no contar repeticiones.

Ej. vivo: botón «Exportar CSV» de `src/pages/admin/ventas.tsx` (F07 de campos de checkout).

## Aritmética de dinero en el cliente

Regla de oro del dominio (CLAUDE.md): el dinero es `Decimal`, nunca `number`. En el frontend
los montos llegan como string `Decimal.toFixed(2)` y se formatean con `Intl.NumberFormat`
(CLP) — el cruce a `Number()` ocurre solo en el borde de presentación.

**Excepción acotada** (sumas informativas en el cliente): una suma de N montos para mostrar
un total visual (ej. "N libros en el carrito · $X") puede operarse con enteros JS, porque los
montos del dominio son CLP enteros (sin decimales reales — el `.00` es siempre cero) y la
suma de enteros JS es exacta. Condiciones de la excepción:

- Vive en su **propia función aislada**, documentada como tal.
- Es **puramente informativa**: un contador visual. JAMÁS vuelve al backend ni alimenta otro
  cálculo.
- Si en el futuro aparece multimoneda o decimales reales, se migra a un `_sum` del backend
  (Prisma suma sobre la columna `Decimal`).

**Ojo en libros-iselk**: esto aplica SOLO a sumas de **precios** (CLP enteros). NO aplica a
montos derivados — IVA (19%), comisión de Flow (~3,44%), neto al vendedor — que nacen de
divisiones y se calculan SIEMPRE en el backend con `Decimal` (`_sum` o aritmética
`Prisma.Decimal`), nunca con la suma de enteros del cliente. Fuera de la suma informativa de
precios, el dinero nunca pasa por `number`.
