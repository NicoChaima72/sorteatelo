import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconEdit,
  IconHome,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";

import { api } from "~/utils/api";

/**
 * Panel "Páginas" del editor (Tanda 3 F05, DockKey nuevo). Lista las páginas de la Tienda, permite
 * crear/renombrar/eliminar (slug validado server-side) y togglear `enNav` (nav derivado). El SWITCHER
 * (click en una página) llama `onSwitch(slug)` ⇒ el editor recarga borrador + preview sobre esa página.
 * Superficie pura (I-I): CERO lógica de dominio; toda escritura pasa por `api.pagebuilder.*` (gateada por
 * membresía server-side). `home` no ofrece renombrar/eliminar (protegida en el use case y en la UI).
 */
export function PanelPaginas({
  slugActual,
  onSwitch,
}: {
  slugActual: string;
  onSwitch: (slug: string) => void;
}) {
  const utils = api.useUtils();
  const paginas = api.pagebuilder.listarPaginas.useQuery();
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [renombrar, setRenombrar] = useState<{ slug: string } | null>(null);

  const refrescar = () => void utils.pagebuilder.listarPaginas.invalidate();

  const crear = api.pagebuilder.crearPagina.useMutation({
    onSuccess: (res) => {
      setCrearAbierto(false);
      refrescar();
      onSwitch(res.slug); // salta a editar la página nueva
      notifications.show({ color: "teal", title: "Página creada", message: `/${res.slug}` });
    },
    onError: (e) => notifications.show({ color: "red", title: "No se pudo crear", message: e.message }),
  });

  const renombrarMut = api.pagebuilder.renombrarPagina.useMutation({
    onSuccess: (res) => {
      const saltar = renombrar?.slug === slugActual;
      setRenombrar(null);
      refrescar();
      if (saltar) onSwitch(res.slug); // si renombramos la página abierta, seguimos en ella
      notifications.show({ color: "teal", title: "Página renombrada", message: `/${res.slug}` });
    },
    onError: (e) => notifications.show({ color: "red", title: "No se pudo renombrar", message: e.message }),
  });

  const eliminar = api.pagebuilder.eliminarPagina.useMutation({
    onSuccess: (res) => {
      refrescar();
      if (res.slug === slugActual) onSwitch("home"); // si borramos la abierta, volvemos a home
      notifications.show({ color: "teal", title: "Página eliminada", message: `/${res.slug}` });
    },
    onError: (e) => notifications.show({ color: "red", title: "No se pudo eliminar", message: e.message }),
  });

  const enNav = api.pagebuilder.setEnNav.useMutation({
    onSuccess: refrescar,
    onError: (e) => notifications.show({ color: "red", title: "No se pudo actualizar el menú", message: e.message }),
  });

  if (paginas.isLoading) return <Loader size="sm" m="md" />;
  const lista = paginas.data ?? [];

  return (
    <Stack gap="sm" p="md">
      <Button
        size="xs"
        variant="light"
        leftSection={<IconPlus className="size-4" />}
        onClick={() => setCrearAbierto(true)}
      >
        Nueva página
      </Button>

      <Stack gap="xs">
        {lista.map((p) => {
          const activa = p.slug === slugActual;
          return (
            <Box
              key={p.slug}
              p="xs"
              style={{
                border: `1px solid ${activa ? "var(--mantine-primary-color-filled)" : "var(--mantine-color-default-border)"}`,
                borderRadius: "var(--mantine-radius-sm)",
                background: activa ? "var(--mantine-color-gray-0)" : undefined,
              }}
            >
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Box
                  style={{ minWidth: 0, cursor: "pointer", flex: 1 }}
                  onClick={() => onSwitch(p.slug)}
                >
                  <Group gap={6} wrap="nowrap">
                    {p.esHome && <IconHome className="size-3.5" style={{ color: "var(--mantine-color-dimmed)" }} />}
                    <Text size="sm" fw={activa ? 600 : 500} truncate>
                      {p.esHome ? "Inicio" : `/${p.slug}`}
                    </Text>
                  </Group>
                  <Badge size="xs" variant="light" color={p.publicado ? "teal" : "gray"} tt="none" mt={2}>
                    {p.publicado ? "Publicada" : "Borrador"}
                  </Badge>
                </Box>
                <Group gap={2} wrap="nowrap">
                  <Tooltip label="Editar esta página" withArrow>
                    <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Editar" onClick={() => onSwitch(p.slug)}>
                      <IconEdit className="size-4" />
                    </ActionIcon>
                  </Tooltip>
                  {!p.esHome && (
                    <>
                      <Tooltip label="Renombrar" withArrow>
                        <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Renombrar" onClick={() => setRenombrar({ slug: p.slug })}>
                          <IconPencil className="size-4" />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Eliminar" withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          aria-label="Eliminar"
                          loading={eliminar.isPending && eliminar.variables?.slug === p.slug}
                          onClick={() => {
                            if (confirm(`¿Eliminar la página /${p.slug}? Se borra su historial.`)) {
                              eliminar.mutate({ slug: p.slug });
                            }
                          }}
                        >
                          <IconTrash className="size-4" />
                        </ActionIcon>
                      </Tooltip>
                    </>
                  )}
                </Group>
              </Group>
              {!p.esHome && (
                <Switch
                  mt="xs"
                  size="xs"
                  label="Mostrar en el menú"
                  checked={p.enNav}
                  onChange={(e) => enNav.mutate({ slug: p.slug, enNav: e.currentTarget.checked })}
                />
              )}
            </Box>
          );
        })}
      </Stack>

      <CrearPaginaModal
        opened={crearAbierto}
        onClose={() => setCrearAbierto(false)}
        onCrear={(slug, nombre) => crear.mutate({ slug, nombre })}
        cargando={crear.isPending}
      />
      <RenombrarPaginaModal
        slug={renombrar?.slug ?? null}
        onClose={() => setRenombrar(null)}
        onRenombrar={(slugNuevo) => renombrar && renombrarMut.mutate({ slug: renombrar.slug, slugNuevo })}
        cargando={renombrarMut.isPending}
      />
    </Stack>
  );
}

/** Modal de creación: nombre humano + slug (sugerido desde el nombre). El use case revalida (I3). */
function CrearPaginaModal({
  opened,
  onClose,
  onCrear,
  cargando,
}: {
  opened: boolean;
  onClose: () => void;
  onCrear: (slug: string, nombre: string) => void;
  cargando: boolean;
}) {
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const slugAuto = slug.trim() || sugerirSlug(nombre);

  return (
    <Modal opened={opened} onClose={onClose} title="Nueva página" centered size="sm">
      <Stack gap="sm">
        <TextInput
          label="Nombre"
          placeholder="Sobre mí"
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
          maxLength={120}
        />
        <TextInput
          label="Dirección (slug)"
          description="Minúsculas y guiones. Ej: sobre-mi"
          placeholder={sugerirSlug(nombre) || "sobre-mi"}
          value={slug}
          onChange={(e) => setSlug(e.currentTarget.value)}
          maxLength={64}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" size="xs" onClick={onClose}>Cancelar</Button>
          <Button size="xs" loading={cargando} disabled={!slugAuto} onClick={() => onCrear(slugAuto, nombre.trim())}>
            Crear
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Modal de renombrado: pide el slug nuevo. El use case valida y mueve el historial (D8). */
function RenombrarPaginaModal({
  slug,
  onClose,
  onRenombrar,
  cargando,
}: {
  slug: string | null;
  onClose: () => void;
  onRenombrar: (slugNuevo: string) => void;
  cargando: boolean;
}) {
  const [slugNuevo, setSlugNuevo] = useState("");
  return (
    <Modal opened={slug !== null} onClose={onClose} title={`Renombrar /${slug ?? ""}`} centered size="sm">
      <Stack gap="sm">
        <TextInput
          label="Nueva dirección (slug)"
          description="Minúsculas y guiones"
          placeholder="sobre-mi"
          value={slugNuevo}
          onChange={(e) => setSlugNuevo(e.currentTarget.value)}
          maxLength={64}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" size="xs" onClick={onClose}>Cancelar</Button>
          <Button size="xs" loading={cargando} disabled={!slugNuevo.trim()} onClick={() => onRenombrar(slugNuevo.trim())}>
            Renombrar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Sugiere un slug kebab desde un nombre (minúsculas, sin acentos, espacios→guiones). Solo UI (el server valida). */
function sugerirSlug(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
