import type { FormState } from "@/lib/form-state";
import type { ColumnMapping } from "@/lib/product-import-mapping";
import type { ImportPlan, ProductStockMode } from "@/lib/product-import";

export interface ImportRowFailure {
  line: number;
  sku: string;
  error: string;
}

export interface ImportState extends FormState {
  csv: string;
  plan: ImportPlan | null;
  sourceHeaders: string[];
  mapping: ColumnMapping | null;
  sampleRow: Record<string, string> | null;
  ignoredSourceColumns: string[];
  stockMode: ProductStockMode;
  locationId: string | null;
  importId: string | null;
  importTotal: number | null;
  importPercent: number | null;
  importing: boolean;
  imported: number | null;
  skipped: number | null;
  stockAdjusted: number | null;
  failures: ImportRowFailure[] | null;
  notice: string | null;
}

export const EMPTY_IMPORT_STATE: ImportState = {
  error: null,
  ok: false,
  csv: "",
  plan: null,
  sourceHeaders: [],
  mapping: null,
  sampleRow: null,
  ignoredSourceColumns: [],
  stockMode: "skip",
  locationId: null,
  importId: null,
  importTotal: null,
  importPercent: null,
  importing: false,
  imported: null,
  skipped: null,
  stockAdjusted: null,
  failures: null,
  notice: null,
};
