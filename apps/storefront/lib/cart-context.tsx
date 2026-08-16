"use client";

import { createContext, useContext, useReducer, useCallback, useEffect, ReactNode } from "react";
import { api, type PublicProduct } from "./api";

export interface CartItem {
  product: PublicProduct;
  qty: number;
}

interface CartState {
  items: CartItem[];
}

type Action =
  | { type: "ADD"; product: PublicProduct; qty: number }
  | { type: "UPDATE"; productId: string; qty: number }
  | { type: "REMOVE"; productId: string }
  | { type: "CLEAR" }
  | { type: "SYNC_PRODUCTS"; products: PublicProduct[] };

// Mirrors PublicOrderLineDto's server-side cap (public-order.dto.ts) — clamping here
// gives an immediate, friendly limit in the UI instead of a confusing rejection at
// checkout after the customer has already filled in delivery details.
const MAX_LINE_QTY = 10000;

function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "ADD": {
      const existing = state.items.find((i) => i.product.id === action.product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === action.product.id
              ? { ...i, qty: Math.min(i.qty + action.qty, MAX_LINE_QTY) }
              : i
          ),
        };
      }
      return { items: [...state.items, { product: action.product, qty: Math.min(action.qty, MAX_LINE_QTY) }] };
    }
    case "UPDATE":
      return {
        items: state.items.map((i) =>
          i.product.id === action.productId ? { ...i, qty: Math.min(action.qty, MAX_LINE_QTY) } : i
        ),
      };
    case "REMOVE":
      return { items: state.items.filter((i) => i.product.id !== action.productId) };
    case "CLEAR":
      return { items: [] };
    case "SYNC_PRODUCTS": {
      // M-BUG: the cart persists a full product snapshot (including price) in
      // localStorage with no expiry and no re-fetch. If a price changes while
      // an item sits in the cart, the shown total could drift from what the
      // order is actually priced at (the backend itself always recomputes
      // from live price lists, so this was never an underpayment risk — just
      // a misleading display). Re-sync from the live product list whenever
      // the cart or checkout page mounts.
      const byId = new Map(action.products.map((p) => [p.id, p]));
      return {
        items: state.items.map((i) => {
          const fresh = byId.get(i.product.id);
          return fresh ? { ...i, product: fresh } : i;
        }),
      };
    }
  }
}

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  totalPrice: number | null;
  addItem: (product: PublicProduct, qty: number) => void;
  updateQty: (productId: string, qty: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  refreshPrices: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "jokas_cart";
// Low: the cart previously had no TTL — a device shared between customers
// (or a browser left open for weeks) would keep showing whoever's cart was
// last saved indefinitely. No PII is involved (product/qty only — checkout
// details live in transient component state, never storage), but a stale
// cart from a different visitor is still a confusing thing to land on.
const CART_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function loadCart(): CartState {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as CartState & { savedAt?: number };
    if (parsed.savedAt && Date.now() - parsed.savedAt > CART_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return { items: [] };
    }
    return { items: parsed.items ?? [] };
  } catch {
    return { items: [] };
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadCart);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
    } catch {
      // localStorage unavailable (private mode, quota exceeded)
    }
  }, [state]);

  const addItem = useCallback((product: PublicProduct, qty: number) =>
    dispatch({ type: "ADD", product, qty }), []);
  const updateQty = useCallback((productId: string, qty: number) =>
    dispatch({ type: "UPDATE", productId, qty }), []);
  const removeItem = useCallback((productId: string) =>
    dispatch({ type: "REMOVE", productId }), []);
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);
  const refreshPrices = useCallback(async () => {
    try {
      const products = await api.products.list();
      dispatch({ type: "SYNC_PRODUCTS", products });
    } catch {
      // Live prices unavailable — keep showing the last-known snapshot
      // rather than blocking the cart/checkout page on this refresh.
    }
  }, []);

  const totalItems = state.items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = state.items.every((i) => i.product.price != null)
    ? state.items.reduce((s, i) => s + (i.product.price ?? 0) * i.qty, 0)
    : null;

  return (
    <CartContext.Provider value={{ items: state.items, totalItems, totalPrice, addItem, updateQty, removeItem, clear, refreshPrices }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
