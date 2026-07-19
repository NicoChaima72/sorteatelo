# Motion en el storefront solo vía la primitiva compartida `animar.tsx`

> **Estado: propuesto** (2026-07-18, pendiente de ratificación del usuario). Plan: `tasks/26-07-18-catalogo-v2-builder-visual.md` (catálogo v2, F03). Origen: síntesis `.scratch/page-builder/catalogo-widgets-v2.md` §4. **Levanta parcialmente** la prohibición de `motion` en el storefront de `docs/design.md` §7 e I5 del plan `identidad-talonario`.

**Decisión:** se permite `motion` (ex framer-motion) en el **storefront del Comprador**, pero SOLO importado desde un módulo único: `src/components/storefront/animar.tsx`. Ningún otro archivo de `src/components/storefront/` importa `motion`. Reglas duras (elevadas a Invariantes I-B..I-E del plan):

- **Un solo módulo** (`animar.tsx`) con `LazyMotion + domAnimation` (feature-set chico ~5kb) y `m.*` (nunca `motion.*`, que arrastra el bundle completo). Expone `Animar` (entrada on-scroll), `AnimarItem` (stagger) y `useCountUp` (IO + rAF, sin motion).
- **SSR-visible (I-D)**: el HTML público anónimo renderiza VISIBLE — jamás `opacity:0` esperando JS. El wrapper "arma" la animación solo client-side tras hidratar, y solo para elementos que aún NO están en viewport (bajo el fold) ⇒ el contenido above-the-fold no parpadea y el HTML cacheable no varía por viewer (compatible con ADR-0019/caché anónima). **Endurece** el `RevelarAlScroll` de la landing (que sí sale `opacity:0` en SSR — no se copia).
- **reduced-motion (I-B)**: `prefers-reduced-motion` colapsa TODA animación a estado final visible. Sin excepciones. `useCountUp` devuelve el valor final inmediato.
- **CLS=0 (I-C)**: solo se animan `transform`/`opacity`/`filter:blur`. Nunca height/top/margin/width.
- **Acotamiento (I-E)**: presets de entrada = enum cerrado (`PRESETS_ENTRADA`); duración/ease FIJOS en `animar.tsx` — NUNCA `duration`/`delay`/`easing` desde el documento ni desde el MCP. Microinteracciones (hover-lift, marquee, pulso CTA/segundos) = **CSS puro** en `globals.css`, gateadas por `prefers-reduced-motion: no-preference`.

Razón: el pedido del usuario "con animaciones" exige levantar la regla, pero de forma controlada. La landing ya usa `motion`; concentrarlo en una primitiva compartida con reglas duras evita que cada widget lo importe inline (bundle inflado, patrones SSR-inseguros, reduced-motion olvidado).

## Consideradas y descartadas

- **Entradas 100% CSS + IntersectionObserver** (sin `motion`): viable para la entrada simple, pero el stagger orquestado de grillas y futuras animaciones (confetti, AnimatePresence del ticker) se benefician de `motion`. Se deja la puerta abierta con LazyMotion, manteniendo las microinteracciones en CSS.
- **`motion` inline en cada widget**: descartado — es exactamente lo que la regla previa prohibía; infla el bundle y dispersa el patrón SSR-visible.

## Consecuencias

- `docs/design.md` §7 se edita: "motion en el storefront solo vía la primitiva compartida `animar.tsx`, siempre con `useReducedMotion` y SSR-visible". La prohibición general se conserva para todo lo que NO pase por `animar.tsx`.
- Un test estático verifica que `motion` solo se importe desde `animar.tsx` en el storefront.
- La caché anónima (ADR-0019) sigue intacta: el SSR no varía por viewer ni sale oculto.
