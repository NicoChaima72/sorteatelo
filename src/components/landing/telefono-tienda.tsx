import { type CSSProperties } from "react";

import { clp } from "~/lib/formato";

import s from "./landing.module.css";
import { TicketToast } from "./ticket-chip";

/**
 * Teléfono con la tienda de un tenant de EJEMPLO + ticket flotante de compra confirmada (el visual
 * del hero). La tienda demo usa SU propio color (índigo), distinto del cobalto/amarillo de
 * plataforma: muestra la convivencia plataforma/tenant. Ese color es **DATO de ejemplo** del
 * componente (mismo estatus que el swatch per-tenant, excepción I1) — el único hex permitido acá,
 * inyectado como `--tenant` para que el CSS module siga sin hex propio.
 */
const COLOR_TIENDA_DEMO = "#3a4fc9";

export function TelefonoTienda() {
  return (
    <div
      className={s.telefonoWrap}
      style={{ "--tenant": COLOR_TIENDA_DEMO } as CSSProperties}
    >
      <div
        className={s.telefono}
        role="img"
        aria-label="Ejemplo de tienda creada con Sortéatelo"
      >
        <div className={s.telefonoNotch}>
          <span />
        </div>
        <div className={s.tiendaHead}>
          <span className={s.tiendaAva}>C</span>
          <span className={s.tiendaNombre}>Tienda de Camila</span>
          <span className={s.tiendaBadge}>Sorteo abierto</span>
        </div>
        <div className={s.tiendaCuerpo}>
          <p className={s.tiendaTitulo}>Aprende acuarela conmigo</p>
          <p className={s.tiendaSub}>
            Cada compra te da un número para el sorteo del set profesional.
          </p>
        </div>
        <div className={s.tiendaProd}>
          <div className={s.tiendaProdCover}>Guía de acuarela</div>
          <div className={s.tiendaProdFila}>
            <span style={{ minWidth: 0 }}>
              <span className={s.tiendaProdNombre}>Guía de acuarela (PDF)</span>
              <span className={s.tiendaProdPrecio}>{clp(3990)}</span>
            </span>
            {/* Botón decorativo del mockup (no acciona): fuera del tab-order y de AT. */}
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className={s.tiendaProdBtn}
            >
              +
            </button>
          </div>
        </div>
        <div className={s.tiendaSorteo}>
          <b>Sorteo: set de acuarelas profesional</b>
          <br />
          Cierra en <b>3 días</b> · 312 números vendidos
        </div>
      </div>

      <TicketToast
        flotante
        numero="#0428"
        etiqueta="Compra confirmada"
        titulo="Tu número quedó adentro"
      />
    </div>
  );
}
