import { Prisma, type PlatformPlan } from "@prisma/client";

/**
 * Núcleo PURO del pricing del Pagador (F01, D1/D7, ADR-0026). Sin DB ni sesión: el caller carga
 * las suscripciones del Pagador y este módulo decide QUÉ PLAN corresponde.
 *
 * La promesa pública de la landing («$25.000/mes, segunda tienda a mitad de precio») es relativa
 * al **Pagador**, no a la Tienda: entre sus suscripciones ACTIVAS hay **exactamente una a precio
 * full — la más antigua** (I8). El plan y el precio se resuelven SIEMPRE server-side contando esas
 * suscripciones; ningún input del cliente los dicta (I4, lección H1 de datawalt-app).
 */

/**
 * Precios BRUTOS mensuales en CLP (IVA incluido) — los mismos que promete la landing del apex
 * (`src/components/landing/copy.ts`). Como **string**: el dinero se construye en `Decimal` y
 * jamás vive como `number` en el server (I2).
 */
export const PRECIO_FULL_CLP = "25000";
export const PRECIO_ADICIONAL_CLP = "12500";

/** Monto bruto mensual del plan, en `Decimal` (I2). Es lo que se snapshotea en la suscripción. */
export function montoDelPlan(plan: PlatformPlan): Prisma.Decimal {
  return new Prisma.Decimal(
    plan === "FULL" ? PRECIO_FULL_CLP : PRECIO_ADICIONAL_CLP,
  );
}

/** Un plan de la Plataforma y su espejo en la cuenta Flow. */
export interface DefinicionPlan {
  plan: PlatformPlan;
  /**
   * `planId` en Flow. Estable y legible: es la LLAVE que vuelve idempotente al bootstrap (F02) y la
   * que se manda en `subscription/create` (F03). Cambiarlo crearía un plan nuevo en Flow y dejaría
   * huérfanas a las suscripciones vivas — es efectivamente inmutable.
   */
  flowPlanId: string;
  /** Nombre visible en el panel de Flow y en los correos que Flow mande al Pagador. */
  nombre: string;
  /** Monto bruto mensual en CLP entero, como string (nunca `number` — I2). */
  montoCLP: string;
}

/**
 * Catálogo de los 2 planes (D1). UNA fuente de verdad compartida por el bootstrap de Flow (F02), la
 * creación de la suscripción (F03) y el recálculo del pricing (F06): si el script tuviera sus
 * propios `planId` sueltos, el día que cambien, Flow y la DB apuntarían a planes distintos.
 *
 * El orden importa: `FULL` primero — es como se lista en el bootstrap y como se lee el catálogo.
 */
export const PLANES_PLATAFORMA: readonly DefinicionPlan[] = [
  {
    plan: "FULL",
    flowPlanId: "sorteatelo-tienda-full",
    nombre: "Sortéatelo — plan tienda",
    montoCLP: PRECIO_FULL_CLP,
  },
  {
    plan: "ADICIONAL",
    flowPlanId: "sorteatelo-tienda-adicional",
    nombre: "Sortéatelo — plan tienda adicional",
    montoCLP: PRECIO_ADICIONAL_CLP,
  },
];

/** La definición del plan. Lanza si el catálogo y el enum se desincronizan (no debería pasar). */
export function definicionDelPlan(plan: PlatformPlan): DefinicionPlan {
  const def = PLANES_PLATAFORMA.find((p) => p.plan === plan);
  if (!def) {
    throw new Error(`No hay definición del plan ${plan} en PLANES_PLATAFORMA.`);
  }
  return def;
}

/**
 * Una suscripción del Pagador tal como la necesita el pricing. Shape chico y explícito: acopla el
 * núcleo a DATOS, no a Prisma (mismo criterio que `DatosGate` de `_publicacion.ts`).
 */
export interface SuscripcionDelPagador {
  id: string;
  plan: PlatformPlan;
  /** Antigüedad: la más antigua es la que se queda con el precio full (I8). */
  createdAt: Date;
}

/**
 * Plan que le corresponde a una suscripción NUEVA de este Pagador: `FULL` si no tiene ninguna
 * activa, `ADICIONAL` si ya tiene al menos una. Recibe las **activas** ya filtradas por el caller
 * (activa = estado ≠ CANCELADA, ver `_estadoSuscripcion.ts`).
 */
export function planParaNuevaSuscripcion(
  activas: SuscripcionDelPagador[],
): PlatformPlan {
  return activas.length === 0 ? "FULL" : "ADICIONAL";
}

/** Un cambio de plan que hay que aplicar para restaurar I8. */
export interface CambioDePlan {
  suscripcionId: string;
  planActual: PlatformPlan;
  planNuevo: PlatformPlan;
}

/**
 * Recálculo del pricing del Pagador (D7): dadas SUS suscripciones activas, devuelve los cambios de
 * plan necesarios para que I8 se cumpla — **exactamente una full, la más antigua**. Lista vacía =
 * el invariante ya se cumple, así que es idempotente y seguro de correr en cada cancelación.
 *
 * El caso que motiva la maquinaria (D7): si el Pagador cancela la Tienda que pagaba full, su
 * adicional más antigua se promueve a full (en Flow, con `subscription/changePlan` PROGRAMADO —
 * el cobro nuevo rige desde la próxima renovación, nunca retroactivo). La función también corrige
 * el caso simétrico (dos fulls por un estado corrupto), degradando todo lo que no sea la primera.
 *
 * Orden: `createdAt asc` con desempate por `id asc` — el MISMO orden canónico que usa el resto del
 * sistema para las membresías (`server/panel/membresias.ts`). Con dos suscripciones creadas en el
 * mismo instante, un orden inestable haría que dos corridas propusieran promover a tiendas
 * distintas, y el Pagador vería el precio saltar de una a otra.
 */
export function recalcularPlanesDelPagador(
  activas: SuscripcionDelPagador[],
): CambioDePlan[] {
  const ordenadas = [...activas].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );

  return ordenadas.flatMap((s, i) => {
    const planNuevo: PlatformPlan = i === 0 ? "FULL" : "ADICIONAL";
    if (s.plan === planNuevo) return [];
    return [{ suscripcionId: s.id, planActual: s.plan, planNuevo }];
  });
}
