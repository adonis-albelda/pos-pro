/**
 * Query key factories, one section per domain being converted to client-side
 * TanStack Query. Centralized so a write path's invalidateQueries() call
 * targets the same keys a read path's useQuery() used, without either side
 * having to guess the other's key shape.
 */
export const queryKeys = {
  /** The signed-in user, client-side — backs AdminGate's isShopAdmin() check. */
  session: {
    all: ["session"] as const,
    me: () => ["session", "me"] as const,
  },
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
    count: (params?: Record<string, unknown>) => ["products", "count", params] as const,
  },
  productImports: {
    all: ["product-imports"] as const,
    list: (params?: Record<string, unknown>) => ["product-imports", "list", params] as const,
    detail: (id: string) => ["product-imports", "detail", id] as const,
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
  /** Also read cross-domain (cashier-name joins) from sales, purchase-orders, etc. */
  users: {
    all: ["users"] as const,
    list: (params?: Record<string, unknown>) => ["users", "list", params] as const,
  },
  locations: {
    all: ["locations"] as const,
    list: (params?: Record<string, unknown>) => ["locations", "list", params] as const,
    transfers: (params?: Record<string, unknown>) => ["locations", "transfers", params] as const,
  },
  /** Singleton row, keyed on the company — no list/detail split needed. */
  storeSettings: {
    all: ["store-settings"] as const,
    detail: () => ["store-settings", "detail"] as const,
  },
  /** Singleton row, same shape as storeSettings. */
  receiptLayout: {
    all: ["receipt-layout"] as const,
    detail: () => ["receipt-layout", "detail"] as const,
  },
  /** No mutations — every key carries its own params so distinct date ranges cache independently. */
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
  /** Admin-only outlays (CLAUDE.md §14) — never written from the POS, never synced to SQLite. */
  expenses: {
    all: ["expenses"] as const,
    list: (params?: Record<string, unknown>) => ["expenses", "list", params] as const,
    sum: (range?: Record<string, unknown>) => ["expenses", "sum", range] as const,
  },
  expenseBills: {
    all: ["expense-bills"] as const,
    list: (params?: Record<string, unknown>) => ["expense-bills", "list", params] as const,
    upcoming: (days?: number) => ["expense-bills", "upcoming", days] as const,
  },
  /** Superadmin-only (CLAUDE.md §15). No per-id read — companyStats() always returns every row; a detail page finds its row client-side, same as the pre-TanStack server code did. */
  companies: {
    all: ["companies"] as const,
    stats: () => ["companies", "stats"] as const,
    users: (companyId: string) => ["companies", "users", companyId] as const,
  },
  /** {key: enabled} for the caller's own company (any user). The admin superadmin list carries its own key below. */
  featureFlags: {
    all: ["feature-flags"] as const,
    mine: () => ["feature-flags", "mine"] as const,
    admin: () => ["feature-flags", "admin"] as const,
  },
  aiSettings: {
    all: ["ai-settings"] as const,
    detail: () => ["ai-settings", "detail"] as const,
  },
  platformAiSettings: {
    all: ["platform-ai-settings"] as const,
    detail: () => ["platform-ai-settings", "detail"] as const,
  },
  productEmbeddingCoverage: {
    all: ["product-embedding-coverage"] as const,
    detail: () => ["product-embedding-coverage", "detail"] as const,
  },
  backups: {
    all: ["platform-backups"] as const,
    list: () => ["platform-backups", "list"] as const,
  },
} as const;
