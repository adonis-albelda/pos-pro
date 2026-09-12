import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { StoreSettings } from "@double-a/shared-types";
import { roundMoney } from "@double-a/shared-types";
import {
  summariseProfit,
  type CashierReportRow,
  type CategoryReportRow,
  type DeviceReportRow,
  type LocationReportRow,
  type PaymentMethodReportRow,
  type ProfitReportRow,
  type RefundsVoidsReportRow,
  type TopProductReportRow,
} from "@double-a/api-client/queries";

export interface SalesReportPdfInput {
  store: StoreSettings;
  fromLabel: string;
  toLabel: string;
  generatedByName: string;
  profit: ProfitReportRow[];
  topProducts: TopProductReportRow[];
  categories: CategoryReportRow[];
  paymentMethods: PaymentMethodReportRow[];
  byLocation: LocationReportRow[];
  byCashier: CashierReportRow[];
  byDevice: DeviceReportRow[];
  refundsVoids: RefundsVoidsReportRow;
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  ewallet: "E-wallet",
  card: "Card",
  credit: "Credit",
  other: "Other",
};

/** Same WinAnsi workaround as purchase-order-pdf.ts / stock-transfer-pdf.ts — "₱" has no glyph in the standard 14 fonts. */
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

/** label/value rows, two per line — used for the Sales Summary block. */
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
 * One universal Sales Report — every breakdown section already built for the
 * Sales Dashboard (packages/api-client/src/queries/reports.ts), rendered as
 * one printable document instead of separate location/terminal/cashier
 * reports. Date-range scoped only; see route.ts for why.
 */
export async function salesReportToPdf(input: SalesReportPdfInput): Promise<Uint8Array> {
  const {
    store,
    fromLabel,
    toLabel,
    generatedByName,
    profit,
    topProducts,
    categories,
    paymentMethods,
    byLocation,
    byCashier,
    byDevice,
    refundsVoids,
  } = input;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold, page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN };

  // Header
  ctx.page.drawText(store.name, { x: MARGIN, y: ctx.y, size: 16, font: bold, color: INK });
  ctx.page.drawText("SALES REPORT", {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize("SALES REPORT", 18),
    y: ctx.y,
    size: 18,
    font: bold,
    color: ACCENT,
  });
  ctx.y -= 20;

  const leftLines = [store.address, store.phone].filter(Boolean) as string[];
  const now = new Date();
  const rightLines = [
    `Date: ${fromLabel} – ${toLabel}`,
    `Generated: ${now.toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })}`,
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

  // Sales Summary — reuses summariseProfit(), same helper the Sales Dashboard uses.
  const summary = summariseProfit(profit);
  const netSales = summary.revenue - refundsVoids.refund_amount;
  const averageOrder = summary.salesCount > 0 ? summary.revenue / summary.salesCount : 0;

  sectionTitle(ctx, "SALES SUMMARY");
  drawStatRow(ctx, "Gross Sales", pdfMoney(summary.revenue));
  drawStatRow(ctx, "Discounts", pdfMoney(summary.discount));
  drawStatRow(ctx, "Refunds", pdfMoney(refundsVoids.refund_amount));
  drawStatRow(ctx, "Net Sales", pdfMoney(netSales), true);
  ctx.y -= 4;
  drawStatRow(ctx, "Transactions", String(summary.salesCount));
  drawStatRow(ctx, "Items Sold", String(summary.itemsSold));
  drawStatRow(ctx, "Average Order Value", pdfMoney(averageOrder));
  ctx.y -= 10;

  // Payment Summary
  sectionTitle(ctx, "PAYMENT SUMMARY");
  if (paymentMethods.length === 0) {
    emptyNote(ctx, "No completed sales in this period.");
  } else {
    const total = paymentMethods.reduce((sum, row) => sum + Number(row.revenue), 0);
    drawTable(
      ctx,
      [
        { label: "Method", width: 0.6, align: "left" },
        { label: "Sales", width: 0.4, align: "right" },
      ],
      paymentMethods.map((row) => [
        PAYMENT_METHOD_LABELS[row.payment_method] ?? row.payment_method,
        pdfMoney(row.revenue),
      ]),
    );
    ensureRoom(ctx, 14);
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 4 }, end: { x: PAGE_WIDTH - MARGIN, y: ctx.y + 4 }, thickness: 0.75, color: LINE });
    drawStatRow(ctx, "Total", pdfMoney(total), true);
  }
  ctx.y -= 6;

  // Category breakdown
  sectionTitle(ctx, "CATEGORY SALES");
  if (categories.length === 0) {
    emptyNote(ctx, "No completed sales in this period.");
  } else {
    drawTable(
      ctx,
      [
        { label: "Category", width: 0.5, align: "left" },
        { label: "Items", width: 0.2, align: "right" },
        { label: "Sales", width: 0.3, align: "right" },
      ],
      categories.map((row) => [row.category, String(row.quantity_sold), pdfMoney(row.revenue)]),
    );
  }
  ctx.y -= 6;

  // Top-selling items — POSPro sells at the variant level, so product_name here is the sellable variant's name (product_variants.name via sale_items.product_name snapshot).
  sectionTitle(ctx, "TOP SELLING ITEMS");
  if (topProducts.length === 0) {
    emptyNote(ctx, "No completed sales in this period.");
  } else {
    drawTable(
      ctx,
      [
        { label: "Item", width: 0.55, align: "left" },
        { label: "Qty", width: 0.15, align: "right" },
        { label: "Sales", width: 0.3, align: "right" },
      ],
      topProducts.map((row) => [row.product_name, String(row.quantity_sold), pdfMoney(row.revenue)]),
    );
  }
  ctx.y -= 6;

  // Sales by Location
  if (byLocation.length > 1) {
    sectionTitle(ctx, "SALES BY LOCATION");
    drawTable(
      ctx,
      [
        { label: "Location", width: 0.4, align: "left" },
        { label: "Transactions", width: 0.3, align: "right" },
        { label: "Sales", width: 0.3, align: "right" },
      ],
      byLocation.map((row) => [row.location_name, String(row.sales_count), pdfMoney(row.revenue)]),
    );
    ctx.y -= 6;
  }

  // Sales by Cashier
  sectionTitle(ctx, "SALES BY CASHIER");
  if (byCashier.length === 0) {
    emptyNote(ctx, "No completed sales in this period.");
  } else {
    drawTable(
      ctx,
      [
        { label: "Cashier", width: 0.4, align: "left" },
        { label: "Transactions", width: 0.3, align: "right" },
        { label: "Sales", width: 0.3, align: "right" },
      ],
      byCashier.map((row) => [row.cashier_name, String(row.sales_count), pdfMoney(row.revenue)]),
    );
    ctx.y -= 6;
  }

  // Sales by Terminal/Device
  if (byDevice.length > 1) {
    sectionTitle(ctx, "SALES BY TERMINAL");
    drawTable(
      ctx,
      [
        { label: "Terminal", width: 0.5, align: "left" },
        { label: "Transactions", width: 0.25, align: "right" },
        { label: "Sales", width: 0.25, align: "right" },
      ],
      byDevice.map((row) => [row.device_id, String(row.sales_count), pdfMoney(row.revenue)]),
    );
    ctx.y -= 6;
  }

  // Refunds & Voids — reuses the same refund/void figures as the Sales Dashboard; no cash reconciliation here (CLAUDE.md, spec §8/§15 — that stays with Cash Flow / Terminal Closing).
  sectionTitle(ctx, "ADJUSTMENTS");
  drawStatRow(ctx, `Refunds: ${refundsVoids.refund_count}`, pdfMoney(refundsVoids.refund_amount));
  drawStatRow(ctx, `Voids: ${refundsVoids.void_count}`, "—");

  ctx.page.drawText(store.name, { x: MARGIN, y: MARGIN - 10, size: 8, font, color: MUTED });

  return doc.save();
}
