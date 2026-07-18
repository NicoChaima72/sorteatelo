import { Stack, Text, ThemeIcon } from "@mantine/core";
import { type ComponentType, type ReactNode } from "react";

type IconCmp = ComponentType<{ className?: string; stroke?: number | string }>;

/**
 * Estado vacío reutilizable del panel (F05/D9.2): ícono Tabler + mensaje en voz al usuario +
 * CTA opcional. Reemplaza los "hueco de texto plano" que había en las tablas/listas (dashboard
 * sin ventas, ventas, participantes del sorteo, tiendas del operador). Tono cercano chileno
 * (dirección §tono). Cero hex inline — el ícono va en `gray` light (neutro), el color lo carga
 * el CTA si lo hay.
 */
interface EmptyStateProps {
  icon: IconCmp;
  title: string;
  description?: string;
  /** CTA opcional (típicamente un `<Button>`). */
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Stack align="center" gap={6} py="xl" px="md" ta="center">
      <ThemeIcon size={48} radius="xl" variant="light" color="gray">
        <Icon className="size-6" stroke={1.75} />
      </ThemeIcon>
      <Text mt="xs" fw={600}>
        {title}
      </Text>
      {description && (
        <Text size="sm" c="dimmed" className="max-w-sm">
          {description}
        </Text>
      )}
      {action && <div className="mt-3">{action}</div>}
    </Stack>
  );
}
