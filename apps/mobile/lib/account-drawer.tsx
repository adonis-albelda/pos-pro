import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface AccountDrawerContextValue {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const AccountDrawerContext = createContext<AccountDrawerContextValue | null>(null);

/**
 * One provider per chrome tree (mounted in app/pos/_layout.tsx and
 * app/admin/_layout.tsx, same split as CartSummaryProvider/FlyToCartProvider)
 * so StoreHeader's hamburger and SubPageHeader's back arrow (see
 * components/sub-page-header.tsx — "back" on a drawer-reached detail screen
 * reopens the drawer instead of just popping to whatever was underneath)
 * drive the exact same drawer instance instead of each owning their own.
 */
export function AccountDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ open, openDrawer, closeDrawer }), [open, openDrawer, closeDrawer]);

  return <AccountDrawerContext.Provider value={value}>{children}</AccountDrawerContext.Provider>;
}

export function useAccountDrawer(): AccountDrawerContextValue {
  const ctx = useContext(AccountDrawerContext);
  if (!ctx) throw new Error("useAccountDrawer must be used inside AccountDrawerProvider");
  return ctx;
}
