/**
 * The domain shapes both apps agree on.
 *
 * Mobile writes the same `sales` and `sale_items` rows that admin reads for
 * reporting, so these live here rather than being declared twice.
 */

import { roundMoney } from "./money";

export type UserRole = "cashier" | "admin" | "device" | "superadmin";
export type PaymentMethod = "cash" | "gcash" | "card" | "other" | "credit";
export type SaleStatus = "completed" | "voided" | "refunded";
/** How the customer takes the goods. Default pickup — delivery is opt-in. */
export type Fulfillment = "pickup" | "delivery";

/**
 * Cash is settled at the counter. GCash / card / other wait on a later
 * confirmation that the payment actually landed.
 */
export function isPaidByDefault(method: PaymentMethod): boolean {
  return method === "cash";
}

/**
 * Credit is meaningless without knowing who owes — a credit sale needs a
 * real customer attached. Checked the same way finishSale() itself decides
 * whether a customer is attached (hasCustomerDetails), not customerId alone
 * — a customer just typed in at the counter has no id yet (one is minted
 * only at save time), so gating on customerId would reject a brand-new
 * customer that was never picked from the dropdown.
 */
export function requiresCustomerForPayment(method: PaymentMethod, customer: CustomerDetails): boolean {
  return method === "credit" && !hasCustomerDetails(customer);
}
export type InventoryReason =
  | "sale"
  | "restock"
  | "adjustment"
  | "oversell_correction"
  | "void_restore"
  | "replace_restore"
  | "transfer_out"
  | "transfer_in";

/** Local-only. Never sent to Supabase — it describes a row's push state. */
export type SyncStatus = "pending" | "synced" | "failed";

/**
 * How a product is sold across the counter. A hardware store sells wire by the
 * metre, cement by the bag, and screws by the piece — the unit belongs to the
 * product, not to the line item.
 */
export const PRODUCT_UNITS = [
  "pc",
  "box",
  "set",
  "pack",
  "roll",
  "sheet",
  "m",
  "ft",
  "kg",
  "l",
  "gal",
  "bag",
] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export function isProductUnit(value: string): value is ProductUnit {
  return (PRODUCT_UNITS as readonly string[]).includes(value);
}

/**
 * How a cashier or owner reads a unit on a receipt or a form. Kept here so the
 * POS and the admin dashboard never invent different words for the same unit.
 */
export const UNIT_LABELS: Record<ProductUnit, string> = {
  pc: "Piece",
  box: "Box",
  set: "Set",
  pack: "Pack",
  roll: "Roll",
  sheet: "Sheet",
  m: "Metre",
  ft: "Foot",
  kg: "Kilogram",
  l: "Litre",
  gal: "Gallon",
  bag: "Bag",
};

/**
 * Units a shop sells in fractions of: wire by the metre, sand by the kilo,
 * paint by the litre. A product on one of these accepts a decimal quantity by
 * default; every other unit defaults to whole numbers but the owner can still
 * turn decimals on per product (see `Product.allowDecimal`).
 */
export const FRACTIONAL_UNITS = ["m", "ft", "kg", "l", "gal", "roll"] as const;

export function isFractionalUnit(unit: ProductUnit): boolean {
  return (FRACTIONAL_UNITS as readonly string[]).includes(unit);
}

/** The `allow_decimal` a new product gets before the owner touches it. */
export function defaultAllowDecimal(unit: ProductUnit): boolean {
  return isFractionalUnit(unit);
}

/** How many decimal places a decimal quantity is kept to, matching numeric(12,3). */
export const QUANTITY_DECIMALS = 3;

/**
 * A quantity as read by a human: whole numbers stay whole ("3"), fractions drop
 * trailing zeros ("3.5", not "3.500"). Kept here so receipts, the POS and the
 * dashboard never disagree on how a weight reads.
 */
export function formatQuantity(quantity: number): string {
  if (Number.isInteger(quantity)) return String(quantity);
  return String(
    Number(quantity.toFixed(QUANTITY_DECIMALS)),
  );
}

/** Short label for a receipt or a quantity stepper: "3.5 m", "2 bag". */
export function formatUnit(quantity: number, unit: ProductUnit): string {
  return `${formatQuantity(quantity)} ${unit}`;
}

/** The shop's day, matching `public.store_timezone()` in Postgres. */
export const STORE_TIME_ZONE = "Asia/Manila";

/**
 * Who the shop is. One row in Postgres, edited in admin, pulled read-only to
 * every terminal so the POS header can carry the real name and logo instead of
 * a constant compiled into the app.
 */
export interface StoreSettings {
  name: string;
  /** Public URL of the uploaded logo, or null while the name stands alone. */
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  /** Printed under the total. Null keeps the receipt's built-in footer. */
  receiptFooter: string | null;
  /** e.g. "JH" in "JH-000001". Null prints just the padded number. */
  invoicePrefix: string | null;
  /** How many digits the sequential part pads to. */
  invoiceDigits: number;
  /** Next number AssignInvoiceNumber will hand out — editable in settings. */
  invoiceNextNumber: number;
  /** Branch these settings belong to. */
  locationId?: string | null;
  updatedAt: string;
}

/**
 * What a surface renders before the first pull lands — a terminal being set up
 * has an empty local table and still has to draw a header.
 */
export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  name: "DOUBLE A",
  logoUrl: null,
  address: null,
  phone: null,
  receiptFooter: null,
  invoicePrefix: null,
  invoiceDigits: 6,
  invoiceNextNumber: 1,
  updatedAt: "",
};

/** What an offline-printed receipt shows in place of a server-assigned number. */
export function pendingInvoiceLabel(prefix: string | null): string {
  return prefix ? `${prefix}-pending` : "pending";
}

/** The letter drawn in the logo well when there is no image to show. */
export function storeInitial(name: string): string {
  return (name.trim()[0] ?? "A").toUpperCase();
}

/**
 * Which blocks print on a thermal receipt. Admin owns this row; terminals pull
 * it and never write it. Bluetooth pairing is per-device, not part of this.
 *
 * Paper is locked to PT-210 / 58mm / 32 columns — the shop's printer.
 */
export interface ReceiptLayout {
  showShopName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showLogoLine: boolean;
  showCashier: boolean;
  showTerminal: boolean;
  showCustomer: boolean;
  showDiscounts: boolean;
  showPayment: boolean;
  showFooter: boolean;
  paperWidthMm: 58;
  columns: 32;
  printerModel: "PT-210";
  updatedAt: string;
}

export const DEFAULT_RECEIPT_LAYOUT: ReceiptLayout = {
  showShopName: true,
  showAddress: true,
  showPhone: true,
  showLogoLine: false,
  showCashier: true,
  showTerminal: true,
  showCustomer: true,
  showDiscounts: true,
  showPayment: true,
  showFooter: true,
  paperWidthMm: 58,
  columns: 32,
  printerModel: "PT-210",
  updatedAt: "",
};

/** PT-210 character budget. Never invent a different width for this shop. */
export const RECEIPT_COLUMNS = 32;
export const RECEIPT_PAPER_WIDTH_MM = 58;
export const RECEIPT_PRINTER_MODEL = "PT-210" as const;

/**
 * Any user flagged `is_demo` — mirrors App\Support\DemoAccount on the
 * Laravel side (same session length). LoginController forces a token
 * expiring this many days out for such an account regardless of the app's
 * normal session length; the admin web's DemoSessionBanner reads it here
 * just for display copy. The flag itself lives on `User.isDemo`, set by a
 * superadmin — not tied to any particular email address. The access code
 * that gates a demo login is generated by a separate site, which also
 * calls this app's superadmin API to register it against a prospect's
 * email; login (LoginInput.accessCode) only ever needs the code itself.
 */
export const DemoAccount = {
  SESSION_DAYS: 2,
} as const;

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  /** Floor staff may unlock when false, but cannot complete a sale. */
  canSell: boolean;
  /** Dashboard admin must set a new password before using the app. */
  mustChangePassword: boolean;
  /** Superadmin-set sandbox flag — gates login behind an access code and caps record creation. */
  isDemo: boolean;
  /** Null only for `superadmin`. Shop staff always belong to one company. */
  companyId: string | null;
  /** Branch this terminal/cashier is bound to. Null for admins and superadmin. */
  locationId: string | null;
  /** False when the shop account is disabled. Superadmin has no company — true. */
  companyIsActive: boolean;
  updatedAt: string;
}

/** A physical place under a company that holds stock — selling branch or warehouse. */
export type LocationType = "branch" | "warehouse";

export interface Location {
  id: string;
  companyId: string;
  name: string;
  type: LocationType;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StockTransferStatus = "pending" | "in_transit" | "received" | "cancelled";

export interface StockTransferItem {
  id: string;
  productId: string;
  productName: string | null;
  quantity: number;
}

export interface StockTransfer {
  id: string;
  companyId: string;
  fromLocationId: string;
  toLocationId: string;
  fromLocationName: string | null;
  toLocationName: string | null;
  status: StockTransferStatus;
  createdBy: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: StockTransferItem[];
}

/** A tenant the platform superadmin creates. Shop identity still lives in store_settings. */
export type InvoiceNumberMode = "incremental" | "random";

export type AiPlanId = 1 | 2 | 3;

export interface AiSubscriptionPlan {
  id: AiPlanId;
  name: string;
  photoExtractWeeklyLimit: number;
  vectorSearchWeeklyLimit: number;
  sortOrder: number;
}

export interface Company {
  id: string;
  name: string;
  isActive: boolean;
  /** Superadmin-only dial — see AssignInvoiceNumber. Defaults to "random" for a new company. */
  invoiceNumberMode: InvoiceNumberMode;
  /** Superadmin-only subscription tier for weekly AI allowances. */
  aiPlanId: AiPlanId;
  createdAt: string;
}

/** Per-company counts for the platform console. */
export interface CompanyStats extends Company {
  productCount: number;
  categoryCount: number;
  supplierCount: number;
  customerCount: number;
  saleCount: number;
  userCount: number;
  stockUnits: number;
}

/** A node in the category tree, e.g. Plumbing / Pipes / PVC. */
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  /**
   * When `markupApplied`, a new product under this category gets a shelf price
   * of cost × (1 + markupPercent/100). Stored as a plain percent (30 = 30%).
   */
  markupPercent: number;
  markupApplied: boolean;
  updatedAt: string;
}

/** A category with its ancestry resolved, ready to render as a tree. */
export interface CategoryNode extends Category {
  path: string;
  depth: number;
  children: CategoryNode[];
}

/** Pure client-side tree assembly — no DB/API dependency, so it lives here rather than in a query layer. */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const category of categories) {
    byId.set(category.id, { ...category, path: category.name, depth: 0, children: [] });
  }

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const settle = (nodes: CategoryNode[], depth: number, prefix: string) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) {
      node.depth = depth;
      node.path = prefix ? `${prefix}${CATEGORY_PATH_SEPARATOR}${node.name}` : node.name;
      settle(node.children, depth + 1, node.path);
    }
  };

  settle(roots, 0, "");
  return roots;
}

export function flattenCategoryTree(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flattenCategoryTree(node.children)]);
}

/**
 * What `public.category_path()` joins a tree with: "Plumbing / Pipes / PVC".
 * Products carry that flattened path for receipts and reports, so anything
 * building or reading a path apart has to use exactly this.
 *
 * Filtering by category is done on ids, never on this text: a product keeps the
 * path it was sold under even after the category itself is deleted.
 */
export const CATEGORY_PATH_SEPARATOR = " / ";

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  /** Supplier's item code on price lists — matched on import and photo extract too. */
  supplierSku: string | null;
  /** The shelf price. What the attendant charges may be lower — see CartLine. */
  price: number;
  /** What the supplier charges us. The owner's margin hangs off this. */
  costPrice: number;
  /** Authoritative on the server; the last pulled value on a device. */
  stockQuantity: number;
  /** Flattened path of `categoryId`, kept in sync by a Postgres trigger. */
  category: string | null;
  categoryId: string | null;
  unit: ProductUnit;
  /**
   * Whether this product can be sold and stocked in fractional quantities
   * (2.5 kg, 1.75 m). Defaults from the unit — see `defaultAllowDecimal` — but
   * the owner may override it either way per product.
   */
  allowDecimal: boolean;
  barcode: string | null;
  /** At or below this count the product lands on the reorder report. */
  reorderPoint: number;
  /** Suggested qty to order when restocking (from supplier lists). */
  replenishQuantity: number;
  /** Optional longer notes — separate from the shelf name. */
  description: string | null;
  /** Contractor price, offered once the line reaches `bulkMinQuantity`. */
  bulkPrice: number | null;
  bulkMinQuantity: number | null;
  isActive: boolean;
  updatedAt: string;
}

/**
 * What a cashier actually sees on a device: the last synced count minus
 * everything sold locally that has not been pushed yet. An estimate, never
 * written back to Supabase.
 */
export interface ProductWithEstimatedStock extends Product {
  estimatedStock: number;
  pendingQuantity: number;
}

/**
 * A reusable customer record. Created on-device with a client UUID (same as
 * sales) so an offline terminal can link orders without waiting on the server.
 * Pulled to every terminal like products; the POS never treats local SQLite as
 * the source of truth once a sync has landed.
 */
export interface Customer {
  id: string;
  name: string;
  address: string | null;
  contact: string | null;
  updatedAt: string;
}

/**
 * A running-ledger payment against a customer's outstanding credit sales —
 * never tied to one specific sale. See CustomerBalanceQuery (Laravel):
 * balance is always sum(unpaid credit sales) - sum(payments), computed live.
 */
export interface CustomerPayment {
  id: string;
  customerId: string;
  amount: number;
  paidAt: string;
  recordedBy: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One of a customer's credit sales still open after a FIFO walk of their payments — a display preview, never a stored allocation. */
export interface CustomerOpenSale {
  saleId: string;
  createdAt: string;
  totalAmount: number;
  amountOpen: number;
}

/**
 * An operating expense the owner logged in admin. Not supplier cost on a sale
 * line — that is COGS. Admin-only; never synced to a POS terminal.
 */
export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  /** Shop calendar day (yyyy-mm-dd), Asia/Manila. */
  expenseDate: string;
  note: string | null;
  createdBy: string | null;
  /** Set when this ledger row was created via Mark paid on a bill. */
  expenseBillId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const EXPENSE_DESCRIPTION_MAX = 200;
export const EXPENSE_CATEGORY_MAX = 80;
export const EXPENSE_NOTE_MAX = 500;

export type ExpenseBillFrequency = "once" | "weekly" | "monthly" | "yearly";

export const EXPENSE_BILL_FREQUENCIES: readonly ExpenseBillFrequency[] = [
  "once",
  "weekly",
  "monthly",
  "yearly",
] as const;

/** Recurring / one-shot bill template. Net only changes after Mark paid. */
export interface ExpenseBill {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  note: string | null;
  frequency: ExpenseBillFrequency;
  /** Next shop calendar due day (yyyy-mm-dd). */
  nextDueDate: string;
  /** Start daily FCM reminders this many days before nextDueDate. */
  remindDaysBefore: number;
  remindersEnabled: boolean;
  lastRemindedOn: string | null;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const EXPENSE_BILL_REMIND_DAYS_MAX = 90;

/**
 * Who the sale was for, when the counter bothered to ask. Every field is
 * optional and normally null: a walk-in buying a bag of cement is not going to
 * dictate an address, and nothing about completing a sale may wait on it.
 *
 * When linked to a `Customer`, `customerId` is set and the three text fields
 * are still snapshotted onto the sale so a receipt reads the same after a
 * later rename. Free text alone (no id) is no longer the happy path — the
 * sheet creates or reuses a customer row.
 */
export interface CustomerDetails {
  customerId: string | null;
  name: string | null;
  address: string | null;
  contact: string | null;
}

/**
 * Longer than any real name, address line or phone number, and short enough
 * that a paste of the wrong thing cannot bloat a sync payload. Enforced on the
 * way in rather than by the server rejecting a batch of sales.
 */
export const CUSTOMER_FIELD_MAX_LENGTH = 160;

/**
 * Trims, drops blanks to null, and caps length. The blank-to-null part matters:
 * a cashier tabbing through the sheet and typing nothing must leave a sale that
 * looks exactly like one where they were never asked.
 */
export function normaliseCustomerDetails(
  input: Partial<Record<keyof CustomerDetails, string | null | undefined>>,
): CustomerDetails {
  const clean = (value: string | null | undefined): string | null => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return null;
    return trimmed.slice(0, CUSTOMER_FIELD_MAX_LENGTH);
  };

  const name = clean(input.name);
  const address = clean(input.address);
  const contact = clean(input.contact);
  // Drop a dangling id when every text field was cleared — that is a walk-in.
  const hasText = Boolean(name || address || contact);
  const rawId = (input.customerId ?? "").trim() || null;

  return {
    customerId: hasText ? rawId : null,
    name,
    address,
    contact,
  };
}

/** Whether a sale carries anything worth printing or showing a customer block for. */
export function hasCustomerDetails(details: CustomerDetails): boolean {
  return Boolean(details.name || details.address || details.contact);
}

export interface Sale {
  /** Generated on-device at creation time so offline rows never collide. */
  id: string;
  /**
   * Server-assigned, sequential, formatted with the company's configured
   * prefix/digits (e.g. "JH-000001"). Null until the sale has synced — a
   * receipt printed offline shows a pending placeholder instead.
   */
  invoiceNumber: string | null;
  userId: string | null;
  totalAmount: number;
  /** Everything given away at the counter on this sale, as a positive number. */
  discountAmount: number;
  paymentMethod: PaymentMethod | null;
  status: SaleStatus;
  deviceId: string | null;
  /** The real moment of sale, set by the client, not the server. */
  createdAt: string;
  /** Link to `customers`. Null on walk-ins and on sales from before the table. */
  customerId: string | null;
  customerName: string | null;
  customerAddress: string | null;
  customerContact: string | null;
  /** False until the cashier confirms GCash/card/online actually landed. */
  isPaid: boolean;
  fulfillment: Fulfillment;
  /** Only meaningful when `fulfillment === "delivery"`. */
  deliveryCompleted: boolean;
  /** Stamped on push from the enrolled terminal's company. */
  companyId?: string | null;
  /** Branch that rang up the sale — stock decrements here. */
  locationId?: string | null;
}

/** The customer columns of a sale, as `CustomerDetails`. */
export function saleCustomer(sale: Sale): CustomerDetails {
  return {
    customerId: sale.customerId,
    name: sale.customerName,
    address: sale.customerAddress,
    contact: sale.customerContact,
  };
}

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string | null;
  /** Snapshotted so renaming a product later cannot rewrite history. */
  productName: string;
  quantity: number;
  /** What the customer paid, after any counter discount. */
  unitPrice: number;
  /** The shelf price at the time of sale. `listPrice - unitPrice` is the discount. */
  listPrice: number;
  /**
   * What it cost us, snapshotted. Reporting never joins back to the product,
   * so a supplier raising their price cannot rewrite last quarter's profit.
   */
  unitCost: number;
  subtotal: number;
  /**
   * Set once this line has been swapped for a different product (admin
   * dashboard only). The row itself is never rewritten — it still shows
   * exactly what was originally sold, at the price it sold for — this just
   * points at what replaced it. Null means still the live line.
   */
  replacedByProductId: string | null;
  replacedByProductName: string | null;
}

export interface LocalSale extends Sale {
  syncStatus: SyncStatus;
  syncedAt: string | null;
}

export interface SaleWithItems extends Sale {
  items: SaleItem[];
}

export interface LocalSaleWithItems extends LocalSale {
  items: SaleItem[];
}

export interface InventoryMovement {
  id: string;
  productId: string;
  /** Embedded by the API — the product's name at read time, null if it's since been deleted. */
  productName: string | null;
  /** Location whose balance this movement changed. */
  locationId?: string | null;
  /** Negative for sales, positive for restocks. */
  changeQuantity: number;
  reason: InventoryReason;
  /** Points at a sale for `reason: "sale"`, at nothing for adjustments. */
  referenceId: string | null;
  note: string | null;
  /** The user who recorded it. Null for anything the POS pushed. */
  createdBy: string | null;
  /** Embedded by the API — who recorded it, null if the account's since been removed. */
  createdByName: string | null;
  createdAt: string;
}

/**
 * Who the shop buys stock from. Admin-only, same tier as Expense — never
 * synced to a POS terminal.
 */
export interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A product a supplier is known to carry. A convenience link for building a
 * PO faster — a PO is never restricted to only these products.
 */
export interface SupplierProduct {
  productId: string;
  productName: string;
}

export const SUPPLIER_NAME_MAX = 200;
export const SUPPLIER_CONTACT_PERSON_MAX = 120;
export const SUPPLIER_PHONE_MAX = 40;
export const SUPPLIER_EMAIL_MAX = 200;
export const SUPPLIER_ADDRESS_MAX = 300;

/**
 * draft: still being put together, freely editable.
 * ordered: sent to the supplier — receiving can now begin.
 * partially_received / received: set automatically as lines come in.
 * cancelled: an explicit owner action, same as draft/ordered transitions.
 */
export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  /** Shop calendar day (yyyy-mm-dd), Asia/Manila. */
  orderDate: string;
  expectedDate: string | null;
  referenceNo: string | null;
  notes: string | null;
  /** Kept in sync by a Postgres trigger — never hand-edited. */
  totalAmount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string | null;
  /** Snapshotted so renaming a product later cannot rewrite an old PO. */
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  /** Snapshot of what the supplier charged at order time. */
  unitCost: number;
  lineTotal: number;
  /** Owner's remark on this one line — substitution, damage, back-order, etc. */
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseOrderItemReceiveState = "pending" | "partial" | "received";

/** Derived, never stored — matches the `quantity_received` check on the row. */
export function poItemReceiveState(
  item: Pick<PurchaseOrderItem, "quantityOrdered" | "quantityReceived">,
): PurchaseOrderItemReceiveState {
  if (item.quantityReceived <= 0) return "pending";
  if (item.quantityReceived >= item.quantityOrdered) return "received";
  return "partial";
}

/** An installment on a PO: how many terms, and whether each has been paid. */
export interface PurchaseOrderPayment {
  id: string;
  purchaseOrderId: string;
  termNumber: number;
  dueDate: string | null;
  amount: number;
  isPaid: boolean;
  paidDate: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What is still owed across a set of installment terms — never a stored column. */
export function purchaseOrderBalance(payments: { amount: number; isPaid: boolean }[]): number {
  return roundMoney(
    payments.reduce((sum, term) => sum + (term.isPaid ? 0 : term.amount), 0),
  );
}

export function purchaseOrderPaidTotal(payments: { amount: number; isPaid: boolean }[]): number {
  return roundMoney(
    payments.reduce((sum, term) => sum + (term.isPaid ? term.amount : 0), 0),
  );
}

/** An in-progress cart, held in memory on a device only. */
export interface CartLine {
  productId: string;
  productName: string;
  /** What this line is selling at. Editable at the counter. */
  unitPrice: number;
  /** The shelf price, so the cart can show what was given away. */
  listPrice: number;
  /** Supplier cost, so the attendant can see the floor before discounting. */
  unitCost: number;
  unit: ProductUnit;
  /** Whether this line can carry a fractional quantity (2.5 kg). From the product. */
  allowDecimal: boolean;
  quantity: number;
  /** Last synced stock, kept so the cart can warn when a line exceeds it. */
  availableStock: number;
}
