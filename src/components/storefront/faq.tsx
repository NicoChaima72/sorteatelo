import { Accordion, Box, Stack, Text, Title } from "@mantine/core";

import { SeccionWrapper } from "~/components/storefront/seccion-wrapper";
import { type SeccionNode } from "~/lib/pagebuilder/schema";

/**
 * `faq` (sección, F11): preguntas frecuentes en acordeón. TEXTO PLANO pre-wrap con límites (I3, nunca
 * HTML interpretado). Reduce fricción de compra (buena para conversión). Ancho de LECTURA acotado
 * (maw centrado) dentro del wrapper compartido.
 *
 * `estiloVisual` (builder-dreamy-secciones F03/D3): `clasico` (default no-op, I-H) = el acordeón de
 * siempre; `dreamy` = el del prototipo `dev-ref/variant-dreamy` (L244-253) — cada item como card
 * translúcida con ring BLANCO y el chevron reemplazado por un `＋` primario que rota 45° al abrir. El
 * `Accordion` de Mantine SE MANTIENE en las dos ramas (I3): el re-skin va por Styles API (`styles`, que
 * emite estilos INLINE y por eso gana también sobre las reglas `[data-active]` del variant `separated`)
 * y por UNA clase en el chevron. Cero hex: todo por tokens (I1).
 */

/** Glifo del toggle dreamy: PLUS de ancho completo (U+FF0B), como el prototipo — no el `+` ASCII. */
const MAS_DREAMY = "＋";

export function Faq({
  nodo,
  divisorColor,
}: {
  nodo: Extract<SeccionNode, { tipo: "faq" }>;
  divisorColor?: string;
}) {
  const props = nodo.props;
  const dreamy = props.estiloVisual === "dreamy";
  return (
    <SeccionWrapper id={nodo.id} estilo={nodo.estilo} divisorColor={divisorColor}>
      <Box maw={620} mx="auto" w="100%">
        <Stack gap="lg">
          <Title order={2} fz={{ base: 24, sm: 30 }} fw={700} data-campo="titulo">
            {props.titulo}
          </Title>
          <Accordion
            variant="separated"
            radius={dreamy ? "lg" : "md"}
            // El `＋` reemplaza al chevron svg de Mantine. La ROTACIÓN de 45° (la default es 180°) no puede
            // ir acá porque depende del estado abierto: vive en `globals.css` como
            // `.st-faq-dreamy-chevron[data-rotate]`, colgada del data-attribute NATIVO del Accordion.
            // El glifo va `aria-hidden` (mismo criterio que el emoji de la stat-card dreamy): el chevron
            // vive DENTRO del `<button>` del control, y a diferencia del svg mudo que reemplaza, un nodo de
            // TEXTO sí entra en el nombre accesible ⇒ sin esto cada pregunta se anunciaría como "＋ ¿…?".
            chevron={dreamy ? <span aria-hidden="true">{MAS_DREAMY}</span> : undefined}
            chevronSize={dreamy ? 20 : undefined}
            classNames={dreamy ? { chevron: "st-faq-dreamy-chevron" } : undefined}
            styles={
              dreamy
                ? {
                    // Card AIREADA en AMBOS estados: `styles` emite estilo inline, así que también pisa el
                    // `background-color: white` + `border-color` que el variant `separated` aplica al item
                    // ACTIVO (esas reglas son de hoja de estilo y el inline las gana sin `!important`).
                    item: {
                      background:
                        "light-dark(color-mix(in srgb, var(--mantine-color-white) 75%, transparent), color-mix(in srgb, var(--mantine-color-dark-6) 75%, transparent))",
                      border:
                        "1px solid light-dark(color-mix(in srgb, var(--mantine-color-white), transparent 20%), var(--mantine-color-dark-4))",
                    },
                    chevron: {
                      color: "var(--mantine-primary-color-filled)",
                      fontWeight: 700,
                      lineHeight: 1,
                      justifyContent: "center",
                    },
                  }
                : undefined
            }
          >
            {props.items.map((item, i) => (
              <Accordion.Item key={`${item.pregunta}-${i}`} value={`faq-${i}`}>
                <Accordion.Control>
                  <Text fw={600} size="sm">
                    {item.pregunta}
                  </Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap" }}>
                    {item.respuesta}
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Stack>
      </Box>
    </SeccionWrapper>
  );
}
