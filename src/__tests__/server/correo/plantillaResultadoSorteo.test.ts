import { describe, expect, it } from "vitest";

import {
  armarCorreoResultadoGanador,
  armarCorreoResultadoNoGanador,
} from "~/server/domain/correo/plantillaResultadoSorteo";

/**
 * Tests de las plantillas PURAS del **resultado del sorteo** (F04/C4-C5, D4). Son dos correos
 * hermanos y opuestos: uno felicita, el otro cierra el ciclo — y los dos NOMBRAN el sorteo (I10) y
 * muestran los Números como boletos con el prefijo de la Tienda (D10/D12).
 *
 * La propiedad más cara del par es negativa y vive en el de NO ganador: **el número ganador SÍ, la
 * identidad del ganador JAMÁS** (D4, Ley 21.719).
 */

const SORTEO = {
  nombre: "Photobook firmado por el grupo",
  premio: "Photobook firmado + set de photocards",
  numeroGanador: 1057,
  prefijoTicket: "ARMY",
};

describe("domain/correo/plantillaResultadoSorteo — ganador (C4)", () => {
  const armado = armarCorreoResultadoGanador({
    nombreTienda: "ARMY Chile",
    sorteo: SORTEO,
  });

  // correo.resultado.001 — felicitación con el sorteo NOMBRADO (I10), el premio, el número ganador
  //                        como BOLETO con prefijo (D10/D12) y el canal de contacto.
  it("felicita nombrando el sorteo y el premio, con el número ganador como boleto y el canal de contacto", () => {
    expect(armado.from).toContain("ARMY Chile");
    // I10: el sorteo se nombra en el asunto y en el cuerpo, no se deja adivinar.
    expect(armado.subject).toContain("Photobook firmado por el grupo");

    for (const parte of [armado.text, armado.html]) {
      expect(parte).toContain("Photobook firmado por el grupo"); // sorteo (I10)
      expect(parte).toContain("Photobook firmado + set de photocards"); // premio
      expect(parte).toContain("ARMY-1057"); // número ganador CON prefijo (D12)
    }
    // Canal de contacto: el reply-to del Organizador, dicho como instrucción (T6).
    expect(armado.text.toLowerCase()).toContain("responde este correo");
    // El boleto (D10): mono + perforación, no una lista plana.
    expect(armado.html).toContain("IBM Plex Mono");
  });
});

describe("domain/correo/plantillaResultadoSorteo — no ganador (C5/D4)", () => {
  const armado = armarCorreoResultadoNoGanador({
    nombreTienda: "ARMY Chile",
    sorteo: SORTEO,
    numeros: [1043, 1044, 1045],
  });

  // correo.resultado.002 — el número ganador + SUS números, el sorteo nombrado, sin promo.
  it("agradece nombrando el sorteo, muestra el número ganador y los números propios como boletos", () => {
    expect(armado.subject).toContain("Photobook firmado por el grupo");
    for (const parte of [armado.text, armado.html]) {
      expect(parte).toContain("Photobook firmado por el grupo"); // I10
      expect(parte).toContain("ARMY-1057"); // el número que ganó
      expect(parte).toContain("ARMY-1043–1045"); // los suyos, plegados en rango (D8)
    }
  });

  // correo.resultado.003 — **D4, la propiedad negativa**: el número ganador SÍ, la identidad del
  //                        ganador JAMÁS (Ley 21.719), y nada de promo adentro (C9 es otro correo).
  //                        El canario es duro a propósito: NINGÚN `@` en el cuerpo. Si alguien mete
  //                        el correo del ganador, un mailto o una dirección de contacto, esto grita.
  it("no filtra la identidad del ganador ni mete promo (D4)", () => {
    for (const parte of [armado.text, armado.html]) {
      expect(parte).not.toContain("@");
      for (const promo of ["descuento", "cupón", "código de", "compra ahora"]) {
        expect(parte.toLowerCase()).not.toContain(promo);
      }
    }
    // Y la garantía estructural: la plantilla no tiene por dónde recibir el dato. Pasarlo no
    // compila (`@ts-expect-error` falla si la propiedad existiera).
    armarCorreoResultadoNoGanador({
      nombreTienda: "ARMY Chile",
      // @ts-expect-error — `SorteoResuelto` no tiene campo para la identidad del ganador (D4)
      sorteo: { ...SORTEO, ganadorEmail: "ganadora@x.cl" },
      numeros: [1043],
    });
  });
});

describe("domain/correo/plantillaResultadoSorteo — jerarquía de los dos grupos de boletos", () => {
  // correo.resultado.007 — el defecto que apareció MIRANDO el render, no en un assert: con los dos
  //                        grupos pintados igual, «TUS NÚMEROS» se lee como continuación del
  //                        ganador y el destinatario puede creer que salió. El ganador va en el
  //                        acento de la Tienda; los propios, en tinta.
  it("el boleto ganador y los propios no comparten tratamiento visual", () => {
    const armado = armarCorreoResultadoNoGanador({
      nombreTienda: "ARMY Chile",
      colorPrimario: "#e11d48",
      sorteo: SORTEO,
      numeros: [1043, 1044],
    });

    const colorDe = (numero: string) =>
      new RegExp(`color:(#[0-9a-f]{6});white-space:nowrap;">${numero}<`).exec(
        armado.html,
      )?.[1];

    const delGanador = colorDe("ARMY-1057");
    const delPropio = colorDe("ARMY-1043–1044");
    expect(delGanador).toBeDefined();
    expect(delPropio).toBeDefined();
    expect(delGanador).not.toBe(delPropio);
  });
});

describe("domain/correo/plantillaResultadoSorteo — entrada hostil", () => {
  // correo.resultado.006 — el nombre del sorteo y el premio los escribe el Organizador y viajan a
  //                        DOS lugares con defensas distintas: el `subject` (cabecera ⇒ sin CRLF) y
  //                        el HTML (⇒ escapado). Este correo es el primero cuyo ASUNTO lleva texto
  //                        del sorteo, así que la defensa de cabecera es nueva acá.
  it("nombre de Tienda, sorteo y premio hostiles no inyectan cabeceras ni HTML", () => {
    const hostil = {
      nombre: "Sorteo\r\nBcc: victima@x.cl <img src=x onerror=alert(1)>",
      premio: "<script>alert(1)</script>",
      numeroGanador: 5,
      prefijoTicket: null,
    };
    const armados = [
      armarCorreoResultadoGanador({
        nombreTienda: 'Regalos <ataque@evil.cl>\r\nBcc: otra@x.cl "a",b;c',
        sorteo: hostil,
      }),
      armarCorreoResultadoNoGanador({
        nombreTienda: 'Regalos <ataque@evil.cl>\r\nBcc: otra@x.cl "a",b;c',
        sorteo: hostil,
        numeros: [1, 2],
      }),
    ];

    for (const armado of armados) {
      // Cabeceras: UN solo angle-addr en el from y cero saltos de línea en from/subject.
      expect(armado.from.match(/</g) ?? []).toHaveLength(1);
      expect(armado.from).not.toMatch(/[\r\n]/);
      expect(armado.subject).not.toMatch(/[\r\n]/);

      // Cuerpo: el markup del tenant llega ESCAPADO, nunca interpretado. El nombre del sorteo es
      // el dato que SÍ aparece en los dos correos (el premio solo en el del ganador — el de no
      // ganador es deliberadamente más seco, D4).
      expect(armado.html).not.toContain("<script>");
      expect(armado.html).not.toContain("<img src=x");
      expect(armado.html).toContain("&lt;img src=x onerror=alert(1)&gt;");

      // Email-safe (el arnés de F07 sigue rigiendo sobre plantillas nuevas).
      for (const prohibido of ["<style", "<link", "class=", "@font-face", "display:flex", "display:grid"]) {
        expect(armado.html).not.toContain(prohibido);
      }
      expect(armado.html).toContain('role="presentation"');
      expect(armado.text.trim()).not.toBe("");
    }
    // El premio, que solo viaja en el del ganador, también llega escapado.
    expect(armados[0]!.html).toContain("&lt;script&gt;");
  });
});

describe("domain/correo/plantillaResultadoSorteo — degradación (§5.2)", () => {
  const SIN_NADA = {
    nombre: "Sorteo de marzo",
    premio: "Un libro",
    numeroGanador: null,
    prefijoTicket: null,
  };

  // correo.resultado.004 — sin `ganadorNumero` (histórico pre-ADR-0024), sin prefijo y sin bases:
  //                        el correo sale ENTERO, sin boleto inventado, sin rótulo vacío y sin un
  //                        enlace de bases roto.
  it("sin número ganador, sin prefijo y sin bases el correo sale entero y sin huecos visibles", () => {
    const ganador = armarCorreoResultadoGanador({
      nombreTienda: "Tienda",
      sorteo: SIN_NADA,
    });
    const perdedor = armarCorreoResultadoNoGanador({
      nombreTienda: "Tienda",
      sorteo: SIN_NADA,
      numeros: [7, 8],
    });

    for (const armado of [ganador, perdedor]) {
      expect(armado.text).toContain("Sorteo de marzo"); // I10 se sostiene igual
      expect(armado.text).not.toContain("undefined");
      expect(armado.text).not.toContain("NaN");
      expect(armado.html).not.toContain("undefined");
      expect(armado.html).not.toContain("NaN");
      // Ni rótulo del boleto ganador ni enlace de bases: no se dibujan, no quedan vacíos.
      expect(armado.html).not.toContain("NÚMERO GANADOR");
      expect(armado.text).not.toContain("Bases del sorteo");
    }
    // Los números propios siguen saliendo, pelados (sin prefijo ⇒ como antes de F08).
    expect(perdedor.text).toContain("7–8");
    expect(perdedor.html).toContain("TUS NÚMEROS");
  });

  // correo.resultado.005 — un participante sin números (no debería pasar: la fila del ledger nace
  //                        de sus tickets) igual recibe un correo legible, no un bloque vacío.
  it("sin números propios no dibuja el bloque «tus números»", () => {
    const armado = armarCorreoResultadoNoGanador({
      nombreTienda: "Tienda",
      sorteo: SORTEO,
      numeros: [],
    });
    expect(armado.html).not.toContain("TUS NÚMEROS");
    expect(armado.text).toContain("ARMY-1057"); // el resultado sigue estando
    expect(armado.text).not.toContain("Tus números");
  });
});
