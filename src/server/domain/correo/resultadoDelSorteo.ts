import { type PrismaClient } from "@prisma/client";

import { replyToDeTenants } from "~/server/domain/correo/_contactoDelOrganizador";
import {
  identidadDeCorreo,
  raffleIdDeClave,
} from "~/server/domain/correo/ledgerCorreos";
import {
  armarCorreoResultadoGanador,
  armarCorreoResultadoNoGanador,
  type SorteoResuelto,
} from "~/server/domain/correo/plantillaResultadoSorteo";
import { type CorreoInput } from "~/server/services/correo";

/**
 * Derivación server-side de los correos de **resultado del sorteo** — C4 (ganador) y C5 (no
 * ganador), F04. Es el puente entre las filas del ledger y las plantillas puras: carga lo que hace
 * falta y devuelve el `CorreoInput` de cada fila, listo para el adapter.
 *
 * ── Por qué recibe FILAS y no ids ──────────────────────────────────────────────────────────────
 * A diferencia de la confirmación de compra —donde la clave ES el `orderId` y basta— acá una fila
 * lleva tres datos que no se pueden reconstruir: el **tipo** (ganador vs. no ganador, que decide qué
 * plantilla se usa), el **email snapshot** (el destinatario, tal como lo escribió el Comprador) y el
 * **`tenantId`** contra el que hay que contrastar el sorteo. El `raffleId` sale de la clave, y quien
 * sabe leerla es `ledgerCorreos` — el formato de la clave tiene UN dueño.
 *
 * ── Batch de verdad: 3 queries pase lo que pase ────────────────────────────────────────────────
 * Sorteos + participaciones + membresías (esta última, solo si algún tenant no tiene contacto
 * público). No 3 por fila: una corrida del cron son hasta 100 filas y contra el pooler cada
 * roundtrip cuesta ~0,6-1 s (ADR-0027 / seam `ResolverMensajes`).
 *
 * Las participaciones se cargan por SORTEO y se agrupan en memoria por persona en vez de filtrarse
 * por los emails del lote: el filtro por email sería case-sensitive en Postgres y perdería los
 * tickets de quien compró dos veces escribiendo su correo distinto — justo la persona a la que le
 * faltarían números en su correo. El sorteo entra completo (una tabla de tickets, sin PII extra) y
 * la identidad se resuelve con la MISMA normalización que armó la clave.
 *
 * ── Fail-closed (I1/I2) ────────────────────────────────────────────────────────────────────────
 * Una fila se salta INTACTA —sin correo, sin intento consumido— cuando: su sorteo no existe, el
 * `tenantId` del sorteo no es el de la fila (bug de scoping en algún productor: antes que mandarle a
 * alguien el resultado de otra Tienda, no se manda nada), o el sorteo no está ejecutado. Saltar es
 * lo que ADR-0027 §3 llama falla segura: la fila queda PENDIENTE y visible.
 */

/** Lo que el sorteo aporta al correo. `SorteoResuelto` NO tiene campo para la identidad (D4). */
type DatosDelSorteo = SorteoResuelto & {
  tenantId: string;
  nombreTienda: string;
  logoUrl: string | null;
  colorPrimario: string | null;
  identidadLegal: string | null;
  contactoEmail: string | null;
  /** `Raffle.ganadorEmail` — se usa SOLO para decidir a quién le toca la plantilla de ganador. */
  ganadorEmail: string;
};

/** Fila del ledger, en lo que a esta derivación le importa. */
export interface FilaDeResultado {
  id: string;
  tenantId: string;
  tipo: string;
  clave: string;
  email: string;
}

export async function armarCorreosDeResultado({
  db,
  filas,
}: {
  db: PrismaClient;
  filas: FilaDeResultado[];
}): Promise<Map<string, CorreoInput>> {
  const correos = new Map<string, CorreoInput>();
  const deResultado = filas.filter(
    (f) => f.tipo === "RESULTADO_GANADOR" || f.tipo === "RESULTADO_NO_GANADOR",
  );
  if (deResultado.length === 0) return correos;

  const raffleIds = [...new Set(deResultado.map((f) => raffleIdDeClave(f.clave)))];

  const raffles = await db.raffle.findMany({
    where: { id: { in: raffleIds } },
    select: {
      id: true,
      tenantId: true,
      nombre: true,
      premio: true,
      ganadorEmail: true,
      ganadorNumero: true,
      ejecutadoAt: true,
      basesPdfUrl: true,
      // Marca de la Tienda: el correo habla en SU voz (D1/D9-rev) y muestra los Números con SU
      // prefijo (D12). Todo dato del `Tenant`, nada hardcodeado.
      tenant: {
        select: {
          nombre: true,
          logoUrl: true,
          colorPrimario: true,
          // Pie legal (F05/D6): quién responde por la venta y el sorteo (ADR-0008).
          identidadLegal: true,
          prefijoTicket: true,
          contactoEmail: true,
        },
      },
    },
  });

  const porRaffle = new Map<string, DatosDelSorteo>();
  for (const r of raffles) {
    // Sin ejecución no hay resultado del que hablar (fail-closed).
    if (!r.ejecutadoAt || !r.ganadorEmail) continue;
    porRaffle.set(r.id, {
      tenantId: r.tenantId,
      nombreTienda: r.tenant.nombre,
      logoUrl: r.tenant.logoUrl,
      colorPrimario: r.tenant.colorPrimario,
      identidadLegal: r.tenant.identidadLegal,
      contactoEmail: r.tenant.contactoEmail,
      nombre: r.nombre,
      premio: r.premio,
      numeroGanador: r.ganadorNumero,
      prefijoTicket: r.tenant.prefijoTicket,
      basesUrl: r.basesPdfUrl,
      ganadorEmail: r.ganadorEmail,
    });
  }
  if (porRaffle.size === 0) return correos;

  // Números por persona, SOLO de los sorteos que tienen filas de no ganador (el correo del ganador
  // muestra el número ganador, que ya viene en el `Raffle`).
  const raffleIdsConNumeros = [
    ...new Set(
      deResultado
        .filter((f) => f.tipo === "RESULTADO_NO_GANADOR")
        .map((f) => raffleIdDeClave(f.clave))
        .filter((id) => porRaffle.has(id)),
    ),
  ];
  /** `raffleId → email normalizado → sus Números`. */
  const numerosPorPersona = new Map<string, Map<string, number[]>>();
  if (raffleIdsConNumeros.length > 0) {
    const entries = await db.raffleEntry.findMany({
      where: { raffleId: { in: raffleIdsConNumeros } },
      select: { raffleId: true, email: true, numero: true },
      orderBy: { numero: "asc" },
    });
    for (const e of entries) {
      const delSorteo =
        numerosPorPersona.get(e.raffleId) ?? new Map<string, number[]>();
      numerosPorPersona.set(e.raffleId, delSorteo);
      const persona = identidadDeCorreo(e.email);
      delSorteo.set(persona, [...(delSorteo.get(persona) ?? []), e.numero]);
    }
  }

  const replyTos = await replyToDeTenants({
    db,
    tenants: [...porRaffle.values()].map((s) => ({
      id: s.tenantId,
      contactoEmail: s.contactoEmail,
    })),
  });

  for (const fila of deResultado) {
    const sorteo = porRaffle.get(raffleIdDeClave(fila.clave));
    // Tenancy (I1): el sorteo tiene que ser del MISMO tenant que escribió la fila.
    if (!sorteo || sorteo.tenantId !== fila.tenantId) continue;

    const marca = {
      nombreTienda: sorteo.nombreTienda,
      logoUrl: sorteo.logoUrl,
      colorPrimario: sorteo.colorPrimario,
      identidadLegal: sorteo.identidadLegal,
    };

    const { from, subject, text, html } =
      fila.tipo === "RESULTADO_GANADOR"
        ? armarCorreoResultadoGanador({
            ...marca,
            sorteo,
            // Solo el contacto PÚBLICO se imprime en el cuerpo; el personal viaja en el reply-to.
            contactoPublico: sorteo.contactoEmail,
          })
        : armarCorreoResultadoNoGanador({
            ...marca,
            sorteo,
            numeros:
              numerosPorPersona
                .get(raffleIdDeClave(fila.clave))
                ?.get(identidadDeCorreo(fila.email)) ?? [],
          });

    correos.set(fila.id, {
      from,
      to: fila.email,
      ...(replyTos.has(sorteo.tenantId)
        ? { replyTo: replyTos.get(sorteo.tenantId)! }
        : {}),
      subject,
      text,
      html,
      // Etiquetas de Resend para segmentar métricas. SOLO ASCII (un tag con el nombre de la Tienda
      // daría 422 de TODO el lote): tipo y tenant son enums/cuids.
      tags: [
        { name: "tipo", value: fila.tipo },
        { name: "tenant", value: sorteo.tenantId },
      ],
    });
  }

  return correos;
}
