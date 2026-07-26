import { Alert, Button, Group, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconClock,
  IconCreditCard,
  IconExternalLink,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { type ComponentType } from "react";

import { fecha } from "~/lib/formato";
import { RUTA_PLAN } from "~/server/panel/restriccionFacturacion";
import { type RouterOutputs } from "~/utils/api";

/**
 * Banner global de morosidad del panel (facturación F05/D4/D10, ADR-0026). Lo monta el chrome en TODA
 * página del panel: la conversación sobre el plan no puede depender de que el Organizador entre a una
 * pantalla que quizá no visita nunca.
 *
 * Dos gravedades distintas, y la diferencia es real (D4):
 * - `COBRO_PENDIENTE` y `EXENCION_POR_EXPIRAR` van en `pendiente` (ámbar): en los dos casos la tienda
 *   **sigue vendiendo** — Flow está reintentando el cobro, o la cortesía todavía vale. Son avisos, no
 *   cortes: pintarlos en rojo sería mentirle sobre su situación (design.md §9: «pendiente» NUNCA en
 *   rojo). El ícono los distingue: algo que FALLÓ (triángulo) vs. una fecha que se ACERCA (reloj).
 * - Los tres motivos de pausa van en `red`: la tienda dejó de recibir pedidos. Acá el rojo sí
 *   corresponde, porque hay algo roto que solo el Organizador puede arreglar.
 *
 * Cada motivo trae su propia acción porque son arreglos distintos: un cobro impago se paga con el
 * `paymentLink` de Flow, un plan cancelado se re-suscribe y una cortesía (vencida o por vencer) se
 * contrata. Un «tienes un problema con tu plan» genérico lo obligaría a adivinar.
 */

/** Se DERIVA del router (frontend-conventions § Tipos): si el server cambia, el compilador avisa acá. */
type EstadoAviso = RouterOutputs["panel"]["getAvisoFacturacion"];
type Aviso = NonNullable<EstadoAviso["aviso"]>;

/** Igual que en `admin-layout` / `empty-state` / `stat-card`: el ícono viaja como componente. */
type IconCmp = ComponentType<{ className?: string; stroke?: number | string }>;

interface Copy {
  color: "pendiente" | "red";
  /**
   * REQUERIDO, no opcional con default: el `Record` de abajo vale justamente porque el compilador
   * pide todo para cada aviso nuevo. Un flag opcional dejaría que un aviso futuro saliera con el
   * ícono equivocado en silencio.
   */
  icono: IconCmp;
  titulo: string;
  cuerpo: string;
  /** Etiqueta del link secundario a la página Plan. */
  irAlPlan: string;
}

const COPY: Record<Aviso, Copy> = {
  COBRO_PENDIENTE: {
    color: "pendiente",
    icono: IconAlertTriangle,
    titulo: "No pudimos cobrar tu plan",
    cuerpo:
      "Vamos a reintentar el cobro en los próximos días. Mientras tanto tu tienda sigue vendiendo con normalidad.",
    irAlPlan: "Ver mi plan",
  },
  EXENCION_POR_EXPIRAR: {
    color: "pendiente",
    icono: IconClock,
    titulo: "Tu plan cortesía está por terminar",
    // El día exacto lo pone `cuerpoDelAviso`: este texto es el respaldo para el caso —hoy
    // imposible— de un aviso sin fecha. Nunca imprimir un `null` ni inventar un día.
    cuerpo:
      "Cuando termine, activa tu plan para que tu tienda siga recibiendo pedidos.",
    // «Ver», no «Activar»: mientras la cortesía siga vigente el server RECHAZA el registro de
    // tarjeta (`iniciarRegistroTarjeta`, D8 — una tienda de cortesía no tiene tarjeta ni suscripción
    // Flow). Prometer una acción que la pantalla de destino no puede ofrecer se paga en soporte.
    irAlPlan: "Ver mi plan",
  },
  EN_PAUSA_POR_PAGO: {
    color: "red",
    icono: IconAlertTriangle,
    titulo: "Tu tienda está en pausa",
    cuerpo:
      "Dejó de recibir pedidos porque no pudimos cobrar tu plan. En cuanto registremos el pago, vuelve a estar disponible.",
    irAlPlan: "Ver mi plan",
  },
  SIN_PLAN: {
    color: "red",
    icono: IconAlertTriangle,
    titulo: "Tu tienda no tiene un plan activo",
    cuerpo:
      "Mientras no haya un plan, tu tienda no recibe pedidos. Puedes activarlo de nuevo cuando quieras.",
    irAlPlan: "Activar mi plan",
  },
  EXENCION_EXPIRADA: {
    color: "red",
    icono: IconAlertTriangle,
    titulo: "Tu plan cortesía terminó",
    cuerpo:
      "Para que tu tienda vuelva a recibir pedidos, activa un plan. La tienda y todo lo que subiste siguen intactos.",
    irAlPlan: "Activar mi plan",
  },
};

/**
 * El único aviso cuyo texto depende de un dato: la cortesía por vencer nombra el DÍA en que termina.
 * Un «termina pronto» dejaría al Organizador con la tarea de averiguar cuándo, que es justo lo que un
 * aviso tiene que ahorrarle. Sin fecha se cae al texto fijo — jamás un `null` ni un día inventado.
 */
function cuerpoDelAviso(estado: EstadoAviso, copy: Copy): string {
  if (estado.aviso === "EXENCION_POR_EXPIRAR" && estado.exentaHastaIso) {
    // Termina en una instrucción y no en una condición (design.md §8: acompañar diciendo qué hacer),
    // con el «desde ese día» que la hace ejecutable: antes, el server rechaza el registro de tarjeta.
    return `Tu tienda vende sin costo hasta el ${fecha(new Date(estado.exentaHastaIso))}. Después de esa fecha, activa tu plan para que siga recibiendo pedidos.`;
  }
  return copy.cuerpo;
}

export function BannerFacturacion({ estado }: { estado: EstadoAviso }) {
  const router = useRouter();

  if (!estado.aviso) return null;
  const copy = COPY[estado.aviso];
  const Icono = copy.icono;

  // Estando ya en la página Plan, el link secundario sobra (apuntaría a donde estás). El
  // `paymentLink` sí se mantiene: ahí es justamente donde se espera poder pagar.
  const yaEnPlan = router.pathname.startsWith(RUTA_PLAN);

  return (
    <Alert
      variant="light"
      color={copy.color}
      radius="md"
      icon={<Icono className="size-[18px]" stroke={1.75} />}
      title={copy.titulo}
      mb="lg"
    >
      <Text size="sm">{cuerpoDelAviso(estado, copy)}</Text>
      <Group gap="xs" mt="sm">
        {estado.paymentLink && (
          <Button
            component="a"
            href={estado.paymentLink}
            // Pestaña NUEVA, que es lo contrario de lo que hace «Activa tu plan» — y la diferencia
            // no es de gusto: este link no tiene tramo de vuelta nuestro. El patrón
            // modal → `window.location.assign` → página de retorno (frontend-conventions § Salir de
            // la app a un proveedor externo) existe porque ahí la app POSEE el regreso: manda una
            // mutation, recibe una URL con `url_return` y confirma server-side al volver. Acá el
            // `paymentLink` sale de una query, es un link de Flow a un invoice suelto SIN
            // `url_return`, y quien reconcilia el pago es el webhook (F04), no el navegador. Sumado
            // a que el banner es GLOBAL, un `location.assign` sacaría al Organizador de cualquier
            // pantalla en la que estuviera trabajando para no traerlo de vuelta a ninguna.
            target="_blank"
            rel="noreferrer"
            size="xs"
            color={copy.color}
            leftSection={<IconCreditCard className="size-3.5" stroke={1.75} />}
            rightSection={<IconExternalLink className="size-3.5" stroke={1.75} />}
          >
            Pagar ahora
          </Button>
        )}
        {!yaEnPlan && (
          <Button component={Link} href={RUTA_PLAN} size="xs" variant="default">
            {copy.irAlPlan}
          </Button>
        )}
      </Group>
    </Alert>
  );
}
