import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { armarCsv } from "~/server/domain/panel/_csv";
import {
  aVentaDelPanel,
  SELECCION_DE_VENTA,
  type VentaDelPanel,
} from "~/server/domain/panel/listarVentas";

/**
 * Zona horaria del producto. Sortéatelo es una plataforma chilena de punta a punta (CLP, es-CL,
 * Flow, SII), así que «la fecha de una venta» es la hora de Chile y no la del servidor —que en
 * producción corre en UTC. Sin esto, el CSV mostraría horas corridas contra las que el Organizador
 * ve en el panel (que formatea en el navegador, o sea en su propio huso).
 *
 * Es el primer lugar del repo que fija un huso: hasta ahora TODO el formateo de fechas era de
 * cliente (`~/lib/formato`), y el cliente ya está parado en Chile. El CSV se arma server-side (D9),
 * así que hay que decirlo explícitamente.
 */
const ZONA_HORARIA = "America/Santiago";

const FMT_FECHA_HORA = new Intl.DateTimeFormat("es-CL", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const FMT_DIA = new Intl.DateTimeFormat("es-CL", {
  timeZone: ZONA_HORARIA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function partes(fmt: Intl.DateTimeFormat, d: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/**
 * Fecha de una celda: `YYYY-MM-DD HH:mm` en hora de Chile.
 *
 * ISO-primero (año-mes-día) y no el `dd-mm-yyyy` de la UI: en una planilla es lo único que ordena
 * bien COMO TEXTO si Excel no la reconoce como fecha, y es el formato que Excel interpreta igual en
 * cualquier locale. El `dd-mm-yyyy` de la pantalla, abierto en un Excel en inglés, convierte el 05
 * de enero en 01 de mayo sin avisar.
 */
function fechaDeCelda(d: Date): string {
  const p = partes(FMT_FECHA_HORA, d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Día de hoy en Chile, para el nombre del archivo. */
function diaDeArchivo(d: Date): string {
  const p = partes(FMT_DIA, d);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Columnas FIJAS. El orden es el de D9 (`fecha, correo, total, estado, productos`) con dos ajustes:
 * `Comisión` y `Te queda` entran pegadas al `Total` —los tres montos juntos, que es como se cuadra
 * plata— y `Productos` se corre al final por ser la celda más larga y variable. **No calca el orden
 * de la tabla del panel**, que es otro (`Cliente, Productos, Fecha, Total, …`): una pantalla se lee
 * de un vistazo y una planilla se lee por columnas.
 *
 * Las dinámicas (una por `clave` respondida) se agregan siempre a la DERECHA: así el archivo de una
 * Tienda que agrega un campo sigue teniendo las mismas primeras columnas que el de la semana pasada.
 *
 * `Comisión` y `Te queda` están acá aunque D9 no las enumeró: la frase que manda de D9 es «exporta
 * las mismas filas que lista el panel de ventas», y esas dos SON columnas del panel. Omitirlas
 * dejaría al CSV —que es la superficie contable, la que se abre para cuadrar la plata del mes—
 * peor que la pantalla que exporta.
 */
const COLUMNAS_FIJAS = [
  "Fecha",
  "Correo",
  "Total",
  "Comisión",
  "Te queda",
  "Estado",
  "Productos",
] as const;

/**
 * Celda «Productos» de una venta. **Criterio DISTINTO del de la tabla del panel** —que hace
 * `items.map(titulo).join(", ")`— y a propósito: en la pantalla el título alcanza porque el
 * Organizador puede abrir el Drawer y ver las cantidades; en la planilla no hay Drawer, así que la
 * celda tiene que bastarse sola.
 *
 * Va `cantidad × título` separado por `, `. La regla que manda es «el separador de adentro no puede
 * ser el separador del archivo»: mientras el archivo delimitó con coma esto se juntaba con `; `, y
 * cuando el archivo pasó a `;` (2026-07-25, decisión del usuario) hubo que darlo vuelta. Si no, la
 * celda de toda venta con dos productos viaja entrecomillada y cualquier lector que parta por `;`
 * sin honrar comillas —que los hay— corre la fila entera.
 */
function productosDeCelda(venta: VentaDelPanel): string {
  return venta.items.map((it) => `${it.cantidad} × ${it.titulo}`).join(", ");
}

/** Una columna dinámica del CSV: la identidad es la `clave`, el encabezado es la `etiqueta`. */
interface ColumnaDinamica {
  clave: string;
  etiqueta: string;
}

/**
 * Las columnas dinámicas del archivo: una por `clave` PRESENTE en el conjunto exportado (D9). Una
 * Tienda que nunca configuró campos no gana ninguna columna (I9); un campo ya borrado la conserva
 * mientras haya una venta que lo respondió — el snapshot es autocontenido y la historia no se
 * reescribe (D5/I4).
 *
 * Dos decisiones que van juntas:
 *
 * - **El encabezado es la `etiqueta`, no la `clave`**: `telefono_de_contacto` es identidad interna;
 *   lo que el Organizador reconoce arriba de la columna es «Teléfono de contacto».
 * - **Se toma la etiqueta de la venta MÁS RECIENTE** (las ventas llegan desc, así que es la primera
 *   aparición). Si el Organizador renombró el campo, el archivo lo titula como se llama HOY, que es
 *   como lo va a buscar; las respuestas viejas siguen abajo, en su columna, intactas.
 *
 * Y cuando dos claves DISTINTAS comparten etiqueta, se desambigua con la clave entre paréntesis.
 * No es un caso de laboratorio: D5 obliga a borrar y recrear el campo para cambiarle el tipo, y la
 * derivación le pone sufijo a la clave nueva (`talla`, `talla_2`) sin tocar la etiqueta — o sea que
 * el camino que el propio diseño prescribe termina en dos columnas «Talla». Dos encabezados
 * idénticos son dos columnas indistinguibles en la planilla.
 */
function columnasDinamicas(ventas: VentaDelPanel[]): ColumnaDinamica[] {
  const etiquetaPorClave = new Map<string, string>();
  for (const venta of ventas) {
    for (const r of venta.respuestas) {
      if (!etiquetaPorClave.has(r.clave)) {
        etiquetaPorClave.set(r.clave, r.etiqueta);
      }
    }
  }

  const repetidas = new Set<string>();
  const vistas = new Set<string>();
  for (const etiqueta of etiquetaPorClave.values()) {
    if (vistas.has(etiqueta)) repetidas.add(etiqueta);
    vistas.add(etiqueta);
  }

  return [...etiquetaPorClave].map(([clave, etiqueta]) => ({
    clave,
    etiqueta: repetidas.has(etiqueta) ? `${etiqueta} (${clave})` : etiqueta,
  }));
}

/**
 * Use case del panel (F07, D9): arma el CSV de TODAS las ventas de la Tienda del Organizador.
 *
 * El `tenantId` se resuelve SERVER-SIDE desde `acceso` (I1/ADR-0005); sin membresía ⇒ `FORBIDDEN`.
 * Es el mismo dato que ya lista el panel —misma selección, mismo mapeo, mismo orden— porque el
 * archivo no puede ser una segunda versión de la verdad (D9).
 *
 * PII (I7): el archivo lleva los datos que el Comprador dejó en el checkout. Solo sale por
 * `panelProcedure`, hacia el Organizador con membresía de la Tienda dueña.
 */
export async function exportarVentasCsv({
  db,
  acceso,
  ahora = new Date(),
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  /** Inyectable para tests: solo nombra el archivo, no filtra nada. */
  ahora?: Date;
}): Promise<{ nombreArchivo: string; contenido: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  const rows = await db.order.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: SELECCION_DE_VENTA,
  });
  const ventas = rows.map(aVentaDelPanel);

  const dinamicas = columnasDinamicas(ventas);

  const filas = ventas.map((v) => {
    const porClave = new Map(v.respuestas.map((r) => [r.clave, r.valor]));
    return [
      fechaDeCelda(v.createdAt),
      v.email,
      v.total,
      v.comision ?? "",
      v.neto ?? "",
      v.estado,
      productosDeCelda(v),
      // Celda vacía cuando esta venta no respondió esa clave (campo opcional, o campo que todavía
      // no existía). Todas las filas tienen el MISMO largo: una planilla con filas desparejas no
      // abre bien.
      ...dinamicas.map((c) => porClave.get(c.clave) ?? ""),
    ];
  });

  const encabezado = [...COLUMNAS_FIJAS, ...dinamicas.map((c) => c.etiqueta)];

  const contenido = armarCsv([encabezado, ...filas]);

  return {
    nombreArchivo: `ventas-${diaDeArchivo(ahora)}.csv`,
    contenido,
  };
}
