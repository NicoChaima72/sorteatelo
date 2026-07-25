import {
  IconBolt,
  IconChartBar,
  IconClock,
  IconCreditCard,
  IconDownload,
  IconGift,
  IconHeart,
  IconHeadset,
  IconLock,
  IconRosetteDiscountCheck,
  IconShieldCheck,
  IconShoppingBag,
  IconSparkles,
  IconStar,
  IconTag,
  IconTicket,
  IconUsers,
  IconWorld,
  type IconProps,
} from "@tabler/icons-react";
import { type ComponentType } from "react";

/**
 * Mapa del enum `ICONOS_BENEFICIO` (documento, `widgets.ts`) al ícono Tabler (render). Enum cerrado ⇒
 * jamás string libre (I-A). Compartido por `beneficios_grid` (F04) y `garantias_sorteo`/
 * `bloque_ticket_promo` (F06). Es un SUPERSET del mapa de `como_funciona` (los 8 de paso + los propios
 * del catálogo de beneficios). Un ícono no mapeado cae a `IconSparkles` (degradación, nunca crashea).
 */
export const ICONOS_BENEFICIO_MAP: Record<string, ComponentType<IconProps>> = {
  // heredados de ICONOS_PASO
  compra: IconShoppingBag,
  descarga: IconDownload,
  ticket: IconTicket,
  regalo: IconGift,
  escudo: IconShieldCheck,
  rayo: IconBolt,
  chispa: IconSparkles,
  reloj: IconClock,
  // propios del catálogo de beneficios
  candado: IconLock,
  corazon: IconHeart,
  estrella: IconStar,
  verificado: IconRosetteDiscountCheck,
  soporte: IconHeadset,
  pago: IconCreditCard,
  mundo: IconWorld,
  usuarios: IconUsers,
  grafico: IconChartBar,
  etiqueta: IconTag,
};

/** Resuelve un enum de ícono a su componente Tabler; fallback seguro a `IconSparkles`. */
export function iconoBeneficio(nombre: string): ComponentType<IconProps> {
  return ICONOS_BENEFICIO_MAP[nombre] ?? IconSparkles;
}

/**
 * Mapa del MISMO enum `ICONOS_BENEFICIO` a un EMOJI de un SET CURADO por NOSOTROS (Tanda 2 F17). Es la vía
 * limpia para el estilo `dreamy` de `estadisticas`: el prototipo `dev-ref/variant-dreamy` usa emojis a color
 * (🎟️/⏳/💜) en vez de íconos monocromos, pero I-A/D2 prohíbe strings/emoji LIBRES del tenant — así que el
 * emoji sale de este map cerrado (paralelo a `ICONOS_BENEFICIO_MAP`), nunca de input libre. Exhaustivo sobre
 * el enum (test `stats.emoji.001`); un ícono no mapeado cae a ✨ (espeja el fallback `IconSparkles`).
 */
export const EMOJI_BENEFICIO_MAP: Record<string, string> = {
  // heredados de ICONOS_PASO
  compra: "🛒",
  descarga: "📥",
  ticket: "🎟️",
  regalo: "🎁",
  escudo: "🛡️",
  rayo: "⚡",
  chispa: "✨",
  reloj: "⏳",
  // propios del catálogo de beneficios
  candado: "🔒",
  corazon: "💜",
  estrella: "⭐",
  verificado: "✅",
  soporte: "🎧",
  pago: "💳",
  mundo: "🌍",
  usuarios: "👥",
  grafico: "📈",
  etiqueta: "🏷️",
};

/** Resuelve un enum de ícono a su EMOJI del set curado (F17); fallback estable a ✨. */
export function emojiBeneficio(nombre: string): string {
  return EMOJI_BENEFICIO_MAP[nombre] ?? "✨";
}
