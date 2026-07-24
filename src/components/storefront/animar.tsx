import { domAnimation, LazyMotion, m, useReducedMotion } from "motion/react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useEnPreview } from "~/components/storefront/preview-muestra";
import { type PresetEntrada } from "~/lib/pagebuilder/widgets";

/**
 * Sistema de animación del STOREFRONT (catálogo-v2 F03/D5, ADR-0020 propuesto). MÓDULO ÚNICO desde el
 * que se importa `motion` en `src/components/storefront/` (I-E): ningún otro archivo del storefront lo
 * importa. Usa `LazyMotion + domAnimation` (feature-set chico, ~5kb) y `m.*` (nunca `motion.*`, que
 * arrastraría el bundle completo).
 *
 * REGLAS DURAS (síntesis §4.6, elevadas a Invariantes I-B..I-E):
 *  - **SSR-visible** (I-D): el HTML público anónimo renderiza VISIBLE (jamás `opacity:0` esperando
 *    JS). El wrapper "arma" la animación SOLO client-side tras hidratar, y SOLO para elementos que aún
 *    NO están en viewport (bajo el fold) — así el contenido above-the-fold nunca parpadea y el HTML
 *    cacheable no varía por viewer. Endurece el `RevelarAlScroll` de la landing (que sí sale opacity:0).
 *  - **reduced-motion** (I-B): `prefers-reduced-motion` ⇒ contenido plano visible, sin animar. Siempre.
 *  - **CLS=0** (I-C): solo se animan `transform`/`opacity`/`filter:blur`. Nunca height/top/margin/width.
 *  - **Acotamiento** (I-E): presets = enum cerrado; duración/ease FIJOS acá (nunca desde el documento).
 */

/** Duración/ease FIJOS (design.md §7: entradas = slow/400ms, easeOut). No configurables (I-E). */
const TRANSICION = { duration: 0.4, ease: "easeOut" } as const;
const VIEWPORT = { once: true, margin: "-80px" } as const;

interface Variante {
  oculto: Record<string, number | string>;
  visible: Record<string, number | string>;
}

/** Variantes por preset (solo transform/opacity/blur — I-C). `ninguna`/`heredar` no llegan acá. */
const VARIANTES: Record<string, Variante> = {
  aparecer: { oculto: { opacity: 0 }, visible: { opacity: 1 } },
  subir: { oculto: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } },
  escala: { oculto: { opacity: 0, scale: 0.96 }, visible: { opacity: 1, scale: 1 } },
  desenfoque: {
    oculto: { opacity: 0, filter: "blur(8px)" },
    visible: { opacity: 1, filter: "blur(0px)" },
  },
};

/** `true` sii el preset produce animación real (no `ninguna`/`heredar`/desconocido). */
function animable(preset: string): boolean {
  return preset in VARIANTES;
}

/**
 * Hook del patrón SSR-visible + solo-bajo-el-fold. Devuelve si hay que ARMAR la animación y el ref a
 * adjuntar. SSR / pre-hidratación / reduced-motion / preset no animable ⇒ `armar:false` (contenido
 * plano visible). Tras montar, si el elemento YA está en viewport ⇒ `armar:false` (no parpadea);
 * si está bajo el fold ⇒ `armar:true` (se anima al hacer scroll).
 */
function useArmarAlScroll(activo: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [armar, setArmar] = useState(false);

  useEffect(() => {
    if (!activo) return;
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    // Ya visible (above/near fold) ⇒ NO animar (sin parpadeo). Bajo el fold ⇒ armar.
    if (rect.top < window.innerHeight * 0.9) return;
    setArmar(true);
  }, [activo]);

  return { ref, armar };
}

/**
 * Entrada on-scroll de un bloque (catálogo-v2 F03). Envuelve `children` y los revela al entrar al
 * viewport. `preset` = enum cerrado. SSR-visible + reduced-motion garantizados por `useArmarAlScroll`.
 */
export function Animar({
  preset,
  children,
  className,
}: {
  preset: PresetEntrada;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  // En preview del catálogo (F11) los thumbnails NO animan su entrada (estáticos, sin parpadeo bajo el
  // fold de la galería): se renderiza el div plano visible.
  const enPreview = useEnPreview();
  const activo = !reduce && !enPreview && animable(preset);
  const { ref, armar } = useArmarAlScroll(activo);

  if (!armar) {
    // SSR + pre-hidratación + reduced-motion + above-the-fold ⇒ contenido plano VISIBLE (I-D/I-B).
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  const v = VARIANTES[preset]!;
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        ref={ref}
        className={className}
        initial={v.oculto}
        whileInView={v.visible}
        viewport={VIEWPORT}
        transition={TRANSICION}
        style={{ willChange: "transform, opacity" }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}

/**
 * Ítem de un stagger (grillas: catálogo/testimonios/ganadores/galería/estadísticas). `index` escalona
 * el delay (`index*60ms`, cap 8). Mismo patrón SSR-visible + solo-bajo-el-fold que `Animar`.
 */
export function AnimarItem({
  index,
  preset = "subir",
  children,
  className,
}: {
  index: number;
  preset?: PresetEntrada;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const enPreview = useEnPreview();
  const activo = !reduce && !enPreview && animable(preset);
  const { ref, armar } = useArmarAlScroll(activo);

  if (!armar) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  const v = VARIANTES[preset]!;
  const delay = Math.min(index, 8) * 0.06;
  return (
    <LazyMotion features={domAnimation}>
      <m.div
        ref={ref}
        className={className}
        initial={v.oculto}
        whileInView={v.visible}
        viewport={VIEWPORT}
        transition={{ ...TRANSICION, delay }}
        style={{ willChange: "transform, opacity" }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}

/** Valor a pintar del count-up: DERIVADO del objetivo y el progreso ∈ [0,1] (1 = final). Puro. */
export function valorCountUp(objetivo: number, progreso: number): number {
  return Math.round(objetivo * progreso);
}

/**
 * Count-up de un entero al entrar al viewport (catálogo-v2 F03): IntersectionObserver + rAF, SIN
 * `motion`. **SSR = valor FINAL** (I-D: cacheable/accesible) — el count-up solo corre client-side si
 * el nodo aún no fue visto (bajo el fold). Con `prefers-reduced-motion` ⇒ valor final inmediato (I-B).
 * Devuelve el valor a pintar + el ref a adjuntar al elemento del número.
 *
 * El estado guardado es el `progreso` de la animación (∈ [0,1], default 1 = final), NO el valor: el
 * valor se DERIVA (`objetivo * progreso`). Así, cuando el `objetivo` llega ASYNC de una query
 * (`useSorteoActivo`: 0 → N), el valor mostrado SIGUE al objetivo en reposo (progreso=1) sin quedar
 * clavado en el 0 del primer render — el bug de `meta_progreso_sorteo`/`contador_tickets`. El
 * count-up, cuando corre, lleva `progreso` de 0 a 1; en reposo siempre pinta el valor final.
 */
export function useCountUp<T extends HTMLElement = HTMLElement>(
  objetivo: number,
  duracionMs = 1200,
) {
  const reduce = useReducedMotion();
  const enPreview = useEnPreview();
  const ref = useRef<T>(null);
  const [progreso, setProgreso] = useState(1); // reposo = valor final (SSR/default, I-D)

  useEffect(() => {
    if (reduce || enPreview) return; // reduced-motion / preview ⇒ progreso queda en 1 (valor final)
    // objetivo aún no resuelto (query async): no armar el count-up; el efecto re-corre al llegar.
    if (objetivo <= 0) return;
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) return; // ya visible ⇒ sin count-up (sin parpadeo)

    let raf = 0;
    let inicio = 0;
    const observer = new IntersectionObserver(
      (entradas, obs) => {
        if (!entradas[0]?.isIntersecting) return;
        obs.disconnect();
        setProgreso(0);
        const paso = (t: number) => {
          if (!inicio) inicio = t;
          const p = Math.min(1, (t - inicio) / duracionMs);
          // easeOutCubic (progreso 0→1)
          setProgreso(1 - Math.pow(1 - p, 3));
          if (p < 1) raf = requestAnimationFrame(paso);
        };
        raf = requestAnimationFrame(paso);
      },
      { rootMargin: "-40px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [objetivo, duracionMs, reduce, enPreview]);

  return { valor: valorCountUp(objetivo, progreso), ref };
}
