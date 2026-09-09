import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface CartSummary {
  itemCount: number;
  total: number;
  /** Opens the cart on phone (the modal CartShell used to reach via the old bottom CartSummaryBar). Undefined on tablet, where the cart panel is already always visible. */
  open?: () => void;
}

interface CartSummaryContextValue extends CartSummary {
  setCartSummary: (summary: CartSummary) => void;
  clearCartSummary: () => void;
}

const EMPTY: CartSummary = { itemCount: 0, total: 0 };

const CartSummaryContext = createContext<CartSummaryContextValue | null>(null);

/**
 * Lets StoreHeader (mounted once for every POS tab, see components/store-header.tsx)
 * show live cart state even though the cart itself only exists on the Sell
 * screen (app/pos/index.tsx). The Sell screen publishes into this on every
 * cart change and clears it on unmount — StoreHeader reads it and only
 * renders the cart chip while it's non-empty/present, i.e. only while the
 * Sell screen is actually mounted.
 */
export function CartSummaryProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<CartSummary>(EMPTY);

  const setCartSummary = useCallback((next: CartSummary) => setSummary(next), []);
  const clearCartSummary = useCallback(() => setSummary(EMPTY), []);

  const value = useMemo(
    () => ({ ...summary, setCartSummary, clearCartSummary }),
    [summary, setCartSummary, clearCartSummary],
  );

  return <CartSummaryContext.Provider value={value}>{children}</CartSummaryContext.Provider>;
}

export function useCartSummary(): CartSummaryContextValue {
  const ctx = useContext(CartSummaryContext);
  if (!ctx) throw new Error("useCartSummary must be used inside CartSummaryProvider");
  return ctx;
}
