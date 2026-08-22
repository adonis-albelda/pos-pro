/**
 * Query key factories for admin-mode screens (app/admin/**) — mirrors
 * apps/admin/lib/query/keys.ts's shape so the two apps' data layers read
 * the same way, even though mobile's admin mode has no offline/SQLite
 * involvement at all (online-only, straight to the Tally API).
 */
export const queryKeys = {
  categories: {
    all: ["categories"] as const,
    list: (params?: Record<string, unknown>) => ["categories", "list", params] as const,
    productCounts: (params?: Record<string, unknown>) =>
      ["categories", "product-counts", params] as const,
  },
  products: {
    all: ["products"] as const,
    list: (params?: Record<string, unknown>) => ["products", "list", params] as const,
    detail: (id: string) => ["products", "detail", id] as const,
    belowReorder: () => ["products", "below-reorder"] as const,
  },
  customers: {
    all: ["customers"] as const,
    list: () => ["customers", "list"] as const,
    detail: (id: string) => ["customers", "detail", id] as const,
    balance: (id: string) => ["customers", "balance", id] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    list: (params?: Record<string, unknown>) => ["suppliers", "list", params] as const,
    detail: (id: string) => ["suppliers", "detail", id] as const,
    balance: (id: string) => ["suppliers", "balance", id] as const,
  },
  sales: {
    all: ["sales"] as const,
    list: (params?: Record<string, unknown>) => ["sales", "list", params] as const,
    detail: (id: string) => ["sales", "detail", id] as const,
  },
  purchaseOrders: {
    all: ["purchase-orders"] as const,
    list: (params?: Record<string, unknown>) => ["purchase-orders", "list", params] as const,
    detail: (id: string) => ["purchase-orders", "detail", id] as const,
    upcomingPayments: () => ["purchase-orders", "upcoming-payments"] as const,
  },
  inventory: {
    all: ["inventory"] as const,
    movements: (params?: Record<string, unknown>) => ["inventory", "movements", params] as const,
    oversold: () => ["inventory", "oversold"] as const,
    belowReorder: () => ["inventory", "below-reorder"] as const,
    reconciliation: () => ["inventory", "reconciliation"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (params?: Record<string, unknown>) => ["users", "list", params] as const,
  },
  expenses: {
    all: ["expenses"] as const,
    list: (params?: Record<string, unknown>) => ["expenses", "list", params] as const,
    sum: (range?: Record<string, unknown>) => ["expenses", "sum", range] as const,
  },
  reports: {
    all: ["reports"] as const,
    profit: (range?: Record<string, unknown>) => ["reports", "profit", range] as const,
    topProducts: (range?: Record<string, unknown>, limit?: number) =>
      ["reports", "top-products", range, limit] as const,
    discounts: (range?: Record<string, unknown>) => ["reports", "discounts", range] as const,
    byCashier: (range?: Record<string, unknown>) => ["reports", "by-cashier", range] as const,
    byDevice: (range?: Record<string, unknown>) => ["reports", "by-device", range] as const,
    inventoryValuation: () => ["reports", "inventory-valuation"] as const,
    deadStock: (days?: number) => ["reports", "dead-stock", days] as const,
  },
  storeSettings: {
    all: ["store-settings"] as const,
    detail: () => ["store-settings", "detail"] as const,
  },
  receiptLayout: {
    all: ["receipt-layout"] as const,
    detail: () => ["receipt-layout", "detail"] as const,
  },
} as const;
