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
