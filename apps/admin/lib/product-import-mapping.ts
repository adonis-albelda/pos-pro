import { parseCsvTable, type CsvTable } from "@/lib/csv";
import {
  OPTIONAL_COLUMNS,
  PRICE_FALLBACK_COLUMNS,
  REQUIRED_COLUMNS,
  type ImportPlan,
} from "@/lib/product-import";

export type ImportField = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];

export const IMPORT_FIELDS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;

export interface ImportFieldMeta {
  key: ImportField;
  label: string;
  required: boolean;
  hint: string;
  /** Normalised header tokens that auto-map to this field. */
  aliases: string[];
}

export type ColumnMapping = Record<ImportField, string | null>;

export interface ImportTablePrep {
  sourceHeaders: string[];
  /** First data row keyed by source header — powers mapping previews. */
  sampleRow: Record<string, string>;
  mapping: ColumnMapping;
  missingRequired: ImportField[];
  table: CsvTable | null;
}

export const IMPORT_FIELD_META: ImportFieldMeta[] = [
  {
    key: "name",
    label: "Product name",
    required: true,
    hint: "What the product is called on the shelf.",
    aliases: ["name", "itemname", "item_name", "product_name", "product", "title"],
  },
  {
    key: "sku",
    label: "SKU / item code",
    required: true,
    hint: "Unique code used to match rows to existing products.",
    aliases: ["sku", "itemcode", "item_code", "code", "product_code", "stock_code", "part_number"],
  },
  {
    key: "price",
    label: "Shelf price",
    required: true,
    hint: "What customers pay.",
    aliases: [
      "price",
      "sell_price",
      "selling_price",
      "retail_price",
      "shelf_price",
      "unit_price",
    ],
  },
  {
    key: "cost_price",
    label: "Supplier cost",
    required: false,
    hint: "What you pay the supplier. Drives margin reports.",
    aliases: ["cost_price", "cost", "supplier_price", "unit_cost", "purchase_price", "landed_cost"],
  },
  {
    key: "unit",
    label: "Unit",
    required: false,
    hint: "pc, box, kg, m, etc.",
    aliases: ["unit", "uom", "unit_of_measure", "measure"],
  },
  {
    key: "allow_decimal",
    label: "Allow decimal qty",
    required: false,
    hint: "yes / no",
    aliases: ["allow_decimal", "decimal", "fractional"],
  },
  {
    key: "barcode",
    label: "Barcode",
    required: false,
    hint: "Optional scan code.",
    aliases: ["barcode", "upc", "ean", "gtin"],
  },
  {
    key: "reorder_point",
    label: "Reorder point",
    required: false,
    hint: "Whole number — flag for restocking.",
    aliases: ["reorder_point", "reorder", "itemreorder", "min_stock", "reorder_level", "minimum_stock"],
  },
  {
    key: "replenish_quantity",
    label: "Replenish quantity",
    required: false,
    hint: "Suggested qty to order when restocking.",
    aliases: [
      "replenish_quantity",
      "itemreplenish",
      "item_replenish",
      "replenish",
      "replenish_qty",
    ],
  },
  {
    key: "bulk_price",
    label: "Bulk / contractor price",
    required: false,
    hint: "Needs bulk minimum quantity too.",
    aliases: ["bulk_price", "wholesale_price", "contractor_price"],
  },
  {
    key: "bulk_min_quantity",
    label: "Bulk minimum qty",
    required: false,
    hint: "Quantity that unlocks bulk price.",
    aliases: ["bulk_min_quantity", "bulk_min", "bulk_qty", "wholesale_min"],
  },
  {
    key: "category",
    label: "Category",
    required: false,
    hint: "Path like Plumbing / Pipes — created if missing.",
    aliases: ["category", "cat", "department", "group", "product_category"],
  },
  {
    key: "supplier",
    label: "Supplier",
    required: false,
    hint: "Supplier name. Created and linked to the product if it does not exist yet.",
    aliases: ["supplier", "vendor", "supplier_name", "vendor_name"],
  },
  {
    key: "description",
    label: "Description",
    required: false,
    hint: "Longer notes about the product. A lone dash is treated as empty.",
    aliases: ["description", "itemdescription", "item_description", "notes", "long_description"],
  },
  {
    key: "stock_quantity",
    label: "Quantity on hand",
    required: false,
    hint: "Optional. Used only when you choose a stock import mode below.",
    aliases: [
      "stock_quantity",
      "itemqtyonhand",
      "qty_on_hand",
      "quantity",
      "stock",
      "on_hand",
      "item_qty",
    ],
  },
  {
    key: "is_active",
    label: "Active on terminals",
    required: false,
    hint: "true / false",
    aliases: ["is_active", "active", "visible", "status"],
  },
];

const FIELD_META_BY_KEY = new Map(IMPORT_FIELD_META.map((field) => [field.key, field]));

const EMPTY_MAPPING = Object.fromEntries(
  IMPORT_FIELDS.map((field) => [field, null]),
) as ColumnMapping;

function scoreHeader(header: string, aliases: string[]): number {
  if (aliases.includes(header)) return 100;
  const compact = header.replace(/_/g, "");
  for (const alias of aliases) {
    if (compact === alias.replace(/_/g, "")) return 90;
    if (header.startsWith(`${alias}_`) || header.endsWith(`_${alias}`)) return 70;
    if (header.includes(alias) && alias.length >= 4) return 50;
  }
  return 0;
}

/** Canonical headers already in the file win without remapping. */
function mappingFromCanonicalHeaders(headers: string[]): ColumnMapping {
  const mapping = { ...EMPTY_MAPPING };
  for (const field of IMPORT_FIELDS) {
    if (headers.includes(field)) mapping[field] = field;
  }
  return mapping;
}

export function emptyColumnMapping(): ColumnMapping {
  return { ...EMPTY_MAPPING };
}

export function detectColumnMapping(headers: string[]): ColumnMapping {
  const canonical = mappingFromCanonicalHeaders(headers);
  if (REQUIRED_COLUMNS.every((field) => canonical[field])) return canonical;

  const mapping = emptyColumnMapping();
  const used = new Set<string>();

  const fields = [...IMPORT_FIELD_META].sort(
    (left, right) => Number(right.required) - Number(left.required),
  );

  for (const field of fields) {
    let bestHeader: string | null = null;
    let bestScore = 0;

    for (const header of headers) {
      if (used.has(header)) continue;
      const score = scoreHeader(header, field.aliases);
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    }

    if (bestHeader && bestScore >= 50) {
      mapping[field.key] = bestHeader;
      used.add(bestHeader);
    }
  }

  return mapping;
}

export function readColumnMapping(formData: FormData): ColumnMapping {
  const mapping = emptyColumnMapping();

  const json = String(formData.get("mapping_json") ?? "").trim();
  if (json) {
    try {
      const parsed = JSON.parse(json) as Partial<ColumnMapping>;
      for (const field of IMPORT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(parsed, field)) {
          mapping[field] = parsed[field] ?? null;
        }
      }
    } catch {
      // Fall through to per-field inputs.
    }
  }

  for (const field of IMPORT_FIELDS) {
    const raw = formData.get(`map_${field}`);
    if (raw === null) continue;
    mapping[field] = String(raw).trim() || null;
  }

  return mapping;
}

export function getMissingRequired(mapping: ColumnMapping): ImportField[] {
  return REQUIRED_COLUMNS.filter((field) => !mapping[field]);
}

export function applyColumnMapping(table: CsvTable, mapping: ColumnMapping): CsvTable {
  const headers = IMPORT_FIELDS.filter((field) => mapping[field]);
  const fallbackHeaders = PRICE_FALLBACK_COLUMNS.filter(
    (column) =>
      table.headers.includes(column) && !(headers as readonly string[]).includes(column),
  );
  const allHeaders = [...headers, ...fallbackHeaders];

  const rows = table.rows.map(({ line, cells }) => {
    const mapped: Record<string, string> = {};
    for (const field of headers) {
      const source = mapping[field]!;
      mapped[field] = cells[source] ?? "";
    }
    for (const column of fallbackHeaders) {
      mapped[column] = cells[column] ?? "";
    }
    return { line, cells: mapped };
  });

  return { headers: allHeaders, rows };
}

export function prepareImportTable(csv: string, mapping?: ColumnMapping): ImportTablePrep {
  const source = parseCsvTable(csv);
  const sampleRow = source.rows[0]?.cells ?? {};
  const resolvedMapping = mapping ?? detectColumnMapping(source.headers);
  const missingRequired = getMissingRequired(resolvedMapping);

  if (source.headers.length === 0) {
    return {
      sourceHeaders: [],
      sampleRow: {},
      mapping: resolvedMapping,
      missingRequired: [...REQUIRED_COLUMNS],
      table: null,
    };
  }

  if (missingRequired.length > 0) {
    return {
      sourceHeaders: source.headers,
      sampleRow,
      mapping: resolvedMapping,
      missingRequired,
      table: null,
    };
  }

  return {
    sourceHeaders: source.headers,
    sampleRow,
    mapping: resolvedMapping,
    missingRequired: [],
    table: applyColumnMapping(source, resolvedMapping),
  };
}

export function describeMappingField(field: ImportField): ImportFieldMeta {
  return FIELD_META_BY_KEY.get(field)!;
}

export function mappingSummary(mapping: ColumnMapping): string[] {
  return IMPORT_FIELDS.filter((field) => mapping[field]).map(
    (field) => `${describeMappingField(field).label} ← ${mapping[field]}`,
  );
}

export type MappedImportPlan = ImportPlan & {
  mapping: ColumnMapping;
  sourceHeaders: string[];
  sampleRow: Record<string, string>;
};
