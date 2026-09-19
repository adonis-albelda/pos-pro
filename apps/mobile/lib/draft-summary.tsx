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
 * tab, but parked carts only exist on the Sell screen
 * (app/pos/(tabs)/index.tsx). The Sell screen publishes its draft count into
 * this on every change. Sell stays mounted in the background for every tab
 * (app/pos/(tabs)/_layout.tsx is a real Tabs navigator, not Stack), so this
 * is populated as soon as any POS tab has loaded once — StoreHeader shows
 * the Draft sales pill on every tablet tab, not just Sell, and `open()`
 * still reaches the same picker regardless of which tab is visible.
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
