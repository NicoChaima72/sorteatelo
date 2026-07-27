import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Drawer,
  Group,
  Indicator,
  Loader,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { IconShoppingCart } from "@tabler/icons-react";
import Link from "next/link";

import { useCarrito } from "~/components/storefront/carrito";
import { FilaCarrito } from "~/components/storefront/fila-carrito";
import {
  useCotizacionCarrito,
  type CotizacionDelCarrito,
} from "~/components/storefront/use-cotizacion-carrito";
import { clp } from "~/lib/formato";

/**
 * UI del carrito (F04 del storefront). Botón del header con contador + drawer con los ítems.
 * Mobile-first: el drawer entra desde la derecha y ocupa el ancho útil en móvil.
 *
 * **I4/I2 — el cliente no hace aritmética de plata.** El drawer AHORA muestra el total, pero no lo
 * calcula: se lo pide a `checkout.cotizarCarrito`, que lo suma en `Decimal` server-side sobre los
 * precios vigentes (`useCotizacionCarrito`). Los unitarios y las portadas también salen de ahí en
 * cuanto llegan — lo del `localStorage` es solo el rótulo con el que se pinta al instante.
 */
export function BotonCarrito({ onOpen }: { onOpen: () => void }) {
  const { cantidad } = useCarrito();
  return (
    <Indicator
      label={cantidad}
      size={18}
      disabled={cantidad === 0}
      offset={4}
      aria-label={`Carrito con ${cantidad} productos`}
    >
      <ActionIcon
        variant="subtle"
        color="gray"
        size="lg"
        onClick={onOpen}
        aria-label="Abrir carrito"
      >
        <IconShoppingCart className="size-5" stroke={1.75} />
      </ActionIcon>
    </Indicator>
  );
}

export function CarritoDrawer({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const { items, quitar, vaciar, cantidad } = useCarrito();
  // Solo se cotiza con el drawer ABIERTO: el carrito vive en el header de todas las páginas del
  // storefront y no tiene sentido preguntar un total que nadie está mirando.
  const cotizacion = useCotizacionCarrito({ activo: opened });

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title={<Text fw={600}>Tu carrito</Text>}
      padding="md"
      size="sm"
      /*
        Layout de altura completa (F02): el contenido del drawer es una columna flex donde la LISTA
        scrollea y el resumen queda fijo abajo. Va por `styles` y no por `classNames` porque es
        estático (frontend-conventions § Mantine): no depende de ningún data-attribute de runtime.

        Tres detalles load-bearing, los tres invisibles en el código:
        - `content: overflow hidden` APAGA el `overflow-y: auto` que Mantine le pone por default a
          esa parte (su modelo es "scrollea el drawer entero, con el header sticky"). Sin apagarlo
          quedan dos regiones scrolleables anidadas y el rebote elástico de iOS puede arrastrar
          header + footer fuera de la pantalla — o sea, devolver el bug que F02 vino a cerrar.
        - `body: minHeight 0` es lo que permite que un hijo con `overflow-y: auto` se ENCOJA; sin él
          un flex item crece con su contenido y empuja el footer fuera de vista.
        - `body: padding 0` pisa el `padding` del Drawer (que aplica a header y body por igual) para
          que lo aporten por separado la lista —que scrollea— y el footer —que no—. Gana sin
          `!important` porque Mantine emite `styles` como estilo inline.
      */
      styles={{
        content: { display: "flex", flexDirection: "column", overflow: "hidden" },
        body: {
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: 0,
        },
      }}
    >
      {cantidad === 0 ? (
        <Stack align="center" py="xl" px="md" gap="xs">
          <IconShoppingCart
            className="size-8"
            stroke={1.5}
            color="var(--mantine-color-dimmed)"
          />
          <Text size="sm" c="dimmed" ta="center">
            Tu carrito está vacío. Agrega productos para continuar.
          </Text>
        </Stack>
      ) : (
        <>
          <Stack gap="md" px="md" pb="md" className="min-h-0 flex-1 overflow-y-auto">
            {items.map((item) => (
              <FilaCarrito
                key={item.id}
                item={item}
                cotizacion={cotizacion}
                onQuitar={() => quitar(item.id)}
                quitarComo="icono"
              />
            ))}
          </Stack>

          {/*
            Resumen FIJO al pie (F02). Antes vivía al final del flujo normal del drawer, así que con
            pocos ítems la CTA quedaba flotando a media altura con aire muerto abajo. Ahora es la
            base de la columna: la lista de arriba es la que scrollea.
          */}
          <Box
            px="md"
            py="md"
            style={{
              flexShrink: 0,
              borderTop: "1px solid var(--mantine-color-default-border)",
              background: "var(--mantine-color-body)",
            }}
          >
            <Stack gap="sm">
              <TotalDelCarrito cotizacion={cotizacion} cantidad={cantidad} />
              {/*
                El botón se apaga SOLO cuando el server ya dijo que no hay nada cobrable: mandar al
                Comprador a un checkout que va a rechazar todo es peor que no ofrecerle el paso
                (frontend-conventions § «Nada de un botón que va a fallar»). Un fallo de la
                cotización NO lo apaga — el total real se calcula igual al iniciar el checkout.
              */}
              <Button
                component={Link}
                href="/checkout"
                onClick={onClose}
                fullWidth
                disabled={cotizacion.sinNadaQueCobrar}
              >
                Ir a pagar
              </Button>
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                onClick={vaciar}
                fullWidth
              >
                Vaciar carrito
              </Button>
            </Stack>
          </Box>
        </>
      )}
    </Drawer>
  );
}

/**
 * El total, con sus cuatro estados. Se comparte entre el drawer y el checkout para que las dos
 * superficies digan lo mismo (y lo digan igual cuando NO se puede decir).
 *
 * El error NO bloquea la compra: el total real lo calcula el server igual al iniciar el checkout, así
 * que la salida honesta es volver al copy de antes («lo confirmas al pagar») con un reintento a mano,
 * no apagar el botón de pagar.
 *
 * **Por qué el error va en `dimmed` y no en `red`**, apartándose del default de
 * frontend-conventions § Data fetching: ese default es para una pantalla cuyo CONTENIDO no cargó.
 * Acá el contenido está —los productos, sus precios, el botón de pagar— y lo único que falta es un
 * número auxiliar que el server va a calcular igual. Pintar de rojo el pie del carrito de alguien
 * que puede comprar perfectamente es alarma sin causa, justo lo que design.md §8 pide evitar en el
 * chrome que ve el Comprador.
 */
export function TotalDelCarrito({
  cotizacion,
  cantidad,
}: {
  cotizacion: CotizacionDelCarrito;
  cantidad: number;
}) {
  const productos = `${cantidad} ${cantidad === 1 ? "producto" : "productos"}`;

  if (cotizacion.error) {
    return (
      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          {productos}. No pudimos calcular el total por ahora; lo confirmas antes
          de pagar.
        </Text>
        <Anchor
          component="button"
          type="button"
          size="xs"
          onClick={cotizacion.reintentar}
        >
          Reintentar
        </Anchor>
      </Stack>
    );
  }

  // Nada cobrable: decirlo en voz de persona en vez de mostrar «Total $0», que se lee como un
  // precio y no como un problema.
  if (cotizacion.sinNadaQueCobrar) {
    return (
      <Text size="sm" c="dimmed">
        {cantidad === 1
          ? "Este producto ya no está disponible en la tienda."
          : "Ninguno de estos productos está disponible en la tienda."}
      </Text>
    );
  }

  return (
    <Group justify="space-between" wrap="nowrap" align="baseline" gap="sm">
      <Text size="sm" c="dimmed">
        Total ({productos})
      </Text>
      {cotizacion.cargando || cotizacion.total === null ? (
        // Skeleton con la forma del monto real ⇒ el footer no salta de alto al llegar el dato.
        <Skeleton height={22} width={92} radius="sm" />
      ) : (
        <Group gap={6} wrap="nowrap" align="center">
          {cotizacion.recalculando && <Loader size={12} />}
          <Text
            fw={700}
            fz="lg"
            className="tabular-nums"
            // Mientras recalcula, el número que se ve es el del carrito ANTERIOR: se atenúa para no
            // afirmar como vigente algo que ya no lo es.
            c={cotizacion.recalculando ? "dimmed" : undefined}
          >
            {clp(cotizacion.total)}
          </Text>
        </Group>
      )}
    </Group>
  );
}
