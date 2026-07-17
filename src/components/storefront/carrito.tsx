import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Carrito del Comprador — estado de CLIENTE per-tenant (F04/D5, ADR-0004). NO hay modelo `Cart`
 * ni sesión de comprador: la identidad es el correo, recogido en el checkout. El carrito vive en
 * localStorage con clave namespaced por slug (`carrito:<slug>`) + estado React; NO cruza tiendas
 * (cada subdominio es un origin distinto ⇒ localStorage aislado por construcción; la clave con el
 * slug es defensa adicional).
 *
 * I4: el carrito solo guarda `precio` como número entero (CLP) para MOSTRARLO — jamás se suma en
 * el cliente ni se reenvía al server. El checkout manda `productIds` + correo; el `total` lo calcula
 * `iniciarCheckout` server-side sobre `Product.precio` (Decimal), congelando el snapshot en el OrderItem.
 */

export interface ItemCarrito {
  id: string;
  titulo: string;
  /** Precio en CLP entero (display-only). NUNCA se opera en el cliente. */
  precio: number;
}

interface CarritoContextValue {
  items: ItemCarrito[];
  /** Cantidad de productos distintos (uno por producto — @@unique([orderId, productId])). */
  cantidad: number;
  contiene: (id: string) => boolean;
  agregar: (item: ItemCarrito) => void;
  quitar: (id: string) => void;
  vaciar: () => void;
}

const CarritoContext = createContext<CarritoContextValue | null>(null);

function claveDe(slug: string): string {
  return `carrito:${slug}`;
}

/** Lee el carrito persistido; tolera JSON corrupto / ausente devolviendo []. */
function leerPersistido(slug: string): ItemCarrito[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(claveDe(slug));
    if (!crudo) return [];
    const parsed = JSON.parse(crudo) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is ItemCarrito =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as ItemCarrito).id === "string" &&
        typeof (x as ItemCarrito).titulo === "string" &&
        typeof (x as ItemCarrito).precio === "number",
    );
  } catch {
    return [];
  }
}

export function CarritoProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  // Arranca vacío en SSR y en el primer render del cliente (sin hydration mismatch); la
  // hidratación desde localStorage ocurre tras montar.
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    setItems(leerPersistido(slug));
    setHidratado(true);
  }, [slug]);

  // Persistir solo DESPUÉS de hidratar, para no pisar lo guardado con [] en el primer render.
  useEffect(() => {
    if (!hidratado) return;
    window.localStorage.setItem(claveDe(slug), JSON.stringify(items));
  }, [items, slug, hidratado]);

  const agregar = useCallback((item: ItemCarrito) => {
    setItems((prev) =>
      prev.some((p) => p.id === item.id) ? prev : [...prev, item],
    );
  }, []);
  const quitar = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);
  const vaciar = useCallback(() => setItems([]), []);

  const value = useMemo<CarritoContextValue>(
    () => ({
      items,
      cantidad: items.length,
      contiene: (id) => items.some((p) => p.id === id),
      agregar,
      quitar,
      vaciar,
    }),
    [items, agregar, quitar, vaciar],
  );

  return (
    <CarritoContext.Provider value={value}>{children}</CarritoContext.Provider>
  );
}

export function useCarrito(): CarritoContextValue {
  const ctx = useContext(CarritoContext);
  if (!ctx) {
    throw new Error("useCarrito debe usarse dentro de <CarritoProvider>");
  }
  return ctx;
}
