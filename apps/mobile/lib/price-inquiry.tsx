import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getPriceInquiryStyle,
  setPriceInquiryStyle as persistPriceInquiryStyle,
  type PriceInquiryStyle,
} from "@/lib/device";

interface PriceInquiryContextValue {
  style: PriceInquiryStyle;
  setStyle: (style: PriceInquiryStyle) => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const PriceInquiryContext = createContext<PriceInquiryContextValue | null>(null);

/**
 * One provider, mounted once at the POS root (see app/pos/_layout.tsx), so
 * the floating button, the account drawer's menu entry, and the Settings
 * toggle all read/write the same style — switching it in Settings hides or
 * shows the button immediately, no remount needed.
 */
export function PriceInquiryProvider({ children }: { children: ReactNode }) {
  const [style, setStyleState] = useState<PriceInquiryStyle>("floating");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    void getPriceInquiryStyle().then(setStyleState);
  }, []);

  const setStyle = useCallback((next: PriceInquiryStyle) => {
    setStyleState(next);
    void persistPriceInquiryStyle(next);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ style, setStyle, isOpen, open, close }),
    [style, setStyle, isOpen, open, close],
  );

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
