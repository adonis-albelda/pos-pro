import { lineSubtotal, roundMoney } from "./money";
import { isProductUnit } from "./domain";
import type { CartLine, Sale, SaleItem } from "./domain";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function validateProductInput(input: {
  name: string;
  price: number;
  sku?: string | null;
  costPrice?: number;
  reorderPoint?: number;
  replenishQuantity?: number;
  description?: string | null;
  bulkPrice?: number | null;
  bulkMinQuantity?: number | null;
  unit?: string;
}): ValidationResult {
  const errors: string[] = [];

  if (!input.name.trim()) errors.push("Name is required.");
  if (!Number.isFinite(input.price) || input.price < 0) {
    errors.push("Price must be zero or more.");
  }
  if (input.sku && input.sku.trim().length < 2) {
    errors.push("SKU must be at least 2 characters, or left empty.");
  }
  if (input.costPrice !== undefined) {
    if (!Number.isFinite(input.costPrice) || input.costPrice < 0) {
      errors.push("Supplier price must be zero or more.");
    }
  }
  if (input.reorderPoint !== undefined) {
    if (!Number.isInteger(input.reorderPoint) || input.reorderPoint < 0) {
      errors.push("Reorder point must be a whole number, zero or more.");
    }
  }
  if (input.replenishQuantity !== undefined) {
    if (!Number.isInteger(input.replenishQuantity) || input.replenishQuantity < 0) {
      errors.push("Replenish quantity must be a whole number, zero or more.");
    }
  }
  if (input.unit !== undefined && !isProductUnit(input.unit)) {
    errors.push("Unit is not one we sell by.");
  }

  // The two bulk fields only mean something together: a price with no minimum
  // quantity would silently never apply.
  const hasBulkPrice = input.bulkPrice !== null && input.bulkPrice !== undefined;
  const hasBulkMin =
    input.bulkMinQuantity !== null && input.bulkMinQuantity !== undefined;

  if (hasBulkPrice !== hasBulkMin) {
    errors.push("Bulk pricing needs both a bulk price and a minimum quantity.");
  }
  if (hasBulkPrice && (!Number.isFinite(input.bulkPrice!) || input.bulkPrice! < 0)) {
    errors.push("Bulk price must be zero or more.");
  }
  if (hasBulkMin && (!Number.isInteger(input.bulkMinQuantity!) || input.bulkMinQuantity! < 2)) {
    errors.push("Bulk minimum quantity must be a whole number of 2 or more.");
  }
  if (hasBulkPrice && input.bulkPrice! > input.price) {
    errors.push("Bulk price is higher than the normal price.");
  }

  return { ok: errors.length === 0, errors };
}

/**
 * A stock or sale quantity. Fractional only when the product allows it; whole
 * numbers otherwise. `min` is the floor (1 for a sale line, 0 for a stock
 * count). Rounding to QUANTITY_DECIMALS happens elsewhere — this only judges.
 */
export function isValidQuantity(
  value: number,
  allowDecimal: boolean,
  min = 0,
): boolean {
  if (!Number.isFinite(value) || value < min) return false;
  if (!allowDecimal && !Number.isInteger(value)) return false;
  return true;
}

export function validateCart(lines: CartLine[]): ValidationResult {
  const errors: string[] = [];

  if (lines.length === 0) errors.push("Add at least one item before completing the sale.");
  for (const line of lines) {
    if (line.quantity <= 0) errors.push(`${line.productName}: quantity must be more than zero.`);
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
      errors.push(`${line.productName}: price is invalid.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * A price typed in at the counter. Selling below cost is allowed on purpose —
 * clearing dead stock is a real decision — but it is called out so nobody does
 * it by accident, and the discount report shows the owner afterwards.
 */
export interface PriceOverrideCheck {
  ok: boolean;
  error: string | null;
  belowCost: boolean;
  aboveList: boolean;
}

export function checkPriceOverride(
  price: number,
  line: { listPrice: number; unitCost: number },
): PriceOverrideCheck {
  if (!Number.isFinite(price) || price < 0) {
    return {
      ok: false,
      error: "Enter a price of zero or more.",
      belowCost: false,
      aboveList: false,
    };
  }

  return {
    ok: true,
    error: null,
    belowCost: price < line.unitCost,
    aboveList: price > line.listPrice,
  };
}

/**
 * A sale must be completely valid before it is ever pushed — a device may hold
 * it for hours, and a malformed row would fail the whole batch later.
 */
export function validateSaleForPush(
  sale: Sale,
  items: SaleItem[],
): ValidationResult {
  const errors: string[] = [];

  if (!isUuid(sale.id)) errors.push("Sale id must be a client-generated UUID.");
  if (!sale.createdAt) errors.push("Sale is missing its creation time.");
  if (items.length === 0) errors.push("Sale has no line items.");

  for (const item of items) {
    if (!isUuid(item.id)) errors.push("Sale item id must be a UUID.");
    if (item.saleId !== sale.id) errors.push("Sale item belongs to a different sale.");
    if (item.quantity <= 0) errors.push(`${item.productName}: quantity must be more than zero.`);
    if (roundMoney(item.subtotal) !== lineSubtotal(item.unitPrice, item.quantity)) {
      errors.push(`${item.productName}: subtotal does not match price times quantity.`);
    }
  }

  const itemsTotal = roundMoney(items.reduce((sum, item) => sum + item.subtotal, 0));
  if (roundMoney(sale.totalAmount) !== itemsTotal) {
    errors.push("Sale total does not match the sum of its line items.");
  }

  return { ok: errors.length === 0, errors };
}

/** Display estimate only. Never written back to Supabase. */
export function estimatedStock(
  lastSyncedStock: number,
  pendingSoldQuantity: number,
): number {
  return lastSyncedStock - pendingSoldQuantity;
}

export type StockLevel = "out" | "low" | "healthy";

export function stockLevel(quantity: number, lowThreshold = 5): StockLevel {
  if (quantity <= 0) return "out";
  if (quantity <= lowThreshold) return "low";
  return "healthy";
}
