import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Product, StoreSettings } from "@double-a/shared-types";
import { roundMoney } from "@double-a/shared-types";
import type {
  InventoryValuationReportRow,
  InventoryValuationSummaryRow,
} from "@double-a/api-client/queries";
import type { ProductStats } from "@double-a/api-client/queries";

export interface InventoryReportPdfInput {
  store: StoreSettings;
  generatedByName: string;
  stats: ProductStats;
  byCategory: InventoryValuationSummaryRow[];
  belowReorder: Product[];
  oversold: Product[];
  valuation: InventoryValuationReportRow[];
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.42, 0.42, 0.42);
const LINE = rgb(0.78, 0.78, 0.78);
const ACCENT = rgb(0.08, 0.45, 0.48);
const BAND = rgb(0.94, 0.96, 0.96);

/** Same WinAnsi workaround as sales-report-pdf.ts / purchase-order-pdf.ts — "₱" has no glyph in the standard 14 fonts. */
function pdfMoney(value: number): string {
  return `PHP ${roundMoney(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

function ensureRoom(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN) newPage(ctx);
}

function sectionTitle(ctx: Ctx, title: string): void {
  ensureRoom(ctx, 30);
  ctx.y -= 6;
  ctx.page.drawText(title, { x: MARGIN, y: ctx.y, size: 11, font: ctx.bold, color: ACCENT });
  ctx.y -= 6;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 0.75,
    color: LINE,
  });
  ctx.y -= 16;
}

function drawStatRow(ctx: Ctx, label: string, value: string, emphasize = false): void {
  ensureRoom(ctx, 16);
  ctx.page.drawText(label, { x: MARGIN, y: ctx.y, size: emphasize ? 10 : 9.5, font: emphasize ? ctx.bold : ctx.font, color: emphasize ? INK : MUTED });
  const valueFont = emphasize ? ctx.bold : ctx.font;
  const size = emphasize ? 10 : 9.5;
  ctx.page.drawText(value, {
    x: PAGE_WIDTH - MARGIN - valueFont.widthOfTextAtSize(value, size),
    y: ctx.y,
    size,
    font: valueFont,
    color: INK,
  });
  ctx.y -= emphasize ? 16 : 14;
}

interface Col {
  label: string;
  width: number;
  align: "left" | "right";
}

function drawTable(ctx: Ctx, columns: Col[], rows: string[][]): void {
  const colWidths = columns.map((c) => c.width * CONTENT_WIDTH);

  function header(): void {
    ensureRoom(ctx, 26);
    let x = MARGIN;
    for (const [i, col] of columns.entries()) {
      const width = colWidths[i] ?? 0;
      const textX = col.align === "right" ? x + width - ctx.bold.widthOfTextAtSize(col.label, 8) : x;
      ctx.page.drawText(col.label, { x: textX, y: ctx.y, size: 8, font: ctx.bold, color: MUTED });
      x += width;
    }
    ctx.y -= 8;
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_WIDTH - MARGIN, y: ctx.y }, thickness: 0.75, color: LINE });
    ctx.y -= 13;
  }

  header();

  rows.forEach((row, index) => {
    if (ctx.y - 14 < MARGIN) {
      newPage(ctx);
      header();
    }
    if (index % 2 === 1) {
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 3, width: CONTENT_WIDTH, height: 13, color: BAND });
    }
    let x = MARGIN;
    for (const [i, cell] of row.entries()) {
      const col = columns[i];
      const width = colWidths[i] ?? 0;
      if (!col) continue;
      const textX = col.align === "right" ? x + width - ctx.font.widthOfTextAtSize(cell, 9) : x;
      ctx.page.drawText(cell, { x: textX, y: ctx.y, size: 9, font: ctx.font, color: INK });
      x += width;
    }
    ctx.y -= 14;
  });

  ctx.y -= 6;
}

function emptyNote(ctx: Ctx, text: string): void {
  ensureRoom(ctx, 16);
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size: 9, font: ctx.font, color: MUTED });
  ctx.y -= 18;
}

/**
 * One universal Inventory Report — a snapshot of what's on the shelves right
 * now (no date range, same as reportInventoryValuation() itself), rendered
 * as one printable document. Reuses the same endpoints already built for the
 * Inventory page's stat cards and CSV export
 * (packages/api-client/src/queries/{products,reports}.ts) — no new
 * backend/aggregation logic. Same pdf-lib layout helpers as
 * sales-report-pdf.ts.
 */
export async function inventoryReportToPdf(input: InventoryReportPdfInput): Promise<Uint8Array> {
  const { store, generatedByName, stats, byCategory, belowReorder, oversold, valuation } = input;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN };

  // Header
  ctx.page.drawText(store.name, { x: MARGIN, y: ctx.y, size: 16, font: bold, color: INK });
  ctx.page.drawText("INVENTORY REPORT", {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize("INVENTORY REPORT", 18),
    y: ctx.y,
    size: 18,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 20;

  const leftLines = [store.address, store.phone].filter(Boolean) as string[];
  const now = new Date();
  const rightLines = [
    `As of: ${now.toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })}`,
    `Generated by: ${generatedByName}`,
  ];
  const headerRows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < headerRows; i += 1) {
    const left = leftLines[i];
    const right = rightLines[i];
    if (left) ctx.page.drawText(left, { x: MARGIN, y: ctx.y, size: 9, font, color: MUTED });
    if (right) {
      ctx.page.drawText(right, {
        x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(right, 9),
        y: ctx.y,
        size: 9,
        font,
        color: INK,
      });
    }
    ctx.y -= 12;
  }
  ctx.y -= 6;
  ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_WIDTH - MARGIN, y: ctx.y }, thickness: 1.5, color: ACCENT });
  ctx.y -= 22;

  // Stock Summary — same figures as the Inventory page's own stat cards.
  sectionTitle(ctx, "STOCK SUMMARY");
  drawStatRow(ctx, "Products Tracked", String(stats.tracked));
  drawStatRow(ctx, "Stock at Cost", pdfMoney(stats.stockCost), true);
  ctx.y -= 4;
  drawStatRow(ctx, "Needs Reordering", String(stats.needsReordering));
  drawStatRow(ctx, "Low Stock", String(stats.lowStock));
  drawStatRow(ctx, "Out of Stock", String(stats.outOfStock));
  drawStatRow(ctx, "Oversold", String(stats.oversold));
  drawStatRow(ctx, "Hidden from Terminals", String(stats.hidden));
  ctx.y -= 10;

  // Stock Value by Category
  sectionTitle(ctx, "STOCK VALUE BY CATEGORY");
  if (byCategory.length === 0) {
    emptyNote(ctx, "No tracked stock yet.");
  } else {
    const totalCost = byCategory.reduce((sum, row) => sum + row.costValue, 0);
    drawTable(
      ctx,
      [
        { label: "Category", width: 0.4, align: "left" },
        { label: "Units", width: 0.15, align: "right" },
        { label: "Cost Value", width: 0.225, align: "right" },
        { label: "Retail Value", width: 0.225, align: "right" },
      ],
      byCategory.map((row) => [
        row.category,
        String(row.stockQuantity),
        pdfMoney(row.costValue),
        pdfMoney(row.retailValue),
      ]),
    );
    ensureRoom(ctx, 14);
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 4 }, end: { x: PAGE_WIDTH - MARGIN, y: ctx.y + 4 }, thickness: 0.75, color: LINE });
    drawStatRow(ctx, "Total Cost Value", pdfMoney(totalCost), true);
  }
  ctx.y -= 6;

  // Needs Reordering
  sectionTitle(ctx, "NEEDS REORDERING");
  if (belowReorder.length === 0) {
    emptyNote(ctx, "Every product is above its reorder point.");
  } else {
    drawTable(
      ctx,
      [
        { label: "Product", width: 0.45, align: "left" },
        { label: "SKU", width: 0.2, align: "left" },
        { label: "Stock", width: 0.175, align: "right" },
        { label: "Reorder At", width: 0.175, align: "right" },
      ],
      belowReorder.map((product) => [
        product.name,
        product.sku ?? "—",
        String(product.stockQuantity),
        String(product.reorderPoint),
      ]),
    );
  }
  ctx.y -= 6;

  // Oversold
  if (oversold.length > 0) {
    sectionTitle(ctx, "OVERSOLD");
    drawTable(
      ctx,
      [
        { label: "Product", width: 0.55, align: "left" },
        { label: "SKU", width: 0.25, align: "left" },
        { label: "Stock", width: 0.2, align: "right" },
      ],
      oversold.map((product) => [product.name, product.sku ?? "—", String(product.stockQuantity)]),
    );
    ctx.y -= 6;
  }

  // Stock on Hand — the full per-product valuation, same rows the CSV export
  // (/api/export/valuation) gives, just printable.
  sectionTitle(ctx, "STOCK ON HAND");
  if (valuation.length === 0) {
    emptyNote(ctx, "No tracked stock yet.");
  } else {
    drawTable(
      ctx,
      [
        { label: "Product", width: 0.32, align: "left" },
        { label: "SKU", width: 0.16, align: "left" },
        { label: "Category", width: 0.18, align: "left" },
        { label: "Stock", width: 0.1, align: "right" },
        { label: "Cost Value", width: 0.12, align: "right" },
        { label: "Retail Value", width: 0.12, align: "right" },
      ],
      valuation.map((row) => [
        row.product_name,
        row.sku ?? "—",
        row.category ?? "—",
        String(row.stock_quantity),
        pdfMoney(row.cost_value),
        pdfMoney(row.retail_value),
      ]),
    );
  }

  ctx.page.drawText(store.name, { x: MARGIN, y: MARGIN - 10, size: 8, font, color: MUTED });

  return doc.save();
}
