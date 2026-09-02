import {
  formatQuantity,
  lineProfit,
  marginPercent,
} from "@double-a/shared-types";
import {
  getStoreSettings,
  listCategories,
  listCustomers,
  listExpenseBills,
  listExpenses,
  listGoodsReceiptsPage,
  listLocations,
  listMovementsPage,
  listProducts,
  listPurchaseOrdersPage,
  listSalesPage,
  listStockTransfers,
  listSuppliers,
  listUsers,
} from "@double-a/api-client/queries";
import type { ApiClient } from "@double-a/api-client";
import { type CsvValue, toCsv } from "@/lib/csv";

/**
 * One named table the owner can pull out of the shop. Built as flat rows so
 * CSV, Excel and PDF all speak the same shape — no format invents its own
 * columns.
 *
 * Secrets stay out: pin_hash, auth_user_id and passwords never leave. Stock
 * rides on products for reference only (same rule as the products export).
 */

export const BACKUP_DATASETS = [
  "products",
  "categories",
  "customers",
  "sales",
  "inventory_movements",
  "expenses",
  "expense_bills",
  "suppliers",
  "purchase_orders",
  "goods_receipts",
  "locations",
  "stock_transfers",
  "users",
  "store_settings",
] as const;

export type BackupDatasetId = (typeof BACKUP_DATASETS)[number];

export function isBackupDatasetId(value: string): value is BackupDatasetId {
  return (BACKUP_DATASETS as readonly string[]).includes(value);
}

export const BACKUP_DATASET_META: Record<
  BackupDatasetId,
  { label: string; blurb: string }
> = {
  products: {
    label: "Products",
    blurb: "Catalogue, prices, cost, stock, units.",
  },
  categories: {
    label: "Categories",
    blurb: "Shelf tree and markup.",
  },
  customers: {
    label: "Customers",
    blurb: "Names, addresses, contacts.",
  },
  sales: {
    label: "Sales",
    blurb: "Receipts with line items (recent cap).",
  },
  inventory_movements: {
    label: "Inventory movements",
    blurb: "Every stock change on record (recent cap).",
  },
  expenses: {
    label: "Expenses",
    blurb: "Rent, wages, utilities.",
  },
  expense_bills: {
    label: "Expense bills",
    blurb: "Recurring and one-shot bill reminders.",
  },
  suppliers: {
    label: "Suppliers",
    blurb: "Who you buy from.",
  },
  purchase_orders: {
    label: "Purchase orders",
    blurb: "Orders, lines and installment terms.",
  },
  goods_receipts: {
    label: "Goods receipts",
    blurb: "Receive orders with line items (recent cap).",
  },
  locations: {
    label: "Locations",
    blurb: "Branches and warehouses.",
  },
  stock_transfers: {
    label: "Stock transfers",
    blurb: "Moves between locations (recent cap).",
  },
  users: {
    label: "Users",
    blurb: "Cashiers, admins, terminals — no PINs.",
  },
  store_settings: {
    label: "Store settings",
    blurb: "Shop name, address, phone, footer.",
  },
};

/** PostgREST and a busy shop both need a ceiling. Caps are stated in the file. */
const MAX_SALES = 8_000;
const MAX_MOVEMENTS = 20_000;
const MAX_PURCHASE_ORDERS = 2_000;
const MAX_GOODS_RECEIPTS = 2_000;
const MAX_STOCK_TRANSFERS = 2_000;

/** PDF is for reading, not for a full dump — Excel/CSV carry every row. */
export const PDF_ROW_CAP = 60;

export interface BackupSheet {
  id: BackupDatasetId;
  label: string;
  /** Base name without extension, safe for zip entries. */
  filename: string;
  headers: string[];
  rows: CsvValue[][];
  /** True when a hard cap cut the list short. */
  truncated: boolean;
}

export async function buildBackupSheets(
  client: ApiClient,
  ids: BackupDatasetId[],
): Promise<BackupSheet[]> {
  const sheets: BackupSheet[] = [];
  for (const id of ids) {
    sheets.push(await buildSheet(client, id));
  }
  return sheets;
}

/** Walks every page of a paginated list up to `cap`, same pattern api-client's own list-alls use. */
async function walkPages<T>(
  loadPage: (page: number) => Promise<{ items: T[]; lastPage: number }>,
  cap: number,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const result = await loadPage(page);
    items.push(...result.items);
    if (items.length >= cap || page >= result.lastPage) {
      return { items: items.slice(0, cap), truncated: items.length >= cap && page < result.lastPage };
    }
    page += 1;
  }
}

async function buildSheet(
  client: ApiClient,
  id: BackupDatasetId,
): Promise<BackupSheet> {
  const label = BACKUP_DATASET_META[id].label;

  switch (id) {
    case "products": {
      const products = await listProducts(client, { includeInactive: true });
      return {
        id,
        label,
        filename: "products",
        truncated: false,
        headers: [
          "id",
          "name",
          "sku",
          "barcode",
          "price",
          "cost_price",
          "margin_percent",
          "unit",
          "allow_decimal",
          "reorder_point",
          "bulk_price",
          "bulk_min_quantity",
          "category",
          "category_id",
          "stock_quantity",
          "is_active",
          "updated_at",
        ],
        rows: products.map((product) => [
          product.id,
          product.name,
          product.sku,
          product.barcode,
          product.price,
          product.costPrice,
          marginPercent(product.price, product.costPrice),
          product.unit,
          product.allowDecimal,
          product.reorderPoint,
          product.bulkPrice,
          product.bulkMinQuantity,
          product.category,
          product.categoryId,
          product.stockQuantity,
          product.isActive,
          product.updatedAt,
        ]),
      };
    }

    case "categories": {
      const categories = await listCategories(client, { includeInactive: true });
      return {
        id,
        label,
        filename: "categories",
        truncated: false,
        headers: [
          "id",
          "name",
          "parent_id",
          "markup_percent",
          "markup_applied",
          "is_active",
          "updated_at",
        ],
        rows: categories.map((category) => [
          category.id,
          category.name,
          category.parentId,
          category.markupPercent,
          category.markupApplied,
          category.isActive,
          category.updatedAt,
        ]),
      };
    }

    case "customers": {
      const customers = await listCustomers(client);
      return {
        id,
        label,
        filename: "customers",
        truncated: false,
        headers: ["id", "name", "address", "contact", "updated_at"],
        rows: customers.map((customer) => [
          customer.id,
          customer.name,
          customer.address,
          customer.contact,
          customer.updatedAt,
        ]),
      };
    }

    case "sales": {
      // GAP (see queries/sales.ts): SaleResource carries no cashier name — joined
      // against a separately fetched user list.
      const users = await listUsers(client, { includeInactive: true });
      const cashierNameById = new Map(users.map((user) => [user.id, user.name]));
      const { items: sales, truncated: salesTruncated } = await walkPages(
        async (page) => {
          const result = await listSalesPage(client, { page, pageSize: 200 });
          return { items: result.sales, lastPage: result.lastPage };
        },
        MAX_SALES,
      );
      const rows = sales.flatMap((sale) =>
        sale.items.map((item) => [
          sale.createdAt,
          sale.id,
          (sale.userId && cashierNameById.get(sale.userId)) ?? null,
          sale.deviceId,
          sale.paymentMethod,
          sale.status,
          sale.isPaid,
          sale.fulfillment,
          sale.deliveryCompleted,
          sale.customerId,
          sale.customerName,
          sale.customerContact,
          sale.customerAddress,
          item.id,
          item.productId,
          item.productName,
          item.quantity,
          item.listPrice,
          item.unitPrice,
          item.unitCost,
          item.subtotal,
          lineProfit(item.unitPrice, item.unitCost, item.quantity),
        ]),
      );
      return {
        id,
        label,
        filename: "sales",
        truncated: salesTruncated,
        headers: [
          "sold_at",
          "sale_id",
          "cashier",
          "terminal",
          "payment",
          "status",
          "is_paid",
          "fulfillment",
          "delivery_completed",
          "customer_id",
          "customer_name",
          "customer_contact",
          "customer_address",
          "line_id",
          "product_id",
          "product",
          "quantity",
          "list_price",
          "unit_price",
          "unit_cost",
          "subtotal",
          "line_profit",
        ],
        rows,
      };
    }

    case "inventory_movements": {
      const { items: movements, truncated: movementsTruncated } = await walkPages(
        async (page) => {
          const result = await listMovementsPage(client, { page, pageSize: 200 });
          return { items: result.movements, lastPage: result.lastPage };
        },
        MAX_MOVEMENTS,
      );
      return {
        id,
        label,
        filename: "inventory_movements",
        truncated: movementsTruncated,
        headers: [
          "id",
          "product_id",
          "change_quantity",
          "reason",
          "reference_id",
          "note",
          "created_by",
          "created_at",
        ],
        rows: movements.map((movement) => [
          movement.id,
          movement.productId,
          movement.changeQuantity,
          movement.reason,
          movement.referenceId,
          movement.note,
          movement.createdBy,
          movement.createdAt,
        ]),
      };
    }

    case "expenses": {
      const expenses = await listExpenses(client);
      return {
        id,
        label,
        filename: "expenses",
        truncated: false,
        headers: [
          "id",
          "expense_date",
          "category",
          "description",
          "amount",
          "note",
          "created_by",
          "created_at",
          "updated_at",
        ],
        rows: expenses.map((expense) => [
          expense.id,
          expense.expenseDate,
          expense.category,
          expense.description,
          expense.amount,
          expense.note,
          expense.createdBy,
          expense.createdAt,
          expense.updatedAt,
        ]),
      };
    }

    case "expense_bills": {
      const bills = await listExpenseBills(client);
      return {
        id,
        label,
        filename: "expense_bills",
        truncated: false,
        headers: [
          "id",
          "description",
          "amount",
          "category",
          "note",
          "frequency",
          "next_due_date",
          "remind_days_before",
          "reminders_enabled",
          "last_reminded_on",
          "active",
          "created_by",
          "created_at",
          "updated_at",
        ],
        rows: bills.map((bill) => [
          bill.id,
          bill.description,
          bill.amount,
          bill.category,
          bill.note,
          bill.frequency,
          bill.nextDueDate,
          bill.remindDaysBefore,
          bill.remindersEnabled,
          bill.lastRemindedOn,
          bill.active,
          bill.createdBy,
          bill.createdAt,
          bill.updatedAt,
        ]),
      };
    }

    case "suppliers": {
      const suppliers = await listSuppliers(client, { includeInactive: true });
      return {
        id,
        label,
        filename: "suppliers",
        truncated: false,
        headers: [
          "id",
          "name",
          "contact_person",
          "phone",
          "email",
          "address",
          "is_active",
          "created_at",
          "updated_at",
        ],
        rows: suppliers.map((supplier) => [
          supplier.id,
          supplier.name,
          supplier.contactPerson,
          supplier.phone,
          supplier.email,
          supplier.address,
          supplier.isActive,
          supplier.createdAt,
          supplier.updatedAt,
        ]),
      };
    }

    case "purchase_orders": {
      // GAP (see queries/purchase-orders.ts): PurchaseOrderResource carries no
      // supplier name — joined against a separately fetched supplier list.
      const suppliers = await listSuppliers(client, { includeInactive: true });
      const supplierNameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
      const { items: orders, truncated: ordersTruncated } = await walkPages(
        async (page) => {
          const result = await listPurchaseOrdersPage(client, { page, pageSize: 200 });
          return { items: result.purchaseOrders, lastPage: result.lastPage };
        },
        MAX_PURCHASE_ORDERS,
      );
      const rows: CsvValue[][] = [];
      for (const order of orders) {
        const terms = order.payments
          .map(
            (payment) =>
              `T${payment.termNumber}:${payment.amount}${payment.isPaid ? ":paid" : ""}`,
          )
          .join("|");
        const header = [
          order.id,
          order.supplierId,
          supplierNameById.get(order.supplierId) ?? null,
          order.status,
          order.orderDate,
          order.expectedDate,
          order.referenceNo,
          order.notes,
          order.totalAmount,
          order.createdBy,
          order.createdAt,
          terms,
        ] as CsvValue[];

        if (order.items.length === 0) {
          rows.push([...header, null, null, null, null, null, null, null, null]);
          continue;
        }
        for (const item of order.items) {
          rows.push([
            ...header,
            item.id,
            item.productId,
            item.productName,
            item.quantityOrdered,
            item.quantityReceived,
            item.unitCost,
            item.lineTotal,
            item.note,
          ]);
        }
      }
      return {
        id,
        label,
        filename: "purchase_orders",
        truncated: ordersTruncated,
        headers: [
          "purchase_order_id",
          "supplier_id",
          "supplier_name",
          "status",
          "order_date",
          "expected_date",
          "reference_no",
          "notes",
          "total_amount",
          "created_by",
          "created_at",
          "payment_terms",
          "line_id",
          "product_id",
          "product_name",
          "quantity_ordered",
          "quantity_received",
          "unit_cost",
          "line_total",
          "line_note",
        ],
        rows,
      };
    }

    case "goods_receipts": {
      const { items: receipts, truncated: receiptsTruncated } = await walkPages(
        async (page) => {
          const result = await listGoodsReceiptsPage(client, { page, pageSize: 100 });
          return { items: result.receipts, lastPage: result.lastPage };
        },
        MAX_GOODS_RECEIPTS,
      );
      const rows: CsvValue[][] = [];
      for (const receipt of receipts) {
        const header = [
          receipt.id,
          receipt.locationId,
          receipt.supplierId,
          receipt.supplierName,
          receipt.purchaseOrderId,
          receipt.referenceNo,
          receipt.photoUrl,
          receipt.notes,
          receipt.hasDiscrepancy,
          receipt.receivedBy,
          receipt.receivedAt,
          receipt.createdAt,
        ] as CsvValue[];

        if (receipt.items.length === 0) {
          rows.push([
            ...header,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          ]);
          continue;
        }
        for (const item of receipt.items) {
          rows.push([
            ...header,
            item.id,
            item.productId,
            item.purchaseOrderItemId,
            item.matchedBy,
            item.name,
            item.sku,
            item.quantityOrdered,
            item.quantityReceived,
            item.unitCost,
            item.appliedPrice,
            item.isFlagged,
            item.note,
          ]);
        }
      }
      return {
        id,
        label,
        filename: "goods_receipts",
        truncated: receiptsTruncated,
        headers: [
          "goods_receipt_id",
          "location_id",
          "supplier_id",
          "supplier_name",
          "purchase_order_id",
          "reference_no",
          "photo_url",
          "notes",
          "has_discrepancy",
          "received_by",
          "received_at",
          "created_at",
          "line_id",
          "product_id",
          "purchase_order_item_id",
          "matched_by",
          "item_name",
          "sku",
          "quantity_ordered",
          "quantity_received",
          "unit_cost",
          "applied_price",
          "is_flagged",
          "line_note",
        ],
        rows,
      };
    }

    case "locations": {
      const locations = await listLocations(client, { includeInactive: true });
      return {
        id,
        label,
        filename: "locations",
        truncated: false,
        headers: [
          "id",
          "name",
          "type",
          "address",
          "is_active",
          "created_at",
          "updated_at",
        ],
        rows: locations.map((location) => [
          location.id,
          location.name,
          location.type,
          location.address,
          location.isActive,
          location.createdAt,
          location.updatedAt,
        ]),
      };
    }

    case "stock_transfers": {
      const { items: transfers, truncated: transfersTruncated } = await walkPages(
        async (page) => {
          const result = await listStockTransfers(client, { page, pageSize: 100 });
          return { items: result.transfers, lastPage: result.lastPage };
        },
        MAX_STOCK_TRANSFERS,
      );
      const rows: CsvValue[][] = [];
      for (const transfer of transfers) {
        const header = [
          transfer.id,
          transfer.fromLocationId,
          transfer.fromLocationName,
          transfer.toLocationId,
          transfer.toLocationName,
          transfer.status,
          transfer.createdBy,
          transfer.receivedAt,
          transfer.createdAt,
          transfer.updatedAt,
        ] as CsvValue[];

        if (transfer.items.length === 0) {
          rows.push([...header, null, null, null, null]);
          continue;
        }
        for (const item of transfer.items) {
          rows.push([
            ...header,
            item.id,
            item.productId,
            item.productName,
            item.quantity,
          ]);
        }
      }
      return {
        id,
        label,
        filename: "stock_transfers",
        truncated: transfersTruncated,
        headers: [
          "stock_transfer_id",
          "from_location_id",
          "from_location_name",
          "to_location_id",
          "to_location_name",
          "status",
          "created_by",
          "received_at",
          "created_at",
          "updated_at",
          "line_id",
          "product_id",
          "product_name",
          "quantity",
        ],
        rows,
      };
    }

    case "users": {
      const users = await listUsers(client, { includeInactive: true });
      return {
        id,
        label,
        filename: "users",
        truncated: false,
        headers: [
          "id",
          "name",
          "email",
          "role",
          "is_active",
          "can_sell",
          "must_change_password",
          "updated_at",
        ],
        rows: users.map((user) => [
          user.id,
          user.name,
          user.email,
          user.role,
          user.isActive,
          user.canSell,
          user.mustChangePassword,
          user.updatedAt,
        ]),
      };
    }

    case "store_settings": {
      const settings = await getStoreSettings(client);
      return {
        id,
        label,
        filename: "store_settings",
        truncated: false,
        headers: [
          "name",
          "logo_url",
          "address",
          "phone",
          "receipt_footer",
          "updated_at",
        ],
        rows: [
          [
            settings.name,
            settings.logoUrl,
            settings.address,
            settings.phone,
            settings.receiptFooter,
            settings.updatedAt,
          ],
        ],
      };
    }
  }
}

export function sheetToCsv(sheet: BackupSheet): string {
  return toCsv(sheet.headers, sheet.rows);
}

/** Cell text for PDF / Excel display — keep numbers readable. */
export function cellText(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : formatQuantity(value);
  }
  return String(value);
}
