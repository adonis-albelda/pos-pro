import { roundMoney } from "@double-a/shared-types";
import type { Product, Supplier } from "@double-a/shared-types";

export interface LineRow {
  key: string;
  name: string;
  sku: string;
  /** Supplier item code from the receipt — kept even after a catalogue match. */
  receiptSupplierSku: string;
  /** AI extraction snapshot — pencil restore target. */
  originalReceiptSupplierSku: string;
  quantityReceived: string;
  unitCost: string;
  productId: string | null;
  matchedBy: "internal" | "supplier" | null;
  existingPrice: number | null;
  existingCostPrice: number | null;
  purchaseOrderItemId: string | null;
  quantityOrdered: number | null;
  appliedPrice: string;
  note: string;
  originalQuantityReceived: string;
  originalUnitCost: string;
  originalAppliedPrice: string;
  excluded: boolean;
  /** New catalogue rows only — when true, product is created with is_active = false. */
  createHidden: boolean;
}

/**
 * Asymmetric on purpose: a supplier cost increase passes straight through to
 * the shelf so the margin doesn't quietly erode, but a cost decrease is
 * never auto-applied — the owner keeps that margin gain until they choose
 * to pass it on themselves.
 */
export function suggestPrice(newCost: number, existingPrice: number, existingCostPrice: number): number {
  const increase = newCost - existingCostPrice;
  return increase > 0 ? roundMoney(existingPrice + increase) : existingPrice;
}

export function lineIsFlagged(row: LineRow): boolean {
  if (!row.productId) return true;
  if (row.quantityOrdered !== null) {
    const received = Number(row.quantityReceived) || 0;
    if (Math.abs(received - row.quantityOrdered) > 0.001) return true;
  }
  return false;
}

export function activeRows(rows: LineRow[]): LineRow[] {
  return rows.filter((row) => !row.excluded);
}

export function lineIsResolved(row: LineRow): boolean {
  if (row.excluded) return true;
  if (!row.name.trim()) return false;
  if (!(Number(row.quantityReceived) > 0)) return false;
  if (row.unitCost.trim() === "") return false;
  if (!(Number(row.unitCost) >= 0)) return false;
  if (row.appliedPrice.trim() === "") return false;
  if (!(Number(row.appliedPrice) > 0)) return false;
  return true;
}

export function allRowsResolved(rows: LineRow[]): boolean {
  const active = activeRows(rows);
  if (active.length === 0) return false;
  return active.every(lineIsResolved);
}

export function unresolvedCount(rows: LineRow[]): number {
  return activeRows(rows).filter((row) => !lineIsResolved(row)).length;
}

export function cleanableRow(row: LineRow): boolean {
  return !row.excluded && lineIsResolved(row);
}

export function headerDisplayName(row: LineRow): string {
  return row.name.trim() || "Untitled item";
}

export function internalSkuDisplay(row: LineRow, product?: Product | null): string {
  return row.sku.trim() || product?.sku?.trim() || "";
}

function skusAreSame(a: string, b: string): boolean {
  return Boolean(a.trim() && b.trim() && normalizeSku(a) === normalizeSku(b));
}

/** Keep receipt code only when distinct from internal sku; matched rows use supplier_sku column. */
export function receiptSupplierSkuAfterMatch(
  existingReceiptSku: string,
  product: Product,
  matchedBy: "internal" | "supplier",
  matchedCode?: string,
): string {
  if (matchedBy === "supplier" && matchedCode?.trim()) {
    return matchedCode.trim();
  }
  const receipt = existingReceiptSku.trim();
  const internal = product.sku?.trim() ?? "";
  if (receipt && !skusAreSame(receipt, internal)) {
    return receipt;
  }
  return product.supplierSku?.trim() ?? "";
}

/** Supplier SKU column — never mirror internal sku. */
export function supplierSkuDisplay(row: LineRow, product?: Product | null): string {
  const receipt = row.receiptSupplierSku.trim();
  const internal = internalSkuDisplay(row, product);
  if (receipt && !skusAreSame(receipt, internal)) {
    return receipt;
  }
  if (row.productId) {
    return product?.supplierSku?.trim() ?? "";
  }
  return "";
}

/** Editable supplier SKU input — receipt value wins; matched rows fall back to catalogue. */
export function supplierSkuInputValue(row: LineRow, product?: Product | null): string {
  if (row.receiptSupplierSku.trim()) return row.receiptSupplierSku;
  if (row.productId) return product?.supplierSku?.trim() ?? "";
  return row.receiptSupplierSku;
}

export function supplierSkuForSubmit(row: LineRow, product?: Product | null): string | null {
  if (row.productId) return null;
  const receipt = row.receiptSupplierSku.trim();
  const internal = internalSkuDisplay(row, product);
  if (receipt && !skusAreSame(receipt, internal)) {
    return receipt;
  }
  return null;
}

export function supplierSkuHint(row: LineRow, product?: Product | null): string {
  if (row.productId) {
    return product?.supplierSku?.trim()
      ? "From your product catalogue."
      : "No supplier code saved on this product yet.";
  }
  return "Code from the receipt.";
}

export function supplierSkuUsesAiExtraction(row: LineRow, product?: Product | null): boolean {
  const original = row.originalReceiptSupplierSku.trim();
  if (!original) return false;
  return normalizeSku(supplierSkuInputValue(row, product)) === normalizeSku(original);
}

export function headerSkuSnippet(row: LineRow, product?: Product | null): string {
  const supplier = supplierSkuDisplay(row, product);
  const internal = internalSkuDisplay(row, product);
  const parts: string[] = [];
  if (supplier) parts.push(`Supplier SKU: ${supplier}`);
  if (internal && !skusAreSame(internal, supplier)) parts.push(`Internal: ${internal}`);
  if (parts.length > 0) return parts.join(" · ");
  return "No SKU";
}

export function hasSupplierSelected(
  supplierId: string,
  supplierName: string,
  hasLinkedOrder: boolean,
): boolean {
  return hasLinkedOrder || Boolean(supplierId) || Boolean(supplierName.trim());
}

export function stockAfterReceive(
  currentStock: number | null,
  quantityReceived: number,
): number | null {
  if (currentStock === null) return null;
  return currentStock + quantityReceived;
}

/** Internal SKU field — editable entry for new products only. */
export function showInternalSkuField(row: LineRow): boolean {
  return !row.productId;
}

/** Walk-in supplier name only — no catalogue match picker. */
export function isWalkInSupplier(supplierId: string, supplierName: string, hasLinkedOrder: boolean): boolean {
  return !hasLinkedOrder && !supplierId && Boolean(supplierName.trim());
}

/** Show the match-product combobox for this delivery header. */
export function showProductMatchPicker(
  supplierId: string,
  supplierName: string,
  hasLinkedOrder: boolean,
): boolean {
  if (hasLinkedOrder || supplierId) return true;
  if (supplierName.trim()) return false;
  return true;
}

function normalizeSku(code: string): string {
  return code.trim().toLowerCase();
}

function supplierNameMatches(product: Product, supplierName: string): boolean {
  const needle = supplierName.trim().toLowerCase();
  if (!needle) return true;
  return product.supplierNames
    .split(",")
    .some((part) => part.trim().toLowerCase() === needle);
}

export function productsForSelectedSupplier(
  products: Product[],
  suppliers: Supplier[],
  supplierId: string,
  supplierName: string,
  hasLinkedOrder: boolean,
): Product[] {
  if (hasLinkedOrder && supplierId) {
    const name = suppliers.find((s) => s.id === supplierId)?.name ?? "";
    if (!name) return products;
    return products.filter((p) => supplierNameMatches(p, name));
  }
  if (supplierId) {
    const name = suppliers.find((s) => s.id === supplierId)?.name ?? "";
    if (!name) return products;
    return products.filter((p) => supplierNameMatches(p, name));
  }
  if (supplierName.trim()) {
    return [];
  }
  return products;
}

export function availableProductsFor(
  currentRow: LineRow,
  rows: LineRow[],
  products: Product[],
): Product[] {
  const usedElsewhere = new Set(
    rows.filter((row) => row.key !== currentRow.key && row.productId).map((row) => row.productId),
  );
  return products.filter((product) => !usedElsewhere.has(product.id));
}

export function findProductBySku(
  products: Product[],
  code: string,
): { product: Product; matchedBy: "internal" | "supplier" } | null {
  const normalized = normalizeSku(code);
  if (!normalized) return null;

  for (const product of products) {
    if (product.sku && normalizeSku(product.sku) === normalized) {
      return { product, matchedBy: "internal" };
    }
  }
  for (const product of products) {
    if (product.supplierSku && normalizeSku(product.supplierSku) === normalized) {
      return { product, matchedBy: "supplier" };
    }
  }
  return null;
}

function receiptSkuAfterMatch(
  row: LineRow,
  product: Product,
  matchedBy: "internal" | "supplier",
  matchedCode?: string,
): string {
  return receiptSupplierSkuAfterMatch(row.receiptSupplierSku, product, matchedBy, matchedCode);
}

export function buildProductMatchPatch(
  row: LineRow,
  product: Product,
  matchedBy: "internal" | "supplier",
  matchedCode?: string,
): Partial<LineRow> {
  const unitCost = Number(row.unitCost) || 0;
  const appliedPrice =
    row.appliedPrice.trim() !== ""
      ? row.appliedPrice
      : String(suggestPrice(unitCost, product.price, product.costPrice));

  return {
    productId: product.id,
    name: row.name.trim() ? row.name : product.name,
    sku: product.sku ?? "",
    receiptSupplierSku: receiptSkuAfterMatch(row, product, matchedBy, matchedCode),
    matchedBy,
    existingPrice: product.price,
    existingCostPrice: product.costPrice,
    appliedPrice,
  };
}

/** Client-side resolve attempt for one row — returns a patch or null if nothing changed. */
export function resolveRowPatch(row: LineRow, products: Product[]): Partial<LineRow> | null {
  if (row.excluded || lineIsResolved(row)) return null;

  const codes = [row.receiptSupplierSku, row.sku].filter(Boolean);
  for (const code of codes) {
    const match = findProductBySku(products, code);
    if (match) {
      return buildProductMatchPatch(row, match.product, match.matchedBy, code);
    }
  }

  const unitCost = Number(row.unitCost) || 0;
  if (
    row.appliedPrice.trim() === "" &&
    row.existingPrice !== null &&
    row.existingCostPrice !== null &&
    unitCost >= 0
  ) {
    return { appliedPrice: String(suggestPrice(unitCost, row.existingPrice, row.existingCostPrice)) };
  }

  return null;
}

export function applyExtractedSupplierName(
  extractedName: string | null,
  suppliers: Supplier[],
  currentSupplierId: string,
  currentSupplierName: string,
  hasLinkedOrder: boolean,
): { supplierId: string; supplierName: string } | null {
  if (hasLinkedOrder || !extractedName?.trim()) return null;
  if (currentSupplierId || currentSupplierName.trim()) return null;

  const normalized = extractedName.trim().toLowerCase();
  const match = suppliers.find((s) => s.name.trim().toLowerCase() === normalized);
  if (match) {
    return { supplierId: match.id, supplierName: "" };
  }
  return { supplierId: "", supplierName: extractedName.trim() };
}

export function describeNoSubmittableRows(rows: LineRow[]): string {
  if (rows.length === 0) {
    return "Add at least one item — upload a photo or add a line manually.";
  }
  if (rows.every((row) => row.excluded)) {
    return "Every line is marked removed — restore at least one, or add a new line.";
  }
  const unresolved = unresolvedCount(rows);
  if (unresolved > 0) {
    return `${unresolved} item${unresolved === 1 ? "" : "s"} still need details — fill quantity, cost, and shelf price.`;
  }
  return "Add at least one item — upload a photo or add a line manually.";
}

export function lineRowFromExtraction(line: {
  name: string;
  sku: string | null;
  quantityReceived: number | null;
  unitCost: number | null;
  productId: string | null;
  matchedBy: "internal" | "supplier" | null;
  existingPrice: number | null;
  existingCostPrice: number | null;
  purchaseOrderItemId: string | null;
  quantityOrdered: number | null;
}): Omit<LineRow, "key"> {
  const unitCost = line.unitCost ?? 0;
  const appliedPrice =
    line.existingPrice !== null && line.existingCostPrice !== null
      ? suggestPrice(unitCost, line.existingPrice, line.existingCostPrice)
      : null;
  const quantityReceived = line.quantityReceived !== null ? String(line.quantityReceived) : "1";
  const unitCostStr = line.unitCost !== null ? String(line.unitCost) : "";
  const appliedPriceStr = appliedPrice !== null ? String(appliedPrice) : "";
  const receiptSku = line.sku ?? "";

  return {
    name: line.name,
    sku: "",
    receiptSupplierSku: receiptSku,
    originalReceiptSupplierSku: receiptSku,
    quantityReceived,
    unitCost: unitCostStr,
    productId: line.productId,
    matchedBy: line.matchedBy,
    existingPrice: line.existingPrice,
    existingCostPrice: line.existingCostPrice,
    purchaseOrderItemId: line.purchaseOrderItemId,
    quantityOrdered: line.quantityOrdered,
    appliedPrice: appliedPriceStr,
    note: "",
    originalQuantityReceived: quantityReceived,
    originalUnitCost: unitCostStr,
    originalAppliedPrice: appliedPriceStr,
    excluded: false,
    createHidden: true,
  };
}

export function emptyManualLineRow(): Omit<LineRow, "key"> {
  return {
    name: "",
    sku: "",
    receiptSupplierSku: "",
    originalReceiptSupplierSku: "",
    quantityReceived: "1",
    unitCost: "",
    productId: null,
    matchedBy: null,
    existingPrice: null,
    existingCostPrice: null,
    purchaseOrderItemId: null,
    quantityOrdered: null,
    appliedPrice: "",
    note: "",
    originalQuantityReceived: "1",
    originalUnitCost: "",
    originalAppliedPrice: "",
    excluded: false,
    createHidden: true,
  };
}

/** Backfill held/draft rows saved before newer LineRow fields existed. */
export function normalizeHeldRow(row: LineRow): LineRow {
  const legacy = !("receiptSupplierSku" in row) || row.receiptSupplierSku === undefined;

  return {
    ...row,
    receiptSupplierSku: legacy ? (row.productId ? "" : row.sku) : row.receiptSupplierSku,
    originalReceiptSupplierSku:
      row.originalReceiptSupplierSku ??
      (legacy ? (row.productId ? "" : row.sku) : row.receiptSupplierSku) ??
      "",
    sku: legacy && !row.productId ? "" : row.sku,
    createHidden: row.createHidden ?? true,
  };
}
