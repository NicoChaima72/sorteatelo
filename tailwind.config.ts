import { type Config } from "tailwindcss";
import { fontFamily } from "tailwindcss/defaultTheme";

/**
 * Tailwind acotado a LAYOUT (ADR-0011 / supuesto S-TW, I11). Color, tipografía, radios y sombras
 * salen del theme de Mantine — NO de Tailwind. Por eso se retiraron los tokens de color shadcn, el
 * `borderRadius` por CSS var y el plugin `tailwindcss-animate`. Quedan `content`, `darkMode`,
 * `screens` y `fontFamily`.
 *
 * `screens` (D7, patrón datawalt-app): se REEMPLAZAN los breakpoints px por defecto de Tailwind por
 * los de Mantine 7 (em), así los `lg:` de layout coinciden con los props responsive de Mantine
 * (`visibleFrom`/`hiddenFrom`, breakpoints de `AppShell`). NO se adopta el uso libre de clases de
 * color de datawalt-app: acá el color sigue saliendo SOLO del theme.
 */
export default {
  darkMode: ["class"],
  content: ["./src/**/*.tsx"],
  theme: {
    // Breakpoints em de Mantine 7 (reemplazan los px por defecto de Tailwind).
    screens: {
      xs: "36em",
      sm: "48em",
      md: "62em",
      lg: "75em",
      xl: "88em",
    },
    extend: {
      fontFamily: {
        // `font-sans` = texto del talonario (Instrument Sans) por CSS var (D5).
        sans: ["var(--font-instrument)", ...fontFamily.sans],
      },
    },
  },
  plugins: [],
} satisfies Config;
