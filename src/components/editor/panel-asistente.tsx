import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { IconSend, IconSparkles } from "@tabler/icons-react";
import { useRef, useState } from "react";

import { type PageDocument } from "~/lib/pagebuilder/schema";
import { api } from "~/utils/api";

/**
 * Panel "Asistente" del dock (Tanda 3 F14/D21): chat con historial LOCAL (en memoria — MVP) que traduce
 * lenguaje natural a mutaciones del borrador vía `api.pagebuilder.asistente`. Superficie pura (I-I): CERO
 * lógica de dominio — el server corre el loop de tool-calling con las MISMAS mutaciones del editor y
 * NUNCA publica (I-U6). Cada respuesta trae el documento nuevo + las acciones aplicadas: `onAplicado`
 * las sube al editor, que patchea el preview en vivo y registra el cambio en el undo-stack (F13).
 *
 * El panel solo se monta cuando el asistente está configurado (hay API key, `asistenteDisponible`) ⇒
 * sin key el editor no lo muestra (fail-soft, cero degradación fea).
 */

interface MensajeLocal {
  rol: "user" | "assistant";
  texto: string;
  /** Acciones aplicadas por el asistente en esta respuesta (para la lista bajo el mensaje). */
  acciones?: string[];
}

export function PanelAsistente({
  slug,
  seleccionId,
  onAplicado,
}: {
  slug: string;
  seleccionId: string | null;
  /** El asistente aplicó cambios: sube el documento + version nuevos al editor (patch + undo-stack). */
  onAplicado: (documento: PageDocument, version: number) => void;
}) {
  const [mensajes, setMensajes] = useState<MensajeLocal[]>([]);
  const [borrador, setBorrador] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);

  const scrollAlFondo = () => {
    requestAnimationFrame(() =>
      viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" }),
    );
  };

  const asistente = api.pagebuilder.asistente.useMutation({
    onSuccess: (res) => {
      setMensajes((m) => [...m, { rol: "assistant", texto: res.texto, acciones: res.acciones }]);
      if (res.acciones.length > 0) onAplicado(res.documento, res.version);
      scrollAlFondo();
    },
    onError: (e) => {
      setMensajes((m) => [
        ...m,
        { rol: "assistant", texto: `No pude completar eso: ${e.message}` },
      ]);
      scrollAlFondo();
    },
  });

  const enviar = () => {
    const texto = borrador.trim();
    if (!texto || asistente.isPending) return;
    const nuevos: MensajeLocal[] = [...mensajes, { rol: "user", texto }];
    setMensajes(nuevos);
    setBorrador("");
    // El historial que viaja al server: solo rol + texto (sin las acciones locales).
    asistente.mutate({
      slug,
      seleccionId: seleccionId ?? undefined,
      mensajes: nuevos.map((m) => ({ rol: m.rol, texto: m.texto })),
    });
    scrollAlFondo();
  };

  return (
    <Stack gap="sm" p="md" style={{ height: "100%" }}>
      <Group gap="xs">
        <IconSparkles className="size-4" style={{ color: "var(--mantine-primary-color-filled)" }} />
        <Text fw={600}>Asistente</Text>
      </Group>
      <Text size="xs" c="dimmed">
        Pídele cambios en palabras. Solo edita el borrador — publicar lo haces tú.
      </Text>

      <ScrollArea style={{ flex: 1, minHeight: 0 }} viewportRef={viewportRef}>
        <Stack gap="sm" pr="xs">
          {mensajes.length === 0 && (
            <Text size="sm" c="dimmed">
              Ej.: “Ponle fondo bicolor a la sección del sorteo y destaca la palabra sorteo en el
              título.”
            </Text>
          )}
          {mensajes.map((m, i) => (
            <Box
              key={i}
              p="xs"
              style={{
                alignSelf: m.rol === "user" ? "flex-end" : "flex-start",
                maxWidth: "92%",
                background:
                  m.rol === "user"
                    ? "var(--mantine-primary-color-light)"
                    : "var(--mantine-color-default)",
                borderRadius: "var(--mantine-radius-md)",
              }}
            >
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {m.texto}
              </Text>
              {m.acciones && m.acciones.length > 0 && (
                <Group gap={4} mt={6}>
                  {m.acciones.map((a, j) => (
                    <Badge key={j} size="xs" variant="light" tt="none">
                      {a}
                    </Badge>
                  ))}
                </Group>
              )}
            </Box>
          ))}
          {asistente.isPending && (
            <Group gap={6}>
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                Pensando…
              </Text>
            </Group>
          )}
        </Stack>
      </ScrollArea>

      <Group gap="xs" align="flex-end" wrap="nowrap">
        <Textarea
          style={{ flex: 1 }}
          placeholder="Escribe qué quieres cambiar…"
          autosize
          minRows={1}
          maxRows={4}
          value={borrador}
          onChange={(e) => setBorrador(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <ActionIcon
          size="lg"
          aria-label="Enviar"
          onClick={enviar}
          loading={asistente.isPending}
          disabled={!borrador.trim()}
        >
          <IconSend className="size-4" />
        </ActionIcon>
      </Group>
    </Stack>
  );
}
