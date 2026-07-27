import { describe, expect, it } from "vitest";

import { crearLimitadorDeIntentos } from "~/server/security/limiteDeIntentos";

/**
 * Tests del limitador de intentos in-memory (verificador-tickets F01/D5). Módulo PURO: la ventana,
 * el límite y el reloj son inyectables, así que el comportamiento se prueba sin `setTimeout` ni
 * esperas reales — el tiempo lo mueve el test.
 *
 * Lo que se prueba es la POLÍTICA de ventana fija, no la estructura interna: dentro del límite
 * permite, el intento N+1 de la misma ventana rechaza, y pasada la ventana vuelve a permitir.
 */
describe("server/security/limiteDeIntentos (ventana fija in-memory, clock inyectado)", () => {
  // limite.001 — dentro del límite, todos los intentos pasan
  it("permite los primeros N intentos de una clave dentro de la ventana", () => {
    const limitador = crearLimitadorDeIntentos({
      limite: 3,
      ventanaMs: 60_000,
      ahora: () => 1_000,
    });

    expect(limitador.permitirIntento("t1:1.2.3.4")).toBe(true);
    expect(limitador.permitirIntento("t1:1.2.3.4")).toBe(true);
    expect(limitador.permitirIntento("t1:1.2.3.4")).toBe(true);
  });

  // limite.002 — el intento N+1 de la MISMA ventana se rechaza
  it("rechaza el intento que pasa el límite dentro de la misma ventana", () => {
    let t = 1_000;
    const limitador = crearLimitadorDeIntentos({ limite: 3, ventanaMs: 60_000, ahora: () => t });

    limitador.permitirIntento("clave");
    limitador.permitirIntento("clave");
    limitador.permitirIntento("clave");

    // El tiempo avanza, pero SIN salir de la ventana: sigue rechazando.
    t = 1_000 + 59_999;
    expect(limitador.permitirIntento("clave")).toBe(false);
    expect(limitador.permitirIntento("clave")).toBe(false);
  });

  // limite.003 — pasada la ventana la cuota se renueva (ventana FIJA: arranca en el 1er intento)
  it("vuelve a permitir cuando la ventana venció", () => {
    let t = 1_000;
    const limitador = crearLimitadorDeIntentos({ limite: 2, ventanaMs: 60_000, ahora: () => t });

    expect(limitador.permitirIntento("clave")).toBe(true);
    expect(limitador.permitirIntento("clave")).toBe(true);
    expect(limitador.permitirIntento("clave")).toBe(false);

    t = 1_000 + 60_000; // exactamente el borde: la ventana ya venció
    expect(limitador.permitirIntento("clave")).toBe(true);
    expect(limitador.permitirIntento("clave")).toBe(true);
    expect(limitador.permitirIntento("clave")).toBe(false);
  });

  // limite.004 — las claves NO se pisan entre sí. Es lo que hace que la clave lleve el `tenantId`:
  // el tráfico de una Tienda jamás puede agotarle la cuota a otra (misma lógica que I1).
  it("cada clave lleva su propia cuota (una agotada no bloquea a las demás)", () => {
    const limitador = crearLimitadorDeIntentos({ limite: 1, ventanaMs: 60_000, ahora: () => 1_000 });

    expect(limitador.permitirIntento("tenantA:1.2.3.4")).toBe(true);
    expect(limitador.permitirIntento("tenantA:1.2.3.4")).toBe(false);
    // Otro tenant desde la MISMA IP, y la misma IP en otro tenant: cuotas independientes.
    expect(limitador.permitirIntento("tenantB:1.2.3.4")).toBe(true);
    expect(limitador.permitirIntento("tenantA:9.9.9.9")).toBe(true);
  });
});
