import type { Product } from "@double-a/shared-types";
import { formatMoney, UNIT_LABELS } from "@double-a/shared-types";

export type ProductFieldChange = {
  label: string;
  before: string;
  after: string;
};

function text(form: HTMLFormElement, key: string): string {
  return String(new FormData(form).get(key) ?? "").trim();
}

function has(form: HTMLFormElement, key: string): boolean {
  return new FormData(form).has(key);
}

function optionalNumber(form: HTMLFormElement, key: string): number | null {
  const raw = text(form, key);
  return raw === "" ? null : Number(raw);
}

function displayText(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? "—" : trimmed;
}

function displayMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return formatMoney(value);
}

function displayBool(value: boolean): string {
  return value ? "Yes" : "No";
}

function displayUnit(unit: string): string {
  return (UNIT_LABELS as Record<string, string>)[unit] ?? unit;
}

function pushChange(
  changes: ProductFieldChange[],
  label: string,
  before: string,
  after: string,
) {
  if (before === after) return;
  changes.push({ label, before, after });
}

/**
 * Diff the live `#product-form` against the loaded product — same fields
 * `saveProduct` / `readProductForm` actually persist. Photos, tags, and
 * variant rows save elsewhere and are out of scope.
 */
export function collectProductFormChanges(
  product: Product,
  form: HTMLFormElement,
  labels: {
    categoryLabel: (id: string | null) => string;
    brandLabel: (id: string | null) => string;
  },
  baseline: {
    /** Rich HTML currently in the editor — matches the hidden `description` field. */
    description: string;
    reorderPoint: number;
    replenishQuantity: number;
  },
): ProductFieldChange[] {
  const changes: ProductFieldChange[] = [];

  pushChange(changes, "Product name", displayText(product.name), displayText(text(form, "name")));
  pushChange(
    changes,
    "Description",
    displayText(baseline.description),
    displayText(text(form, "description")),
  );
  pushChange(changes, "Notes", displayText(product.notes), displayText(text(form, "notes")));

  const nextCategoryId = text(form, "category_id") || null;
  pushChange(
    changes,
    "Category",
    labels.categoryLabel(product.categoryId),
    labels.categoryLabel(nextCategoryId),
  );

  const nextBrandId = text(form, "brand_id") || null;
  pushChange(changes, "Brand", labels.brandLabel(product.brandId), labels.brandLabel(nextBrandId));

  pushChange(
    changes,
    "Product type",
    displayText(product.productType),
    displayText(text(form, "product_type") || "physical"),
  );

  // Edit form often omits cost_price (read-only from suppliers) — only
  // compare when the field is actually in the payload.
  if (has(form, "cost_price")) {
    pushChange(
      changes,
      "Supplier price",
      displayMoney(product.costPrice),
      displayMoney(Number(text(form, "cost_price") || 0)),
    );
  }

  if (has(form, "price")) {
    pushChange(
      changes,
      "Shelf price",
      displayMoney(product.price),
      displayMoney(Number(text(form, "price") || 0)),
    );
  }

  if (has(form, "bulk_price") || has(form, "bulk_min_quantity")) {
    pushChange(
      changes,
      "Bulk price",
      displayMoney(product.bulkPrice),
      displayMoney(optionalNumber(form, "bulk_price")),
    );
    pushChange(
      changes,
      "Bulk min quantity",
      product.bulkMinQuantity === null ? "—" : String(product.bulkMinQuantity),
      optionalNumber(form, "bulk_min_quantity") === null
        ? "—"
        : String(optionalNumber(form, "bulk_min_quantity")),
    );
  }

  if (has(form, "sku") || has(form, "barcode") || has(form, "unit")) {
    pushChange(changes, "SKU", displayText(product.sku), displayText(text(form, "sku") || null));
    pushChange(
      changes,
      "Barcode",
      displayText(product.barcode),
      displayText(text(form, "barcode") || null),
    );
    pushChange(changes, "Sold by", displayUnit(product.unit), displayUnit(text(form, "unit") || "pc"));
  }

  const allowDecimalEl = form.querySelector<HTMLInputElement>('[name="allow_decimal"]');
  if (allowDecimalEl) {
    pushChange(
      changes,
      "Allow decimal quantities",
      displayBool(product.allowDecimal),
      displayBool(allowDecimalEl.checked),
    );
  }

  if (has(form, "reorder_point")) {
    pushChange(
      changes,
      "Reorder point",
      String(baseline.reorderPoint),
      String(Number(text(form, "reorder_point"))),
    );
  }
  if (has(form, "replenish_quantity")) {
    pushChange(
      changes,
      "Replenish quantity",
      String(baseline.replenishQuantity),
      String(Number(text(form, "replenish_quantity"))),
    );
  }

  const trackEl = form.querySelector<HTMLInputElement>('[name="is_track_inventory"]');
  if (trackEl) {
    const tracked = trackEl.type === "checkbox" ? trackEl.checked : trackEl.value === "1";
    pushChange(changes, "Track inventory", displayBool(product.isTrackInventory), displayBool(tracked));
  }

  const sellableEl = form.querySelector<HTMLInputElement>('[name="is_sellable"]');
  if (sellableEl) {
    pushChange(changes, "Sellable", displayBool(product.isSellable), displayBool(sellableEl.checked));
  }
  const purchasableEl = form.querySelector<HTMLInputElement>('[name="is_purchasable"]');
  if (purchasableEl) {
    pushChange(
      changes,
      "Purchasable",
      displayBool(product.isPurchasable),
      displayBool(purchasableEl.checked),
    );
  }

  const bundleEl = form.querySelector<HTMLInputElement>('[name="is_bundle"]');
  if (bundleEl) {
    pushChange(changes, "Bundle", displayBool(product.isBundle), displayBool(bundleEl.checked));
  }

  const activeField = form.querySelector('[name="is_active_field"]');
  const activeEl = form.querySelector<HTMLInputElement>('[name="is_active"]');
  if (activeField && activeEl) {
    pushChange(
      changes,
      "Show on terminals",
      displayBool(product.isActive),
      displayBool(activeEl.checked),
    );
  }

  return changes;
}
