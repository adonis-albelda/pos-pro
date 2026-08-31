"use server";

import { revalidatePath } from "next/cache";
import {
  listCategories,
  listLocations,
  listProducts,
  listSuppliers,
  startProductImport,
  extractProductsFromPhoto,
  type ProductImportRowPayload,
} from "@double-a/api-client/queries";
import { ApiError } from "@double-a/api-client";
import type { ProductStockMode } from "@/lib/product-import";
import {
  IMPORT_FIELDS,
  prepareImportTable,
  readColumnMapping,
  type ImportField,
} from "@/lib/product-import-mapping";
import { planProductImportFromTable } from "@/lib/product-import";
import { suggestImportRowFixes } from "@/lib/product-import-ai-fix";
import { applyImportRowFixes, type ImportRowFix } from "@/lib/product-import-fix";
import { getAuthedClient } from "@/lib/api/session";
import {
  describePhotoExtractError,
  extractedLinesToCsv,
} from "@/lib/product-import-from-photo";
import { EMPTY_IMPORT_STATE, type ImportState } from "./import-state";

async function readUpload(formData: FormData): Promise<string> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.type.startsWith("image/")) return "";
    return file.text();
  }
  return String(formData.get("pasted") ?? "");
}

async function readPhotoCsv(formData: FormData): Promise<
  { ok: true; csv: string; lineCount: number } | { ok: false; error: string }
> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a photo to read." };
  }

  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "That file is not an image." };
  }

  if (file.size > 5.5 * 1024 * 1024) {
    return {
      ok: false,
      error: "Photo is too large (over 5.5 MB). Try a clearer, smaller shot.",
    };
  }

  const client = getAuthedClient();

  try {
    const lines = await extractProductsFromPhoto(client, file, { applyStock: false });
    if (lines.length === 0) {
      return {
        ok: false,
        error:
          "No product lines found. Use a clearer photo with one product per row (name and price).",
      };
    }

    return { ok: true, csv: extractedLinesToCsv(lines), lineCount: lines.length };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: describePhotoExtractError(error),
    };
  }
}

function readStockMode(formData: FormData): ProductStockMode {
  const raw = String(formData.get("stock_mode") ?? "skip");
  if (raw === "set" || raw === "add") return raw;
  return "skip";
}

function resolveStockLocationId(
  branches: Array<{ id: string }>,
  locationId: string | null,
): string | null {
  if (branches.length === 1) return branches[0]!.id;
  if (!locationId) return null;
  return branches.some((branch) => branch.id === locationId) ? locationId : null;
}

function ignoredSourceColumns(
  sourceHeaders: string[],
  mapping: ReturnType<typeof readColumnMapping>,
): string[] {
  const mapped = new Set(
    Object.values(mapping).filter((header): header is string => Boolean(header)),
  );
  return sourceHeaders.filter((header) => !mapped.has(header));
}

function toImportRow(row: {
  line: number;
  values: NonNullable<ImportState["plan"]>["rows"][number]["values"];
  categoryPath: string | null;
  supplierName: string | null;
}): ProductImportRowPayload | null {
  if (!row.values) return null;

  return {
    line: row.line,
    name: row.values.name,
    sku: row.values.sku,
    supplier_sku: row.values.supplier_sku,
    price: row.values.price,
    cost_price: row.values.cost_price,
    unit: row.values.unit,
    barcode: row.values.barcode,
    reorder_point: row.values.reorder_point,
    replenish_quantity: row.values.replenish_quantity,
    bulk_price: row.values.bulk_price,
    bulk_min_quantity: row.values.bulk_min_quantity,
    allow_decimal: row.values.allow_decimal,
    is_active: row.values.is_active,
    description: row.values.description,
    category_path: row.categoryPath,
    supplier_name: row.supplierName,
    stock_quantity: row.values.stock_quantity,
  };
}

export async function importProducts(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const intent = String(formData.get("intent") ?? "");
  const writing = intent === "import";
  const remapping = intent === "map";
  const aiFixing = intent === "ai_fix";
  const editingRow = intent === "edit_row";
  const extractingPhoto = intent === "extract_photo";
  const skipExistingUpdates = formData.get("skip_existing_updates") === "1";

  let photoNotice: string | null = null;
  const fromPhoto = extractingPhoto
    ? true
    : intent === "check"
      ? false
      : _prev.fromPhoto;

  let csv: string;
  if (writing || remapping || aiFixing || editingRow) {
    csv = String(formData.get("csv") ?? "");
  } else if (extractingPhoto) {
    const photo = await readPhotoCsv(formData);
    if (!photo.ok) {
      return { ...EMPTY_IMPORT_STATE, error: photo.error };
    }
    csv = photo.csv;
    photoNotice = `AI read ${photo.lineCount} product line${photo.lineCount === 1 ? "" : "s"} from your photo. Review the mapping, then import.`;
  } else {
    csv = await readUpload(formData);
  }

  const stockMode = readStockMode(formData);
  const locationId = String(formData.get("location_id") ?? "").trim() || null;

  if (!csv.trim()) {
    return {
      ...EMPTY_IMPORT_STATE,
      error: writing
        ? "The file was lost. Upload it again."
        : extractingPhoto
          ? "Choose a photo to read."
          : "Choose a CSV file, paste the rows, or upload a photo.",
    };
  }

  const mapping =
    remapping || writing || aiFixing || editingRow ? readColumnMapping(formData) : undefined;
  const prepared = prepareImportTable(csv, mapping);
  const ignored = ignoredSourceColumns(prepared.sourceHeaders, prepared.mapping);

  if (prepared.sourceHeaders.length === 0) {
    return { ...EMPTY_IMPORT_STATE, error: "That file is empty." };
  }

  if (prepared.missingRequired.length > 0) {
    const labels = prepared.missingRequired.join(", ");
    return {
      ...EMPTY_IMPORT_STATE,
      csv,
      sourceHeaders: prepared.sourceHeaders,
      mapping: prepared.mapping,
      sampleRow: prepared.sampleRow,
      ignoredSourceColumns: ignored,
      stockMode,
      locationId,
      fromPhoto,
      error: `Map these required columns: ${labels}.`,
    };
  }

  const client = getAuthedClient();
  const [products, categories, suppliers, branches] = await Promise.all([
    listProducts(client, { includeInactive: true }),
    listCategories(client, { includeInactive: true }),
    listSuppliers(client, { includeInactive: true }),
    listLocations(client, { type: "branch" }),
  ]);

  const hasStockColumn = Boolean(prepared.mapping.stock_quantity);
  const stockLocationId =
    hasStockColumn && stockMode !== "skip"
      ? resolveStockLocationId(branches, locationId)
      : locationId;

  const plan = planProductImportFromTable(prepared.table!, {
    products,
    categories,
    suppliers,
    stockMode,
  });

  if (plan.error) {
    return {
      ...EMPTY_IMPORT_STATE,
      csv,
      sourceHeaders: prepared.sourceHeaders,
      mapping: prepared.mapping,
      sampleRow: prepared.sampleRow,
      ignoredSourceColumns: ignored,
      stockMode,
      locationId: stockLocationId,
      fromPhoto,
      error: plan.error,
    };
  }

  if (!aiFixing && !editingRow && hasStockColumn && stockMode !== "skip" && !stockLocationId) {
    return {
      ...EMPTY_IMPORT_STATE,
      csv,
      plan,
      sourceHeaders: prepared.sourceHeaders,
      mapping: prepared.mapping,
      sampleRow: prepared.sampleRow,
      ignoredSourceColumns: ignored,
      stockMode,
      locationId: stockLocationId,
      fromPhoto,
      error:
        branches.length === 0
          ? "Add an active branch before importing stock quantities."
          : "Choose which branch receives the stock updates.",
    };
  }

  if (aiFixing || editingRow) {
    let fixes: ImportRowFix[];
    let attempted = 0;

    if (editingRow) {
      const line = Number(formData.get("edit_line") ?? 0);
      const fields: Partial<Record<ImportField, string>> = {};
      for (const field of IMPORT_FIELDS) {
        const raw = formData.get(`edit_${field}`);
        if (typeof raw === "string" && raw.trim() !== "") {
          fields[field] = raw.trim();
        }
      }

      if (!line || Object.keys(fields).length === 0) {
        return {
          ...EMPTY_IMPORT_STATE,
          csv,
          plan,
          sourceHeaders: prepared.sourceHeaders,
          mapping: prepared.mapping,
          sampleRow: prepared.sampleRow,
          ignoredSourceColumns: ignored,
          stockMode,
          locationId: stockLocationId,
          error: "Nothing to save.",
        };
      }

      fixes = [{ line, fields }];
    } else {
      const rejected = plan.rows.filter((row) => row.action === "reject");
      if (rejected.length === 0) {
        return {
          ...EMPTY_IMPORT_STATE,
          csv,
          plan,
          sourceHeaders: prepared.sourceHeaders,
          mapping: prepared.mapping,
          sampleRow: prepared.sampleRow,
          ignoredSourceColumns: ignored,
          stockMode,
          locationId: stockLocationId,
          error: "No turned-away rows to fix.",
        };
      }

      try {
        const acceptedSamples = plan.rows
          .filter((row) => row.action !== "reject")
          .slice(0, 5)
          .map((row) => ({ line: row.line }));

        const result = await suggestImportRowFixes({
          csv,
          mapping: prepared.mapping,
          rejected: rejected.map((row) => ({ line: row.line, errors: row.notes })),
          acceptedSamples,
        });
        fixes = result.fixes;
        attempted = result.attempted;

        if (fixes.length === 0) {
          return {
            ...EMPTY_IMPORT_STATE,
            csv,
            plan,
            sourceHeaders: prepared.sourceHeaders,
            mapping: prepared.mapping,
            sampleRow: prepared.sampleRow,
            ignoredSourceColumns: ignored,
            stockMode,
            locationId: stockLocationId,
            error: `AI could not confidently fix any of the ${attempted} turned-away rows.`,
          };
        }
      } catch (error) {
        return {
          ...EMPTY_IMPORT_STATE,
          csv,
          plan,
          sourceHeaders: prepared.sourceHeaders,
          mapping: prepared.mapping,
          sampleRow: prepared.sampleRow,
          ignoredSourceColumns: ignored,
          stockMode,
          locationId: stockLocationId,
          error: error instanceof Error ? error.message : "AI fix could not run.",
        };
      }
    }

    try {
      const fixedCsv = applyImportRowFixes(csv, prepared.mapping, fixes);
      const fixedPrepared = prepareImportTable(fixedCsv, prepared.mapping);
      if (!fixedPrepared.table) {
        return {
          ...EMPTY_IMPORT_STATE,
          csv: fixedCsv,
          sourceHeaders: fixedPrepared.sourceHeaders,
          mapping: fixedPrepared.mapping,
          sampleRow: fixedPrepared.sampleRow,
          ignoredSourceColumns: ignoredSourceColumns(
            fixedPrepared.sourceHeaders,
            fixedPrepared.mapping,
          ),
          stockMode,
          locationId: stockLocationId,
          error: editingRow
            ? "Edited file could not be read back."
            : "Fixed file could not be read back. Try downloading turned-away rows instead.",
        };
      }

      const fixedPlan = planProductImportFromTable(fixedPrepared.table, {
        products,
        categories,
        suppliers,
        stockMode,
      });

      if (fixedPlan.error) {
        return {
          ...EMPTY_IMPORT_STATE,
          csv: fixedCsv,
          sourceHeaders: fixedPrepared.sourceHeaders,
          mapping: fixedPrepared.mapping,
          sampleRow: fixedPrepared.sampleRow,
          ignoredSourceColumns: ignoredSourceColumns(
            fixedPrepared.sourceHeaders,
            fixedPrepared.mapping,
          ),
          stockMode,
          locationId: stockLocationId,
          error: fixedPlan.error,
        };
      }

      const recovered = plan.rejectCount - fixedPlan.rejectCount;

      return {
        ...EMPTY_IMPORT_STATE,
        csv: fixedCsv,
        plan: fixedPlan,
        sourceHeaders: fixedPrepared.sourceHeaders,
        mapping: fixedPrepared.mapping,
        sampleRow: fixedPrepared.sampleRow,
        ignoredSourceColumns: ignoredSourceColumns(
          fixedPrepared.sourceHeaders,
          fixedPrepared.mapping,
        ),
        stockMode,
        locationId: stockLocationId,
        fromPhoto,
        lastFixes: fixes,
        notice: editingRow
          ? `Saved your changes to line ${fixes[0]!.line}.`
          : recovered > 0
            ? `AI fixed ${fixes.length} row${fixes.length === 1 ? "" : "s"} — ${recovered} now pass preview. Review before importing.`
            : `AI updated ${fixes.length} row${fixes.length === 1 ? "" : "s"}, but they still need manual edits. Check the preview.`,
      };
    } catch (error) {
      return {
        ...EMPTY_IMPORT_STATE,
        csv,
        plan,
        sourceHeaders: prepared.sourceHeaders,
        mapping: prepared.mapping,
        sampleRow: prepared.sampleRow,
        ignoredSourceColumns: ignored,
        stockMode,
        locationId: stockLocationId,
        error: error instanceof Error ? error.message : "Could not save the change.",
      };
    }
  }

  if (!writing) {
    return {
      ...EMPTY_IMPORT_STATE,
      csv,
      plan,
      sourceHeaders: prepared.sourceHeaders,
      mapping: prepared.mapping,
      sampleRow: prepared.sampleRow,
      ignoredSourceColumns: ignored,
      stockMode,
      locationId: stockLocationId,
      fromPhoto,
      notice: photoNotice,
    };
  }

  const accepted = plan.rows.filter((row) => {
    if (row.values === null || row.action === "reject") return false;
    if (skipExistingUpdates && row.action === "update") return false;
    return true;
  });
  if (accepted.length === 0) {
    return {
      ...EMPTY_IMPORT_STATE,
      csv,
      plan,
      sourceHeaders: prepared.sourceHeaders,
      mapping: prepared.mapping,
      sampleRow: prepared.sampleRow,
      ignoredSourceColumns: ignored,
      stockMode,
      locationId: stockLocationId,
      fromPhoto,
      error: skipExistingUpdates
        ? "Every row matches an existing product and updates are skipped. Uncheck skip updates or add new SKUs."
        : "Every row was turned away. Fix the ones listed and upload again.",
    };
  }

  const rows = accepted
    .map((row) =>
      toImportRow({
        line: row.line,
        values: row.values,
        categoryPath: row.categoryPath,
        supplierName: row.supplierName,
      }),
    )
    .filter((row): row is ProductImportRowPayload => row !== null);

  try {
    const started = await startProductImport(client, {
      rows,
      stockMode,
      locationId: stockLocationId,
    });

    revalidatePath("/products");
    revalidatePath("/categories");
    revalidatePath("/suppliers");
    revalidatePath("/inventory");
    revalidatePath("/reports");

    return {
      ...EMPTY_IMPORT_STATE,
      csv,
      plan,
      sourceHeaders: prepared.sourceHeaders,
      mapping: prepared.mapping,
      sampleRow: prepared.sampleRow,
      ignoredSourceColumns: ignored,
      stockMode,
      locationId: stockLocationId,
      importId: started.importId,
      importTotal: started.total,
      importing: true,
    };
  } catch (error) {
    return {
      ...EMPTY_IMPORT_STATE,
      csv,
      plan,
      sourceHeaders: prepared.sourceHeaders,
      mapping: prepared.mapping,
      sampleRow: prepared.sampleRow,
      ignoredSourceColumns: ignored,
      stockMode,
      locationId: stockLocationId,
      error: error instanceof Error ? error.message : "Import could not be started.",
    };
  }
}
