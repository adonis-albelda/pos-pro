import { roundMoney } from "./money";
import {
  DEFAULT_RECEIPT_LAYOUT,
  DEFAULT_STORE_SETTINGS,
  RECEIPT_COLUMNS,
  type ReceiptLayout,
  type StoreSettings,
} from "./domain";

/**
 * Plain data a receipt needs — enough for the admin preview and for the POS
 * builder without dragging Sale / SaleItem types into a layout form.
 */
export interface ReceiptPreviewSale {
  id: string;
  createdAt: string;
  totalAmount: number;
  discountAmount: number;
  paymentMethod: string | null;
  deviceId: string | null;
  cashierName: string | null;
  customerName: string | null;
  customerContact: string | null;
  customerAddress: string | null;
  items: {
    productName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    listPrice: number;
    subtotal: number;
  }[];
}

/** Sample sale so the owner can see paper output without a real order. */
export const SAMPLE_RECEIPT_SALE: ReceiptPreviewSale = {
  id: "a1b2c3d4-0000-4000-8000-000000000001",
  createdAt: "2026-08-07T10:15:00+08:00",
  totalAmount: 485.5,
  discountAmount: 14.5,
  paymentMethod: "cash",
  deviceId: "term-01",
  cashierName: "Maria",
  customerName: "Juan Dela Cruz",
  customerContact: "09171234567",
  customerAddress: "123 Mabini St, Quezon City",
  items: [
    {
      productName: "PVC Pipe 1/2\" x 10ft",
      quantity: 2,
      unit: "pc",
      unitPrice: 185,
      listPrice: 185,
      subtotal: 370,
    },
    {
      productName: "Elbow 1/2\"",
      quantity: 4,
      unit: "pc",
      unitPrice: 32.5,
      listPrice: 35,
      subtotal: 130,
    },
  ],
};

function money(value: number): string {
  return roundMoney(value).toFixed(2);
}

function padColumns(label: string, value: string, columns: number): string {
  const room = columns - value.length;
  const trimmed = label.length > room ? label.slice(0, Math.max(0, room - 1)) : label;
  const gap = " ".repeat(Math.max(1, room - trimmed.length));
  return `${trimmed}${gap}${value}`;
}

function divider(columns: number, character = "-"): string {
  return character.repeat(columns);
}

/**
 * Renders the receipt as plain text lines at the PT-210 column width.
 * Admin preview and the mobile ESC/POS builder both read from this shape so
 * what the owner toggles is what the printer actually prints.
 */
export function formatReceiptLines(
  sale: ReceiptPreviewSale,
  options: {
    layout?: ReceiptLayout;
    store?: StoreSettings;
    /** A custom receipt template's own heading — e.g. "ORDER RECEIPT" for a Kitchen Order slip. Printed before everything else. */
    title?: string | null;
    description?: string | null;
  } = {},
): string[] {
  const layout = options.layout ?? DEFAULT_RECEIPT_LAYOUT;
  const store = options.store ?? DEFAULT_STORE_SETTINGS;
  const columns = RECEIPT_COLUMNS;
  const lines: string[] = [];

  const pushCentered = (value: string) => {
    const trimmed = value.slice(0, columns);
    const pad = Math.max(0, Math.floor((columns - trimmed.length) / 2));
    lines.push(`${" ".repeat(pad)}${trimmed}`);
  };

  if (options.title) {
    pushCentered(options.title.toUpperCase());
  }
  if (options.description) {
    for (const part of wrapWords(options.description, columns)) pushCentered(part);
  }
  if (options.title || options.description) {
    lines.push(divider(columns));
  }

  if (layout.showShopName) {
    pushCentered(store.name);
  }
  if (layout.showLogoLine) {
    pushCentered("[logo]");
  }
  if (layout.showAddress && store.address) {
    for (const part of wrapWords(store.address, columns)) pushCentered(part);
  }
  if (layout.showPhone && store.phone) {
    pushCentered(store.phone);
  }

  lines.push(new Date(sale.createdAt).toLocaleString());
  lines.push(`Receipt ${sale.id.slice(0, 8).toUpperCase()}`);
  if (layout.showCashier && sale.cashierName) {
    lines.push(`Cashier: ${sale.cashierName}`);
  }
  if (layout.showTerminal && sale.deviceId) {
    lines.push(`Terminal ${sale.deviceId.slice(0, 8)}`);
  }

  lines.push(divider(columns));

  const hasCustomer = Boolean(
    sale.customerName || sale.customerContact || sale.customerAddress,
  );
  if (layout.showCustomer && hasCustomer) {
    if (sale.customerName) lines.push(...wrapLabeled("Customer: ", sale.customerName, columns));
    if (sale.customerContact) {
      lines.push(...wrapLabeled("Contact: ", sale.customerContact, columns));
    }
    if (sale.customerAddress) {
      lines.push(...wrapLabeled("Address: ", sale.customerAddress, columns));
    }
    lines.push(divider(columns));
  }

  for (const item of sale.items) {
    lines.push(item.productName.slice(0, columns));
    const sold = `  ${item.quantity} ${item.unit} @ ${money(item.unitPrice)}`;
    const total = money(item.subtotal);
    const was =
      item.listPrice > item.unitPrice ? ` (was ${money(item.listPrice)})` : "";

    if (was && sold.length + was.length + total.length + 1 > columns) {
      lines.push(padColumns(sold, total, columns));
      lines.push(`   was ${money(item.listPrice)}`);
    } else {
      lines.push(padColumns(`${sold}${was}`, total, columns));
    }
  }

  lines.push(divider(columns, "- "));

  if (layout.showDiscounts && sale.discountAmount > 0) {
    lines.push(padColumns("DISCOUNT", `-${money(sale.discountAmount)}`, columns));
  }

  lines.push(padColumns("TOTAL", money(sale.totalAmount), columns));

  if (layout.showPayment && sale.paymentMethod) {
    lines.push(padColumns("Paid by", sale.paymentMethod.toUpperCase(), columns));
  }
  lines.push("Amounts in PHP");

  if (layout.showFooter) {
    lines.push("");
    const footer = store.receiptFooter?.trim() || "Thank you";
    for (const part of wrapWords(footer, columns)) pushCentered(part);
  }

  return lines;
}

/** One string the admin preview paints inside a 58mm paper frame. */
export function formatReceiptPreview(
  sale: ReceiptPreviewSale = SAMPLE_RECEIPT_SALE,
  options: {
    layout?: ReceiptLayout;
    store?: StoreSettings;
    title?: string | null;
    description?: string | null;
  } = {},
): string {
  return formatReceiptLines(sale, options).join("\n");
}

function wrapWords(value: string, columns: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word.slice(0, columns);
      continue;
    }
    if (current.length + 1 + word.length <= columns) {
      current = `${current} ${word}`;
    } else {
      out.push(current);
      current = word.slice(0, columns);
    }
  }
  if (current) out.push(current);
  return out;
}

function wrapLabeled(label: string, value: string, columns: number): string[] {
  const indent = "  ";
  const room = Math.max(columns - indent.length, 8);
  const out: string[] = [];
  let current = label;

  for (const word of value.split(/\s+/).filter(Boolean)) {
    if (!current) {
      current = indent + word.slice(0, room);
      continue;
    }
    if (current.length + 1 + word.length <= columns) {
      current = `${current} ${word}`;
    } else {
      out.push(current);
      current = indent + word.slice(0, room);
    }
  }
  if (current) out.push(current);
  return out;
}
