import { ActionIcon, Anchor, Group, Stack, Text } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";

import { type ItemCarrito } from "~/components/storefront/carrito";
import { leyendaPrecioUnitario } from "~/components/storefront/leyenda-precio";
import { MiniaturaProducto } from "~/components/storefront/miniatura-producto";
import { StepperCantidad } from "~/components/storefront/stepper-cantidad";
import { type CotizacionDelCarrito } from "~/components/storefront/use-cotizacion-carrito";

/**
 * **Una línea de carrito**, compartida por el drawer y por el resumen del checkout (F03).
 *
 * Las dos superficies muestran lo mismo —miniatura, título, a qué corresponde el precio, cuántas
 * unidades y cómo sacarlo—, así que viven en un solo componente: escritas por separado ya se habían
 * desincronizado una vez (el «por pack de 1» de F04 estaba mal en las dos y bien en el catálogo).
 *
 * **Layout de dos filas, y no de una** (nit del `frontend-reviewer`): con la miniatura, el stepper
 * (~104 px) y el botón de quitar en la MISMA fila, a 320 px al título le quedaban ~50 px — o sea
 * ilegible justo en el ancho donde vive la mayoría del público (design.md §1: mobile-first real). Con
 * los controles bajados a una segunda línea, el texto se queda con todo el ancho menos la miniatura.
 * Es la regla registrada «cuando en una fila conviven un texto que identifica y un control que
 * actúa, el que tiene que sobrevivir al ancho es el texto».
 *
 * Los datos VIGENTES ganan sobre los del `localStorage` en cuanto llega la cotización (I2): precio,
 * unidades del pack y portada salen de la línea del server; lo guardado solo evita el hueco mientras
 * viaja.
 */
export function FilaCarrito({
  item,
  cotizacion,
  onQuitar,
  quitarComo,
  tamanoMiniatura = 56,
}: {
  item: ItemCarrito;
  cotizacion: CotizacionDelCarrito;
  onQuitar: () => void;
  /**
   * Cómo se ofrece sacar el ítem. Es lo ÚNICO que difiere entre las dos superficies y se pasa como
   * prop en vez de unificarse a la fuerza: el drawer es una lista compacta con íconos y el checkout
   * es un resumen de lectura donde la acción va escrita.
   */
  quitarComo: "icono" | "texto";
  tamanoMiniatura?: number;
}) {
  const linea = cotizacion.lineaDe(item.id);
  // Solo se puede AFIRMAR que un ítem murió cuando la cotización corresponde al carrito de ahora
  // (D3): durante un refetch, un ítem sano tampoco tiene línea, y marcarlo sería mentir.
  const noDisponible = cotizacion.sincronizada && linea === undefined;

  const quitar =
    quitarComo === "icono" ? (
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        onClick={onQuitar}
        // Sin el nombre, una lista de N ítems son N controles «Quitar» indistinguibles para quien
        // navega con lector de pantalla. Mismo patrón que los botones del catálogo.
        aria-label={`Quitar ${item.titulo} del carrito`}
      >
        <IconTrash className="size-4" stroke={1.75} />
      </ActionIcon>
    ) : (
      <Anchor
        size="xs"
        c="dimmed"
        component="button"
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar ${item.titulo} del carrito`}
      >
        Quitar
      </Anchor>
    );

  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <MiniaturaProducto
        url={linea?.portadaUrl ?? item.portadaUrl}
        titulo={item.titulo}
        tamano={tamanoMiniatura}
      />
      <Stack gap={6} className="min-w-0 flex-1">
        <div className="min-w-0">
          <Text size="sm" fw={500} lineClamp={2}>
            {item.titulo}
          </Text>
          {noDisponible ? (
            <Text size="xs" c="dimmed">
              Ya no está disponible. Quítalo para continuar.
            </Text>
          ) : (
            <Text size="xs" c="dimmed" className="tabular-nums">
              {/*
                En un pack la "unidad" que se cobra ES EL PACK, así que «c/u» a secas dejaría al
                Comprador sin saber si lleva el de 1 o el de 4. Y un pack de 1 no es un pack: dice
                «c/u» (F04). La regla vive UNA vez, en `leyendaPrecioUnitario`.
              */}
              {leyendaPrecioUnitario(
                linea?.precioUnitario ?? item.precio,
                linea?.unidadesPorPack ?? item.unidadesPorPack,
              )}
            </Text>
          )}
        </div>
        <Group
          justify={noDisponible ? "flex-end" : "space-between"}
          wrap="nowrap"
          gap="xs"
        >
          {/* Sin stepper para un ítem muerto: elegir cuántos llevar de algo que no se vende no
              significa nada, y el único paso útil es sacarlo. */}
          {!noDisponible && <StepperCantidad id={item.id} size="sm" />}
          {quitar}
        </Group>
      </Stack>
    </Group>
  );
}
