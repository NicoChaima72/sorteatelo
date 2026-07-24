import { ActionIcon, Avatar, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
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

/** Iniciales del nombre (hasta 2 palabras) para el fallback del avatar. */
function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = palabras.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return letras.join("") || "?";
}

/**
 * `perfil_autora` (sección, catálogo-v2 F12): bloque editorial "sobre mí" centrado. Avatar del picker
 * (`<Avatar src>`) o iniciales del `nombre` (degradación elegante: sin imagen o URL rota ⇒ iniciales,
 * nunca un `<img>` roto — Mantine Avatar cae a los `children`). `redes` reusa el shape de
 * `botones_sociales` (ícono Tabler de marca + color del TEMA del tenant, I-G — sin colores de red
 * fijos, sin SDKs). Texto plano (I3).
 */
export function PerfilAutora({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "perfil_autora" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="md" align="center" ta="center" maw={640} mx="auto">
        <Avatar
          src={props.avatarUrl ?? null}
          alt={props.nombre}
          size={120}
          radius="50%"
          color="var(--mantine-primary-color-filled)"
          styles={{ placeholder: { fontSize: "var(--mantine-font-size-xl)", fontWeight: 700 } }}
        >
          {iniciales(props.nombre)}
        </Avatar>

        <Title order={2} fz={{ base: 24, sm: 30 }} fw={700}>
          {props.nombre}
        </Title>

        {props.bio && (
          <Text size="lg" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
            {props.bio}
          </Text>
        )}

        {props.redes && props.redes.length > 0 && (
          <Group gap="sm" justify="center" mt="xs">
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
                    variant="light"
                    size="lg"
                    radius="xl"
                    className="animar-hover-lift"
                  >
                    <Icono className="size-5" stroke={1.75} />
                  </ActionIcon>
                </Tooltip>
              );
            })}
          </Group>
        )}
      </Stack>
    </SeccionWrapper>
  );
}
