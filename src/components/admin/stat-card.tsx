import { Card, Group, Text } from "@mantine/core";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { type ComponentType } from "react";

import { cn } from "~/lib/utils";

type IconCmp = ComponentType<{
  className?: string;
  stroke?: number | string;
  color?: string;
}>;

interface StatCardProps {
  label: string;
  value: string;
  icon: IconCmp;
  delta?: { value: string; dir: "up" | "down" };
  hint?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  hint,
}: StatCardProps) {
  return (
    <Card withBorder padding="lg" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" fw={500} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.03em" }}>
          {label}
        </Text>
        {/* Acento primario del panel (cobalto de plataforma). Hereda la paleta del theme por token. */}
        <Icon
          className="size-[18px]"
          stroke={1.75}
          color="var(--mantine-primary-color-filled)"
        />
      </Group>
      <Text mt="sm" fw={600} fz="1.5rem" lh={1.2} className="tabular-nums">
        {value}
      </Text>
      <Group mt={6} gap={6} align="center">
        {delta && (
          <Text span size="xs" fw={500} className="inline-flex items-center gap-0.5">
            {delta.dir === "up" ? (
              <IconTrendingUp className="size-3.5" />
            ) : (
              <IconTrendingDown className="size-3.5" />
            )}
            {delta.value}
          </Text>
        )}
        {hint && (
          <Text span size="xs" c="dimmed" className={cn(delta && "before:mr-1 before:content-['·']")}>
            {hint}
          </Text>
        )}
      </Group>
    </Card>
  );
}
