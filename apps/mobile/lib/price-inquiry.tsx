import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface PriceInquiryContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const PriceInquiryContext = createContext<PriceInquiryContextValue | null>(null);

/**
 * One provider, mounted once at the POS root (see app/pos/_layout.tsx) — the
 * bottom tab bar's center button is the only entry point (see
 * components/bottom-tab-bar.tsx); a prior floating-draggable-button/menu-item
 * choice was retired once that button covered every screen already.
 */
export function PriceInquiryProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);

  return <PriceInquiryContext.Provider value={value}>{children}</PriceInquiryContext.Provider>;
}

export function usePriceInquiry(): PriceInquiryContextValue {
  const context = useContext(PriceInquiryContext);
  if (!context) throw new Error("usePriceInquiry must be used inside PriceInquiryProvider");
  return context;
}

/** Same context, no throw — for spots (e.g. BottomTabBar) mounted both inside
 * the POS tree (has PriceInquiryProvider) and the admin tree (does not). */
export function usePriceInquiryOptional(): PriceInquiryContextValue | null {
  return useContext(PriceInquiryContext);
}
