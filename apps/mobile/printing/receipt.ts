import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_RECEIPT_LAYOUT,
  DEFAULT_STORE_SETTINGS,
  RECEIPT_COLUMNS,
  hasCustomerDetails,
  pendingInvoiceLabel,
  roundMoney,
  saleCustomer,
  type LocalSaleWithItems,
  type ProductUnit,
  type ReceiptLayout,
  type StoreSettings,
} from "@double-a/shared-types";
import { getProductUnits } from "@/db/products";
import { getLocalReceiptLayout } from "@/db/receipt-layout";
import { getLocalStoreSettings } from "@/db/store";
import { EscPosBuilder } from "./escpos";
import {
  DEFAULT_PRINTER_SETTINGS,
  transportFor,
  type PrinterSettings,
} from "./transport";

const SETTINGS_KEY = "double-a.printer";

export async function getPrinterSettings(): Promise<PrinterSettings> {
  const stored = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!stored) return DEFAULT_PRINTER_SETTINGS;

  try {
    return {
      ...DEFAULT_PRINTER_SETTINGS,
      ...(JSON.parse(stored) as PrinterSettings),
      // Paper width is office-owned for this shop — never invent 80mm here.
      columns: RECEIPT_COLUMNS,
    };
  } catch {
    return DEFAULT_PRINTER_SETTINGS;
  }
}

export async function savePrinterSettings(settings: PrinterSettings): Promise<void> {
  await AsyncStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ ...settings, columns: RECEIPT_COLUMNS }),
  );
}

function money(value: number): string {
  return roundMoney(value).toFixed(2);
}

/**
 * Builds the receipt bytes from the local sale row — no server data involved.
 * Layout and shop identity come from the last pull; pairing stays in AsyncStorage.
 */
export function buildReceipt(
  sale: LocalSaleWithItems,
  options: {
    columns?: number;
    cashierName?: string;
    units?: Map<string, ProductUnit>;
    layout?: ReceiptLayout;
    store?: StoreSettings;
  },
): Uint8Array {
  const layout = options.layout ?? DEFAULT_RECEIPT_LAYOUT;
  const store = options.store ?? DEFAULT_STORE_SETTINGS;
  const columns = options.columns ?? RECEIPT_COLUMNS;
  const builder = new EscPosBuilder(columns);

  builder.align("center");
  if (layout.showShopName) {
    builder.bold(true).line(store.name).bold(false);
  }
  if (layout.showLogoLine) {
    builder.line("[logo]");
  }
  if (layout.showAddress && store.address) {
    builder.wrapped("", store.address, "");
  }
  if (layout.showPhone && store.phone) {
    builder.line(store.phone);
  }

  builder.line(new Date(sale.createdAt).toLocaleString());
  builder.line(`Receipt ${sale.invoiceNumber ?? pendingInvoiceLabel(store.invoicePrefix)}`);
  if (layout.showCashier && options.cashierName) {
    builder.line(`Cashier: ${options.cashierName}`);
  }
  if (layout.showTerminal && sale.deviceId) {
    builder.line(`Terminal ${sale.deviceId.slice(0, 8)}`);
  }

  builder.align("left").divider();

  const customer = saleCustomer(sale);
  if (layout.showCustomer && hasCustomerDetails(customer)) {
    if (customer.name) builder.wrapped("Customer: ", customer.name);
    if (customer.contact) builder.wrapped("Contact: ", customer.contact);
    if (customer.address) builder.wrapped("Address: ", customer.address);
    builder.divider();
  }

  for (const item of sale.items) {
    const unit = (item.productId ? options.units?.get(item.productId) : null) ?? "pc";
    const sold = `  ${item.quantity} ${unit} @ ${money(item.unitPrice)}`;
    const total = money(item.subtotal);
    const was =
      item.listPrice > item.unitPrice ? ` (was ${money(item.listPrice)})` : "";

    builder.line(item.productName);

    if (was && sold.length + was.length + total.length + 1 > columns) {
      builder.columns(sold, total);
      builder.line(`   was ${money(item.listPrice)}`);
    } else {
      builder.columns(`${sold}${was}`, total);
    }
  }

  builder.ledgerLine();

  if (layout.showDiscounts && sale.discountAmount > 0) {
    builder.columns("DISCOUNT", `-${money(sale.discountAmount)}`);
  }

  builder.bold(true).big(true);
  builder.columns("TOTAL", money(sale.totalAmount));
  builder.big(false).bold(false);

  if (layout.showPayment && sale.paymentMethod) {
    builder.columns("Paid by", sale.paymentMethod.toUpperCase());
  }
  builder.line(`Amounts in PHP`);

  if (layout.showFooter) {
    const footer = store.receiptFooter?.trim() || "Thank you";
    builder.align("center").line().line(footer);
  }

  builder.feed(3).cut();

  return builder.build();
}

/**
 * Prints a receipt from the local sale record.
 *
 * Never awaited by the sale flow and never gated on connectivity — a failed
 * print must not be able to fail a completed sale.
 */
export async function printReceipt(
  sale: LocalSaleWithItems,
  cashierName?: string,
): Promise<void> {
  const productIds = sale.items
    .map((item) => item.productId)
    .filter((id): id is string => id !== null);

  const [settings, units, layout, store] = await Promise.all([
    getPrinterSettings(),
    getProductUnits(productIds),
    getLocalReceiptLayout(),
    getLocalStoreSettings(),
  ]);

  const payload = buildReceipt(sale, {
    columns: RECEIPT_COLUMNS,
    cashierName,
    units,
    layout,
    store,
  });

  await transportFor(settings).send(payload);
}
