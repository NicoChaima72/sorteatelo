import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconChevronDown,
  IconChevronUp,
  IconForms,
  IconLock,
  IconMail,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { EmptyState } from "~/components/admin/empty-state";
import { SettingCard } from "~/components/admin/setting-card";
import { api, type RouterOutputs } from "~/utils/api";

type Campo = RouterOutputs["panel"]["listarCamposCheckout"][number];
type TipoCampo = Campo["tipo"];

/**
 * Máximo de Campos de checkout ACTIVOS por Tienda (D6/I6).
 *
 * ESPEJO de `MAX_CAMPOS_ACTIVOS` de `~/server/domain/camposCheckout/reglas` — el cliente no importa
 * código del server (misma regla que `MAX_CANTIDAD_POR_ITEM` y `CONTENT_TYPES_IMAGEN`,
 * frontend-conventions). Acá el número solo apaga el botón y explica por qué; **quien lo hace
 * cumplir es el use case**, que lo reconta dentro de su `$transaction`. Si divergen, el server gana
 * y el Organizador ve el error de dominio.
 */
const MAX_CAMPOS_ACTIVOS = 10;

/** Nombre de cada tipo en la voz del panel. `Record` a propósito: agregar un tipo al enum sin darle nombre acá no compila. */
const ETIQUETA_TIPO: Record<TipoCampo, string> = {
  TEXTO: "Texto",
  TELEFONO: "Teléfono",
  NUMERO: "Número",
  SELECT: "Lista de opciones",
  CHECKBOX: "Casilla sí/no",
};

/** Qué verá el Comprador con cada tipo — se muestra bajo el selector para que la elección no sea a ciegas. */
const DESCRIPCION_TIPO: Record<TipoCampo, string> = {
  TEXTO: "Una línea de texto libre.",
  TELEFONO: "Un número de contacto.",
  NUMERO: "Un número entero.",
  SELECT: "Elige una opción de la lista que tú definas.",
  CHECKBOX: "Una casilla que se marca o no.",
};

const DATA_TIPOS = (Object.keys(ETIQUETA_TIPO) as TipoCampo[]).map((tipo) => ({
  value: tipo,
  label: ETIQUETA_TIPO[tipo],
}));

function esTipoCampo(valor: string): valor is TipoCampo {
  return valor in ETIQUETA_TIPO;
}

/**
 * Guardrail anti-consentimiento (D4/I5/ADR-0008), en UNA constante porque se muestra en DOS lugares
 * —la lista y el form— y ambos deben decir exactamente lo mismo. Un checkbox del Organizador es un
 * DATO, nunca un instrumento de consentimiento legal: los términos y las bases del sorteo tienen su
 * propio carril, con texto versionado y aceptación registrada.
 */
const GUARDRAIL_CONSENTIMIENTO =
  "Estos campos son para datos que necesitas (un teléfono, una talla, una sucursal). No los uses para que acepten términos o condiciones: eso ya va en las bases de tu sorteo y en los términos de la plataforma.";

function NotaGuardrail() {
  return (
    <Paper p="sm" radius="md" bg="var(--mantine-color-default-hover)">
      <Text size="xs" c="dimmed">
        {GUARDRAIL_CONSENTIMIENTO}
      </Text>
    </Paper>
  );
}

/**
 * Devuelve la lista con el elemento de `desde` reubicado en `hacia`. Se manda el orden COMPLETO al
 * server (`reordenarCamposCheckout` lo exige y asigna `posicion = índice`): un "subir/bajar este"
 * dejaría a los demás con posiciones viejas y el orden final dependería del desempate por fecha.
 */
function moverEnLista<T>(items: T[], desde: number, hacia: number): T[] {
  const copia = [...items];
  const [movido] = copia.splice(desde, 1);
  if (movido === undefined) return items;
  copia.splice(hacia, 0, movido);
  return copia;
}

interface CampoForm {
  etiqueta: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  placeholder: string;
  textoAyuda: string;
  opciones: string[];
  defaultMarcado: boolean;
}

const VALORES_INICIALES: CampoForm = {
  etiqueta: "",
  tipo: "TEXTO",
  obligatorio: false,
  placeholder: "",
  textoAyuda: "",
  opciones: [],
  defaultMarcado: false,
};

/**
 * Alta y edición de un Campo de checkout.
 *
 * La asimetría del form ES la decisión D5: al CREAR se elige el `tipo` y la `clave` todavía no
 * existe (la deriva el server de la etiqueta); al EDITAR ambos aparecen con candado, porque el
 * snapshot de las respuestas ya guardadas quedó atado a ellos. Cambiar de tipo es borrar y crear
 * de nuevo, y el modal lo dice con todas sus letras.
 */
function CampoFormModal({
  open,
  onOpenChange,
  campo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campo: Campo | null;
}) {
  const esEdicion = campo !== null;
  const utils = api.useUtils();

  const form = useForm<CampoForm>({
    initialValues: VALORES_INICIALES,
    validate: {
      etiqueta: (v) => (v.trim() === "" ? "Ponle un nombre al campo" : null),
      // Espejo del `superRefine` de `crearCampoCheckoutInput`: un SELECT sin opciones es un campo
      // imposible de responder. El server vuelve a validarlo.
      opciones: (v, valores) =>
        valores.tipo === "SELECT" && v.length === 0
          ? "Agrega al menos una opción"
          : null,
    },
  });

  // Rehidratar cada vez que se abre con un target distinto (patrón de `ProductoFormModal`).
  useEffect(() => {
    if (!open) return;
    form.setValues({
      etiqueta: campo?.etiqueta ?? "",
      tipo: campo?.tipo ?? "TEXTO",
      obligatorio: campo?.obligatorio ?? false,
      placeholder: campo?.placeholder ?? "",
      textoAyuda: campo?.textoAyuda ?? "",
      opciones: campo?.opciones ?? [],
      defaultMarcado: campo?.defaultMarcado ?? false,
    });
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campo]);

  const onDone = async () => {
    await utils.panel.listarCamposCheckout.invalidate();
    notifications.show({
      message: esEdicion ? "Cambios guardados." : "Campo agregado.",
      color: "green",
    });
    onOpenChange(false);
  };

  const onError = (error: { message: string }) => {
    notifications.show({ message: error.message, color: "red" });
  };

  const crear = api.panel.crearCampoCheckout.useMutation({ onSuccess: onDone, onError });
  const editar = api.panel.editarCampoCheckout.useMutation({ onSuccess: onDone, onError });
  const enviando = crear.isPending || editar.isPending;

  const tipo = form.values.tipo;
  const esCheckbox = tipo === "CHECKBOX";
  const esSelect = tipo === "SELECT";

  const submit = form.onSubmit((valores) => {
    // Lo que no aplica al tipo viaja en su forma canónica (el server igual normaliza, `_normalizar.ts`):
    // así un cambio de tipo a mitad del form no arrastra opciones ni defaults de la elección anterior.
    const comunes = {
      etiqueta: valores.etiqueta,
      obligatorio: esCheckbox ? false : valores.obligatorio,
      placeholder: esCheckbox ? "" : valores.placeholder,
      textoAyuda: valores.textoAyuda,
      opciones: esSelect ? valores.opciones : [],
      defaultMarcado: esCheckbox ? valores.defaultMarcado : false,
    };

    if (campo) editar.mutate({ campoId: campo.id, ...comunes });
    else crear.mutate({ tipo: valores.tipo, ...comunes });
  });

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title={esEdicion ? "Editar campo" : "Agregar campo"}
      size="lg"
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <NotaGuardrail />

          <TextInput
            label="Nombre del campo"
            placeholder="Ej. Teléfono de contacto"
            description="Es lo que va a leer quien te compre."
            {...form.getInputProps("etiqueta")}
          />

          <Select
            label="Tipo"
            data={DATA_TIPOS}
            allowDeselect={false}
            disabled={esEdicion}
            leftSection={esEdicion ? <IconLock className="size-4" /> : undefined}
            description={
              esEdicion
                ? "El tipo no se puede cambiar: las respuestas que ya recibiste quedaron guardadas con él. Si necesitas otro tipo, borra este campo y crea uno nuevo."
                : DESCRIPCION_TIPO[tipo]
            }
            value={tipo}
            onChange={(v) => {
              if (v !== null && esTipoCampo(v)) form.setFieldValue("tipo", v);
            }}
          />

          {esEdicion && (
            <TextInput
              label="Nombre interno"
              value={campo.clave}
              readOnly
              disabled
              leftSection={<IconLock className="size-4" />}
              // Mono por token del theme, no por clase Tailwind de tipografía (prohibidas, §9).
              styles={{
                input: { fontFamily: "var(--mantine-font-family-monospace)" },
              }}
              description="Se genera del nombre del campo y no cambia. Es el título de la columna cuando exportas tus ventas."
            />
          )}

          {esSelect && (
            <TagsInput
              label="Opciones"
              placeholder="Escribe una opción y presiona Enter"
              description="Las alternativas entre las que va a elegir quien te compre."
              maxTags={50}
              {...form.getInputProps("opciones")}
            />
          )}

          {!esCheckbox && (
            <TextInput
              label="Texto de ejemplo"
              placeholder="Ej. +56 9 1234 5678"
              description="Opcional. Aparece en gris dentro del campo vacío."
              {...form.getInputProps("placeholder")}
            />
          )}

          <TextInput
            label="Texto de ayuda"
            placeholder="Ej. Te escribimos por aquí si ganas."
            description="Opcional. Una línea bajo el campo para explicar por qué lo pides."
            {...form.getInputProps("textoAyuda")}
          />

          {/*
            D4/I5: `obligatorio` NO se ofrece para CHECKBOX. Una casilla obligatoria sería un gate de
            compra —o sea, un consentimiento ad-hoc sin texto versionado— y acá los campos son datos.
            El server además lo normaliza a `false` por si el switch llegara igual.
          */}
          {esCheckbox ? (
            <Switch
              label="Viene marcada por defecto"
              description="Si la dejas marcada, quien compre la verá marcada y puede desmarcarla."
              {...form.getInputProps("defaultMarcado", { type: "checkbox" })}
            />
          ) : (
            <Switch
              label="Es obligatorio"
              description="No se puede terminar la compra sin responderlo."
              {...form.getInputProps("obligatorio", { type: "checkbox" })}
            />
          )}

          <Group justify="flex-end" gap="sm" mt="xs">
            <Button
              variant="default"
              onClick={() => onOpenChange(false)}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={enviando}>
              {esEdicion ? "Guardar cambios" : "Agregar campo"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/**
 * Fila del correo: NO es un Campo de checkout (I2/ADR-0004) y por eso no tiene switch, lápiz ni
 * tacho. Se muestra igual, primera y con candado, porque es exactamente lo que el Comprador va a
 * ver arriba de todo — sin ella la lista mentiría por omisión sobre el checkout real.
 */
function FilaCorreoFijo() {
  return (
    <Paper p="sm" radius="md" bg="var(--mantine-color-default-hover)">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap" className="min-w-0">
          <IconMail className="size-[18px] shrink-0" stroke={1.75} />
          <div className="min-w-0">
            <Text size="sm" fw={500}>
              Correo
            </Text>
            <Text size="xs" c="dimmed">
              Siempre se pide. Es donde llega el archivo y su número del sorteo.
            </Text>
          </div>
        </Group>
        <Badge
          variant="outline"
          color="gray"
          leftSection={<IconLock className="size-3" />}
          styles={{ label: { fontWeight: 400, textTransform: "none" } }}
        >
          Fijo
        </Badge>
      </Group>
    </Paper>
  );
}

/**
 * Fila de la lista. Es PRESENTACIÓN PURA: no declara hooks de mutation propios porque eso sería
 * "un hook por fila", que frontend-conventions § Data fetching prohíbe — las mutations viven una
 * sola vez en `CamposCheckoutCard` y acá llegan como callbacks, con el `loading` ya aislado a la
 * fila que lo disparó.
 */
function FilaCampo({
  campo,
  esPrimero,
  esUltimo,
  sinCupo,
  onEditar,
  onMover,
  onCambiarActivo,
  onBorrar,
  reordenando,
  cambiandoActivo,
  borrando,
}: {
  campo: Campo;
  esPrimero: boolean;
  esUltimo: boolean;
  sinCupo: boolean;
  onEditar: () => void;
  onMover: (direccion: -1 | 1) => void;
  onCambiarActivo: (activo: boolean) => void;
  onBorrar: () => void;
  reordenando: boolean;
  cambiandoActivo: boolean;
  borrando: boolean;
}) {
  // Activar consume cupo; desactivar siempre libera. Con el tope lleno, el switch de un campo
  // inactivo queda apagado (el porqué está en el contador, arriba de la lista).
  const switchBloqueado = sinCupo && !campo.activo;

  return (
    <Paper p="sm" radius="md" bg="var(--mantine-color-default-hover)">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap" className="min-w-0">
          <Stack gap={0} className="shrink-0">
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              aria-label={`Subir ${campo.etiqueta}`}
              disabled={esPrimero || reordenando}
              onClick={() => onMover(-1)}
            >
              <IconChevronUp className="size-4" />
            </ActionIcon>
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              aria-label={`Bajar ${campo.etiqueta}`}
              disabled={esUltimo || reordenando}
              onClick={() => onMover(1)}
            >
              <IconChevronDown className="size-4" />
            </ActionIcon>
          </Stack>

          <div className="min-w-0">
            <Group gap="xs" wrap="nowrap">
              <Text size="sm" fw={500} className="truncate">
                {campo.etiqueta}
              </Text>
              {campo.obligatorio && (
                <Badge
                  size="xs"
                  variant="light"
                  color="gray"
                  styles={{ label: { textTransform: "none" } }}
                >
                  Obligatorio
                </Badge>
              )}
              {!campo.activo && (
                <Badge
                  size="xs"
                  variant="outline"
                  color="gray"
                  styles={{ label: { fontWeight: 400, textTransform: "none" } }}
                >
                  Inactivo
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" className="truncate">
              {ETIQUETA_TIPO[campo.tipo]} ·{" "}
              <Text span ff="monospace" inherit>
                {campo.clave}
              </Text>
            </Text>
          </div>
        </Group>

        <Group gap={4} wrap="nowrap">
          <Switch
            size="sm"
            checked={campo.activo}
            disabled={switchBloqueado || cambiandoActivo}
            aria-label={`Mostrar ${campo.etiqueta} en el checkout`}
            onChange={(event) => onCambiarActivo(event.currentTarget.checked)}
          />
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={`Editar ${campo.etiqueta}`}
            onClick={onEditar}
          >
            <IconPencil className="size-4" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label={`Eliminar ${campo.etiqueta}`}
            loading={borrando}
            onClick={onBorrar}
          >
            <IconTrash className="size-4" />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  );
}

const DESCRIPCION_CAMPOS =
  "Los datos que le pides a quien compra, además del correo. Aparecen en el checkout de tu tienda y quedan guardados en cada venta.";

/**
 * Sección «Campos del checkout» de la configuración (F03,
 * tasks/26-07-25-checkout-campos-configurables). Toda la lógica de dominio vive en F02
 * (`domain/camposCheckout/`): acá no hay más regla propia que el orden que se arrastra y el cartel
 * del cupo, y ambos los vuelve a decidir el server.
 */
export function CamposCheckoutCard() {
  const utils = api.useUtils();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [enEdicion, setEnEdicion] = useState<Campo | null>(null);

  const campos = api.panel.listarCamposCheckout.useQuery(undefined, {
    retry: false,
  });

  // Las tres mutations de la lista se declaran UNA vez y las comparten las N filas
  // (frontend-conventions § Data fetching): el `loading` se aísla comparando `variables` con el id
  // de la fila, nunca con un hook por fila ni un `useState` de id-en-vuelo.
  const onError = (error: { message: string }) => {
    notifications.show({ message: error.message, color: "red" });
  };
  const invalidarLista = () => utils.panel.listarCamposCheckout.invalidate();

  const reordenar = api.panel.reordenarCamposCheckout.useMutation({
    onSuccess: invalidarLista,
    onError,
  });

  const cambiarActivo = api.panel.cambiarActivoCampoCheckout.useMutation({
    onSuccess: invalidarLista,
    onError,
  });

  const borrar = api.panel.borrarCampoCheckout.useMutation({
    onSuccess: async () => {
      await invalidarLista();
      notifications.show({ message: "Campo eliminado.", color: "green" });
    },
    onError,
  });

  const confirmarBorrado = (campo: Campo) =>
    modals.openConfirmModal({
      title: "Eliminar campo",
      children: (
        <Text size="sm">
          <Text component="span" fw={600}>
            {campo.etiqueta}
          </Text>{" "}
          dejará de pedirse en tu checkout. Las respuestas que ya te dejaron se
          conservan en tus ventas.
        </Text>
      ),
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: () => borrar.mutate({ campoId: campo.id }),
    });

  const abrirCreacion = () => {
    setEnEdicion(null);
    setModalAbierto(true);
  };

  const abrirEdicion = (campo: Campo) => {
    setEnEdicion(campo);
    setModalAbierto(true);
  };

  if (campos.isLoading) {
    return (
      <SettingCard
        icon={IconForms}
        title="Campos del checkout"
        description={DESCRIPCION_CAMPOS}
      >
        <Stack gap="sm">
          <Skeleton height={56} />
          <Skeleton height={56} />
        </Stack>
      </SettingCard>
    );
  }

  if (campos.isError || !campos.data) {
    return (
      <SettingCard
        icon={IconForms}
        title="Campos del checkout"
        description={DESCRIPCION_CAMPOS}
      >
        <Stack align="center" py="lg" gap="sm">
          <Text size="sm" c="red">
            No pudimos cargar los campos de tu checkout.
          </Text>
          <Button variant="default" size="xs" onClick={() => void campos.refetch()}>
            Reintentar
          </Button>
        </Stack>
      </SettingCard>
    );
  }

  const lista = campos.data;
  const activos = lista.filter((campo) => campo.activo).length;
  const sinCupo = activos >= MAX_CAMPOS_ACTIVOS;

  const mover = (indice: number, direccion: -1 | 1) => {
    const idsEnOrden = moverEnLista(lista, indice, indice + direccion).map(
      (campo) => campo.id,
    );
    reordenar.mutate({ idsEnOrden });
  };

  return (
    <SettingCard
      icon={IconForms}
      title="Campos del checkout"
      description={DESCRIPCION_CAMPOS}
    >
      <Stack gap="md">
        <NotaGuardrail />

        <Group justify="space-between" align="center" gap="sm">
          <Text size="sm" c="dimmed">
            {activos} de {MAX_CAMPOS_ACTIVOS} campos activos
          </Text>
          <Button
            size="xs"
            leftSection={<IconPlus className="size-4" />}
            disabled={sinCupo}
            onClick={abrirCreacion}
          >
            Agregar campo
          </Button>
        </Group>

        {sinCupo && (
          <Text size="xs" c="dimmed">
            Llegaste al máximo de {MAX_CAMPOS_ACTIVOS} campos activos. Desactiva
            uno si quieres agregar otro — un checkout corto vende más.
          </Text>
        )}

        <Stack gap="xs">
          <FilaCorreoFijo />

          {lista.length === 0 ? (
            <EmptyState
              icon={IconForms}
              title="Por ahora solo pides el correo"
              description="Si necesitas algo más para coordinar la entrega del premio —un teléfono, una talla— agrégalo acá y aparecerá en tu checkout."
            />
          ) : (
            lista.map((campo, indice) => (
              <FilaCampo
                key={campo.id}
                campo={campo}
                esPrimero={indice === 0}
                esUltimo={indice === lista.length - 1}
                sinCupo={sinCupo}
                reordenando={reordenar.isPending}
                cambiandoActivo={
                  cambiarActivo.isPending &&
                  cambiarActivo.variables?.campoId === campo.id
                }
                borrando={
                  borrar.isPending && borrar.variables?.campoId === campo.id
                }
                onEditar={() => abrirEdicion(campo)}
                onMover={(direccion) => mover(indice, direccion)}
                onCambiarActivo={(activo) =>
                  cambiarActivo.mutate({ campoId: campo.id, activo })
                }
                onBorrar={() => confirmarBorrado(campo)}
              />
            ))
          )}
        </Stack>
      </Stack>

      <CampoFormModal
        open={modalAbierto}
        onOpenChange={setModalAbierto}
        campo={enEdicion}
      />
    </SettingCard>
  );
}
