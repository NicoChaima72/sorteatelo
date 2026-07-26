import {
  Badge,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconCreditCard,
  IconExternalLink,
  IconGift,
} from "@tabler/icons-react";
import { type GetServerSideProps } from "next";

import { ActivarPlanModal } from "~/components/admin/activar-plan-modal";
import { AdminLayout } from "~/components/admin/admin-layout";
import { PanelCard } from "~/components/admin/panel-card";
import { clp, fecha } from "~/lib/formato";
import { guardPaginaAdmin } from "~/server/panel/guardPaginaAdmin";
import {
  ESTADO_COBRO_COLOR,
  ESTADO_SUSCRIPCION_COLOR,
  type EstadoCobro,
  type EstadoSuscripcion,
} from "~/styles/theme";
import { api, type RouterOutputs } from "~/utils/api";

/**
 * Página «Plan» del admin (facturación F05/F10/D12, ADR-0026).
 *
 * Nació MÍNIMA en F05 con una razón dura: cuando la Tienda entra en pausa, el guard del panel manda
 * TODAS las rutas acá, así que esta pantalla es la única salida — tiene que poder explicar el estado
 * y dejar regularizar (sin eso el Organizador quedaría encerrado).
 *
 * **F10 la completa** con lo que hace falta para administrar el plan y no solo para rescatarlo:
 * historial de cobros, «Cambiar tarjeta» y el link de pago del cobro impago en su propia fila.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const guard = await guardPaginaAdmin(ctx);
  if (!("ok" in guard)) return guard;
  return { props: {} };
};

type EstadoPlan = RouterOutputs["panel"]["getEstadoPlan"];
type Cobro = EstadoPlan["historial"][number];

/**
 * Cómo se nombra cada estado de la suscripción de cara al Organizador. `Record<EstadoSuscripcion, …>`
 * (el union client-safe de `theme.ts`, el mismo que indexa `ESTADO_SUSCRIPCION_COLOR`) para que un
 * estado nuevo del enum no pueda quedar sin nombre: el compilador lo pide acá.
 */
const NOMBRE_ESTADO: Record<EstadoSuscripcion, string> = {
  AL_DIA: "Al día",
  COBRO_PENDIENTE: "Cobro pendiente",
  EN_PAUSA_POR_PAGO: "En pausa por pago",
  CANCELADA: "Cancelada",
};

/**
 * Cómo se nombra cada estado de un cobro del historial. Mismo `Record` exhaustivo, y en la voz del
 * Organizador: lo que él quiere saber de una fila es si el cargo pasó o no, no el vocabulario de
 * facturación de Flow.
 */
const NOMBRE_COBRO: Record<EstadoCobro, string> = {
  PENDIENTE: "En curso",
  PAGADA: "Pagado",
  FALLIDA: "No se pudo cobrar",
  VENCIDA: "Impago",
  ANULADA: "Anulado",
};

/**
 * Qué decirle a una tienda que tiene cortesía **y además** una suscripción. Es un `Record` por estado
 * y no un párrafo único porque el párrafo único mentiría en la mitad de los casos: «se sigue cobrando
 * todos los meses» es falso con el plan `CANCELADA` o `EN_PAUSA_POR_PAGO`, y «puedes cancelarlo acá»
 * se contradice con el botón que esa misma rama renderiza («Reactivar mi plan»).
 *
 * La combinación existe de verdad —la cortesía se otorga por DB directa (D8) sobre una tienda que
 * puede venir de cualquier estado— y es justo la que nadie mira: quien la vive está pagando (o
 * debiendo) sin que la pantalla se lo diga.
 */
const PLAN_BAJO_CORTESIA: Record<EstadoSuscripcion, string> = {
  AL_DIA:
    "Además tienes un plan activo, que se sigue cobrando todos los meses. Si no lo necesitas mientras dure la cortesía, puedes cancelarlo acá.",
  // «Regularizarlo cambiando tu tarjeta» y no «regularizarlo acá» a secas: `COBRO_PENDIENTE` se
  // deriva del flag `morose` de Flow O de un invoice `FALLIDA`, y en el primer caso todavía no hay
  // `paymentLink` que ofrecer — la vía real es la tarjeta. Prometer un botón que puede no estar es
  // el mismo error que el CTA sin destino de F07.
  COBRO_PENDIENTE:
    "Además tienes un plan con un cobro pendiente. La cortesía sostiene tu tienda igual, pero ese cobro sigue su curso: puedes cancelar el plan acá, o regularizarlo cambiando tu tarjeta.",
  EN_PAUSA_POR_PAGO:
    "Además tienes un plan con un cobro impago. Mientras dure la cortesía tu tienda vende igual; cuando termine, vas a tener que regularizarlo.",
  CANCELADA:
    "Tu plan quedó cancelado. Mientras dure la cortesía tu tienda vende igual; después vas a necesitar activarlo de nuevo.",
};

export default function PlanPage() {
  const utils = api.useUtils();
  const plan = api.panel.getEstadoPlan.useQuery(undefined, { retry: false });
  const [modalAbierto, modal] = useDisclosure(false);

  const cancelar = api.panel.cancelarPlan.useMutation({
    onSuccess: async (r) => {
      // El estado del plan cambió y el chrome del panel lo lee aparte (banner + rail): se invalidan
      // los dos. El de publicación también — sin plan activo, republicar deja de estar disponible.
      await Promise.all([
        utils.panel.getEstadoPlan.invalidate(),
        utils.panel.getAvisoFacturacion.invalidate(),
        utils.panel.getEstadoPublicacion.invalidate(),
      ]);
      notifications.show({
        message: r.cancelacionEfectivaAtIso
          ? `Plan cancelado. Tu tienda vende hasta el ${fecha(new Date(r.cancelacionEfectivaAtIso))}.`
          : "Plan cancelado. Tu tienda vende hasta que termine el período pagado.",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  const cambiarTarjeta = api.panel.iniciarCambioDeTarjeta.useMutation({
    onSuccess: ({ redirectUrl }) => {
      // Se sale del SPA a propósito: la tarjeta se ingresa en el dominio de Flow y vuelve a
      // `/admin/plan/retorno-tarjeta` (frontend-conventions § «Salir de la app a un proveedor
      // externo y volver»).
      window.location.assign(redirectUrl);
    },
    onError: (error) => {
      notifications.show({ message: error.message, color: "red" });
    },
  });

  /**
   * Confirmación EXPLÍCITA (D12, frontend-conventions § Diálogos y destructivos): cancelar corta el
   * ingreso de la tienda, así que no puede ser un click suelto. El cuerpo dice las dos cosas que el
   * Organizador necesita para decidir — hasta cuándo sigue vendiendo y que no se borra nada —, que
   * es justo lo que evita la cancelación por susto.
   */
  const confirmarCancelacion = (hastaIso: string | null) =>
    modals.openConfirmModal({
      title: "Cancelar el plan de tu tienda",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            {hastaIso
              ? `Tu tienda sigue vendiendo hasta el ${fecha(new Date(hastaIso))}, el fin del período que ya pagaste. Después deja de recibir compras.`
              : "Tu tienda sigue vendiendo hasta que termine el período que ya pagaste. Después deja de recibir compras."}
          </Text>
          <Text size="sm" c="dimmed">
            No se borra nada: tus productos, el sorteo y tus ventas quedan donde
            están, y quienes ya compraron conservan sus descargas. Puedes volver a
            activar el plan cuando quieras.
          </Text>
        </Stack>
      ),
      labels: { confirm: "Cancelar el plan", cancel: "Mejor no" },
      confirmProps: { color: "red" },
      onConfirm: () => cancelar.mutate(),
    });

  return (
    <AdminLayout
      title="Tu plan"
      description="El plan mensual de Sortéatelo para esta tienda."
    >
      <PanelCard>
        {plan.isLoading ? (
          <Stack gap="sm">
            <Skeleton height={28} width={180} />
            <Skeleton height={20} width={260} />
          </Stack>
        ) : plan.isError || !plan.data ? (
          <Stack align="center" py="lg" gap="sm">
            <Text size="sm" c="red">
              No pudimos cargar el estado de tu plan.
            </Text>
            <Button variant="default" size="xs" onClick={() => void plan.refetch()}>
              Reintentar
            </Button>
          </Stack>
        ) : (
          <CuerpoPlan
            data={plan.data}
            onActivar={modal.open}
            onCancelar={confirmarCancelacion}
            onCambiarTarjeta={() => cambiarTarjeta.mutate()}
            cancelando={cancelar.isPending}
            cambiandoTarjeta={cambiarTarjeta.isPending}
          />
        )}
      </PanelCard>

      {/* Historial de cobros (F10): aparte de la tarjeta del estado, porque son dos preguntas
          distintas —«cómo está mi plan» y «qué me cobraron»— y la segunda es una lista que crece. */}
      {plan.data && plan.data.historial.length > 0 && (
        <HistorialDeCobros cobros={plan.data.historial} />
      )}

      <ActivarPlanModal opened={modalAbierto} onClose={modal.close} />
    </AdminLayout>
  );
}

function CuerpoPlan({
  data,
  onActivar,
  onCancelar,
  onCambiarTarjeta,
  cancelando,
  cambiandoTarjeta,
}: {
  data: EstadoPlan;
  onActivar: () => void;
  onCancelar: (hastaIso: string | null) => void;
  onCambiarTarjeta: () => void;
  cancelando: boolean;
  cambiandoTarjeta: boolean;
}) {
  // Exenta: la cortesía se anuncia primero, porque es lo que explica por qué la tienda vende. Pero
  // NO tapa lo demás: si además hay una suscripción viva, se muestra abajo con todo su detalle.
  // Ocultarla —como hacía la pantalla hasta F10— dejaba a alguien pagando todos los meses sin
  // ninguna superficie donde ver el cargo ni cancelarlo.
  if (data.exenta) {
    return (
      <Stack gap="md">
        <Stack gap={6}>
          <Group gap="xs">
            <IconGift className="size-[18px]" stroke={1.75} />
            <Text fw={600}>Plan cortesía</Text>
          </Group>
          <Text size="sm" c="dimmed">
            {data.exencion?.exentaHastaIso
              ? `Tu tienda vende sin costo hasta el ${fecha(new Date(data.exencion.exentaHastaIso))}.`
              : "Tu tienda vende sin costo, sin fecha de término."}
          </Text>
          {/* Cortesía CON fecha y sin plan detrás: el banner de los últimos 7 días manda acá, así que
              esta pantalla tiene que explicar qué pasa después. No hay botón a propósito — mientras la
              cortesía siga vigente el server rechaza el registro de tarjeta (D8), y ofrecer un botón
              que va a fallar es peor que no ofrecer ninguno.

              La segunda condición la calcula el SERVER (`quedaSinPlanAlVencerLaExencion`): con una
              suscripción viva detrás, el vencimiento no cambia nada y prometerle «vas a poder activar
              tu plan» a quien ya lo tiene —y a quien Flow ya le cobra— sería falso. */}
          {data.exencion?.exentaHastaIso && data.quedaSinPlanAlVencerLaExencion && (
            <Text size="sm" c="dimmed">
              Después de esa fecha vas a poder activar tu plan acá mismo:{" "}
              <Text span fw={600} className="tabular-nums">
                {clp(data.montoQueCorresponde)}
              </Text>{" "}
              al mes, IVA incluido. Mientras tanto no tienes que hacer nada.
            </Text>
          )}
        </Stack>

        {/* La cortesía NO cancela la suscripción de Flow: si existe, se le sigue cobrando. Callarlo
            sería cobrarle a alguien mientras la pantalla le dice que vende gratis. Qué se dice
            depende del ESTADO del plan (ver `PLAN_BAJO_CORTESIA`): no todos siguen cobrando. */}
        {data.suscripcion && (
          <>
            <Text size="sm" c="dimmed">
              {PLAN_BAJO_CORTESIA[data.suscripcion.estado]}
            </Text>
            <DetalleSuscripcion
              data={data}
              suscripcion={data.suscripcion}
              onActivar={onActivar}
              onCancelar={onCancelar}
              onCambiarTarjeta={onCambiarTarjeta}
              cancelando={cancelando}
              cambiandoTarjeta={cambiandoTarjeta}
            />
          </>
        )}
      </Stack>
    );
  }

  if (!data.suscripcion) {
    return (
      <Stack gap="sm" align="flex-start">
        <Text fw={600}>Todavía no tienes un plan activo</Text>
        <Text size="sm" c="dimmed">
          Mientras no haya plan, tu tienda no recibe pedidos. Tu plan sería de{" "}
          {/* El monto lo calcula el SERVER (I4); acá solo se imprime con `clp()` + `tabular-nums`. */}
          <Text span fw={600} className="tabular-nums">
            {clp(data.montoQueCorresponde)}
          </Text>{" "}
          al mes, IVA incluido.
        </Text>
        <Button
          onClick={onActivar}
          leftSection={<IconCreditCard className="size-4" stroke={1.75} />}
        >
          Activar mi plan
        </Button>
      </Stack>
    );
  }

  return (
    <DetalleSuscripcion
      data={data}
      suscripcion={data.suscripcion}
      onActivar={onActivar}
      onCancelar={onCancelar}
      onCambiarTarjeta={onCambiarTarjeta}
      cancelando={cancelando}
      cambiandoTarjeta={cambiandoTarjeta}
    />
  );
}

/** El plan vigente: estado, monto, próximo cobro, tarjeta y las acciones sobre él. */
function DetalleSuscripcion({
  data,
  suscripcion: s,
  onActivar,
  onCancelar,
  onCambiarTarjeta,
  cancelando,
  cambiandoTarjeta,
}: {
  data: EstadoPlan;
  suscripcion: NonNullable<EstadoPlan["suscripcion"]>;
  onActivar: () => void;
  onCancelar: (hastaIso: string | null) => void;
  onCambiarTarjeta: () => void;
  cancelando: boolean;
  cambiandoTarjeta: boolean;
}) {
  return (
    <Stack gap="md">
      <Group justify="space-between" align="baseline" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Text fw={600}>
            {s.plan === "ADICIONAL" ? "Plan tienda adicional" : "Plan de tu tienda"}
          </Text>
          <Badge variant="light" color={ESTADO_SUSCRIPCION_COLOR[s.estado]}>
            {NOMBRE_ESTADO[s.estado]}
          </Badge>
        </Group>
        <Text fw={700} size="lg" className="tabular-nums">
          {clp(s.montoBruto)}
          <Text span size="sm" fw={500} c="dimmed">
            {" "}
            /mes
          </Text>
        </Text>
      </Group>

      <Stack gap={4}>
        {s.cancelacionEfectivaAtIso ? (
          <Text size="sm" c="dimmed">
            Cancelado: tu tienda vende hasta el{" "}
            {fecha(new Date(s.cancelacionEfectivaAtIso))}.
          </Text>
        ) : (
          s.proximoCobroAtIso && (
            <Text size="sm" c="dimmed">
              Próximo cobro: {fecha(new Date(s.proximoCobroAtIso))}.
            </Text>
          )
        )}

        {data.tarjeta?.ultimos4 && (
          <Text size="sm" c="dimmed">
            Tarjeta {data.tarjeta.marca ?? ""} terminada en{" "}
            <Text span className="tabular-nums">
              {data.tarjeta.ultimos4}
            </Text>
            .
          </Text>
        )}
      </Stack>

      {/* Cancelada con el período ya cerrado: la tienda no vende y hay que re-suscribir (D6). La
          tarjeta registrada se reusa, así que el mismo modal del checklist alcanza. */}
      {s.estado === "CANCELADA" && (
        <Group>
          <Button
            onClick={onActivar}
            leftSection={<IconCreditCard className="size-4" stroke={1.75} />}
          >
            Reactivar mi plan
          </Button>
        </Group>
      )}

      {s.estado !== "CANCELADA" && (
        // Sin el botón del Pagador, la fila se alinea a la derecha en vez de dejar un hueco: el
        // `space-between` con un solo hijo lo empujaría a la izquierda.
        <Group justify={data.soyElPagador ? "space-between" : "flex-end"} gap="sm">
          {/* Cambiar tarjeta (F10/D12). Solo se le ofrece al PAGADOR: el server lo rechaza para
              cualquier otra membresía (una Tienda admite varias) y un botón que va a fallar es peor
              que ninguno. Va `default` —no `filled`— porque es mantenimiento, no la acción que la
              pantalla propone. */}
          {data.soyElPagador && (
            <Button
              variant="default"
              size="xs"
              loading={cambiandoTarjeta}
              onClick={onCambiarTarjeta}
              leftSection={<IconCreditCard className="size-4" stroke={1.75} />}
            >
              {data.tarjeta?.ultimos4 ? "Cambiar tarjeta" : "Registrar tarjeta"}
            </Button>
          )}

          {/* Cancelar (F06/D6). Solo con un plan vivo y sin cancelación ya pedida: ofrecer «Cancelar»
              a quien ya canceló invitaría a dudar de si la primera vez funcionó. Va como `subtle` y
              al pie —no compite con nada— porque es la acción que uno espera encontrar si la busca,
              no una que la pantalla deba sugerir. */}
          {!s.cancelacionEfectivaAtIso && (
            <Button
              variant="subtle"
              color="red"
              size="xs"
              loading={cancelando}
              onClick={() => onCancelar(s.periodoFinIso)}
            >
              Cancelar mi plan
            </Button>
          )}
        </Group>
      )}
    </Stack>
  );
}

/**
 * Historial de cobros (F10/D12). No es contabilidad ni reemplaza la boleta (D13, fuera del
 * producto): es para que el Organizador reconozca un cargo en su tarjeta y, si alguno quedó impago,
 * pueda pagarlo desde su propia fila.
 */
function HistorialDeCobros({ cobros }: { cobros: Cobro[] }) {
  return (
    <PanelCard padding={0} mt="md">
      <Paper px="lg" pt="md" pb="xs" bg="transparent">
        <Text fw={600}>Cobros</Text>
        <Text size="sm" c="dimmed">
          Los últimos cargos del plan de esta tienda.
        </Text>
      </Paper>
      <Table.ScrollContainer minWidth={420}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="pl-6">Fecha</Table.Th>
              <Table.Th className="text-right">Monto</Table.Th>
              <Table.Th>Estado</Table.Th>
              <Table.Th className="pr-6 text-right">{""}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cobros.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td className="pl-6">{fecha(new Date(c.fechaIso))}</Table.Td>
                <Table.Td className="text-right tabular-nums">
                  {clp(c.montoBruto)}
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={ESTADO_COBRO_COLOR[c.estado]}>
                    {NOMBRE_COBRO[c.estado]}
                  </Badge>
                </Table.Td>
                <Table.Td className="pr-6 text-right">
                  {/* El link de Flow para regularizar ESTE cobro. Pestaña nueva y no una página de
                      retorno propia: es un invoice suelto de Flow, sin `url_return`, y quien
                      reconcilia el pago es el webhook (F04) — la variante de link externo sin tramo
                      de vuelta de frontend-conventions. El server solo lo manda en cobros impagos:
                      ofrecerlo sobre uno pagado sería invitar a pagar dos veces. */}
                  {c.paymentLink && (
                    <Button
                      component="a"
                      href={c.paymentLink}
                      target="_blank"
                      rel="noreferrer"
                      size="xs"
                      variant="light"
                      rightSection={
                        <IconExternalLink className="size-3.5" stroke={1.75} />
                      }
                    >
                      Pagar
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </PanelCard>
  );
}
