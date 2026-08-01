// Server-side (SSR/SSG): call NestJS directly on the internal port — avoids
// the full round-trip through LiteSpeed and the reverse proxy.
// Client-side (browser): use a same-origin relative path so the request goes
// through the main proxy, which rewrites /api/v1/* to the NestJS backend.
const BASE =
  typeof window === "undefined"
    ? `http://127.0.0.1:${process.env.API_PORT ?? "4001"}/api/v1`
    : "/api/v1";

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
  quantity: number;
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
  lines: { productName: string; qty: number; unitPrice: number; }[];
  total: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/public${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
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
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? `API error ${res.status}`);
  return json.data as T;
}

export const api = {
  products: {
    list: (category?: string): Promise<PublicProduct[]> =>
      get<PublicProduct[]>(
        category ? `/products?category=${encodeURIComponent(category)}` : "/products"
      ),
    get: (slug: string): Promise<PublicProduct> =>
      get<PublicProduct>(`/products/${slug}`),
  },
  orders: {
    place: (payload: PlaceOrderPayload): Promise<{ storefrontRef: string }> =>
      post<{ storefrontRef: string }>("/orders", payload),
    status: (ref: string): Promise<PublicOrder> =>
      get<PublicOrder>(`/orders/${ref}`),
  },
};
