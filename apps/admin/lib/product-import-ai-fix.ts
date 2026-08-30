import "server-only";

import { fixImportRows } from "@double-a/api-client/queries";
import { getAuthedClient } from "@/lib/api/session";
import type { ColumnMapping } from "@/lib/product-import-mapping";
import { IMPORT_FIELD_META } from "@/lib/product-import-mapping";
import {
  mappedCellsFromSource,
  sanitiseImportRowFixes,
  sourceCellsForLine,
  type ImportRowFix,
} from "@/lib/product-import-fix";

const MAX_FIX_ROWS = 120;

function buildFieldGuide(): string {
  return IMPORT_FIELD_META.map((field) => `- ${field.key}: ${field.label}. ${field.hint}`).join("\n");
}

export async function suggestImportRowFixes(input: {
  mapping: ColumnMapping;
  csv: string;
  rejected: Array<{ line: number; errors: string[] }>;
  acceptedSamples: Array<{ line: number }>;
}): Promise<{ fixes: ImportRowFix[]; attempted: number }> {
  const capped = input.rejected.slice(0, MAX_FIX_ROWS);

  const rejected = capped.map((row) => {
    const sourceCells = sourceCellsForLine(input.csv, row.line);
    return {
      line: row.line,
      errors: row.errors,
      sourceCells,
      mapped: mappedCellsFromSource(sourceCells, input.mapping),
    };
  });

  const samples = input.acceptedSamples.slice(0, 5).map((row) => {
    const sourceCells = sourceCellsForLine(input.csv, row.line);
    return {
      line: row.line,
      sourceCells,
      mapped: mappedCellsFromSource(sourceCells, input.mapping),
    };
  });

  const { fixes, attempted } = await fixImportRows(getAuthedClient(), {
    fieldGuide: buildFieldGuide(),
    rejected,
    samples,
  });

  return { fixes: sanitiseImportRowFixes(fixes), attempted };
}
