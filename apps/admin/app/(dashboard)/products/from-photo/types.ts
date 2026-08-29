/**
 * One product line read from a notebook photo, before the owner saves it.
 * Stock is never here — counts only move through Inventory.
 */
export interface ScannedProductDraft {
  /** Stable React key; not a DB id. */
  clientId: string;
  name: string;
  description: string;
  sku: string;
  supplierSku: string;
  barcode: string;
  price: string;
  costPrice: string;
  quantity: string;
  categoryId: string;
  unit: string;
  reorderPoint: string;
  bulkPrice: string;
  bulkMinQuantity: string;
  /** Set when the API matched an existing catalogue SKU. */
  existingProductId: string | null;
  /** internal or supplier — how the line matched an existing product. */
  matchedBy: "internal" | "supplier" | null;
  /** Stock movement already recorded for an existing SKU. */
  stockApplied: boolean;
}

export interface ExtractProductsResult {
  error: string | null;
  drafts: ScannedProductDraft[];
}

export interface SaveScannedResult {
  error: string | null;
  ok: boolean;
  /** clientId that was saved, so the UI can drop that row. */
  clientId: string | null;
}

export interface SaveAllScannedResult {
  error: string | null;
  /** How many rows landed in the catalogue. */
  saved: number;
  /** clientIds that failed, with the reason. */
  failures: { clientId: string; error: string }[];
}

/**
 * A catalogue product whose SKU exactly matches what the user just typed
 * into a draft row — surfaced live so they can compare against what the AI
 * read off the photo, rather than only finding out on save that the SKU
 * collides with something else already on file.
 */
export interface ExistingProductMatch {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  price: number;
  costPrice: number;
  stockQuantity: number;
  unit: string;
}
