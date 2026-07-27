import { Box, Group, Stack, Text } from "@mantine/core";

import { bloquesDeNumerosDelSorteo } from "~/lib/numerosDelSorteo";

/**
 * Los **Números del sorteo** de un Comprador, dibujados como boletos — uno por BLOQUE contiguo
 * (`checkout-retorno-numeros-sorteo` F02/D3). Es lo que la landing le promete: ver su número.
 *
 * Nació dentro de `checkout/retorno.tsx` y se extrajo acá al aparecer el SEGUNDO consumidor
 * (`verificador-tickets` F02/D9): la página `/verificar`, donde el mismo Comprador consulta esos
 * números más tarde con su correo. La extracción es 1:1 — mismo markup, mismos estilos, cero cambio
 * visual en el retorno. Lo que compra es que las dos superficies no puedan divergir: el retorno y el
 * verificador dicen EXACTAMENTE lo mismo que el correo de confirmación (I12 de ADR-0024).
 *
 * El plegado en rangos y el prefijo salen del punto ÚNICO de presentación (`~/lib/numerosDelSorteo`,
 * I4/I12): un boleto por bloque, `ARMY-1043–1092` y no `ARMY-1043–ARMY-1092`. Acá se comparte el
 * formateador, nunca el markup del correo (D3).
 *
 * Sin bloques ⇒ `null`: una orden PAGADA sin tickets (productos que no participan del sorteo, o sin
 * sorteo activo al pagar, D4) celebra SIN este bloque. No se promete un número que no existe. Qué
 * decir en ese caso lo decide el caller — el retorno calla, `/verificar` muestra su mensaje neutral.
 *
 * **Sin props de copy a propósito**: el pie («También quedan guardados en tu correo de confirmación»)
 * vale igual en las dos superficies y es, palabra por palabra, el texto de contexto que el plan del
 * verificador pedía para su resultado. Parametrizarlo abriría la puerta a que las dos pantallas
 * digan cosas distintas sobre los mismos números, que es justo lo que la extracción vino a cerrar.
 *
 * Cero hex (I5): el borde punteado y el chip salen de la escala del tenant, con el acento degradando
 * a marca por fallback de `var()`. Misma gramática de boleto que el widget `momento_ticket` del
 * storefront (perforación dashed + número en mono), que es donde el Comprador vio el ejemplo.
 */
export function BoletosDelSorteo({
  numeros,
  prefijo,
}: {
  numeros: number[];
  prefijo: string | null;
}) {
  const bloques = bloquesDeNumerosDelSorteo(numeros, prefijo);
  if (bloques.length === 0) return null;

  // Acento del tenant con fallback a marca (I-T2), igual que `momento-ticket.tsx`.
  const acento = "var(--mantine-color-acento-filled, var(--mantine-primary-color-filled))";

  return (
    <Stack align="center" gap="xs" w="100%">
      <Text fz="sm" fw={600} ta="center">
        {bloques.length === 1 && numeros.length === 1
          ? "Tu número del sorteo"
          : "Tus números del sorteo"}
      </Text>
      <Group justify="center" gap="xs">
        {bloques.map((bloque) => (
          <Box
            key={bloque}
            px="md"
            py={6}
            style={{
              borderRadius: "var(--mantine-radius-md)",
              border: `2px dashed color-mix(in srgb, ${acento} 45%, transparent)`,
              background: "var(--mantine-primary-color-0)",
            }}
          >
            <Text
              component="span"
              fw={700}
              fz="lg"
              ff="monospace"
              className="tabular-nums"
              style={{
                letterSpacing: "0.06em",
                color: "var(--mantine-primary-color-filled)",
              }}
            >
              {bloque}
            </Text>
          </Box>
        ))}
      </Group>
      <Text fz="xs" c="dimmed" ta="center">
        También quedan guardados en tu correo de confirmación.
      </Text>
    </Stack>
  );
}
