import { ActionIcon, Group, Stack, Text, Tooltip } from "@mantine/core";
import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandTelegram,
  IconBrandThreads,
  IconBrandTiktok,
  IconBrandWhatsapp,
  IconBrandX,
  IconBrandYoutube,
  IconLink,
  type IconProps,
} from "@tabler/icons-react";
import { type ComponentType } from "react";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/** Mapa de la red (enum cerrado) al ícono Tabler + etiqueta accesible. Fallback: `IconLink`. */
const RED: Record<string, { Icono: ComponentType<IconProps>; label: string }> = {
  instagram: { Icono: IconBrandInstagram, label: "Instagram" },
  tiktok: { Icono: IconBrandTiktok, label: "TikTok" },
  whatsapp: { Icono: IconBrandWhatsapp, label: "WhatsApp" },
  youtube: { Icono: IconBrandYoutube, label: "YouTube" },
  x: { Icono: IconBrandX, label: "X" },
  facebook: { Icono: IconBrandFacebook, label: "Facebook" },
  threads: { Icono: IconBrandThreads, label: "Threads" },
  telegram: { Icono: IconBrandTelegram, label: "Telegram" },
};

/** Estilo del widget → variante de `ActionIcon` (theming per-tenant, I-G — no colores de marca fijos). */
const VARIANTE: Record<string, string> = {
  relleno: "filled",
  contorno: "outline",
  minimal: "subtle",
};

/**
 * `botones_sociales` (sección, catálogo-v2 F05): fila "sígueme". Cada red es un enlace (pestaña nueva,
 * `rel="noreferrer"`) con su ícono de marca Tabler y color del TEMA del tenant (I-G) — sin SDKs de
 * terceros, solo enlaces. Hover-lift CSS (F03).
 */
export function BotonesSociales({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "botones_sociales" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const variant = VARIANTE[props.estilo] ?? "filled";
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="md" align="center">
        {props.titulo && (
          <Text fw={600} fz={{ base: "lg", sm: "xl" }} ta="center">
            {props.titulo}
          </Text>
        )}
        <Group gap="sm" justify="center">
          {props.redes.map((r, i) => {
            const def = RED[r.red] ?? { Icono: IconLink, label: r.red };
            const Icono = def.Icono;
            return (
              <Tooltip key={i} label={def.label} withArrow>
                <ActionIcon
                  component="a"
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={def.label}
                  variant={variant}
                  size="xl"
                  radius="xl"
                  className="animar-hover-lift"
                >
                  <Icono className="size-6" stroke={1.75} />
                </ActionIcon>
              </Tooltip>
            );
          })}
        </Group>
      </Stack>
    </SeccionWrapper>
  );
}
