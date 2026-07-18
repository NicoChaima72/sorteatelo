import { Group, Text, ThemeIcon } from "@mantine/core";
import { IconTicket } from "@tabler/icons-react";

import { Plumon } from "~/components/landing/plumon";
import { APP_CONFIG } from "~/config/app";

/**
 * Wordmark de plataforma (identidad «El Talonario»). Firma tipográfica reutilizable: isotipo
 * PROVISIONAL (Tabler `IconTicket` en un `ThemeIcon` del primario cobalto) + el nombre en Bricolage
 * Grotesque (`var(--font-display)`, peso 800) con el **«éa» resaltado en plumón amarillo**. El
 * nombre SIEMPRE sale de `APP_CONFIG.name` (I8) — nunca literal; el resaltado se hace partiendo el
 * nombre por «éa» y degrada limpio si ese trozo no está. Un logo/isotipo dibujado real es encargo
 * de diseño futuro (out of scope del plan).
 */
interface WordmarkProps {
  /** Tamaño de fuente del nombre en px (el isotipo escala proporcional). */
  size?: number;
  /** Muestra el isotipo (ThemeIcon). En espacios muy chicos se puede ocultar. */
  withIcon?: boolean;
  /** Color del texto (token del theme). Por defecto hereda el color de texto del contexto. */
  c?: string;
}

/** Parte el nombre por «éa» para resaltar ese trozo con plumón; si no está, deja el nombre plano. */
function nombreConPlumon() {
  const partes = APP_CONFIG.name.split("éa");
  if (partes.length !== 2) return APP_CONFIG.name;
  return (
    <>
      {partes[0]}
      <Plumon>éa</Plumon>
      {partes[1]}
    </>
  );
}

export function Wordmark({ size = 20, withIcon = true, c }: WordmarkProps) {
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      {withIcon && (
        <ThemeIcon size={Math.round(size * 1.6)} radius="md" variant="filled">
          <IconTicket style={{ width: "62%", height: "62%" }} stroke={1.9} />
        </ThemeIcon>
      )}
      <Text
        component="span"
        fw={800}
        c={c}
        style={{
          fontFamily: "var(--font-display)",
          fontSize: size,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {nombreConPlumon()}
      </Text>
    </Group>
  );
}
