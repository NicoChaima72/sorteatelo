import { type TenantStatus } from "@prisma/client";

/**
 * Núcleo PURO del gate de publicación (F08/F03, D4/D5, ADR-0008). Es la ÚNICA fuente de verdad
 * de los requisitos para publicar una Tienda, y la comparten (por construcción, no por
 * disciplina) el checklist del panel (`getEstadoPublicacion`) y el gate real recomputado
 * server-side dentro de `publicarTienda` (I2: la transición a PUBLICADA jamás confía en un
 * `puedePublicar` del cliente). Sin DB ni sesión: el caller carga los datos y este módulo decide.
 */

/** Un requisito del checklist: si está cumplido (y, en el caso de bases, si aplica). */
export interface Requisito {
  cumplido: boolean;
}

export interface RequisitosPublicacion {
  /** Términos de Servicio aceptados en la versión vigente (ADR-0008). */
  tos: Requisito;
  /** Credenciales Flow cargadas (BYO-Flow, ADR-0006). */
  flow: Requisito;
  /**
   * ≥1 Product `activo` y **ENTREGABLE** (I9/D5). Desde productos-tipos-digitales F03 "entregable"
   * es "tiene ≥1 `ProductFile` confirmado, o el `pdfPath` legacy" — ya no la columna a secas; y desde
   * F06 un producto **SOBRE** además exige pool ≥ pack ACTIVO más grande (D4/I7).
   * El criterio concreto vive en `esProductoEntregable`; acá solo llega el booleano.
   */
  producto: Requisito;
  /**
   * Bases del sorteo: solo `aplica` si hay un Raffle ACTIVO (ADR-0008). Desde admin-bases-pdf
   * F03/D2/D3, «cumplido» = el Raffle ACTIVO tiene su **PDF de bases** subido — ya no un texto
   * borrador en el Tenant.
   */
  bases: Requisito & { aplica: boolean };
  /**
   * Facturación de la plataforma (ADR-0026, F03/D2): plan activo **o** [[Exención]] vigente. Es el
   * ÚLTIMO requisito a propósito — el paso del compromiso económico no se le pide a quien todavía
   * no terminó de armar su tienda. `exenta` distingue «pagó» de «es cortesía» para que la UI
   * muestre lo correcto sin volver a preguntar (D8/D12).
   */
  facturacion: Requisito & { exenta: boolean };
}

export interface EstadoPublicacion {
  estado: TenantStatus;
  requisitos: RequisitosPublicacion;
  /** Todos los requisitos aplicables cumplidos. Recomputado server-side; nunca del cliente (I2). */
  puedePublicar: boolean;
}

/**
 * Datos crudos que el gate necesita, cargados por el caller (getEstadoPublicacion desde `db`,
 * publicarTienda desde la `tx`). Mantener este shape chico y explícito acopla el núcleo puro a
 * DATOS, no a Prisma.
 */
export interface DatosGate {
  estado: TenantStatus;
  /** Última versión de ToS aceptada por el tenant (`Tenant.tosVersion`), o null. */
  tosVersion: string | null;
  /** Versión de ToS vigente de la plataforma (`TOS_VERSION`). */
  tosVersionVigente: string;
  flowConfigurada: boolean;
  tieneProductoPublicable: boolean;
  hayRaffleActivo: boolean;
  /**
   * `Raffle.basesPdfUrl` del Raffle **ACTIVO** (admin-bases-pdf F03/D2/D3), o `null` si no lo subió
   * — o si no hay Raffle activo, en cuyo caso el requisito ni siquiera aplica. Reemplaza al
   * `basesSorteo` (texto borrador del Tenant) que era la fuente hasta este plan: las bases legales
   * son SIEMPRE un PDF y viven en el SORTEO, no en la Tienda.
   */
  basesPdfDelRaffleActivo: string | null;
  /**
   * `true` sii la Tienda tiene una `PlatformSubscription` ACTIVA (estado ≠ CANCELADA — ver
   * `domain/facturacion/_estadoSuscripcion.ts`). El caller la resuelve; el núcleo no conoce Prisma.
   */
  suscripcionActiva: boolean;
  /**
   * `true` sii tiene una `PlatformExemption` VIGENTE. La vigencia (la fecha `exentaHasta`) la evalúa
   * el caller con `exencionVigente` — misma función que usa el gate de venta, para que «exenta» no
   * signifique dos cosas distintas según por dónde se entre.
   */
  exentaVigente: boolean;
}

/**
 * `true` sii el valor tiene contenido real (no null, no vacío, no solo espacios). Se llama `tieneValor`
 * y no `tieneTexto` desde admin-bases-pdf F03: lo que evalúa ahora es una URL de PDF, no un texto
 * redactado. El `trim` sigue importando — una columna con `""` o espacios NO es "bases cargadas".
 */
function tieneValor(v: string | null): boolean {
  return (v?.trim().length ?? 0) > 0;
}

/**
 * Evalúa los requisitos de publicación y si la Tienda puede publicarse. El requisito de bases
 * SOLO aplica si hay un Raffle ACTIVO (sin sorteo activo no se exige, D5); cuando no aplica,
 * `cumplido` es `true` para no bloquear el gate.
 */
export function evaluarPublicacion(d: DatosGate): EstadoPublicacion {
  const tos: Requisito = {
    cumplido: d.tosVersion !== null && d.tosVersion === d.tosVersionVigente,
  };
  const flow: Requisito = { cumplido: d.flowConfigurada };
  const producto: Requisito = { cumplido: d.tieneProductoPublicable };

  const basesAplica = d.hayRaffleActivo;
  const bases = {
    aplica: basesAplica,
    cumplido: !basesAplica || tieneValor(d.basesPdfDelRaffleActivo),
  };

  // Facturación (ADR-0026, F03/D2): «el plan corre cuando publicas» — la etapa de configuración es
  // el gratis y el cobro nace al publicar, sin trial. Una Tienda exenta (cortesía / grandfather)
  // cumple sin tarjeta ni suscripción Flow (D8).
  const facturacion = {
    exenta: d.exentaVigente,
    cumplido: d.suscripcionActiva || d.exentaVigente,
  };

  const puedePublicar =
    tos.cumplido &&
    flow.cumplido &&
    producto.cumplido &&
    bases.cumplido &&
    facturacion.cumplido;

  return {
    estado: d.estado,
    requisitos: { tos, flow, producto, bases, facturacion },
    puedePublicar,
  };
}

/**
 * Mensaje humano del PRIMER requisito no cumplido (para el error de `publicarTienda` cuando el
 * gate no pasa). Devuelve `null` si todo está cumplido. El orden espeja el del checklist.
 */
export function mensajeRequisitoFaltante(
  r: RequisitosPublicacion,
): string | null {
  if (!r.tos.cumplido) {
    return "Antes de publicar debes aceptar los Términos de Servicio.";
  }
  if (!r.flow.cumplido) {
    return "Antes de publicar debes conectar tu cuenta de Flow para cobrar.";
  }
  if (!r.producto.cumplido) {
    return "Antes de publicar necesitas al menos un producto activo con su archivo subido.";
  }
  if (r.bases.aplica && !r.bases.cumplido) {
    return "Tu sorteo está activo: antes de publicar debes subir el PDF con sus bases.";
  }
  // ÚLTIMO en el orden: el compromiso económico se pide recién cuando el resto está listo (D12).
  if (!r.facturacion.cumplido) {
    return "Antes de publicar debes activar tu plan de Sortéatelo.";
  }
  return null;
}
