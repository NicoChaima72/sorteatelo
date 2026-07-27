import { type PrismaClient } from "@prisma/client";

import { construirUrlSubdominio } from "~/lib/urlApex";
import { urlDeBaja } from "~/server/domain/correo/bajaDeAvisos";
import {
  identidadDeCorreo,
  offsetDeClave,
  raffleIdDeClave,
} from "~/server/domain/correo/ledgerCorreos";
import {
  puedeRecibirAvisos,
  SELECCION_GATE_DE_AVISOS,
} from "~/server/domain/correo/planificarRecordatorios";
import { armarCorreoRecordatorioSorteo } from "~/server/domain/correo/plantillaRecordatorioSorteo";
import { destinatariosDeAvisos } from "~/server/domain/correo/preferenciasDeCorreo";
import { type CorreoInput } from "~/server/services/correo";

/**
 * Derivación server-side de los **recordatorios del sorteo** — C2/C3 (F06). El puente entre las
 * filas del ledger y la plantilla pura: carga lo que hace falta y devuelve el `CorreoInput` de cada
 * fila, listo para el adapter. Hermano de `resultadoDelSorteo.ts` y con la misma forma.
 *
 * ── El filtro se re-pregunta ACÁ, y no es redundancia ──────────────────────────────────────────
 * El planificador ya filtró por consentimiento y supresión al encolar, pero entre encolar y enviar
 * pueden pasar DÍAS: con Resend Free (100/día) un blast se drena de a poco (I9/ADR-0027 §5). Si
 * alguien se da de baja el martes, el correo encolado el lunes **no puede salir el miércoles**. El
 * momento que vale para I5 es el del ENVÍO, así que el filtro se aplica otra vez acá. Es también de
 * donde sale el `tokenBaja` de cada persona, que la plantilla necesita para su enlace de baja.
 *
 * ── Fail-closed (I1/I5) ────────────────────────────────────────────────────────────────────────
 * Una fila se salta INTACTA cuando: su sorteo no existe, el `tenantId` no calza con el de la fila
 * (bug de scoping en algún productor ⇒ antes que mandarle a alguien el sorteo de otra Tienda, no se
 * manda nada), el sorteo ya no está ACTIVO o su cierre pasó, la Tienda no está PUBLICADA **o entró
 * en pausa por pago** (ADR-0026: son ejes separados, una Tienda en pausa sigue PUBLICADA), la clave
 * no trae un offset legible, o la persona perdió el permiso. El caso «obsoleto» además lo RETIRA el
 * planificador (`planificarRecordatorios`), para que la fila no ocupe la ventana del drenado para
 * siempre; esto es la segunda línea, la que impide que salga aunque la primera falle.
 *
 * ── Batch: 3 queries por corrida, no 3 por fila ────────────────────────────────────────────────
 * Sorteos + números + preferencias (esta última una vez por tenant del lote). Contra el pooler cada
 * round-trip cuesta ~0,6-1 s y una corrida son hasta 100 filas.
 */

/** Fila del ledger, en lo que a esta derivación le importa. */
export interface FilaDeRecordatorio {
  id: string;
  tenantId: string;
  tipo: string;
  clave: string;
  email: string;
}

/**
 * URL pública de la Tienda (el CTA del T-6h). Se deriva del `baseUrl` de la PLATAFORMA —el mismo
 * que arma los enlaces de entrega— reusando `construirUrlSubdominio`, que es la única definición de
 * «cómo se arma la dirección de una Tienda» en el repo (ADR-0022).
 *
 * Ojo con una trampa conocida: si `APP_URL` apuntara a un host CON subdominio (`www.…`), pegarle el
 * slug daría `tienda.www.…`. Hoy no pasa —`APP_URL`/`NEXTAUTH_URL` apuntan al apex— y el CTA es
 * decorativo (el correo se entiende sin él), así que no se agrega env nueva por esto; queda
 * anotado como el punto a mirar si el CTA aparece roto.
 */
function urlDeTienda(baseUrl: string, slug: string): string {
  const base = new URL(baseUrl);
  return construirUrlSubdominio({
    protocol: base.protocol,
    apex: base.hostname,
    puerto: base.port,
    slug,
    path: "/",
  });
}

export async function armarRecordatoriosDeSorteo({
  db,
  filas,
  baseUrl,
  ahora = new Date(),
}: {
  db: PrismaClient;
  filas: FilaDeRecordatorio[];
  /** Base absoluta de la plataforma. La lee el borde de `env`, nunca este módulo. */
  baseUrl: string;
  ahora?: Date;
}): Promise<Map<string, CorreoInput>> {
  const correos = new Map<string, CorreoInput>();
  const deRecordatorio = filas.filter((f) => f.tipo === "RECORDATORIO_SORTEO");
  if (deRecordatorio.length === 0) return correos;

  const raffleIds = [
    ...new Set(deRecordatorio.map((f) => raffleIdDeClave(f.clave))),
  ];

  // Las condiciones de vigencia van en el WHERE y no en un `if` después: un sorteo cerrado o de una
  // Tienda despublicada ni siquiera vuelve de la DB, así que no hay forma de olvidarse de mirarlas.
  const raffles = await db.raffle.findMany({
    where: {
      id: { in: raffleIds },
      estado: "ACTIVO",
      fechaFin: { gt: ahora },
      tenant: { estado: "PUBLICADA" },
    },
    select: {
      id: true,
      tenantId: true,
      nombre: true,
      premio: true,
      fechaFin: true,
      basesPdfUrl: true,
      tenant: {
        select: {
          slug: true,
          nombre: true,
          logoUrl: true,
          colorPrimario: true,
          prefijoTicket: true,
          identidadLegal: true,
          // Gate de venta (ADR-0026), segunda línea: el planificador ya lo miró al encolar, pero
          // entre encolar y enviar pueden pasar DÍAS bajo la cuota de Resend Free y la Tienda puede
          // haber entrado en pausa por pago en el medio. `estado === PUBLICADA` NO alcanza: los dos
          // ejes están separados y una Tienda en pausa sigue publicada.
          ...SELECCION_GATE_DE_AVISOS,
        },
      },
    },
  });
  const porRaffle = new Map(
    raffles
      .filter((r) => puedeRecibirAvisos(r.tenant, ahora))
      .map((r) => [r.id, r]),
  );
  if (porRaffle.size === 0) return correos;

  // Números por persona, por sorteo. Se cargan por SORTEO y se agrupan en memoria (no filtrando por
  // los emails del lote): el filtro `in` de Postgres es case-sensitive y le comería los tickets a
  // quien compró dos veces escribiendo su correo distinto — justo a quien le faltarían números.
  const entries = await db.raffleEntry.findMany({
    where: { raffleId: { in: [...porRaffle.keys()] } },
    select: { raffleId: true, email: true, numero: true },
    orderBy: { numero: "asc" },
  });
  const numerosPorPersona = new Map<string, Map<string, number[]>>();
  for (const e of entries) {
    const delSorteo =
      numerosPorPersona.get(e.raffleId) ?? new Map<string, number[]>();
    numerosPorPersona.set(e.raffleId, delSorteo);
    const persona = identidadDeCorreo(e.email);
    delSorteo.set(persona, [...(delSorteo.get(persona) ?? []), e.numero]);
  }

  // Preferencias VIGENTES, una consulta por tenant del lote (I5 al momento del envío).
  const porTenant = new Map<string, FilaDeRecordatorio[]>();
  for (const fila of deRecordatorio) {
    porTenant.set(fila.tenantId, [
      ...(porTenant.get(fila.tenantId) ?? []),
      fila,
    ]);
  }
  const habilitadosPorTenant = new Map(
    await Promise.all(
      [...porTenant].map(
        async ([tenantId, susFilas]) =>
          [
            tenantId,
            await destinatariosDeAvisos({
              db,
              tenantId,
              emails: susFilas.map((f) => f.email),
            }),
          ] as const,
      ),
    ),
  );

  for (const fila of deRecordatorio) {
    const sorteo = porRaffle.get(raffleIdDeClave(fila.clave));
    // Tenancy (I1): el sorteo tiene que ser del MISMO tenant que escribió la fila.
    if (!sorteo || sorteo.tenantId !== fila.tenantId) continue;

    const offsetHoras = offsetDeClave(fila.clave);
    if (offsetHoras === null) continue; // clave sin offset legible ⇒ no se adivina la variante

    // I5 al momento del envío: quien se dio de baja entre el encolado y ahora NO recibe.
    const persona = identidadDeCorreo(fila.email);
    const destinatario = habilitadosPorTenant.get(fila.tenantId)?.get(persona);
    if (!destinatario) continue;

    const { from, subject, text, html, headers } =
      armarCorreoRecordatorioSorteo({
        nombreTienda: sorteo.tenant.nombre,
        logoUrl: sorteo.tenant.logoUrl,
        colorPrimario: sorteo.tenant.colorPrimario,
        identidadLegal: sorteo.tenant.identidadLegal,
        sorteo: {
          nombre: sorteo.nombre,
          premio: sorteo.premio,
          fechaFin: sorteo.fechaFin,
          prefijoTicket: sorteo.tenant.prefijoTicket,
          basesUrl: sorteo.basesPdfUrl,
        },
        numeros: numerosPorPersona.get(sorteo.id)?.get(persona) ?? [],
        offsetHoras,
        urlTienda: urlDeTienda(baseUrl, sorteo.tenant.slug),
        urlBaja: urlDeBaja({ baseUrl, token: destinatario.tokenBaja }),
      });

    correos.set(fila.id, {
      from,
      // El snapshot de la fila y no el de la preferencia: es a quien se le prometió el correo.
      to: fila.email,
      subject,
      text,
      html,
      // Las cabeceras del one-click son lo que distingue a un aviso de un transaccional (I5).
      headers,
      // Etiquetas de Resend, SOLO ASCII (un tag con el nombre de la Tienda daría 422 del lote).
      tags: [
        { name: "tipo", value: "RECORDATORIO_SORTEO" },
        { name: "offset", value: String(offsetHoras) },
        { name: "tenant", value: sorteo.tenantId },
      ],
    });
  }

  return correos;
}
