import { Checkbox, NumberInput, Select, TextInput } from "@mantine/core";
import { type UseFormReturnType } from "@mantine/form";

import { type ValoresCheckout } from "~/components/storefront/respuestas-checkout";
import { type CampoDelCheckout } from "~/server/domain/camposCheckout/camposActivos";

/**
 * Los Campos de checkout de la Tienda, renderizados en el form del Comprador (F04,
 * tasks/26-07-25-checkout-campos-configurables). PRESENTACIÓN PURA: no tiene query, mutation ni
 * estado propio — las definiciones llegan por SSR (`getPropsCheckout`, I1) y los valores viven en
 * el `useForm` de la página, igual que el fieldset compartido del panel (frontend-conventions).
 *
 * Marcado de obligatoriedad: se marca "(opcional)" en lo OPCIONAL, no un asterisco en lo
 * obligatorio. El correo es obligatorio y NO lleva asterisco (así estaba antes de esta feature y
 * así queda, I9); ponerle asterisco solo a los campos nuevos leería como que el correo se puede
 * omitir, que es exactamente lo contrario de ADR-0004. La regla que queda es simple: todo se
 * responde, salvo lo que dice "(opcional)".
 */
export function CamposCheckout({
  campos,
  form,
}: {
  campos: CampoDelCheckout[];
  form: UseFormReturnType<ValoresCheckout>;
}) {
  // Sin campos no emite NADA (ni un wrapper): el checkout queda con el DOM de siempre (I9).
  return (
    <>
      {campos.map((campo) => (
        <CampoCheckout key={campo.clave} campo={campo} form={form} />
      ))}
    </>
  );
}

/**
 * El tipo de retorno es EXPLÍCITO a propósito (nit del frontend-reviewer): con él, un 6º valor en
 * `CheckoutFieldType` deja de compilar acá ("function lacks ending return statement") en vez de
 * renderizar nada en silencio. Es el equivalente en render del `Record<TipoCampo, string>` que el
 * panel usa para el mismo fin (F03).
 */
function CampoCheckout({
  campo,
  form,
}: {
  campo: CampoDelCheckout;
  form: UseFormReturnType<ValoresCheckout>;
}): React.JSX.Element {
  const ruta = `respuestas.${campo.clave}` as const;
  const placeholder = campo.placeholder ?? undefined;

  // Props que comparten los inputs con etiqueta arriba. El CHECKBOX no los usa: su etiqueta va al
  // lado de la casilla y nunca lleva marca de opcional (D4 — una casilla siempre está respondida).
  const comunes = {
    label: campo.obligatorio ? campo.etiqueta : `${campo.etiqueta} (opcional)`,
    description: campo.textoAyuda ?? undefined,
  };

  switch (campo.tipo) {
    case "CHECKBOX":
      return (
        <Checkbox
          label={campo.etiqueta}
          description={campo.textoAyuda ?? undefined}
          {...form.getInputProps(ruta, { type: "checkbox" })}
        />
      );

    case "SELECT":
      return (
        <Select
          {...comunes}
          data={campo.opciones}
          placeholder={placeholder ?? "Elige una opción"}
          // La pertenencia a `opciones` la vuelve a validar el server contra la definición vigente
          // (D3/I3): acá el Select solo evita el error obvio.
          searchable={campo.opciones.length > 8}
          {...form.getInputProps(ruta)}
        />
      );

    case "NUMERO":
      return (
        <NumberInput
          {...comunes}
          placeholder={placeholder}
          // D3: NUMERO es ENTERO. El rango lo acota el server; acá solo se impide el decimal, que
          // es la única regla del tipo que el Comprador puede corregir mientras escribe.
          allowDecimal={false}
          {...form.getInputProps(ruta)}
        />
      );

    case "TELEFONO":
      return (
        <TextInput
          {...comunes}
          placeholder={placeholder}
          // `tel` + `inputMode` levantan el teclado numérico en móvil (el checkout es mobile-first).
          // El formato es LAXO por decisión de dominio (D3): un +56, espacios o guiones son válidos,
          // así que no hay `pattern` que rechace mientras escribe.
          type="tel"
          inputMode="tel"
          {...form.getInputProps(ruta)}
        />
      );

    case "TEXTO":
      return (
        <TextInput
          {...comunes}
          placeholder={placeholder}
          {...form.getInputProps(ruta)}
        />
      );
  }
}
