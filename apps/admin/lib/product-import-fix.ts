import { parseCsvTable, toCsv } from "@/lib/csv";
import type { ColumnMapping, ImportField } from "@/lib/product-import-mapping";
import { IMPORT_FIELDS } from "@/lib/product-import-mapping";

export interface ImportRowFix {
  line: number;
  fields: Partial<Record<ImportField, string>>;
  reason?: string;
}

const IMPORT_FIELD_SET = new Set<string>(IMPORT_FIELDS);

export function sanitiseImportRowFixes(fixes: ImportRowFix[]): ImportRowFix[] {
  return fixes
    .filter((fix) => Number.isInteger(fix.line) && fix.line > 1)
    .map((fix) => {
      const fields: Partial<Record<ImportField, string>> = {};
      for (const [key, value] of Object.entries(fix.fields)) {
        if (!IMPORT_FIELD_SET.has(key) || value === undefined || value === null) continue;
        fields[key as ImportField] = String(value).trim();
      }
      return { line: fix.line, fields, reason: fix.reason };
    })
    .filter((fix) => Object.keys(fix.fields).length > 0);
}

/** Write catalogue-field fixes back into the original file columns via the mapping. */
export function applyImportRowFixes(
  csv: string,
  mapping: ColumnMapping,
  fixes: ImportRowFix[],
): string {
  const table = parseCsvTable(csv);
  if (table.headers.length === 0 || fixes.length === 0) return csv;

  const fixByLine = new Map(fixes.map((fix) => [fix.line, fix]));

  const rows = table.rows.map((row) => {
    const fix = fixByLine.get(row.line);
    const cells = { ...row.cells };

    if (fix) {
      for (const [field, value] of Object.entries(fix.fields)) {
        const source = mapping[field as ImportField];
        if (source && value !== undefined) cells[source] = value;
      }
    }

    return table.headers.map((header) => cells[header] ?? "");
  });

  return toCsv(table.headers, rows);
}

export function sourceCellsForLine(csv: string, line: number): Record<string, string> {
  const table = parseCsvTable(csv);
  return table.rows.find((row) => row.line === line)?.cells ?? {};
}

export function mappedCellsFromSource(
  sourceCells: Record<string, string>,
  mapping: ColumnMapping,
): Partial<Record<ImportField, string>> {
  const mapped: Partial<Record<ImportField, string>> = {};
  for (const field of IMPORT_FIELDS) {
    const source = mapping[field];
    if (source) mapped[field] = sourceCells[source] ?? "";
  }
  return mapped;
}
