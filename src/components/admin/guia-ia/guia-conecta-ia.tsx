import {
  Accordion,
  Anchor,
  Button,
  CopyButton,
  Divider,
  Group,
  List,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconLock,
  IconPointFilled,
  IconTerminal2,
} from "@tabler/icons-react";
import { useState } from "react";

import {
  APPS_IA,
  LIMITES,
  PROMPTS_EJEMPLO,
  TROUBLESHOOTING,
  type BeatGuion,
  type IdAppIa,
  comandoClaudeCode,
  guionDe,
} from "~/components/admin/guia-ia/guion";
import { APP_CONFIG } from "~/config/app";
import { urlMcpPublica } from "~/lib/urlMcp";

/**
 * Guía «Conecta tu IA» — el manual con capturas, dentro del panel (D1).
 *
 * Vive como Modal abierto desde la card Conexiones IA y NO como página pública (decisión del
 * usuario 2026-07-26: modal, no Drawer): el Organizador la va a buscar donde están sus conexiones.
 * El contenido se **monta recién al abrir** (el `Modal` de Mantine no renderiza children con
 * `keepMounted={false}`, su default) ⇒ las capturas no pesan un byte en la carga de Configuración;
 * adentro van además con `loading="lazy"`. El scroll es el default del Modal (scrollea la página,
 * sin ScrollArea interna — decisión del usuario 2026-07-26, aplicada a todos los modales).
 *
 * Este archivo es SOLO render: toda la prosa, los pasos y los nombres de menú viven en `guion.ts`
 * (I7). Si hay que corregir copy, se corrige allá.
 */
export function GuiaConectaIa({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const [app, setApp] = useState<IdAppIa>(APPS_IA[0]!.id);

  const appActiva = APPS_IA.find((a) => a.id === app)!;
  const beats = guionDe(app);
  const url = urlMcpPublica();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={600}>Conecta una app de IA</Text>}
      padding="md"
      size="xl"
    >
      <Stack gap="xl">
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            ¿Con cuál la vas a conectar? Los pasos cambian según la app; el resto es igual.
          </Text>
          <SegmentedControl
            fullWidth
            value={app}
            onChange={(valor) => setApp(valor as IdAppIa)}
            data={APPS_IA.map((a) => ({ value: a.id, label: a.nombre }))}
          />
          {/* Los requisitos van ARRIBA, antes del paso 1: enterarse de que tu plan no alcanza
              después de haber seguido cuatro pasos es la peor forma de enterarse. */}
          <Paper p="sm" radius="md" bg="var(--mantine-color-default-hover)">
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">
              Antes de empezar
            </Text>
            {/* `icon` explícito y no el marcador nativo: el preflight de Tailwind apaga
                `list-style` en todo `ul`/`ol` del proyecto, así que una `List` de Mantine sin
                `icon` sale SIN viñeta ni número — se ve como párrafos sueltos con sangría. Es el
                mismo motivo por el que el consent pasa `IconCheck`/`IconLock` a sus listas. */}
            <List
              size="sm"
              spacing={4}
              mt={6}
              withPadding
              // `itemWrapper` centra el marcador contra el ítem ENTERO: en un requisito de tres
              // líneas la viñeta terminaba flotando al lado de la segunda, leyéndose como si ese
              // ítem empezara ahí. Va por `styles` y no por `classNames` porque es estático
              // (frontend-conventions § Mantine). El `marginTop` sienta el disco sobre la primera
              // línea, que es de 14px con más interlineado que el ícono de 10.
              styles={{ itemWrapper: { alignItems: "flex-start" } }}
              icon={
                <IconPointFilled className="size-2.5" style={{ marginTop: 6 }} />
              }
            >
              {appActiva.requisitos.map((requisito) => (
                <List.Item key={requisito}>{requisito}</List.Item>
              ))}
            </List>
          </Paper>
        </Stack>

        <Stack gap="xl">
          {beats.map((beat) => (
            <Beat key={beat.n} beat={beat} url={url} />
          ))}
        </Stack>

        <Divider />

        <QuePuedesPedirle />

        <Divider />

        <Accordion variant="separated" radius="md">
          <Accordion.Item value="claude-code">
            <Accordion.Control icon={<IconTerminal2 className="size-4" />}>
              <Text size="sm" fw={500}>
                ¿Usas Claude Code?
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <Text size="sm">
                  Desde la terminal es un comando. Después te abre el navegador para autorizar,
                  igual que en el paso 4.
                </Text>
                <BloqueCopiable
                  texto={comandoClaudeCode()}
                  etiquetaCopiado="Copiado"
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Stack gap="sm">
          <Text fw={600} size="sm">
            Si algo no resulta
          </Text>
          {TROUBLESHOOTING.map((item) => (
            <div key={item.titulo}>
              <Text size="sm" fw={500}>
                {item.titulo}
              </Text>
              <Text size="sm" c="dimmed">
                {item.cuerpo}
              </Text>
            </div>
          ))}
          <Text size="sm" c="dimmed">
            ¿Sigue sin funcionar? Escríbenos a{" "}
            <Anchor size="sm" href={`mailto:${APP_CONFIG.soporteEmail}`}>
              {APP_CONFIG.soporteEmail}
            </Anchor>
            .
          </Text>
        </Stack>
      </Stack>
    </Modal>
  );
}

/** Un beat del guion: número, título, cuerpo, pasos, su slot y sus capturas. */
function Beat({ beat, url }: { beat: BeatGuion; url: string }) {
  return (
    <Group align="flex-start" wrap="nowrap" gap="sm">
      <ThemeIcon variant="light" radius="xl" size={28} className="shrink-0">
        {/* El número en mono, como todos los números de la marca (design.md §3). */}
        <Text size="sm" fw={600} ff="monospace">
          {beat.n}
        </Text>
      </ThemeIcon>

      <Stack gap="xs" className="min-w-0 grow">
        <div>
          <Text fw={600}>{beat.titulo}</Text>
          <Text size="sm" c="dimmed">
            {beat.cuerpo}
          </Text>
        </div>

        {beat.pasos && (
          <List
            size="sm"
            spacing={6}
            withPadding
            // Misma corrección que la lista de requisitos: el número tiene que marcar dónde
            // EMPIEZA el paso, y casi todos los pasos ocupan dos líneas.
            styles={{ itemWrapper: { alignItems: "flex-start" } }}
          >
            {beat.pasos.map((paso, i) => (
              // El número va como `icon` y no como `type="ordered"`: el preflight de Tailwind
              // apaga los marcadores nativos (ver la lista de requisitos). Y acá el número no es
              // decoración — es la referencia con la que uno vuelve a la guía después de mirar la
              // otra pantalla («iba en el 3»).
              <List.Item
                key={paso}
                icon={
                  <Text size="xs" ff="monospace" c="dimmed" mt={2}>
                    {i + 1}.
                  </Text>
                }
              >
                {paso}
              </List.Item>
            ))}
          </List>
        )}

        {beat.slot === "url-conexion" && (
          <BloqueCopiable texto={url} etiquetaCopiado="Copiada" />
        )}

        {beat.capturas.map((captura) => (
          <Paper
            key={captura.archivo}
            radius="md"
            bg="var(--mantine-color-default-hover)"
            // Tope en el ancho NATIVO de la captura: una captura de pantalla estirada se ve blanda
            // y el texto de la UI ajena —que es justo lo que se vino a leer— se vuelve una mancha.
            // Así una captura chica se muestra 1:1 y una grande se achica (que sí se ve bien).
            style={{ overflow: "hidden", maxWidth: captura.ancho }}
          >
            {/* `<img>` a secas: el repo no usa `next/image` (ver storefront). `width`/`height`
                reales evitan que el modal salte cuando la captura termina de cargar. */}
            <img
              src={`/guia-ia/${captura.archivo}`}
              alt={captura.alt}
              width={captura.ancho}
              height={captura.alto}
              loading="lazy"
              className="block h-auto w-full"
            />
          </Paper>
        ))}

        {beat.nota && (
          <Text size="xs" c="dimmed">
            {beat.nota}
          </Text>
        )}
      </Stack>
    </Group>
  );
}

/**
 * Un dato que está para copiarse (la dirección del MCP, el comando de Claude Code): inset
 * borderless + texto en mono + botón de copiar.
 *
 * El botón lleva **etiqueta de texto** y no un `ActionIcon`: el panel no usa `Tooltip` en icon-only
 * (frontend-conventions § Chrome del panel), y acá adivinar qué copia el ícono sería justo lo que
 * la guía viene a evitar. La etiqueta de confirmación entra por prop porque en español concuerda
 * con lo copiado («la dirección» / «el comando»).
 */
function BloqueCopiable({
  texto,
  etiquetaCopiado,
}: {
  texto: string;
  etiquetaCopiado: string;
}) {
  return (
    <Paper p="sm" radius="md" bg="var(--mantine-color-default-hover)">
      <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
        <Text size="sm" ff="monospace" className="min-w-0 break-words">
          {texto}
        </Text>
        <CopyButton value={texto}>
          {({ copied, copy }) => (
            <Button
              size="xs"
              variant={copied ? "light" : "default"}
              color={copied ? "exito" : undefined}
              className="shrink-0"
              leftSection={
                copied ? (
                  <IconCheck className="size-4" />
                ) : (
                  <IconCopy className="size-4" />
                )
              }
              onClick={copy}
            >
              {copied ? etiquetaCopiado : "Copiar"}
            </Button>
          )}
        </CopyButton>
      </Group>
    </Paper>
  );
}

/**
 * Qué se le puede pedir y qué NO. Los límites no son una lista de pendientes: son diseño
 * (ADR-0018/0025), y contarlos es lo que vuelve creíble el resto de la guía.
 */
function QuePuedesPedirle() {
  return (
    <Stack gap="sm">
      <div>
        <Text fw={600}>Qué puedes pedirle</Text>
        <Text size="sm" c="dimmed">
          Escríbele en tus palabras. Estos son ejemplos de cosas que sí sabe hacer:
        </Text>
      </div>

      <Stack gap="xs">
        {PROMPTS_EJEMPLO.map((prompt) => (
          <Paper
            key={prompt.tool}
            p="sm"
            radius="md"
            bg="var(--mantine-color-default-hover)"
          >
            <Text size="sm">«{prompt.texto}»</Text>
            {prompt.nota && (
              <Text size="xs" c="dimmed" mt={4}>
                {prompt.nota}
              </Text>
            )}
          </Paper>
        ))}
      </Stack>

      <div>
        <Text fw={600} size="sm" mt="xs">
          Lo que no va a poder hacer
        </Text>
        <Text size="sm" c="dimmed">
          No es que se lo pidamos: esas cosas no existen para ella.
        </Text>
        <Stack gap={6} mt="xs">
          {LIMITES.map((limite) => (
            <Group key={limite} gap="xs" wrap="nowrap" align="flex-start">
              <IconLock className="size-4 shrink-0" style={{ marginTop: 2 }} />
              <Text size="sm">{limite}</Text>
            </Group>
          ))}
        </Stack>
      </div>
    </Stack>
  );
}
