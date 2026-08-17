import { type GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cuota por IP del `getServerSideProps` de `/entrega/[token]` (F03/D3 de
 * `entrega-postpago-retorno-y-reacceso`).
 *
 * Por qué esta superficie tiene cuota recién ahora: hasta D2 el `DownloadGrant` moría a los 30 días,
 * así que sondear tokens al azar tenía fecha de vencimiento. Con el acceso permanente la URL pasó a
 * ser una capability que no caduca — y cada apertura de esta página presigna TODAS las miniaturas de
 * la orden, así que también es la más cara de las tres superficies.
 *
 * **Lo observable es que la DB no se toque**, no el status: el exceso devuelve el MISMO `notFound`
 * que un token inválido (decisión deliberada — es una página, y meterle una pantalla de «demasiados
 * intentos» a la única puerta del Comprador asustaría a quien recargó tres veces de nervios). Por eso
 * cada caso se afirma contando llamadas a `getEntregaDeOrden`, que es el primer trabajo real que la
 * página haría si el gate la dejara pasar.
 *
 * El limitador de la página es de MÓDULO (una instancia por proceso, «por lambda» en Vercel), así que
 * su estado SOBREVIVE entre los tests de este archivo: cada caso usa su propia IP a propósito.
 */

vi.mock("~/env", () => ({
  // Sin R2 configurado: la página degrada a solo íconos y no presigna nada. Mantiene el mock chico y
  // no es el objeto de este test.
  env: { R2_ENDPOINT: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET: "" },
}));
vi.mock("~/server/db", () => ({
  db: {
    storefrontPage: { findFirst: vi.fn(), findMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));
vi.mock("~/server/entrega/getEntregaDeOrden", () => ({ getEntregaDeOrden: vi.fn() }));
vi.mock("~/server/storage/storageDeEnv", () => ({ crearStorageDeEnv: vi.fn() }));

import { getEntregaDeOrden } from "~/server/entrega/getEntregaDeOrden";
import { getServerSideProps } from "~/pages/entrega/[token]";

const mockEntrega = vi.mocked(getEntregaDeOrden);

/** Techo configurado en la página. Si allá cambia, este test tiene que cambiar con él a propósito. */
const TECHO = 30;

/**
 * Request al APEX (la URL que viaja en el correo) declarando su IP como lo hace el proxy de Vercel.
 * `x-forwarded-for` es una LISTA `cliente, proxy…`: se manda con un proxy detrás para que el test
 * ejercite el mismo parseo que producción y no una cabecera de juguete.
 */
function ctxDesde(ip: string, token = "tok-cualquiera") {
  return {
    params: { token },
    req: { headers: { host: "sorteatelo.cl", "x-forwarded-for": `${ip}, 10.0.0.1` } },
    query: {},
  } as unknown as GetServerSidePropsContext;
}

beforeEach(() => {
  mockEntrega.mockReset();
  // Token que no resuelve: alcanza para el gate y evita arrastrar el resto de la página.
  mockEntrega.mockResolvedValue(null);
});

describe("entrega/[token] getServerSideProps — cuota por IP (F03/D3)", () => {
  // rate.entrega.001 — por debajo del techo NUNCA limita, y pasado el techo el gate corta ANTES de la
  // DB. Que la respuesta sea la misma en los dos casos es el punto: el corte no es sondeable.
  it("deja pasar hasta el techo y a partir de ahí corta sin consultar la DB", async () => {
    for (let i = 0; i < TECHO; i++) {
      const res = await getServerSideProps(ctxDesde("203.0.113.1"));
      expect(res).toEqual({ notFound: true });
    }
    expect(mockEntrega).toHaveBeenCalledTimes(TECHO);

    const limitada = await getServerSideProps(ctxDesde("203.0.113.1"));
    // Idéntica a las anteriores: quien se pasó no puede notar que se pasó.
    expect(limitada).toEqual({ notFound: true });
    // Pero no llegó a la DB — que es TODO lo que la cuota compra.
    expect(mockEntrega).toHaveBeenCalledTimes(TECHO);
  });

  // rate.entrega.002 — el cupo es POR IP: que alguien barra tokens no puede dejar afuera al Comprador
  // legítimo que abre el enlace de su correo desde otra conexión.
  it("requests desde IPs distintas no comparten cupo", async () => {
    for (let i = 0; i < TECHO + 5; i++) {
      await getServerSideProps(ctxDesde("203.0.113.2"));
    }
    const gastadasPorElAbusivo = mockEntrega.mock.calls.length;
    expect(gastadasPorElAbusivo).toBe(TECHO); // el abusivo ya está cortado

    await getServerSideProps(ctxDesde("203.0.113.3"));
    // La otra IP sí llegó a la DB: su balde estaba intacto.
    expect(mockEntrega).toHaveBeenCalledTimes(TECHO + 1);
  });

  // rate.entrega.003 — sin IP resoluble (un proxy que no la declara) la request PASA: todas comparten
  // un balde común, que es lo conservador, pero el camino sigue abierto. El limitador falla ABIERTO
  // (I8) y nadie que ya pagó queda sin su descarga por una cabecera que no controla.
  it("sin cabecera de IP la request pasa igual (falla ABIERTO)", async () => {
    const sinIp = {
      params: { token: "tok-cualquiera" },
      req: { headers: { host: "sorteatelo.cl" } },
      query: {},
    } as unknown as GetServerSidePropsContext;

    const res = await getServerSideProps(sinIp);
    expect(res).toEqual({ notFound: true });
    expect(mockEntrega).toHaveBeenCalledTimes(1);
  });
});
