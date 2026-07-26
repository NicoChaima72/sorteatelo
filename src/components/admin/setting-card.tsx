import { Group, Text } from "@mantine/core";
import { type ComponentType, type ReactNode } from "react";

import { PanelCard } from "~/components/admin/panel-card";

type IconCmp = ComponentType<{ className?: string; stroke?: number | string }>;

/**
 * Card de un bloque de AJUSTES del panel: `PanelCard` + encabezado (ícono Tabler + título +
 * descripción) con la gramática «Oscuro + calmo» (design.md §4).
 *
 * Vivía dentro de `admin/configuracion.tsx`; se extrajo al agregar la sección «Campos del checkout»
 * (F03, checkout-campos-configurables), que es un componente propio y necesitaba el MISMO
 * encabezado: duplicarlo habría dejado dos gramáticas de header conviviendo en la misma pantalla.
 */
export function SettingCard({
  icon: Icon,
  title,
  description,
  headerAction,
  children,
}: {
  icon: IconCmp;
  title: string;
  description: string;
  /**
   * Acción OPCIONAL a la derecha del título (guia-conecta-tu-ia F01/D3): hoy, el botón que abre la
   * guía «Conecta tu IA» en la card Conexiones IA.
   *
   * Es un slot y no un `onAyuda?: () => void` porque la card no tiene por qué saber QUÉ acción es;
   * y va acá arriba —y no como un link suelto bajo la descripción— porque abajo competiría con el
   * `EmptyState`, que es justamente lo que se ve cuando el Organizador todavía no conectó nada y
   * más necesita la guía. Sin la prop, el header se renderiza exactamente como antes.
   */
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PanelCard>
      {/* `wrap="wrap"` (y no `nowrap`) es lo que salva al TÍTULO en pantallas angostas: un botón con
          etiqueta larga mide lo que mide y no cede ancho, así que en una sola línea el que se come
          el recorte es siempre el título — medido en vivo, a 375 px quedaba «Co…» y a 320 px
          desaparecía entero, dejando la card sin encabezado. Con wrap, cuando los dos no entran, la
          acción baja a una segunda línea y el título se lee completo. Arriba de ~430 px van juntos
          en la misma línea, que es la forma que la card tiene en desktop. */}
      <Group gap="xs" mb={4} justify="space-between" wrap="wrap">
        <Group gap="xs" wrap="nowrap" className="min-w-0">
          <Icon className="size-[18px]" stroke={1.75} />
          <Text fw={600} className="truncate">
            {title}
          </Text>
        </Group>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        {description}
      </Text>
      {children}
    </PanelCard>
  );
}
