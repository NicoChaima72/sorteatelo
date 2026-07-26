import { Divider, Drawer, Group, Paper, Stack, Text } from "@mantine/core";

import { EstadoBadge } from "~/components/admin/estado-badge";
import { valorDeRespuesta } from "~/components/admin/respuestas-venta";
import { clp, fechaHora } from "~/lib/formato";
import { type VentaDelPanel } from "~/server/domain/panel/listarVentas";

/**
 * Detalle de UNA venta del panel (F06, tasks/26-07-25-checkout-campos-configurables): qué compró el
 * Comprador, cuánto le queda al Organizador y qué se respondió en el checkout.
 *
 * Es un **Drawer** y no una fila expandible (D8 ofrecía las dos). La tabla de ventas vive dentro de
 * un `Table.ScrollContainer minWidth={640}`: una fila expandida heredaría ese ancho mínimo, así que
 * en un teléfono el Organizador tendría que hacer scroll HORIZONTAL para leer las respuestas del
 * comprador — justo el dato que vino a ver. El Drawer se lleva el detalle fuera de la tabla y lo
 * apila en vertical, que es la forma que tiene un detalle compuesto (líneas con plata + pares
 * etiqueta/valor de largo variable).
 *
 * PII (I7): esto solo se monta dentro del panel, que ya está gateado por membresía del tenant del
 * host (`guardPaginaAdmin` + `panelProcedure`). Acá no hay ninguna decisión de autorización.
 */
export function DetalleVenta({
  venta,
  opened,
  onClose,
}: {
  /**
   * La venta a mostrar. Se mantiene POBLADA mientras el Drawer se cierra (el padre no la limpia al
   * cerrar): vaciarla junto con `opened` dejaría el panel deslizándose hacia afuera en blanco.
   */
  venta: VentaDelPanel | null;
  opened: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title={<Text fw={600}>Detalle de la venta</Text>}
      padding="md"
      size="md"
    >
      {venta && (
        <Stack gap="lg">
          <Stack gap={4}>
            <Group
              justify="space-between"
              wrap="nowrap"
              gap="sm"
              align="flex-start"
            >
              {/* Sin `truncate`, a diferencia de la celda de la tabla: acá el correo NO es una
                  columna que haya que encajar sino el dato que el Organizador vino a leer (y muy
                  probablemente a copiar). Se deja envolver, mismo criterio que los valores de las
                  respuestas. */}
              <Text fw={500} className="min-w-0 break-words">
                {venta.email}
              </Text>
              <div className="shrink-0">
                <EstadoBadge estado={venta.estado} />
              </div>
            </Group>
            <Text size="sm" c="dimmed">
              {fechaHora(venta.createdAt)}
            </Text>
          </Stack>

          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Lo que compró
            </Text>
            <Paper p="md" radius="md" bg="var(--mantine-color-default-hover)">
              <Stack gap="xs">
                {venta.items.map((it, i) => (
                  <Group
                    key={i}
                    justify="space-between"
                    align="flex-start"
                    wrap="nowrap"
                    gap="md"
                  >
                    <Text size="sm" className="min-w-0">
                      {it.titulo}
                    </Text>
                    {/* Cantidad × precio UNITARIO. No se muestra el subtotal de la línea: sería
                        multiplicar plata en el cliente, y el dinero se calcula con `Decimal` en el
                        server (CLAUDE.md § Regla de oro). El total de abajo ya viene calculado. */}
                    <Text
                      size="sm"
                      c="dimmed"
                      className="shrink-0 tabular-nums"
                    >
                      {it.cantidad} × {clp(it.precio)}
                    </Text>
                  </Group>
                ))}
                <Divider />
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" c="dimmed">
                    Total
                  </Text>
                  <Text size="sm" fw={600} className="tabular-nums">
                    {clp(venta.total)}
                  </Text>
                </Group>
                {/* Comisión y neto REPUESTOS acá (decisión del usuario al cerrar F06): en la tabla
                    esa columna se esconde bajo `md`, así que en un teléfono el Organizador no tenía
                    ninguna vía para ver cuánto le queda de una venta. Mismas etiquetas que las
                    columnas («Comisión», «Te queda») para que el mapeo sea 1:1, mismo `−` y mismo
                    `clp`. Sin aritmética acá: el neto llega ya calculado con `Decimal` del server. */}
                {venta.comision !== null && (
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" c="dimmed">
                      Comisión
                    </Text>
                    <Text size="sm" c="dimmed" className="tabular-nums">
                      −{clp(venta.comision)}
                    </Text>
                  </Group>
                )}
                {/* Sin `—` cuando no hay: el guion es relleno de COLUMNA para que la tabla no se
                    desalinee; acá una venta pendiente simplemente no tiene comisión todavía y la
                    línea no existe (mismo criterio que la sección de respuestas, I9). */}
                {venta.neto !== null && (
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" c="dimmed">
                      Te queda
                    </Text>
                    <Text size="sm" fw={600} className="tabular-nums">
                      {clp(venta.neto)}
                    </Text>
                  </Group>
                )}
              </Stack>
            </Paper>
          </Stack>

          {/* I9 — sin respuestas no hay sección. Las órdenes anteriores a la feature (y las de una
              Tienda que nunca configuró campos) se ven exactamente como antes, sin un bloque vacío
              anunciando algo que esa venta no tiene. */}
          {venta.respuestas.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Respuestas del checkout
              </Text>
              <Paper p="md" radius="md" bg="var(--mantine-color-default-hover)">
                <Stack gap="sm">
                  {venta.respuestas.map((r) => (
                    <div key={r.clave}>
                      {/* La etiqueta es la CONGELADA: lo que el Comprador leyó cuando respondió,
                          aunque el Organizador haya renombrado o borrado el campo después (D5/I4). */}
                      <Text size="xs" c="dimmed">
                        {r.etiqueta}
                      </Text>
                      <Text size="sm" className="break-words">
                        {valorDeRespuesta(r)}
                      </Text>
                    </div>
                  ))}
                </Stack>
              </Paper>
            </Stack>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
