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
  children,
}: {
  icon: IconCmp;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <PanelCard>
      <Group gap="xs" mb={4}>
        <Icon className="size-[18px]" stroke={1.75} />
        <Text fw={600}>{title}</Text>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        {description}
      </Text>
      {children}
    </PanelCard>
  );
}
