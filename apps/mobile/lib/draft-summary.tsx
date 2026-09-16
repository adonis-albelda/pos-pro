import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface DraftSummary {
  count: number;
  /** Opens the saved-drafts picker. Undefined until the Sell screen (the only thing with drafts) is actually mounted. */
  open?: () => void;
}

interface DraftSummaryContextValue extends DraftSummary {
  setDraftSummary: (summary: DraftSummary) => void;
  clearDraftSummary: () => void;
}

const EMPTY: DraftSummary = { count: 0 };

const DraftSummaryContext = createContext<DraftSummaryContextValue | null>(null);

/**
 * Same pattern as lib/cart-summary.tsx: StoreHeader is mounted for every POS
 * tab, but parked carts only exist on the Sell screen (app/pos/index.tsx).
 * The Sell screen publishes its draft count into this on every change and
 * clears it on unmount — StoreHeader reads it and only shows the Draft
 * sales button while it's present, i.e. only while Sell is mounted.
 */
export function DraftSummaryProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<DraftSummary>(EMPTY);

  const setDraftSummary = useCallback((next: DraftSummary) => setSummary(next), []);
  const clearDraftSummary = useCallback(() => setSummary(EMPTY), []);

  const value = useMemo(
    () => ({ ...summary, setDraftSummary, clearDraftSummary }),
    [summary, setDraftSummary, clearDraftSummary],
  );

  return <DraftSummaryContext.Provider value={value}>{children}</DraftSummaryContext.Provider>;
}

export function useDraftSummary(): DraftSummaryContextValue {
  const ctx = useContext(DraftSummaryContext);
  if (!ctx) throw new Error("useDraftSummary must be used inside DraftSummaryProvider");
  return ctx;
}
