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
 * I4: el carrito solo guarda `precio` como número entero (CLP) para MOSTRARLO — jamás se suma ni se
 * multiplica en el cliente ni se reenvía al server. El checkout manda `items: {productId, cantidad}` +
 * correo; el `total` = Σ `precio × cantidad` lo calcula `iniciarCheckout` server-side sobre
 * `Product.precio` (Decimal), congelando precio unitario + cantidad + participaEnSorteo en el OrderItem.
 *
 * ADR-0012: cada ítem lleva `cantidad` (≥1) editable con el stepper +/− (D7). El tope de cordura
 * (`MAX_CANTIDAD_POR_ITEM`) espeja el `max` de Zod del server — el cliente no puede pasar de ahí.
 */

/** Tope de unidades por producto (S1/ADR-0012); espeja el `max` del schema server (I4). */
export const MAX_CANTIDAD_POR_ITEM = 99;

export interface ItemCarrito {
  id: string;
  titulo: string;
  /** Precio UNITARIO en CLP entero (display-only). NUNCA se opera en el cliente. */
  precio: number;
  /** Unidades de este producto (≥1, ≤ MAX_CANTIDAD_POR_ITEM). */
  cantidad: number;
}

interface CarritoContextValue {
  items: ItemCarrito[];
  /** Cantidad de productos DISTINTOS (uno por producto — @@unique([orderId, productId])). */
  cantidad: number;
  contiene: (id: string) => boolean;
  /** Agrega un producto nuevo al carrito, iniciando su cantidad en 1 (no-op si ya está). */
  agregar: (item: Omit<ItemCarrito, "cantidad">) => void;
  quitar: (id: string) => void;
  /** Fija la cantidad de un ítem, clampeada a [1, MAX_CANTIDAD_POR_ITEM]. */
  setCantidad: (id: string, cantidad: number) => void;
  vaciar: () => void;
}

const CarritoContext = createContext<CarritoContextValue | null>(null);

function claveDe(slug: string): string {
  return `carrito:${slug}`;
}

/** Normaliza una cantidad cruda a un entero en [1, MAX_CANTIDAD_POR_ITEM]. */
function normalizarCantidad(valor: unknown): number {
  const n = typeof valor === "number" ? Math.floor(valor) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_CANTIDAD_POR_ITEM);
}

/** Lee el carrito persistido; tolera JSON corrupto / ausente / sin `cantidad` (carritos viejos). */
function leerPersistido(slug: string): ItemCarrito[] {
  if (typeof window === "undefined") return [];
  try {
    const crudo = window.localStorage.getItem(claveDe(slug));
    if (!crudo) return [];
    const parsed = JSON.parse(crudo) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is { id: string; titulo: string; precio: number; cantidad?: unknown } =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as ItemCarrito).id === "string" &&
          typeof (x as ItemCarrito).titulo === "string" &&
          typeof (x as ItemCarrito).precio === "number",
      )
      .map((x) => ({
        id: x.id,
        titulo: x.titulo,
        precio: x.precio,
        cantidad: normalizarCantidad(x.cantidad), // carritos viejos sin cantidad ⇒ 1
      }));
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

  const agregar = useCallback((item: Omit<ItemCarrito, "cantidad">) => {
    setItems((prev) =>
      prev.some((p) => p.id === item.id) ? prev : [...prev, { ...item, cantidad: 1 }],
    );
  }, []);
  const quitar = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  }, []);
  const setCantidad = useCallback((id: string, cantidad: number) => {
    const n = normalizarCantidad(cantidad);
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, cantidad: n } : p)));
  }, []);
  const vaciar = useCallback(() => setItems([]), []);

  const value = useMemo<CarritoContextValue>(
    () => ({
      items,
      cantidad: items.length,
      contiene: (id) => items.some((p) => p.id === id),
      agregar,
      quitar,
      setCantidad,
      vaciar,
    }),
    [items, agregar, quitar, setCantidad, vaciar],
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
