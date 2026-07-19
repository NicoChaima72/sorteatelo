import {
  Box,
  Button,
  FileButton,
  Group,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPhoto, IconTrash, IconUpload } from "@tabler/icons-react";
import { useState } from "react";

import { CONTENT_TYPES_IMAGEN, esContentTypeImagen } from "~/lib/imagenes";
import { api } from "~/utils/api";

/**
 * Picker de imagen del editor (catálogo-v2 F10): para toda prop `urlPublica`, elige una imagen ya
 * subida (galería de `PageAsset`, F08) o sube una nueva (presign → PUT directo a R2 → confirm). Setea
 * la prop con la URL pública. Cero lógica de dominio: usa los procedures gateados de F08.
 */
export function PickerImagen({
  slug: _slug,
  label,
  valor,
  onChange,
}: {
  slug: string;
  label: string;
  valor: string;
  onChange: (url: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const lista = api.pagebuilder.listarImagenes.useQuery(undefined, { enabled: abierto, retry: false });
  const utils = api.useUtils();
  const crearUrl = api.pagebuilder.crearUrlSubidaImagen.useMutation();
  const confirmar = api.pagebuilder.confirmarImagen.useMutation();

  const subir = async (file: File | null) => {
    if (!file) return;
    const contentType = file.type;
    // Narrowing por el type guard (fuente única de la allowlist): tras el `return`, `contentType` es un
    // `ContentTypeImagen` ⇒ los procedures lo reciben tipado sin `any` (el server igual revalida el enum).
    if (!esContentTypeImagen(contentType)) {
      notifications.show({ color: "red", title: "Formato no permitido", message: "Usa PNG, JPG o WebP." });
      return;
    }
    setSubiendo(true);
    try {
      const { assetId, url } = await crearUrl.mutateAsync({ contentType, bytes: file.size });
      const put = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      if (!put.ok) throw new Error("La subida falló.");
      const confirmado = await confirmar.mutateAsync({ assetId, contentType, bytes: file.size });
      onChange(confirmado.url);
      void utils.pagebuilder.listarImagenes.invalidate();
      setAbierto(false);
    } catch (e) {
      notifications.show({ color: "red", title: "No se pudo subir", message: e instanceof Error ? e.message : "Error" });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Box>
      <Text size="sm" fw={500} mb={4}>{label}</Text>
      <Group gap="sm">
        {valor ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={valor} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "var(--mantine-radius-sm)" }} />
        ) : (
          <Box style={{ width: 56, height: 56, borderRadius: "var(--mantine-radius-sm)", background: "var(--mantine-color-gray-1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IconPhoto className="size-5" color="var(--mantine-color-dimmed)" />
          </Box>
        )}
        <Button size="xs" variant="default" onClick={() => setAbierto(true)}>Elegir imagen</Button>
        {valor && (
          <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash className="size-3.5" />} onClick={() => onChange("")}>
            Quitar
          </Button>
        )}
      </Group>

      <Modal opened={abierto} onClose={() => setAbierto(false)} title="Elegir una imagen" size="lg" centered>
        <Stack gap="md">
          <FileButton onChange={subir} accept={CONTENT_TYPES_IMAGEN.join(",")} disabled={subiendo}>
            {(props) => (
              <Button {...props} leftSection={subiendo ? <Loader size="xs" /> : <IconUpload className="size-4" />} disabled={subiendo}>
                Subir una imagen nueva
              </Button>
            )}
          </FileButton>

          {lista.isLoading ? (
            <Group justify="center" p="md"><Loader /></Group>
          ) : lista.data && lista.data.length > 0 ? (
            <SimpleGrid cols={3} spacing="xs">
              {lista.data.map((a) => (
                <UnstyledButton
                  key={a.id}
                  aria-label="Elegir esta imagen"
                  onClick={() => {
                    onChange(a.url);
                    setAbierto(false);
                  }}
                  style={{ borderRadius: "var(--mantine-radius-sm)", overflow: "hidden", display: "block" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt=""
                    style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
                  />
                </UnstyledButton>
              ))}
            </SimpleGrid>
          ) : (
            <Text size="sm" c="dimmed">Todavía no subiste imágenes. Sube la primera arriba.</Text>
          )}
        </Stack>
      </Modal>
    </Box>
  );
}
