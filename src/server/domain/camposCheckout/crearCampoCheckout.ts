import { type PrismaClient } from "@prisma/client";

import { type AccesoPanel, resolverTenantDelPanel } from "~/server/authPolicy";
import { derivarClaveUnica } from "~/server/domain/camposCheckout/_clave";
import { normalizarPorTipo } from "~/server/domain/camposCheckout/_normalizar";
import {
  CLAVES_RESERVADAS,
  MAX_CAMPOS_ACTIVOS,
} from "~/server/domain/camposCheckout/reglas";
import { type CrearCampoCheckoutInput } from "~/server/domain/camposCheckout/schemas";
import { DomainError } from "~/server/domain/errors";

/**
 * Use case del panel (F02): agrega un Campo de checkout a la Tienda. Nace ACTIVO y ÚLTIMO en el
 * orden; su `clave` se DERIVA de la etiqueta server-side y queda inmutable (D5/D7).
 *
 * Scopeado por el `tenantId` resuelto SERVER-SIDE (I1/ADR-0005); el `tenantId` JAMÁS del input.
 *
 * TODO lo que decide vive DENTRO de la `$transaction` y a partir de UNA sola lectura de los campos
 * del tenant, porque las tres decisiones dependen del mismo estado y no pueden verlo desfasado:
 * (1) el límite de 10 ACTIVOS (D6/I6) — mismo criterio que el guard 1-ACTIVO de `crearSorteo` y la
 * carrera D8 de `crearTienda`: recontar fuera de la tx deja el chequeo obsoleto entre el check y el
 * insert; (2) la clave libre, que debe desambiguar contra los campos INACTIVOS también (el
 * `@@unique([tenantId, clave])` los alcanza, `checkout.schema.001`); (3) la posición final.
 */
export async function crearCampoCheckout({
  db,
  acceso,
  input,
}: {
  db: PrismaClient;
  acceso: AccesoPanel;
  input: CrearCampoCheckoutInput;
}): Promise<{ id: string }> {
  const tenantId = resolverTenantDelPanel(acceso);

  return db.$transaction(async (tx) => {
    const campos = await tx.checkoutField.findMany({
      where: { tenantId },
      select: { clave: true, posicion: true, activo: true },
    });

    // Guard atómico del límite (D6/I6). Solo cuentan los ACTIVOS: desactivados y borrados no ocupan
    // lugar en el checkout, que es lo que el tope protege.
    const activos = campos.filter((c) => c.activo).length;
    if (activos >= MAX_CAMPOS_ACTIVOS) {
      throw new DomainError(
        "CONFLICT",
        `Ya tienes ${MAX_CAMPOS_ACTIVOS} campos activos en tu checkout. Desactiva uno antes de agregar otro.`,
      );
    }

    const clave = derivarClaveUnica(
      input.etiqueta,
      new Set(campos.map((c) => c.clave)),
    );

    // I2/D7: el correo NO es un Campo de checkout — es el dato fijo de la Orden (ADR-0004). Se
    // rechaza en vez de auto-desambiguar a `email_2`: crear un "Email" que NO es el correo de la
    // compra sería una trampa para el Organizador y dos correos distintos para el Comprador.
    if (CLAVES_RESERVADAS.has(clave)) {
      throw new DomainError(
        "INVALID",
        "El correo ya se pide siempre en el checkout. Usa otra etiqueta para este campo.",
      );
    }

    const posicion = campos.reduce((max, c) => Math.max(max, c.posicion + 1), 0);

    const campo = await tx.checkoutField.create({
      data: {
        tenantId,
        clave,
        etiqueta: input.etiqueta,
        tipo: input.tipo,
        placeholder: input.placeholder,
        textoAyuda: input.textoAyuda,
        posicion,
        activo: true,
        ...normalizarPorTipo(input),
      },
      select: { id: true },
    });

    return { id: campo.id };
  });
}
