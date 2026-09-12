import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { StockTransfer, StoreSettings } from "@double-a/shared-types";
import { formatQuantity } from "@double-a/shared-types";

export interface StockTransferPdfInput {
  transfer: StockTransfer;
  store: StoreSettings;
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.78, 0.78, 0.78);
const ACCENT = rgb(0.08, 0.45, 0.48);

const STATUS_LABEL: Record<string, string> = {
  pending: "Draft",
  in_transit: "In Transit",
  partially_received: "Partially Received",
  received: "Received",
  cancelled: "Cancelled",
};

function formatDisplayDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Portrait stock-transfer document — same pdf-lib approach as purchase-order-pdf.ts. */
export async function stockTransferToPdf(input: StockTransferPdfInput): Promise<Uint8Array> {
  const { transfer, store } = input;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const label = `ST-${transfer.id.slice(0, 8).toUpperCase()}`;
  let y = PAGE_HEIGHT - MARGIN;

  page.drawText(store.name, { x: MARGIN, y, size: 16, font: bold, color: INK });
  page.drawText("STOCK TRANSFER", {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize("STOCK TRANSFER", 18),
    y,
    size: 18,
    font: bold,
    color: ACCENT,
  });
  y -= 20;

  const leftLines = [store.address, store.phone].filter(Boolean) as string[];
  const rightLines = [
    `Transfer # ${label}`,
    `Date  ${formatDisplayDate(transfer.createdAt)}`,
    `Status  ${STATUS_LABEL[transfer.status] ?? transfer.status}`,
  ];
  const headerRows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < headerRows; i += 1) {
    const left = leftLines[i];
    const right = rightLines[i];
    if (left) page.drawText(left, { x: MARGIN, y, size: 9, font, color: MUTED });
    if (right) {
      page.drawText(right, {
        x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(right, 9),
        y,
        size: 9,
        font,
        color: INK,
      });
    }
    y -= 12;
  }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.5, color: ACCENT });
  y -= 24;

  y = drawTwoColumnBlock(
    page,
    bold,
    font,
    y,
    "From",
    [transfer.fromLocationName ?? "—"],
    "To",
    [transfer.toLocationName ?? "—"],
  );
  y -= 20;

  y = drawItemsTable(page, bold, font, y, transfer);
  y -= 12;

  if (transfer.notes) {
    page.drawText("Notes", { x: MARGIN, y, size: 10, font: bold, color: INK });
    y -= 14;
    for (const line of wrapText(stripHtml(transfer.notes), font, 9, CONTENT_WIDTH)) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: MUTED });
      y -= 12;
    }
    y -= 8;
  }

  page.drawText(`Created by  ${transfer.createdByName ?? "—"}`, {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: MUTED,
  });

  page.drawText(store.name, {
    x: MARGIN,
    y: MARGIN - 10,
    size: 8,
    font,
    color: MUTED,
  });

  return doc.save();
}

function drawTwoColumnBlock(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  leftLabel: string,
  leftLines: string[],
  rightLabel: string,
  rightLines: string[],
): number {
  let y = startY;
  const colWidth = CONTENT_WIDTH / 2;

  page.drawText(leftLabel, { x: MARGIN, y, size: 9, font: bold, color: MUTED });
  page.drawText(rightLabel, { x: MARGIN + colWidth, y, size: 9, font: bold, color: MUTED });
  y -= 14;

  const rows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < rows; i += 1) {
    const left = leftLines[i];
    const right = rightLines[i];
    if (left) page.drawText(left, { x: MARGIN, y, size: 10, font, color: INK });
    if (right) page.drawText(right, { x: MARGIN + colWidth, y, size: 10, font, color: INK });
    y -= 14;
  }

  return y;
}

const COLUMNS: { label: string; width: number; align: "left" | "right" }[] = [
  { label: "Item", width: 0.42, align: "left" },
  { label: "SKU", width: 0.18, align: "left" },
  { label: "Transferred", width: 0.15, align: "right" },
  { label: "Received", width: 0.13, align: "right" },
  { label: "Remaining", width: 0.12, align: "right" },
];

function drawItemsTable(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  transfer: StockTransfer,
): number {
  let y = startY;
  const colWidths = COLUMNS.map((c) => c.width * CONTENT_WIDTH);

  let x = MARGIN;
  for (const [i, col] of COLUMNS.entries()) {
    const width = colWidths[i] ?? 0;
    const textX = col.align === "right" ? x + width - bold.widthOfTextAtSize(col.label, 9) : x;
    page.drawText(col.label, { x: textX, y, size: 9, font: bold, color: MUTED });
    x += width;
  }
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: LINE });
  y -= 14;

  for (const item of transfer.items) {
    x = MARGIN;
    const cells = [
      item.productName ?? "Product",
      item.sku ?? "—",
      formatQuantity(item.quantity),
      formatQuantity(item.quantityReceived),
      formatQuantity(item.quantityRemaining),
    ];
    for (const [i, cell] of cells.entries()) {
      const col = COLUMNS[i];
      const width = colWidths[i] ?? 0;
      const textX = col?.align === "right" ? x + width - font.widthOfTextAtSize(cell, 9) : x;
      page.drawText(cell, { x: textX, y, size: 9, font, color: INK });
      x += width;
    }
    y -= 16;
  }

  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 6 }, thickness: 1, color: LINE });

  return y;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  return lines;
}
