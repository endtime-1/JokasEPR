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
  imageUrl: string | null;
}

// H25: public.service.ts's listProducts()/getProduct() actually return
// { slug, description, category, unitPrice } — and never return `currency`
// at all — while this file's PublicProduct interface (and every component
// built against it) expected { publicSlug, publicDescription,
// storefrontCategory, price, currency }. With no transform layer between
// them, every product link resolved to /shop/products/undefined (404), the
// sitemap submitted the same broken links to search engines, and every
// product showed "Price on request" everywhere — the storefront was not
// actually functional for any visitor. This is the real shape the API
// returns; toPublicProduct() below is the transform layer that was missing.
interface RawPublicProduct {
  id: string;
  name: string;
  sku: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  minOrderQty: number;
  unitLabel: string | null;
  unitPrice: number | null;
}

function toPublicProduct(raw: RawPublicProduct): PublicProduct {
  return {
    id: raw.id,
    name: raw.name,
    publicSlug: raw.slug,
    publicDescription: raw.description,
    storefrontCategory: raw.category,
    minOrderQty: raw.minOrderQty,
    unitLabel: raw.unitLabel,
    price: raw.unitPrice,
    currency: "GHS",
    imageUrl: raw.imageUrl
  };
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
  idempotencyKey?: string;
}

export interface PublicOrder {
  storefrontRef: string;
  status: string;
  createdAt: string;
  lines: { productName: string; qty: number; unitPrice: number; }[];
  total: number;
}

export interface ContactPayload {
  name: string;
  phone: string;
  email?: string;
  subject?: string;
  message: string;
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
    list: async (category?: string): Promise<PublicProduct[]> => {
      const raw = await get<RawPublicProduct[]>(
        category ? `/products?category=${encodeURIComponent(category)}` : "/products"
      );
      return raw.map(toPublicProduct);
    },
    get: async (slug: string): Promise<PublicProduct> => {
      const raw = await get<RawPublicProduct>(`/products/${slug}`);
      return toPublicProduct(raw);
    },
  },
  orders: {
    place: (payload: PlaceOrderPayload): Promise<{ storefrontRef: string }> =>
      post<{ storefrontRef: string }>("/orders", payload),
    status: (ref: string): Promise<PublicOrder> =>
      get<PublicOrder>(`/orders/${ref}`),
  },
  contact: {
    submit: (payload: ContactPayload): Promise<{ sent: boolean }> =>
      post<{ sent: boolean }>("/contact", payload),
  },
};
