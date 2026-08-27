import type {
  Category,
  Customer,
  Expense,
  Fulfillment,
  InventoryMovement,
  InventoryReason,
  PaymentMethod,
  Product,
  ProductUnit,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPayment,
  PurchaseOrderStatus,
  ReceiptLayout,
  Sale,
  SaleItem,
  SaleStatus,
  StoreSettings,
  Supplier,
  User,
  UserRole,
} from "@double-a/shared-types";
import type { Tables } from "./database.types";

/**
 * snake_case rows to camelCase domain objects, in one place. Postgres numerics
 * arrive as numbers through PostgREST but are coerced anyway so a string never
 * leaks into arithmetic.
 */

export function toProduct(row: Tables<"products">): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    price: Number(row.price),
    costPrice: Number(row.cost_price),
    stockQuantity: Number(row.stock_quantity),
    category: row.category,
    categoryId: row.category_id,
    unit: row.unit as ProductUnit,
    allowDecimal: row.allow_decimal,
    barcode: row.barcode,
    reorderPoint: row.reorder_point,
    bulkPrice: row.bulk_price === null ? null : Number(row.bulk_price),
    bulkMinQuantity: row.bulk_min_quantity === null ? null : Number(row.bulk_min_quantity),
    isActive: row.is_active,
    updatedAt: row.updated_at,
  };
}

export function toCategory(row: Tables<"categories">): Category {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    isActive: row.is_active,
    markupPercent: Number(row.markup_percent ?? 0),
    markupApplied: row.markup_applied ?? false,
    updatedAt: row.updated_at,
  };
}

export function toCustomer(row: Tables<"customers">): Customer {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    contact: row.contact,
    updatedAt: row.updated_at,
  };
}

export function toExpense(row: Tables<"expenses">): Expense {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    category: row.category,
    expenseDate: row.expense_date,
    note: row.note,
    createdBy: row.created_by,
    expenseBillId: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Takes only the columns callers are allowed to read — pin_hash and
 * auth_user_id are revoked from normal clients, so queries never select them.
 */
export type UserRowSubset = Pick<
  Tables<"users">,
  | "id"
  | "name"
  | "email"
  | "role"
  | "is_active"
  | "can_sell"
  | "must_change_password"
  | "updated_at"
> & {
  company_id?: string | null;
  company_is_active?: boolean | null;
};

export function toUser(row: UserRowSubset): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    isActive: row.is_active,
    canSell: row.can_sell,
    mustChangePassword: row.must_change_password,
    companyId: row.company_id ?? null,
    companyIsActive: row.company_is_active ?? true,
    updatedAt: row.updated_at,
  };
}

export function toStoreSettings(row: Tables<"store_settings">): StoreSettings {
  return {
    name: row.name,
    logoUrl: row.logo_url,
    address: row.address,
    phone: row.phone,
    receiptFooter: row.receipt_footer,
    updatedAt: row.updated_at,
  };
}

export function toReceiptLayout(row: Tables<"receipt_layout">): ReceiptLayout {
  return {
    showShopName: row.show_shop_name,
    showAddress: row.show_address,
    showPhone: row.show_phone,
    showLogoLine: row.show_logo_line,
    showCashier: row.show_cashier,
    showTerminal: row.show_terminal,
    showCustomer: row.show_customer,
    showDiscounts: row.show_discounts,
    showPayment: row.show_payment,
    showFooter: row.show_footer,
    paperWidthMm: 58,
    columns: 32,
    printerModel: "PT-210",
    updatedAt: row.updated_at,
  };
}

export function toSale(row: Tables<"sales">): Sale {
  return {
    id: row.id,
    userId: row.user_id,
    totalAmount: Number(row.total_amount),
    discountAmount: Number(row.discount_amount ?? 0),
    paymentMethod: row.payment_method as PaymentMethod | null,
    status: row.status as SaleStatus,
    deviceId: row.device_id,
    createdAt: row.created_at,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerAddress: row.customer_address,
    customerContact: row.customer_contact,
    isPaid: row.is_paid ?? true,
    fulfillment: (row.fulfillment as Fulfillment) ?? "pickup",
    deliveryCompleted: row.delivery_completed ?? false,
    companyId: row.company_id,
  };
}

export function toSaleItem(row: Tables<"sale_items">): SaleItem {
  return {
    id: row.id,
    saleId: row.sale_id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    listPrice: Number(row.list_price ?? row.unit_price),
    unitCost: Number(row.unit_cost ?? 0),
    subtotal: Number(row.subtotal),
  };
}

export function toSupplier(row: Tables<"suppliers">): Supplier {
  return {
    id: row.id,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPurchaseOrder(row: Tables<"purchase_orders">): PurchaseOrder {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    status: row.status as PurchaseOrderStatus,
    orderDate: row.order_date,
    expectedDate: row.expected_date,
    referenceNo: row.reference_no,
    notes: row.notes,
    totalAmount: Number(row.total_amount),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPurchaseOrderItem(
  row: Tables<"purchase_order_items">,
): PurchaseOrderItem {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    productId: row.product_id,
    productName: row.product_name,
    quantityOrdered: Number(row.quantity_ordered),
    quantityReceived: Number(row.quantity_received),
    unitCost: Number(row.unit_cost),
    lineTotal: Number(row.line_total),
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPurchaseOrderPayment(
  row: Tables<"purchase_order_payments">,
): PurchaseOrderPayment {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    termNumber: row.term_number,
    dueDate: row.due_date,
    amount: Number(row.amount),
    isPaid: row.is_paid,
    paidDate: row.paid_date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toInventoryMovement(
  row: Tables<"inventory_movements">,
): InventoryMovement {
  return {
    id: row.id,
    productId: row.product_id,
    changeQuantity: Number(row.change_quantity),
    reason: row.reason as InventoryReason,
    referenceId: row.reference_id,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
