import { Button, Group, Stack, Text } from "@mantine/core";
import {
  IconBrandFacebook,
  IconBrandTelegram,
  IconBrandWhatsapp,
  IconBrandX,
  IconCheck,
  IconCopy,
  type IconProps,
} from "@tabler/icons-react";
import { useEffect, useState, type ComponentType } from "react";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

const ICONO: Record<string, ComponentType<IconProps>> = {
  whatsapp: IconBrandWhatsapp,
  x: IconBrandX,
  telegram: IconBrandTelegram,
  facebook: IconBrandFacebook,
  copiar: IconCopy,
};

const LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  x: "X",
  telegram: "Telegram",
  facebook: "Facebook",
  copiar: "Copiar enlace",
};

/** Deeplink de difusión por canal (sin SDKs de terceros). `copiar` no es un enlace (usa el portapapeles). */
function deeplink(canal: string, mensaje: string, url: string): string | null {
  const texto = `${mensaje} ${url}`.trim();
  switch (canal) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(texto)}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(mensaje)}&url=${encodeURIComponent(url)}`;
    case "telegram":
      return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(mensaje)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    default:
      return null; // copiar
  }
}

/**
 * `compartir_sorteo` (sección, catálogo-v2 F06): botones de difusión (motor viral). Sin SDKs: cada
 * canal es un deeplink (WhatsApp/X/Telegram/Facebook) y `copiar` usa el portapapeles. La URL es la de
 * ESTA tienda (host actual, resuelto client-side ⇒ no se hornea al HTML cacheable). El mensaje es del
 * documento (texto plano). Micro-feedback "¡Copiado!".
 */
export function CompartirSorteo({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "compartir_sorteo" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const mensaje = props.mensaje ?? "¡Mira esta tienda y participa del sorteo!";
  const [url, setUrl] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    // Host actual (client-side): la URL pública de la tienda, sin el token de preview.
    setUrl(window.location.origin + window.location.pathname);
  }, []);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`${mensaje} ${url}`.trim());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard bloqueado ⇒ sin feedback (degrada limpio) */
    }
  };

  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Stack gap="md" align="center">
        <Text fw={600} fz={{ base: "lg", sm: "xl" }} ta="center">
          {props.titulo ?? "Compártelo con tus amigos"}
        </Text>
        <Group gap="sm" justify="center">
          {props.canales.map((canal) => {
            const Icono = ICONO[canal] ?? IconCopy;
            if (canal === "copiar") {
              return (
                <Button
                  key={canal}
                  variant="default"
                  radius="xl"
                  leftSection={
                    copiado ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />
                  }
                  onClick={copiar}
                  className="animar-hover-lift"
                >
                  {copiado ? "¡Copiado!" : LABEL.copiar}
                </Button>
              );
            }
            const href = deeplink(canal, mensaje, url);
            return (
              <Button
                key={canal}
                component="a"
                href={href ?? "#"}
                target="_blank"
                rel="noreferrer"
                variant="light"
                radius="xl"
                leftSection={<Icono className="size-4" />}
                className="animar-hover-lift"
              >
                {LABEL[canal] ?? canal}
              </Button>
            );
          })}
        </Group>
      </Stack>
    </SeccionWrapper>
  );
}
