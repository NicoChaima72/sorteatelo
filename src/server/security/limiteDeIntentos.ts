/**
 * Limitador de intentos **in-memory por clave**, de ventana fija (verificador-tickets F01/D5).
 *
 * Existe para el verificador público de tickets: una superficie sin sesión donde alguien podría
 * tipear correos ajenos en bucle. Es **fricción anti-script, NO un perímetro de seguridad** — en
 * Vercel la memoria no se comparte entre instancias, así que el techo real es «por lambda». Se
 * acepta a propósito (D5): lo que la superficie expone son datos públicos-por-diseño (Números del
 * sorteo, ADR-0024) y la respuesta ya es indistinguible entre «no compró» y «compró sin tickets»
 * (D4). Sin Redis ni captcha, por el principio rector «simple y barato».
 *
 * PURO respecto del entorno: límite, ventana y **reloj** son inyectables, así que su política se
 * testea sin esperas reales. Quien lo instancia es el borde (el router), una vez a nivel de módulo.
 */

export interface LimitadorDeIntentos {
  /** `true` = el intento se cuenta y procede; `false` = la clave agotó su cuota de esta ventana. */
  permitirIntento(clave: string): boolean;
}

interface Ventana {
  /** Instante en que arrancó la ventana vigente de esa clave. */
  inicio: number;
  /** Intentos ya consumidos dentro de esa ventana. */
  usados: number;
}

/**
 * Techo de claves vivas. No es una cuota de negocio: es la cota de memoria del proceso. Al pasarlo
 * se podan las ventanas ya vencidas y, si aún así no baja, se vacía el mapa entero — o sea el
 * limitador **falla ABIERTO** bajo presión de memoria. Es la elección correcta acá: el peor caso de
 * fallar abierto es que un scraper vea números públicos, y el de fallar cerrado sería dejar sin
 * verificar sus tickets a Compradores legítimos por culpa de otro.
 */
const MAX_CLAVES = 10_000;

export function crearLimitadorDeIntentos({
  limite,
  ventanaMs,
  ahora = () => Date.now(),
}: {
  /** Intentos permitidos por clave dentro de una ventana. */
  limite: number;
  /** Largo de la ventana en milisegundos. */
  ventanaMs: number;
  /** Reloj inyectable (los tests mueven el tiempo a mano; producción usa `Date.now`). */
  ahora?: () => number;
}): LimitadorDeIntentos {
  const ventanas = new Map<string, Ventana>();

  return {
    permitirIntento(clave: string): boolean {
      const t = ahora();
      const vigente = ventanas.get(clave);

      // Sin ventana, o con la anterior ya vencida ⇒ arranca una nueva y este intento la estrena.
      if (!vigente || t - vigente.inicio >= ventanaMs) {
        if (ventanas.size >= MAX_CLAVES) podar(ventanas, t, ventanaMs);
        ventanas.set(clave, { inicio: t, usados: 1 });
        return true;
      }

      if (vigente.usados >= limite) return false;

      vigente.usados += 1;
      return true;
    },
  };
}

/**
 * Poda las ventanas vencidas (nadie las va a volver a mirar: la siguiente lectura de esa clave
 * arrancaría una ventana nueva igual). Si tras podar el mapa sigue lleno, se vacía entero — ver el
 * comentario de `MAX_CLAVES` sobre por qué el modo de falla es ABIERTO.
 */
function podar(ventanas: Map<string, Ventana>, t: number, ventanaMs: number): void {
  for (const [clave, v] of ventanas) {
    if (t - v.inicio >= ventanaMs) ventanas.delete(clave);
  }
  if (ventanas.size >= MAX_CLAVES) ventanas.clear();
}
