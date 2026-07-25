import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconLock, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import {
  COLUMNAS_FOOTER,
  FONDO_HEADER,
  LAYOUT_HEADER,
  STICKY_HEADER,
  type Chrome,
  type MenuItem,
} from "~/lib/pagebuilder/chrome";
import { CTA_ANCLAS } from "~/lib/pagebuilder/widgets";
import { api } from "~/utils/api";

/**
 * Panel "Chrome" del editor (Tanda 3 F07/D12, ADR-0021, DockKey nuevo). Edita el header/footer GLOBAL del
 * tenant (menú, fondo, sticky, layout, links/texto del footer) y lo guarda vía `api.pagebuilder.setChrome`
 * (validación Zod server-side, I3). Los NODOS PINNED (carrito/sesión/atribución+Bases) se muestran con
 * CANDADO — visibles pero NO editables (I-U2: no hay input que los quite). Superficie pura (I-I).
 */
export function PanelChrome({ onGuardado }: { onGuardado: () => void }) {
  const chromeQuery = api.pagebuilder.getChrome.useQuery();
  const [chrome, setChrome] = useState<Chrome | null>(null);

  useEffect(() => {
    if (chromeQuery.data) setChrome(chromeQuery.data);
  }, [chromeQuery.data]);

  const guardar = api.pagebuilder.setChrome.useMutation({
    onSuccess: () => {
      onGuardado();
      notifications.show({ color: "teal", title: "Chrome guardado", message: "Actualizamos tu vista previa." });
    },
    onError: (e) => notifications.show({ color: "red", title: "No se pudo guardar", message: e.message }),
  });

  if (!chrome) return <Loader size="sm" m="md" />;

  const setHeader = (parche: Partial<Chrome["header"]>) =>
    setChrome({ ...chrome, header: { ...chrome.header, ...parche } });
  const setFooter = (parche: Partial<Chrome["footer"]>) =>
    setChrome({ ...chrome, footer: { ...chrome.footer, ...parche } });

  return (
    <Stack gap="md" p="md">
      {/* ── Pinned (candado) ── */}
      <Box p="xs" style={{ border: "1px dashed var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-sm)" }}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>Fijos de la plataforma</Text>
        <Stack gap={4}>
          {["Carrito de compra", "Acceso / sesión", "Atribución + enlace a las Bases del sorteo"].map((l) => (
            <Group key={l} gap={6} wrap="nowrap">
              <IconLock className="size-3.5" style={{ color: "var(--mantine-color-dimmed)" }} />
              <Text size="xs" c="dimmed">{l}</Text>
            </Group>
          ))}
        </Stack>
        <Text size="xs" c="dimmed" mt={6} fs="italic">Siempre visibles; no se pueden quitar.</Text>
      </Box>

      {/* ── Header ── */}
      <Divider label="Encabezado" labelPosition="left" />
      <Select
        label="Fondo del header"
        data={FONDO_HEADER.map((o) => ({ value: o, label: o }))}
        value={chrome.header.fondo}
        onChange={(v) => v && setHeader({ fondo: v as Chrome["header"]["fondo"] })}
      />
      <Select
        label="Al hacer scroll"
        data={STICKY_HEADER.map((o) => ({ value: o, label: o === "fijo" ? "Se queda pegado" : "Se va con el scroll" }))}
        value={chrome.header.sticky}
        onChange={(v) => v && setHeader({ sticky: v as Chrome["header"]["sticky"] })}
      />
      <Select
        label="Posición del logo"
        data={LAYOUT_HEADER.map((o) => ({ value: o, label: o }))}
        value={chrome.header.layout}
        onChange={(v) => v && setHeader({ layout: v as Chrome["header"]["layout"] })}
      />
      <Switch
        label="Transparente sobre el hero"
        checked={chrome.header.transparenteSobreHero}
        onChange={(e) => setHeader({ transparenteSobreHero: e.currentTarget.checked })}
      />
      <EditorMenu
        label="Menú del header"
        items={chrome.header.menu}
        max={8}
        onChange={(menu) => setHeader({ menu })}
        ayuda="Si dejas el menú vacío, se arma solo desde tus secciones y páginas."
      />

      {/* ── Footer ── */}
      <Divider label="Pie de página" labelPosition="left" />
      <Select
        label="Columnas del footer"
        data={COLUMNAS_FOOTER.map((o) => ({ value: o, label: o }))}
        value={chrome.footer.columnas}
        onChange={(v) => v && setFooter({ columnas: v as Chrome["footer"]["columnas"] })}
      />
      <TextInput
        label="Texto del footer"
        placeholder="(opcional)"
        maxLength={200}
        value={chrome.footer.texto ?? ""}
        onChange={(e) => setFooter({ texto: e.currentTarget.value || undefined })}
      />
      <EditorMenu
        label="Links del footer"
        items={chrome.footer.links}
        max={12}
        onChange={(links) => setFooter({ links })}
      />

      {/* ── Acciones ── */}
      <Group justify="space-between" mt="xs">
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          onClick={() => guardar.mutate({ chrome: null })}
          loading={guardar.isPending && guardar.variables?.chrome === null}
        >
          Restablecer
        </Button>
        <Button
          size="xs"
          onClick={() => guardar.mutate({ chrome })}
          loading={guardar.isPending && guardar.variables?.chrome !== null}
        >
          Guardar chrome
        </Button>
      </Group>
    </Stack>
  );
}

/** Editor de una lista de `MenuItem` (etiqueta + destino tipado). Reusado por el menú del header y del footer. */
function EditorMenu({
  label,
  items,
  max,
  onChange,
  ayuda,
}: {
  label: string;
  items: MenuItem[];
  max: number;
  onChange: (items: MenuItem[]) => void;
  ayuda?: string;
}) {
  const set = (i: number, item: MenuItem) => {
    const copia = [...items];
    copia[i] = item;
    onChange(copia);
  };
  const agregar = () =>
    onChange([...items, { etiqueta: "Nuevo", destino: { tipo: "ancla", ancla: CTA_ANCLAS[0] } }]);

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>{label}</Text>
      {ayuda && <Text size="xs" c="dimmed">{ayuda}</Text>}
      {items.map((item, i) => (
        <Box key={i} p="xs" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-sm)" }}>
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">#{i + 1}</Text>
            <ActionIcon variant="subtle" color="red" size="sm" aria-label="Quitar" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <IconTrash className="size-4" />
            </ActionIcon>
          </Group>
          <ItemDestino item={item} onChange={(it) => set(i, it)} />
        </Box>
      ))}
      {items.length < max && (
        <Button size="xs" variant="light" leftSection={<IconPlus className="size-4" />} onClick={agregar}>
          Agregar enlace
        </Button>
      )}
    </Stack>
  );
}

/** Un ítem de menú: etiqueta + destino (tipo select + valor según la rama). El server revalida (I3). */
function ItemDestino({ item, onChange }: { item: MenuItem; onChange: (item: MenuItem) => void }) {
  const setDestinoTipo = (tipo: "ancla" | "pagina" | "url") => {
    const destino =
      tipo === "ancla"
        ? { tipo: "ancla" as const, ancla: CTA_ANCLAS[0] }
        : tipo === "pagina"
          ? { tipo: "pagina" as const, slug: "" }
          : { tipo: "url" as const, url: "" };
    onChange({ ...item, destino });
  };

  return (
    <Stack gap="xs">
      <TextInput
        label="Etiqueta"
        maxLength={20}
        value={item.etiqueta}
        onChange={(e) => onChange({ ...item, etiqueta: e.currentTarget.value })}
      />
      <Select
        label="Destino"
        data={[
          { value: "ancla", label: "Sección de esta página" },
          { value: "pagina", label: "Otra página" },
          { value: "url", label: "Enlace externo (https)" },
        ]}
        value={item.destino.tipo}
        onChange={(v) => v && setDestinoTipo(v as "ancla" | "pagina" | "url")}
      />
      {item.destino.tipo === "ancla" && (
        <Select
          label="Sección"
          data={CTA_ANCLAS.map((a) => ({ value: a, label: a }))}
          value={item.destino.ancla}
          onChange={(v) => v && onChange({ ...item, destino: { tipo: "ancla", ancla: v as (typeof CTA_ANCLAS)[number] } })}
        />
      )}
      {item.destino.tipo === "pagina" && (
        <TextInput
          label="Slug de la página"
          placeholder="sobre-mi"
          value={item.destino.slug}
          onChange={(e) => onChange({ ...item, destino: { tipo: "pagina", slug: e.currentTarget.value } })}
        />
      )}
      {item.destino.tipo === "url" && (
        <TextInput
          label="URL (https)"
          placeholder="https://…"
          value={item.destino.url}
          onChange={(e) => onChange({ ...item, destino: { tipo: "url", url: e.currentTarget.value } })}
        />
      )}
      <Tooltip label="Los enlaces se validan al guardar (https, slug válido)" withArrow>
        <Text size="xs" c="dimmed">El destino se valida al guardar.</Text>
      </Tooltip>
    </Stack>
  );
}
