import type { ExtractedProductLine } from "@double-a/api-client/queries";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatNumber(value: number | null): string {
  if (value === null) return "";
  return String(value);
}

/** Canonical import headers — auto-maps on the next wizard step. */
const PHOTO_CSV_HEADERS = [
  "name",
  "sku",
  "price",
  "cost_price",
  "unit",
  "barcode",
  "stock_quantity",
  "description",
] as const;

/** Vision lines from `/products/extract-from-photo` into import-ready CSV text. */
export function extractedLinesToCsv(lines: ExtractedProductLine[]): string {
  const headerLine = PHOTO_CSV_HEADERS.join(",");
  const dataLines = lines.map((line) =>
    [
      line.name,
      line.sku ?? "",
      formatNumber(line.price),
      formatNumber(line.costPrice),
      line.unit || "pc",
      line.barcode ?? "",
      formatNumber(line.quantity),
      line.description ?? "",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [headerLine, ...dataLines].join("\n");
}

export function describePhotoExtractError(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 429) {
      return "OpenAI is busy. Wait about a minute, then try again.";
    }
    if (status === 402) {
      return "OpenAI has no credits left. Check billing or the API key on the server.";
    }
    if (status === 403 && "message" in error) {
      return String((error as { message: string }).message);
    }
  }
  return error instanceof Error
    ? `Could not read the photo: ${error.message}`
    : "Could not read the photo. Try again.";
}
