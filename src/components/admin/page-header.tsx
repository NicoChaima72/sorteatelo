import { Group, Text, Title } from "@mantine/core";
import { type ReactNode } from "react";

/**
 * Encabezado de página del panel (F04/D8). Vive DENTRO del contenido (`AppShell.Main`), no en la
 * barra superior: el `AppShell.Header` quedó liviano (marca + cuenta + "Ver mi tienda"). Título
 * como `h1`, descripción y acciones de la página. `AdminLayout` lo renderiza desde su API
 * `title`/`description`/`actions`, así las páginas no cambian.
 */
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap" gap="md" mb="lg">
      <div className="min-w-0">
        <Title order={1} fz="h2" fw={700} lh={1.2}>
          {title}
        </Title>
        {description && (
          <Text size="sm" c="dimmed" mt={4}>
            {description}
          </Text>
        )}
      </div>
      {actions && (
        <Group gap="sm" wrap="nowrap">
          {actions}
        </Group>
      )}
    </Group>
  );
}
