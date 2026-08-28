import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PurchaseOrderWithLines } from "@double-a/api-client/queries";
import type { StoreSettings, Supplier } from "@double-a/shared-types";
import {
  formatMoney,
  formatQuantity,
  purchaseOrderBalance,
} from "@double-a/shared-types";

export interface PurchaseOrderPdfInput {
  order: PurchaseOrderWithLines;
  supplier: Supplier | null;
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

/** Portrait purchase-order document for emailing or printing. */
export async function purchaseOrderToPdf(input: PurchaseOrderPdfInput): Promise<Uint8Array> {
  const { order, supplier, store } = input;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const poLabel = order.referenceNo?.trim() || order.id.slice(0, 8).toUpperCase();

  y = drawHeader(page, bold, font, store, poLabel, order.orderDate, order.expectedDate, y);

  y -= 18;
  y = drawTwoColumnBlock(
    page,
    bold,
    font,
    y,
    "Vendor",
    supplierBlock(supplier),
    "Ship to",
    storeBlock(store),
  );

  y -= 20;
  y = drawLineItemsTable(page, bold, font, order, y, () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN - 24;
    drawTableHeader(page, bold, y);
    return { page, y: y - 18 };
  });

  y -= 8;
  y = drawTotals(page, bold, font, order.totalAmount, y);

  if (order.payments.length > 0) {
    y -= 22;
    y = drawPaymentTerms(page, bold, font, order, y, () => {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      return { page, y: PAGE_HEIGHT - MARGIN };
    });
  }

  if (order.notes?.trim()) {
    y -= 22;
    y = drawNotes(page, bold, font, order.notes.trim(), y);
  }

  if (order.status === "draft") {
    drawDraftWatermark(page, bold);
  }

  drawFooter(page, font, store.name);

  return doc.save();
}

function drawHeader(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  store: StoreSettings,
  poNumber: string,
  orderDate: string,
  expectedDate: string | null,
  startY: number,
): number {
  let y = startY;

  page.drawText(store.name, {
    x: MARGIN,
    y,
    size: 16,
    font: bold,
    color: INK,
  });

  page.drawText("PURCHASE ORDER", {
    x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize("PURCHASE ORDER", 18),
    y,
    size: 18,
    font: bold,
    color: ACCENT,
  });

  y -= 20;

  const leftLines = [store.address, store.phone].filter(Boolean) as string[];
  const rightLines = [
    `PO # ${poNumber}`,
    `Order date  ${formatDisplayDate(orderDate)}`,
    expectedDate ? `Expected by  ${formatDisplayDate(expectedDate)}` : null,
  ].filter(Boolean) as string[];

  const rows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < rows; i += 1) {
    const left = leftLines[i];
    const right = rightLines[i];
    if (left) {
      page.drawText(left, { x: MARGIN, y, size: 9, font, color: MUTED });
    }
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
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1.5,
    color: ACCENT,
  });

  return y;
}

function drawTwoColumnBlock(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  startY: number,
  leftTitle: string,
  leftLines: string[],
  rightTitle: string,
  rightLines: string[],
): number {
  const colGap = 24;
  const colWidth = (CONTENT_WIDTH - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colWidth + colGap;

  let y = startY;

  page.drawText(leftTitle.toUpperCase(), {
    x: leftX,
    y,
    size: 8,
    font: bold,
    color: MUTED,
  });
  page.drawText(rightTitle.toUpperCase(), {
    x: rightX,
    y,
    size: 8,
    font: bold,
    color: MUTED,
  });

  y -= 14;

  const rows = Math.max(leftLines.length, rightLines.length, 1);
  for (let i = 0; i < rows; i += 1) {
    const left = leftLines[i] ?? "";
    const right = rightLines[i] ?? "";
    if (left) {
      page.drawText(clip(left, colWidth, i === 0 ? bold : font, i === 0 ? 10 : 9), {
        x: leftX,
        y,
        size: i === 0 ? 10 : 9,
        font: i === 0 ? bold : font,
        color: INK,
      });
    }
    if (right) {
      page.drawText(clip(right, colWidth, i === 0 ? bold : font, i === 0 ? 10 : 9), {
        x: rightX,
        y,
        size: i === 0 ? 10 : 9,
        font: i === 0 ? bold : font,
        color: INK,
      });
    }
    y -= i === 0 ? 14 : 12;
  }

  return y;
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number): void {
  const cols = lineItemColumns();
  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: CONTENT_WIDTH,
    height: 18,
    color: rgb(0.94, 0.96, 0.96),
  });

  let x = MARGIN + 6;
  for (const col of cols) {
    const label = col.label.toUpperCase();
    const textX = col.align === "right" ? x + col.width - bold.widthOfTextAtSize(label, 8) - 4 : x;
    page.drawText(label, {
      x: textX,
      y,
      size: 8,
      font: bold,
      color: MUTED,
    });
    x += col.width;
  }

  page.drawLine({
    start: { x: MARGIN, y: y - 6 },
    end: { x: PAGE_WIDTH - MARGIN, y: y - 6 },
    thickness: 0.5,
    color: LINE,
  });
}

function drawLineItemsTable(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  order: PurchaseOrderWithLines,
  startY: number,
  newPage: () => { page: PDFPage; y: number },
): number {
  let currentPage = page;
  let y = startY;

  drawTableHeader(currentPage, bold, y);
  y -= 22;

  const cols = lineItemColumns();
  const rowHeight = 16;

  order.items.forEach((item, index) => {
    if (y < MARGIN + 120) {
      const next = newPage();
      currentPage = next.page;
      y = next.y;
    }

    if (index % 2 === 1) {
      currentPage.drawRectangle({
        x: MARGIN,
        y: y - 3,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: rgb(0.98, 0.98, 0.98),
      });
    }

    let x = MARGIN + 6;
    const values = [
      String(index + 1),
      item.note?.trim() ? `${item.productName} (${item.note.trim()})` : item.productName,
      formatQuantity(item.quantityOrdered),
      formatMoney(item.unitCost),
      formatMoney(item.lineTotal),
    ];

    for (let c = 0; c < cols.length; c += 1) {
      const col = cols[c]!;
      const value = values[c] ?? "";
      const size = c === 1 ? 9 : 9;
      const activeFont = c === 4 ? bold : font;
      const text = clip(value, col.width - 8, activeFont, size);
      const textX =
        col.align === "right"
          ? x + col.width - activeFont.widthOfTextAtSize(text, size) - 4
          : x;
      currentPage.drawText(text, {
        x: textX,
        y,
        size,
        font: activeFont,
        color: INK,
      });
      x += col.width;
    }

    y -= rowHeight;
  });

  currentPage.drawLine({
    start: { x: MARGIN, y: y + 6 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 6 },
    thickness: 0.5,
    color: LINE,
  });

  return y;
}

function drawTotals(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  totalAmount: number,
  startY: number,
): number {
  const labelX = PAGE_WIDTH - MARGIN - 180;
  const valueX = PAGE_WIDTH - MARGIN;
  let y = startY;

  const totalLabel = "TOTAL";
  const totalValue = formatMoney(totalAmount);
  y -= 10;

  page.drawText(totalLabel, {
    x: labelX,
    y,
    size: 10,
    font: bold,
    color: INK,
  });
  page.drawText(totalValue, {
    x: valueX - bold.widthOfTextAtSize(totalValue, 12),
    y,
    size: 12,
    font: bold,
    color: INK,
  });

  return y;
}

function drawPaymentTerms(
  page: PDFPage,
  bold: PDFFont,
  font: PDFFont,
  order: PurchaseOrderWithLines,
  startY: number,
  newPage: () => { page: PDFPage; y: number },
): number {
  let currentPage = page;
  let y = startY;

  currentPage.drawText("PAYMENT TERMS", {
    x: MARGIN,
    y,
    size: 8,
    font: bold,
    color: MUTED,
  });
  y -= 16;

  const terms = order.payments.slice().sort((a, b) => a.termNumber - b.termNumber);
  for (const term of terms) {
    if (y < MARGIN + 40) {
      const next = newPage();
      currentPage = next.page;
      y = next.y;
    }

    const due = term.dueDate ? formatDisplayDate(term.dueDate) : "On receipt";
    const line = `Term ${term.termNumber} — due ${due} — ${formatMoney(term.amount)}`;
    currentPage.drawText(line, { x: MARGIN, y, size: 9, font, color: INK });
    y -= 12;
  }

  const balance = purchaseOrderBalance(order.payments);
  if (balance > 0) {
    currentPage.drawText(`Balance outstanding: ${formatMoney(balance)}`, {
      x: MARGIN,
      y: y - 2,
      size: 9,
      font: bold,
      color: INK,
    });
    y -= 14;
  }

  return y;
}

function drawNotes(page: PDFPage, bold: PDFFont, font: PDFFont, notes: string, startY: number): number {
  let y = startY;

  page.drawText("NOTES", {
    x: MARGIN,
    y,
    size: 8,
    font: bold,
    color: MUTED,
  });
  y -= 14;

  for (const paragraph of wrapText(notes, font, 9, CONTENT_WIDTH)) {
    page.drawText(paragraph, { x: MARGIN, y, size: 9, font, color: INK });
    y -= 12;
  }

  return y;
}

function drawDraftWatermark(page: PDFPage, bold: PDFFont): void {
  const label = "DRAFT";
  const size = 48;
  page.drawText(label, {
    x: PAGE_WIDTH / 2 - bold.widthOfTextAtSize(label, size) / 2,
    y: PAGE_HEIGHT / 2,
    size,
    font: bold,
    color: rgb(0.9, 0.9, 0.9),
    rotate: degrees(35),
  });
}

function drawFooter(page: PDFPage, font: PDFFont, storeName: string): void {
  const line = `Please confirm receipt of this purchase order. — ${storeName}`;
  page.drawText(clip(line, CONTENT_WIDTH, font, 8), {
    x: MARGIN,
    y: MARGIN - 12,
    size: 8,
    font,
    color: MUTED,
  });
}

function supplierBlock(supplier: Supplier | null): string[] {
  if (!supplier) return ["Supplier not found"];
  return [
    supplier.name,
    supplier.contactPerson ? `Attn: ${supplier.contactPerson}` : "",
    supplier.address ?? "",
    [supplier.phone, supplier.email].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

function storeBlock(store: StoreSettings): string[] {
  return [store.name, store.address ?? "", store.phone ?? ""].filter(Boolean);
}

function lineItemColumns(): { label: string; width: number; align: "left" | "right" }[] {
  const numWidth = 28;
  const qtyWidth = 52;
  const moneyWidth = 78;
  const descWidth = CONTENT_WIDTH - numWidth - qtyWidth - moneyWidth * 2;
  return [
    { label: "#", width: numWidth, align: "left" },
    { label: "Description", width: descWidth, align: "left" },
    { label: "Qty", width: qtyWidth, align: "right" },
    { label: "Unit cost", width: moneyWidth, align: "right" },
    { label: "Amount", width: moneyWidth, align: "right" },
  ];
}

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Date(year, month - 1, day).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = words[0] ?? "";

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i] ?? "";
    }
  }
  lines.push(current);
  return lines;
}

function clip(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let end = text.length;
  while (end > 1) {
    end -= 1;
    const candidate = `${text.slice(0, end)}…`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) return candidate;
  }
  return "…";
}
