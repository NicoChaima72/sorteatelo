# Chrome global del tenant configurable, con nodos "pinned" renderizados por la plataforma

> **Estado: propuesto** (2026-07-26). Plan: `tasks/26-07-25-builder-tanda-3-arquitectura.md` (Tanda 3, F06/D10/D11). Origen: mapa `.scratch/page-builder/mapa-potencial-editores.md` §3.C (evolución C). Refuerza ADR-0016 (documento de página), ADR-0017 (referencias-no-copias), ADR-0018 (sin HTML libre) y ADR-0008 (responsabilidad del sorteo).

El storefront tiene dos superficies de contenido distintas: el **Documento de Página** (`StorefrontPage`, ADR-0016), que es POR PÁGINA, y el **chrome** (header + footer), que es TRANSVERSAL a todas las páginas de una Tienda (la home y `/sobre-mi` comparten el mismo header/footer). Este ADR fija cómo se hace editable el chrome sin romper los invariantes de tenancy, seguridad y responsabilidad legal.

**Decisión (dos conceptos nuevos):**

1. **Chrome GLOBAL en una columna del Tenant, NO en el documento.** El chrome vive en `Tenant.chromeJson Json?`, fuera del `StorefrontPage`, porque es propiedad de la Tienda, no de una página. Se valida server-side con un `ChromeSchema` Zod propio `.strict()` (`~/lib/pagebuilder/chrome.ts`): `header { layout, sticky, transparenteSobreHero, fondo, menu: MenuItem[] }` + `footer { columnas, links: MenuItem[], texto? }`. Todo enum cerrado / token curado — cero hex, cero URL/HTML libre (hereda ADR-0018). El `MenuItem` reusa el `DestinoLink` de los runs (Tanda 3 F01): un solo vocabulario de destinos (`ancla | pagina | url https validada`) en toda la plataforma. `chromeJson: null` ⇒ el header/footer ACTUALES byte-idénticos (migración no-op): el schema solo aporta OVERRIDES. Lectura tolerante en render (`leerChromeParaRender`, espejo de `leerDocumentoParaRender`): un chrome podrido ⇒ chrome default, jamás un 500.

2. **Nodos PINNED = render de PLATAFORMA, fuera del `chromeJson`.** El carrito + la acción de sesión (header) y la **atribución neutral + el enlace a las Bases del sorteo** (footer, ADR-0008) NO existen dentro de `chromeJson`: los renderiza `storefront-layout` incondicionalmente alrededor de lo configurable. No hay flag que los apague, no hay mutación que los toque, no hay input que los quite. Son **no-borrables POR CONSTRUCCIÓN** — una garantía más fuerte que un campo "protegido: true" (que un bug o un LLM podría flipear). El editor los muestra como items con candado (visibles, no editables) para que el Organizador entienda el layout completo.

Razón:

- **Tenancy / seguridad**: el chrome es contenido del tenant; al pasar por el mismo borde Zod `.strict()` que el documento, un `<a href>` libre, un `javascript:` o un HTML crudo simplemente no parsean (ADR-0018 — con la cookie de sesión wildcard, ADR-0019, esto es aislamiento de sesión, no solo anti-XSS).
- **Responsabilidad legal (ADR-0008)**: el disclaimer/atribución y el acceso a las Bases del sorteo NO pueden depender de la buena voluntad del Organizador ni de que "no borre el widget". Sacarlos del modelo editable y renderizarlos por plataforma es lo que hace que la obligación legal sea estructural, no una convención.
- **Comercio**: el carrito/checkout jamás editables ni removibles — la plataforma nunca permite una tienda sin forma de comprar (coherente con que la plataforma orquesta pero no toca la plata, ADR-0006).

## Consideradas y descartadas

- **Chrome como un `StorefrontPage` con slug especial (`__chrome`)** → mezcla dos ciclos de vida (publicar una página vs. el chrome global) y obliga a un documento con nodos header/footer que romperían el tope de 2 niveles.
- **Pinned como widgets "protegidos: true" dentro del chrome** → un flag es flipeable por un bug o un editor LLM; sacar el nodo del schema elimina la clase de fallo por construcción.
- **`menu` con URLs libres** → reintroduce la superficie de ADR-0018; el `DestinoLink` tipado la cierra.

## Consecuencias

- El chrome se edita SOLO desde el editor visual (panel "Chrome", F07) vía un procedure tRPC `setChrome` gateado por membresía; el **MCP/chat de IA NO gana tool para el chrome** en esta tanda (viola I12 "MCP sin efectos fuera del documento de la página"): extender el asistente al chrome queda como candidato para cuando este ADR se acepte.
- `chromeJson` aditivo/null-safe: ningún tenant publicado cambia de aspecto por el deploy (no-op). `db push` aditivo, con `schema-guardian` antes.
- La migración inversa (chrome → columnas de `Tenant` legacy) NO existe: el chrome es la fuente única de verdad de header/footer cuando está presente.
- Pendiente de aceptación del usuario: los dos conceptos (chrome global + pinned por construcción) son de dominio nuevo; este ADR queda `propuesto` hasta su visto bueno.
