import { Text, Title } from "@mantine/core";
import { type ReactNode } from "react";

import { Etiqueta } from "./etiqueta";
import s from "./landing.module.css";

/**
 * Boleto CTA — el cierre de la landing: una card-boleto con el cuerpo (eyebrow + titular + bajada)
 * y un **talón amarillo troquelado** (borde dashed) con el número de serie mono y el botón de
 * acción. En móvil el talón baja debajo (grid a una columna, CSS module). El botón lo inyecta el
 * caller (`cta`) para que sea un `Button` de Mantine tematizado. Cero hex: todo por tokens.
 */
export function BoletoCta({
  eyebrow,
  titulo,
  bajada,
  numero,
  cta,
}: {
  eyebrow: string;
  titulo: string;
  bajada: string;
  numero: string;
  cta: ReactNode;
}) {
  return (
    <div className={s.boleto}>
      <div className={s.boletoCuerpo}>
        <Etiqueta>{eyebrow}</Etiqueta>
        <Title
          order={2}
          fw={800}
          mt={10}
          mb={8}
          style={{
            fontSize: "clamp(26px, 3.2vw, 38px)",
            letterSpacing: "-0.02em",
            textWrap: "balance",
          }}
        >
          {titulo}
        </Title>
        <Text c="dimmed" style={{ fontSize: 16.5, lineHeight: 1.6, maxWidth: "34em" }}>
          {bajada}
        </Text>
      </div>
      <div className={s.boletoTalon}>
        <span className={s.boletoNumero}>{numero}</span>
        {cta}
      </div>
    </div>
  );
}
