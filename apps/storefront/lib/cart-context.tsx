"use client";

import { createContext, useContext, useReducer, useCallback, ReactNode } from "react";
import type { PublicProduct } from "./api";

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
  | { type: "CLEAR" };

function reducer(state: CartState, action: Action): CartState {
  switch (action.type) {
    case "ADD": {
      const existing = state.items.find((i) => i.product.id === action.product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === action.product.id ? { ...i, qty: i.qty + action.qty } : i
          ),
        };
      }
      return { items: [...state.items, { product: action.product, qty: action.qty }] };
    }
    case "UPDATE":
      return {
        items: state.items.map((i) =>
          i.product.id === action.productId ? { ...i, qty: action.qty } : i
        ),
      };
    case "REMOVE":
      return { items: state.items.filter((i) => i.product.id !== action.productId) };
    case "CLEAR":
      return { items: [] };
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
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [] });

  const addItem = useCallback((product: PublicProduct, qty: number) =>
    dispatch({ type: "ADD", product, qty }), []);
  const updateQty = useCallback((productId: string, qty: number) =>
    dispatch({ type: "UPDATE", productId, qty }), []);
  const removeItem = useCallback((productId: string) =>
    dispatch({ type: "REMOVE", productId }), []);
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);

  const totalItems = state.items.reduce((s, i) => s + i.qty, 0);
  const totalPrice = state.items.every((i) => i.product.price != null)
    ? state.items.reduce((s, i) => s + (i.product.price ?? 0) * i.qty, 0)
    : null;

  return (
    <CartContext.Provider value={{ items: state.items, totalItems, totalPrice, addItem, updateQty, removeItem, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
