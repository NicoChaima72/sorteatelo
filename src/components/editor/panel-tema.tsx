import {
  ActionIcon,
  ColorInput,
  Divider,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useState } from "react";

import { useAutoGuardado } from "~/components/editor/use-auto-guardado";
import { SWATCHES_MARCA } from "~/lib/coloresMarca";
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

/** Hex de 3/6 dígitos (espejo de `esHex`/`setColorAcentoInput`). */
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Panel del TEMA DE LA PÁGINA (`root.props`, catálogo-v2 F10/D3): modo claro/oscuro, radio, vibe, par
 * tipográfico, ancho por defecto y fondo de página — todos selects de enums cerrados (I-A). "Guardar"
 * emite `set_page_theme` con el objeto COMPLETO (reemplaza el tema; el use case revalida, I3).
 *
 * builder-tanda-1 F01/D2: el SEGUNDO color de marca (`colorAcento`) también se edita acá, pero vive
 * FUERA del documento (columna `Tenant.colorAcento`, I-T1) ⇒ NO va por `set_page_theme` sino por
 * `onColorAcento` (procedure `setColorAcento`, que recarga la preview). Auto-guardado on-change-end
 * (D14): al soltar el picker o al blur, si el valor es hex válido (o vacío ⇒ limpiar) se aplica.
 */
export function PanelTema({
  tema,
  colorAcento,
  onColorAcento,
  aplicandoAcento,
  onVolver,
  onAplicar,
}: {
  tema: Obj;
  /** Valor actual del acento del tenant (hex) o `null`. */
  colorAcento: string | null;
  /** Aplica el acento (hex válido) o lo limpia (`null`). */
  onColorAcento: (hex: string | null) => void;
  aplicandoAcento: boolean;
  onVolver: () => void;
  onAplicar: (mutacion: MutacionPagina) => void;
}) {
  const [t, setT] = useState<Obj>({ ...tema });
  const [acento, setAcento] = useState<string>(colorAcento ?? "");
  const set = (campo: string, valor: unknown) => setT((prev) => ({ ...prev, [campo]: valor }));

  // Auto-guardado on-change (F10/D14): sin botón "Guardar tema" — cada select emite `set_page_theme` con
  // debounce ~500ms. (Cambiar el tema RECARGA la preview, F09/D13: toca el provider a nivel de página.)
  useAutoGuardado(t, (tema) => onAplicar({ accion: "set_page_theme", tema }));
  const sel = (campo: string, def: string, opciones: readonly string[]) => (
    <Select
      label={ETIQUETAS[campo] ?? campo}
      data={opciones.map((o) => ({ value: o, label: o }))}
      value={(t[campo] as string) ?? def}
      onChange={(v) => v && set(campo, v)}
    />
  );

  /** On-change-end: aplica un hex válido, o limpia si quedó vacío. Ignora estados intermedios inválidos. */
  const aplicarAcento = (valor: string) => {
    const limpio = valor.trim();
    if (limpio === "") return onColorAcento(null);
    if (HEX.test(limpio)) return onColorAcento(limpio);
    // hex incompleto/ inválido ⇒ no se aplica (se espera a que quede bien formado)
  };

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

      {/* Luces en movimiento (focos-animados F03/D5): solo aparece si la tienda YA tiene un ambiente —
          sin focos no hay nada que animar y el switch sería una promesa vacía. El movimiento no se
          elige: lo deriva el tipo de ambiente (focos y aurora derivan, neón pulsa), así que este es el
          único control que necesita. */}
      {(t.ambiente ?? "ninguno") !== "ninguno" && (
        <Switch
          label="Luces en movimiento"
          description="Los focos del fondo se mueven muy lento. Se detienen solos si la persona pidió menos animaciones."
          checked={Boolean(t.ambienteAnimado)}
          onChange={(e) => set("ambienteAnimado", e.currentTarget.checked)}
        />
      )}

      <Divider label="Segundo color de marca" labelPosition="left" mt="xs" />
      <ColorInput
        label="Color de acento"
        description="Un 2º color para fondos, títulos y detalles. Se guarda al elegirlo."
        placeholder="Sin acento (usa el color de marca)"
        format="hex"
        value={acento}
        onChange={setAcento}
        onChangeEnd={aplicarAcento}
        rightSection={aplicandoAcento ? <Loader size="xs" /> : undefined}
        // Misma paleta sugerida que la card «Tu tienda» del admin (admin-bases-pdf F06): las dos
        // superficies que editan la marca ofrecen los mismos atajos.
        swatches={[...SWATCHES_MARCA]}
      />
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
