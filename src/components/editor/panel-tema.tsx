import { ActionIcon, Button, Group, Select, Stack, Text } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useState } from "react";

import {
  ANCHO_CONTENIDO,
  ESQUEMAS_FONDO,
  MODO_COLOR,
  PARES_TIPOGRAFICOS,
  RADIO_GLOBAL,
  VIBE,
} from "~/lib/pagebuilder/widgets";
import { type MutacionPagina } from "~/server/domain/pagebuilder/schemas";

type Obj = Record<string, unknown>;

/**
 * Panel del TEMA DE LA PÁGINA (`root.props`, catálogo-v2 F10/D3): modo claro/oscuro, radio, vibe, par
 * tipográfico, ancho por defecto y fondo de página — todos selects de enums cerrados (I-A). "Guardar"
 * emite `set_page_theme` con el objeto COMPLETO (reemplaza el tema; el use case revalida, I3).
 */
export function PanelTema({
  tema,
  onVolver,
  onAplicar,
}: {
  tema: Obj;
  onVolver: () => void;
  onAplicar: (mutacion: MutacionPagina) => void;
}) {
  const [t, setT] = useState<Obj>({ ...tema });
  const set = (campo: string, valor: unknown) => setT((prev) => ({ ...prev, [campo]: valor }));
  const sel = (campo: string, def: string, opciones: readonly string[]) => (
    <Select
      label={ETIQUETAS[campo] ?? campo}
      data={opciones.map((o) => ({ value: o, label: o }))}
      value={(t[campo] as string) ?? def}
      onChange={(v) => v && set(campo, v)}
    />
  );

  return (
    <Stack gap="sm" p="md">
      <Group gap="xs" wrap="nowrap">
        <ActionIcon variant="subtle" onClick={onVolver} aria-label="Volver a la lista">
          <IconArrowLeft className="size-4" />
        </ActionIcon>
        <Text fw={600}>Tema de la página</Text>
      </Group>

      {sel("modo", "claro", MODO_COLOR)}
      {sel("tipografia", "plataforma", PARES_TIPOGRAFICOS)}
      {sel("radio", "m", RADIO_GLOBAL)}
      {sel("vibe", "suave", VIBE)}
      {sel("anchoContenido", "contenido", ANCHO_CONTENIDO)}
      {sel("fondoPagina", "superficie", ESQUEMAS_FONDO)}

      <Button onClick={() => onAplicar({ accion: "set_page_theme", tema: t })}>Guardar tema</Button>
    </Stack>
  );
}

const ETIQUETAS: Record<string, string> = {
  modo: "Modo de color",
  tipografia: "Tipografía",
  radio: "Redondeo",
  vibe: "Personalidad",
  anchoContenido: "Ancho por defecto",
  fondoPagina: "Fondo de la página",
};
