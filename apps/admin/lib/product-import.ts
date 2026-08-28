import type { Category, Product, Supplier } from "@double-a/shared-types";
import {
  defaultAllowDecimal,
  formatMoney,
  isProductUnit,
  validateProductInput,
  type ProductUnit,
} from "@double-a/shared-types";
import { toCategoryOptions } from "@/lib/category-options";
import { parseCsvTable, type CsvTable } from "@/lib/csv";

/**
 * Reading a price list from a supplier into the catalogue.
 *
 * Rules:
 *   * Blank optional cell = keep existing value on that product.
 *   * Stock only moves when stock_mode is set/add and a qty column is mapped.
 *   * Shelf price falls back through Price Level 1 → 2 → 3 when primary is empty/zero.
 */

export const REQUIRED_COLUMNS = ["name", "sku", "price"] as const;

export const OPTIONAL_COLUMNS = [
  "cost_price",
  "unit",
  "allow_decimal",
  "barcode",
  "reorder_point",
  "replenish_quantity",
  "bulk_price",
  "bulk_min_quantity",
  "category",
  "supplier",
  "description",
  "is_active",
  "stock_quantity",
] as const;

export const PRICE_FALLBACK_COLUMNS = ["price_level_1", "price_level_2", "price_level_3"] as const;

export type ProductStockMode = "skip" | "set" | "add";

export const TEMPLATE_HEADERS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

export const TEMPLATE_EXAMPLE = [
  "PVC pipe 1/2 inch x 3m",
  "PVC-050-3M",
  "185.00",
  "132.50",
  "pc",
  "false",
  "4806501234567",
  "12",
  "0",
  "170.00",
  "10",
  "Plumbing / Pipes / PVC",
  "",
  "true",
];

const KNOWN_COLUMNS = new Set<string>([
  ...REQUIRED_COLUMNS,
  ...OPTIONAL_COLUMNS,
  ...PRICE_FALLBACK_COLUMNS,
]);

/**
 * Snake_case, matching the CSV columns and the field-by-field business logic
 * below. Structurally unable to carry stock or the trigger-owned category
 * path. `import/actions.ts` maps each accepted row to the api-client's
 * camelCase `ProductInput` right before calling `createProduct`/`updateProduct`.
 */
export interface ProductImportRow {
  name: string;
  sku: string;
  price: number;
  cost_price: number;
  unit: string;
  allow_decimal: boolean;
  barcode: string | null;
  reorder_point: number;
  replenish_quantity: number;
  bulk_price: number | null;
  bulk_min_quantity: number | null;
  category_id: string | null;
  description: string | null;
  is_active: boolean;
  stock_quantity: number | null;
}

export type ImportAction = "create" | "update" | "reject";

export interface ImportRowPlan {
  /** Where it sits in the file, header counted as line 1. */
  line: number;
  name: string;
  sku: string;
  action: ImportAction;
  /** What will change, or why the row was turned away. */
  notes: string[];
  /** Null when rejected. `category_id` is resolved just before writing. */
  values: ProductImportRow | null;
  /** Non-null when the row names a category to attach the product to. */
  categoryPath: string | null;
  /** Non-null when the row names a supplier to link the product to. */
  supplierName: string | null;
}

export interface ImportPlan {
  rows: ImportRowPlan[];
  createCount: number;
  updateCount: number;
  rejectCount: number;
  /** Paths in the file that do not exist yet and would be created. */
  newCategoryPaths: string[];
  /** Supplier names in the file that do not exist yet and would be created. */
  newSupplierNames: string[];
  /** Columns nobody reads, listed so a typo in a header is visible. */
  unknownColumns: string[];
  /** Set when the whole file is unusable, e.g. a missing required column. */
  error: string | null;
}

const EMPTY_PLAN: ImportPlan = {
  rows: [],
  createCount: 0,
  updateCount: 0,
  rejectCount: 0,
  newCategoryPaths: [],
  newSupplierNames: [],
  unknownColumns: [],
  error: null,
};

function normalisePath(path: string): string {
  return path
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" / ");
}

function parseBoolean(raw: string): boolean | null {
  const value = raw.toLowerCase();
  if (["true", "yes", "y", "1", "active"].includes(value)) return true;
  if (["false", "no", "n", "0", "hidden", "inactive"].includes(value)) return false;
  return null;
}

/** Supplier exports often use "-" when a notes field is empty. */
function importTextValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") return null;
  return trimmed;
}

function parsePriceCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Primary mapped price column, then price level fallbacks when empty or zero. */
export function resolveShelfPrice(
  cells: Record<string, string>,
  primaryColumn = "price",
): { price: number | null; note: string | null } {
  const chain = [
    primaryColumn,
    ...PRICE_FALLBACK_COLUMNS.filter((column) => column !== primaryColumn),
  ];

  let usedFallback = false;
  let primarySeen = false;

  for (const column of chain) {
    if (!(column in cells)) continue;
    const value = parsePriceCell(cells[column] ?? "");
    if (value === null) continue;
    if (column === primaryColumn) {
      primarySeen = true;
      if (value > 0) return { price: value, note: null };
      continue;
    }
    if (value > 0) {
      return {
        price: value,
        note: primarySeen
          ? `Price empty — used ${column.replace(/_/g, " ")} (${value}).`
          : null,
      };
    }
    usedFallback = true;
  }

  if (primarySeen) {
    const primary = parsePriceCell(cells[primaryColumn] ?? "");
    if (primary !== null && primary >= 0) return { price: primary, note: null };
  }

  return { price: null, note: usedFallback ? "No usable price in price columns." : null };
}

function describeStockChange(
  current: number,
  fileQty: number,
  mode: ProductStockMode,
): string | null {
  if (mode === "skip") return null;
  if (mode === "set") {
    if (current === fileQty) return `Stock stays ${current} (already matches file).`;
    return `Stock ${current} → ${fileQty} (set to file quantity).`;
  }
  const next = current + fileQty;
  const sign = fileQty >= 0 ? "+" : "";
  return `Stock ${current} → ${next} (${sign}${fileQty} from file).`;
}

/** Plan from a table whose headers are already canonical import field names. */
export function planProductImportFromTable(
  table: CsvTable,
  context: {
    products: Product[];
    categories: Category[];
    suppliers: Supplier[];
    stockMode?: ProductStockMode;
  },
): ImportPlan {
  if (table.headers.length === 0) {
    return { ...EMPTY_PLAN, error: "That file is empty." };
  }

  const missing = REQUIRED_COLUMNS.filter((column) => !table.headers.includes(column));
  if (missing.length > 0) {
    return {
      ...EMPTY_PLAN,
      error: `Map ${missing.join(", ")} before checking the file.`,
    };
  }
  if (table.rows.length === 0) {
    return { ...EMPTY_PLAN, error: "That file has a header row but no products." };
  }

  const stockMode = context.stockMode ?? "skip";
  const has = (column: string) => table.headers.includes(column);
  const unknownColumns = table.headers.filter((header) => !KNOWN_COLUMNS.has(header));

  const bySku = new Map<string, Product>();
  for (const product of context.products) {
    if (product.sku) bySku.set(product.sku.toLowerCase(), product);
  }

  const categoryIdByPath = new Map<string, string>();
  for (const option of toCategoryOptions(context.categories)) {
    categoryIdByPath.set(option.path.toLowerCase(), option.id);
  }

  const supplierIdByName = new Map<string, string>();
  for (const supplier of context.suppliers) {
    supplierIdByName.set(supplier.name.toLowerCase(), supplier.id);
  }

  const rows: ImportRowPlan[] = [];
  const newCategoryPaths: string[] = [];
  const newSupplierNames: string[] = [];
  const seenSkus = new Set<string>();

  for (const { line, cells } of table.rows) {
    const cell = (column: string) => cells[column] ?? "";
    /** True only when the column exists and this row actually filled it in. */
    const given = (column: string) => has(column) && cell(column) !== "";

    const name = cell("name");
    const sku = cell("sku");
    const existing = sku ? bySku.get(sku.toLowerCase()) : undefined;
    const problems: string[] = [];

    if (!sku) {
      problems.push("A SKU is needed — it is what matches a row to a product.");
    } else if (seenSkus.has(sku.toLowerCase())) {
      problems.push("This SKU appears earlier in the file.");
    }
    if (sku) seenSkus.add(sku.toLowerCase());

    const resolvedPrice = resolveShelfPrice(cells, "price");
    const price = resolvedPrice.price;
    const priceNote = resolvedPrice.note;
    if (price === null || !Number.isFinite(price)) {
      problems.push("Price is missing or is not a number.");
    }

    // Blank optional cell: keep what the product already has, or fall back to
    // the same default a new product would get.
    const costPrice = given("cost_price")
      ? Number(cell("cost_price"))
      : (existing?.costPrice ?? 0);
    if (!Number.isFinite(costPrice)) problems.push("Supplier price is not a number.");

    const unit = given("unit")
      ? cell("unit").toLowerCase()
      : (existing?.unit ?? "pc");
    if (!isProductUnit(unit)) {
      problems.push(`"${cell("unit")}" is not a unit we sell by.`);
    }

    // Follows the unit for a new product unless the sheet says otherwise; an
    // existing product keeps its setting when the cell is blank.
    let allowDecimal = existing
      ? existing.allowDecimal
      : isProductUnit(unit)
        ? defaultAllowDecimal(unit as ProductUnit)
        : false;
    if (given("allow_decimal")) {
      const parsed = parseBoolean(cell("allow_decimal"));
      if (parsed === null) {
        problems.push(`"${cell("allow_decimal")}" is not a yes or no.`);
      } else {
        allowDecimal = parsed;
      }
    }

    const barcode = given("barcode") ? cell("barcode") : (existing?.barcode ?? null);

    const reorderPoint = given("reorder_point")
      ? Number(cell("reorder_point"))
      : (existing?.reorderPoint ?? 5);
    if (!Number.isInteger(reorderPoint)) {
      problems.push("Reorder point must be a whole number.");
    }

    const replenishQuantity = given("replenish_quantity")
      ? Number(cell("replenish_quantity"))
      : (existing?.replenishQuantity ?? 0);
    if (!Number.isInteger(replenishQuantity) || replenishQuantity < 0) {
      problems.push("Replenish quantity must be a whole number, zero or more.");
    }

    const description = given("description")
      ? importTextValue(cell("description"))
      : (existing?.description ?? null);

    // The pair moves together: filling in one and leaving the other blank is
    // rejected below rather than silently written as half a tier.
    const bulkPriceGiven = given("bulk_price");
    const bulkMinGiven = given("bulk_min_quantity");
    const bulkTouched = bulkPriceGiven || bulkMinGiven;

    const bulkPrice = bulkPriceGiven
      ? Number(cell("bulk_price"))
      : bulkTouched
        ? null
        : (existing?.bulkPrice ?? null);
    const bulkMinQuantity = bulkMinGiven
      ? Number(cell("bulk_min_quantity"))
      : bulkTouched
        ? null
        : (existing?.bulkMinQuantity ?? null);

    let isActive = existing?.isActive ?? true;
    if (given("is_active")) {
      const parsed = parseBoolean(cell("is_active"));
      if (parsed === null) {
        problems.push(`"${cell("is_active")}" is not a yes or no.`);
      } else {
        isActive = parsed;
      }
    }

    const categoryPath = given("category") ? normalisePath(cell("category")) : null;
    const supplierName = given("supplier") ? cell("supplier").trim() : null;

    let stockQuantity: number | null = null;
    if (has("stock_quantity") && given("stock_quantity")) {
      const parsed = Number(cell("stock_quantity"));
      if (!Number.isFinite(parsed)) {
        problems.push("Stock quantity is not a number.");
      } else {
        stockQuantity = parsed;
      }
    }

    const validation = validateProductInput({
      name,
      price: price as number,
      sku,
      costPrice: Number.isFinite(costPrice) ? costPrice : undefined,
      reorderPoint: Number.isInteger(reorderPoint) ? reorderPoint : undefined,
      bulkPrice,
      bulkMinQuantity,
      unit,
    });
    problems.push(...validation.errors);

    if (problems.length > 0) {
      rows.push({
        line,
        name,
        sku,
        action: "reject",
        notes: [...new Set(problems)],
        values: null,
        categoryPath,
        supplierName,
      });
      continue;
    }

    if (categoryPath && !categoryIdByPath.has(categoryPath.toLowerCase())) {
      if (!newCategoryPaths.includes(categoryPath)) newCategoryPaths.push(categoryPath);
    }

    if (supplierName && !supplierIdByName.has(supplierName.toLowerCase())) {
      if (!newSupplierNames.includes(supplierName)) newSupplierNames.push(supplierName);
    }

    const values: ProductImportRow = {
      name,
      sku,
      price: price!,
      cost_price: costPrice,
      unit,
      allow_decimal: allowDecimal,
      barcode,
      reorder_point: reorderPoint,
      replenish_quantity: replenishQuantity,
      bulk_price: bulkPrice,
      bulk_min_quantity: bulkMinQuantity,
      category_id: existing?.categoryId ?? null,
      description,
      is_active: isActive,
      stock_quantity: stockQuantity,
    };

    const notes = existing
      ? describeChanges(existing, values, categoryPath)
      : stockMode !== "skip" && stockQuantity !== null
        ? ["New product."]
        : ["New product. Stock starts at zero until you record it in Inventory."];
    if (priceNote) notes.push(priceNote);
    if (stockQuantity !== null && stockMode !== "skip") {
      const stockNote = describeStockChange(existing?.stockQuantity ?? 0, stockQuantity, stockMode);
      if (stockNote) notes.push(stockNote);
    }
    if (supplierName) {
      if (supplierIdByName.has(supplierName.toLowerCase())) {
        notes.push(`Supplier → ${supplierName}`);
      } else {
        notes.push(`Supplier ${supplierName} will be created and linked.`);
      }
    }

    rows.push({
      line,
      name,
      sku,
      action: existing ? "update" : "create",
      notes,
      values,
      categoryPath,
      supplierName,
    });
  }

  return {
    rows,
    createCount: rows.filter((row) => row.action === "create").length,
    updateCount: rows.filter((row) => row.action === "update").length,
    rejectCount: rows.filter((row) => row.action === "reject").length,
    newCategoryPaths,
    newSupplierNames,
    unknownColumns,
    error: null,
  };
}

/** Legacy entry — prefer `prepareImportTable` + `planProductImportFromTable`. */
export function planProductImport(
  csv: string,
  context: { products: Product[]; categories: Category[]; suppliers?: Supplier[] },
): ImportPlan {
  return planProductImportFromTable(parseCsvTable(csv), {
    ...context,
    suppliers: context.suppliers ?? [],
  });
}

function describeChanges(
  existing: Product,
  values: ProductImportRow,
  categoryPath: string | null,
): string[] {
  const changes: string[] = [];

  if (existing.name !== values.name) changes.push(`Name → ${values.name}`);
  if (existing.price !== values.price) {
    changes.push(
      `Shelf price ${formatMoney(existing.price)} → ${formatMoney(values.price)}`,
    );
  }
  if (existing.costPrice !== values.cost_price) {
    changes.push(
      `Supplier price ${formatMoney(existing.costPrice)} → ${formatMoney(values.cost_price ?? 0)}`,
    );
  }
  if (existing.unit !== values.unit) changes.push(`Sold by → ${values.unit}`);
  if (existing.allowDecimal !== (values.allow_decimal ?? false)) {
    changes.push(
      values.allow_decimal ? "Decimal quantities on" : "Decimal quantities off",
    );
  }
  if (existing.barcode !== values.barcode) changes.push("Barcode changes");
  if (existing.reorderPoint !== values.reorder_point) {
    changes.push(`Reorder point ${existing.reorderPoint} → ${values.reorder_point}`);
  }
  if (existing.replenishQuantity !== values.replenish_quantity) {
    changes.push(
      `Replenish qty ${existing.replenishQuantity} → ${values.replenish_quantity}`,
    );
  }
  if ((existing.description ?? null) !== (values.description ?? null)) {
    changes.push(values.description ? "Description updated" : "Description cleared");
  }
  const bulkPrice = values.bulk_price ?? null;
  if (
    existing.bulkPrice !== bulkPrice ||
    existing.bulkMinQuantity !== (values.bulk_min_quantity ?? null)
  ) {
    changes.push(
      bulkPrice === null
        ? "Bulk price removed"
        : `Bulk price ${formatMoney(bulkPrice)} from ${values.bulk_min_quantity}`,
    );
  }
  if (existing.isActive !== values.is_active) {
    changes.push(values.is_active ? "Shown on terminals" : "Hidden from terminals");
  }
  if (categoryPath && categoryPath.toLowerCase() !== (existing.category ?? "").toLowerCase()) {
    changes.push(`Category → ${categoryPath}`);
  }

  return changes.length > 0 ? changes : ["Nothing changes for this one."];
}
