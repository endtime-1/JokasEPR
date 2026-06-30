import { MOCK_PRODUCTS } from "./mock-data";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api/v1";

export interface PublicProduct {
  id: string;
  name: string;
  publicSlug: string;
  publicDescription: string | null;
  storefrontCategory: string | null;
  minOrderQty: number;
  unitLabel: string | null;
  price: number | null;
  currency: string;
}

export interface OrderLine {
  productId: string;
  qty: number;
  unitPrice: number;
}

export interface PlaceOrderPayload {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  notes?: string;
  lines: OrderLine[];
}

export interface PublicOrder {
  storefrontRef: string;
  status: string;
  createdAt: string;
  lines: { productName: string; qty: number; unitPrice: number }[];
  total: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/public${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return json.data as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/public${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? `API error ${res.status}`);
  return json.data as T;
}

function filterMock(category?: string): PublicProduct[] {
  if (!category) return MOCK_PRODUCTS;
  return MOCK_PRODUCTS.filter((p) => p.storefrontCategory === category);
}

export const api = {
  products: {
    list: async (category?: string): Promise<PublicProduct[]> => {
      try {
        return await get<PublicProduct[]>(
          category ? `/products?category=${encodeURIComponent(category)}` : "/products"
        );
      } catch {
        return filterMock(category);
      }
    },
    get: async (slug: string): Promise<PublicProduct> => {
      try {
        return await get<PublicProduct>(`/products/${slug}`);
      } catch {
        const found = MOCK_PRODUCTS.find((p) => p.publicSlug === slug);
        if (!found) throw new Error("Product not found");
        return found;
      }
    },
  },
  orders: {
    place: async (payload: PlaceOrderPayload): Promise<{ storefrontRef: string }> => {
      try {
        return await post<{ storefrontRef: string }>("/orders", payload);
      } catch {
        // Demo mode: generate a fake ref so the UI flow still works
        const ref = `AK-DEMO-${Date.now().toString(36).toUpperCase()}`;
        // Store in sessionStorage so order status page can retrieve it
        if (typeof window !== "undefined") {
          sessionStorage.setItem(
            `order:${ref}`,
            JSON.stringify({
              storefrontRef: ref,
              status: "PENDING",
              createdAt: new Date().toISOString(),
              lines: payload.lines.map((l) => {
                const product = MOCK_PRODUCTS.find((p) => p.id === l.productId);
                return {
                  productName: product?.name ?? l.productId,
                  qty: l.qty,
                  unitPrice: l.unitPrice,
                };
              }),
              total: payload.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0),
            })
          );
        }
        return { storefrontRef: ref };
      }
    },
    status: async (ref: string): Promise<PublicOrder> => {
      try {
        return await get<PublicOrder>(`/orders/${ref}`);
      } catch {
        // Check demo session storage
        if (typeof window !== "undefined") {
          const raw = sessionStorage.getItem(`order:${ref}`);
          if (raw) return JSON.parse(raw) as PublicOrder;
        }
        throw new Error("Order not found");
      }
    },
  },
};
