import { parseCsvTable, toCsv } from "@/lib/csv";
import type { ImportPlan } from "@/lib/product-import";

export interface ImportRowExportIssue {
  line: number;
  errors: string[];
}

/** Original file columns plus `import_errors` for rows that failed validation. */
export function buildImportIssuesCsv(
  csv: string,
  issues: ImportRowExportIssue[],
): string | null {
  if (issues.length === 0) return null;

  const table = parseCsvTable(csv);
  if (table.headers.length === 0) return null;

  const headers = [...table.headers, "import_errors"];
  const byLine = new Map(table.rows.map((row) => [row.line, row]));

  const rows = issues.map((issue) => {
    const source = byLine.get(issue.line);
    const cells = table.headers.map((header) => source?.cells[header] ?? "");
    return [...cells, issue.errors.join(" ")];
  });

  return toCsv(headers, rows);
}

export function rejectedRowsFromPlan(plan: ImportPlan): ImportRowExportIssue[] {
  return plan.rows
    .filter((row) => row.action === "reject")
    .map((row) => ({ line: row.line, errors: row.notes }));
}

export function importIssuesFilename(kind: "turned-away" | "failed-save"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `products-import-${kind}-${date}.csv`;
}

export function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadImportIssuesCsv(
  csv: string,
  issues: ImportRowExportIssue[],
  filename: string,
): boolean {
  const content = buildImportIssuesCsv(csv, issues);
  if (!content) return false;
  downloadCsvFile(filename, content);
  return true;
}
