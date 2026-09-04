import type {
  AddonGroup,
  AddonGroupItemChoice,
  BundleItem,
  Category,
  Company,
  CompanyStats,
  Customer,
  CustomerOpenSale,
  CustomerPayment,
  Expense,
  ExpenseBill,
  Fulfillment,
  InventoryMovement,
  InventoryReason,
  Location,
  LocationType,
  PaymentMethod,
  Product,
  ProductUnit,
  ProductVariant,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPayment,
  PurchaseOrderStatus,
  ReceiptLayout,
  Sale,
  SaleItem,
  SaleItemAddon,
  SaleStatus,
  StockTransfer,
  StockTransferStatus,
  StoreSettings,
  Supplier,
  User,
  UserRole,
  VariantAttributeValue,
  AiPlanId,
} from "@double-a/shared-types";
import type { JsonApiResource } from "./http";

/**
 * JSON:API `attributes` (snake_case, as returned by Laravel Resources) to
 * camelCase domain objects, in one place. Mirrors the old Postgres-row
 * mappers 1:1 — only the source shape changed.
 */

export interface ProductAttrs {
  name: string;
  description: string | null;
  sku: string | null;
  supplier_sku: string | null;
  supplier_names?: string;
  price: number;
  stock_quantity: number;
  category: string | null;
  category_id: string | null;
  is_active: boolean;
  cost_price: number;
  unit: string;
  barcode: string | null;
  reorder_point: number;
  replenish_quantity: number;
  bulk_price: number | null;
  bulk_min_quantity: number | null;
  allow_decimal: boolean;
  photo_url: string | null;
  is_bundle?: boolean;
  bundle_items?: {
    product_id: string;
    name: string | null;
    sku: string | null;
    unit: string | null;
    quantity: number;
    cost_price: number;
  }[];
  addon_group_ids?: string[];
  created_at: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
}

export function toProduct(resource: JsonApiResource<ProductAttrs>): Product {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    description: a.description,
    sku: a.sku,
    supplierSku: a.supplier_sku,
    supplierNames: a.supplier_names ?? "",
    price: Number(a.price),
    costPrice: Number(a.cost_price),
    stockQuantity: Number(a.stock_quantity),
    category: a.category,
    categoryId: a.category_id,
    unit: a.unit as ProductUnit,
    allowDecimal: a.allow_decimal,
    barcode: a.barcode,
    reorderPoint: a.reorder_point,
    replenishQuantity: a.replenish_quantity ?? 0,
    bulkPrice: a.bulk_price === null ? null : Number(a.bulk_price),
    bulkMinQuantity: a.bulk_min_quantity === null ? null : Number(a.bulk_min_quantity),
    isActive: a.is_active,
    // Coerced explicitly: an un-migrated/older server simply omits this key,
    // which is `undefined` at runtime despite the `string | null` type — and
    // `undefined` crashes expo-sqlite's native bind on the mobile write path.
    photoUrl: a.photo_url ?? null,
    isBundle: a.is_bundle ?? false,
    bundleItems: (a.bundle_items ?? []).map(
      (item): BundleItem => ({
        productId: item.product_id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        quantity: Number(item.quantity),
        costPrice: Number(item.cost_price),
      }),
    ),
    addonGroupIds: a.addon_group_ids ?? [],
    updatedAt: a.updated_at ?? "",
    deletedAt: a.deleted_at ?? null,
  };
}

export interface ProductVariantAttrs {
  product_id: string;
  sku: string | null;
  supplier_sku: string | null;
  barcode: string | null;
  price: number;
  cost_price: number;
  is_default: boolean;
  is_active: boolean;
  stock_quantity: number | null;
  attribute_values?: {
    company_attribute_id: string | null;
    company_attribute_value_id: string;
    value: string | null;
  }[];
  updated_at: string | null;
}

export function toProductVariant(resource: JsonApiResource<ProductVariantAttrs>): ProductVariant {
  const a = resource.attributes;
  return {
    id: resource.id,
    productId: a.product_id,
    sku: a.sku,
    supplierSku: a.supplier_sku,
    barcode: a.barcode,
    price: Number(a.price),
    costPrice: Number(a.cost_price),
    stockQuantity: Number(a.stock_quantity ?? 0),
    isDefault: a.is_default,
    isActive: a.is_active,
    attributeValues: (a.attribute_values ?? []).map(
      (value): VariantAttributeValue => ({
        companyAttributeId: value.company_attribute_id,
        companyAttributeValueId: value.company_attribute_value_id,
        value: value.value,
      }),
    ),
    updatedAt: a.updated_at ?? "",
  };
}

export interface AddonGroupAttrs {
  name: string;
  selection_type: string;
  is_required: boolean;
  items: {
    id: string;
    variant_id: string;
    product_name: string | null;
    variant_label: string | null;
    extra_price: number | null;
    effective_price: number;
    photo_url: string | null;
  }[];
}

export function toAddonGroup(resource: JsonApiResource<AddonGroupAttrs>): AddonGroup {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    selectionType: a.selection_type === "single" ? "single" : "multiple",
    isRequired: a.is_required,
    items: (a.items ?? []).map(
      (item): AddonGroupItemChoice => ({
        id: item.id,
        variantId: item.variant_id,
        name: [item.product_name, item.variant_label].filter(Boolean).join(" — ") || (item.product_name ?? ""),
        price: Number(item.effective_price),
        extraPrice: item.extra_price === null ? null : Number(item.extra_price),
        photoUrl: item.photo_url,
      }),
    ),
  };
}

export interface CategoryAttrs {
  name: string;
  parent_id: string | null;
  is_active: boolean;
  markup_percent: number;
  markup_applied: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export function toCategory(resource: JsonApiResource<CategoryAttrs>): Category {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    parentId: a.parent_id,
    isActive: a.is_active,
    markupPercent: Number(a.markup_percent ?? 0),
    markupApplied: a.markup_applied ?? false,
    updatedAt: a.updated_at ?? "",
  };
}

export interface CustomerAttrs {
  name: string;
  address: string | null;
  contact: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function toCustomer(resource: JsonApiResource<CustomerAttrs>): Customer {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    address: a.address,
    contact: a.contact,
    updatedAt: a.updated_at ?? "",
  };
}

/** Plain JsonResource (CustomerPaymentResource), not JSON:API — same shape as PurchaseOrderPaymentResource's sibling. */
export interface CustomerPaymentJson {
  id: string;
  customer_id: string;
  amount: number;
  paid_at: string | null;
  recorded_by: string | null;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function toCustomerPayment(json: CustomerPaymentJson): CustomerPayment {
  return {
    id: json.id,
    customerId: json.customer_id,
    amount: Number(json.amount),
    paidAt: json.paid_at ?? "",
    recordedBy: json.recorded_by,
    note: json.note,
    createdAt: json.created_at ?? "",
    updatedAt: json.updated_at ?? "",
  };
}

/** Plain array response from CustomerOpenSalesController — a FIFO display preview, not a resource. */
export interface CustomerOpenSaleJson {
  sale_id: string;
  created_at: string;
  total_amount: number;
  amount_open: number;
}

export function toCustomerOpenSale(json: CustomerOpenSaleJson): CustomerOpenSale {
  return {
    saleId: json.sale_id,
    createdAt: json.created_at,
    totalAmount: Number(json.total_amount),
    amountOpen: Number(json.amount_open),
  };
}

export interface ExpenseAttrs {
  description: string;
  amount: number;
  category: string | null;
  expense_date: string;
  note: string | null;
  created_by: string | null;
  expense_bill_id?: string | null;
  location_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function toExpense(resource: JsonApiResource<ExpenseAttrs>): Expense {
  const a = resource.attributes;
  return {
    id: resource.id,
    description: a.description,
    amount: Number(a.amount),
    category: a.category,
    expenseDate: a.expense_date,
    note: a.note,
    createdBy: a.created_by,
    expenseBillId: a.expense_bill_id ?? null,
    locationId: a.location_id,
    createdAt: a.created_at ?? "",
    updatedAt: a.updated_at ?? "",
  };
}

export interface ExpenseBillAttrs {
  description: string;
  amount: number;
  category: string | null;
  note: string | null;
  frequency: string;
  next_due_date: string;
  remind_days_before: number;
  reminders_enabled: boolean;
  last_reminded_on: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function toExpenseBill(resource: JsonApiResource<ExpenseBillAttrs>): ExpenseBill {
  const a = resource.attributes;
  return {
    id: resource.id,
    description: a.description,
    amount: Number(a.amount),
    category: a.category,
    note: a.note,
    frequency: a.frequency as ExpenseBill["frequency"],
    nextDueDate: a.next_due_date,
    remindDaysBefore: Number(a.remind_days_before),
    remindersEnabled: Boolean(a.reminders_enabled),
    lastRemindedOn: a.last_reminded_on,
    active: Boolean(a.active),
    createdBy: a.created_by,
    createdAt: a.created_at ?? "",
    updatedAt: a.updated_at ?? "",
  };
}

export interface UserAttrs {
  name: string;
  email: string;
  role: string;
  company_id: string | null;
  location_id?: string | null;
  company_is_active: boolean | null;
  is_active: boolean;
  can_sell: boolean;
  must_change_password: boolean;
  must_enroll_mfa: boolean;
  is_demo: boolean;
  email_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function toUser(resource: JsonApiResource<UserAttrs>): User {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    email: a.email,
    role: a.role as UserRole,
    isActive: a.is_active,
    canSell: a.can_sell,
    mustChangePassword: a.must_change_password,
    mustEnrollMfa: a.must_enroll_mfa,
    isDemo: a.is_demo,
    companyId: a.company_id ?? null,
    locationId: a.location_id ?? null,
    companyIsActive: a.company_is_active ?? true,
    emailVerifiedAt: a.email_verified_at ?? null,
    updatedAt: a.updated_at ?? "",
  };
}

export interface StoreSettingAttrs {
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  receipt_footer: string | null;
  invoice_prefix: string | null;
  invoice_digits: number | null;
  invoice_next_number: number | null;
  location_id?: string | null;
  company_id?: string | null;
  updated_at: string | null;
}

export function toStoreSettings(resource: JsonApiResource<StoreSettingAttrs>): StoreSettings {
  const a = resource.attributes;
  return {
    name: a.name,
    logoUrl: a.logo_url,
    address: a.address,
    phone: a.phone,
    receiptFooter: a.receipt_footer,
    invoicePrefix: a.invoice_prefix,
    invoiceDigits: a.invoice_digits ?? 6,
    invoiceNextNumber: a.invoice_next_number ?? 1,
    locationId: a.location_id ?? resource.id,
    updatedAt: a.updated_at ?? "",
  };
}

export interface ReceiptLayoutAttrs {
  show_shop_name: boolean;
  show_address: boolean;
  show_phone: boolean;
  show_logo_line: boolean;
  show_cashier: boolean;
  show_terminal: boolean;
  show_customer: boolean;
  show_discounts: boolean;
  show_payment: boolean;
  show_footer: boolean;
  updated_at: string | null;
}

export function toReceiptLayout(resource: JsonApiResource<ReceiptLayoutAttrs>): ReceiptLayout {
  const a = resource.attributes;
  return {
    showShopName: a.show_shop_name,
    showAddress: a.show_address,
    showPhone: a.show_phone,
    showLogoLine: a.show_logo_line,
    showCashier: a.show_cashier,
    showTerminal: a.show_terminal,
    showCustomer: a.show_customer,
    showDiscounts: a.show_discounts,
    showPayment: a.show_payment,
    showFooter: a.show_footer,
    paperWidthMm: 58,
    columns: 32,
    printerModel: "PT-210",
    updatedAt: a.updated_at ?? "",
  };
}

/** Nested under a sale — plain JsonResource, not JSON:API (no type/attributes wrapper, no sale_id). */
export interface SaleItemJson {
  id: string;
  product_id: string | null;
  variant_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  list_price: number;
  unit_cost: number;
  replaced_by_product_id?: string | null;
  replaced_by_product_name?: string | null;
  addons?: {
    id: string;
    addon_group_item_id: string | null;
    quantity: number;
    price_at_purchase: number;
    name_snapshot: string;
  }[];
}

export function toSaleItem(json: SaleItemJson, saleId: string): SaleItem {
  return {
    id: json.id,
    saleId,
    productId: json.product_id,
    variantId: json.variant_id ?? null,
    productName: json.product_name,
    quantity: Number(json.quantity),
    unitPrice: Number(json.unit_price),
    listPrice: Number(json.list_price ?? json.unit_price),
    unitCost: Number(json.unit_cost ?? 0),
    subtotal: Number(json.subtotal),
    replacedByProductId: json.replaced_by_product_id ?? null,
    replacedByProductName: json.replaced_by_product_name ?? null,
    addons: (json.addons ?? []).map(
      (addon): SaleItemAddon => ({
        id: addon.id,
        addonGroupItemId: addon.addon_group_item_id,
        quantity: Number(addon.quantity),
        priceAtPurchase: Number(addon.price_at_purchase),
        nameSnapshot: addon.name_snapshot,
      }),
    ),
  };
}

export interface SaleAttrs {
  invoice_number?: string | null;
  user_id: string | null;
  customer_id: string | null;
  total_amount: number;
  discount_amount: number | null;
  payment_method: string | null;
  status: string;
  device_id: string | null;
  location_id?: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_contact: string | null;
  is_paid: boolean | null;
  fulfillment: string | null;
  delivery_completed: boolean | null;
  company_id?: string | null;
  created_at: string | null;
  synced_at: string | null;
  updated_at: string | null;
  items?: SaleItemJson[];
}

export function toSale(resource: JsonApiResource<SaleAttrs>): Sale {
  const a = resource.attributes;
  return {
    id: resource.id,
    invoiceNumber: a.invoice_number ?? null,
    userId: a.user_id,
    totalAmount: Number(a.total_amount),
    discountAmount: Number(a.discount_amount ?? 0),
    paymentMethod: a.payment_method as PaymentMethod | null,
    status: a.status as SaleStatus,
    deviceId: a.device_id,
    createdAt: a.created_at ?? "",
    customerId: a.customer_id,
    customerName: a.customer_name,
    customerAddress: a.customer_address,
    customerContact: a.customer_contact,
    isPaid: a.is_paid ?? true,
    fulfillment: (a.fulfillment as Fulfillment) ?? "pickup",
    deliveryCompleted: a.delivery_completed ?? false,
    companyId: a.company_id,
    locationId: a.location_id ?? null,
  };
}

export function toSaleWithItems(resource: JsonApiResource<SaleAttrs>): Sale & { items: SaleItem[] } {
  return {
    ...toSale(resource),
    items: (resource.attributes.items ?? []).map((item) => toSaleItem(item, resource.id)),
  };
}

export interface SupplierAttrs {
  name: string;
  contact_person: string | null;
  phone: string | null;
  secondary_phone: string | null;
  email: string | null;
  secondary_email: string | null;
  address: string | null;
  tin: string | null;
  notes: string | null;
  is_active: boolean;
  products_count: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export function toSupplier(resource: JsonApiResource<SupplierAttrs>): Supplier {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    contactPerson: a.contact_person,
    phone: a.phone,
    secondaryPhone: a.secondary_phone,
    email: a.email,
    secondaryEmail: a.secondary_email,
    address: a.address,
    tin: a.tin ?? null,
    notes: a.notes,
    isActive: a.is_active,
    productsCount: a.products_count ?? null,
    createdAt: a.created_at ?? "",
    updatedAt: a.updated_at ?? "",
  };
}

/** Nested under a purchase order — plain JsonResource, no purchase_order_id/timestamps. */
export interface PurchaseOrderItemJson {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  line_total: number;
  note: string | null;
}

export function toPurchaseOrderItem(json: PurchaseOrderItemJson, purchaseOrderId: string): PurchaseOrderItem {
  return {
    id: json.id,
    purchaseOrderId,
    productId: json.product_id,
    productName: json.product_name,
    quantityOrdered: Number(json.quantity_ordered),
    quantityReceived: Number(json.quantity_received),
    unitCost: Number(json.unit_cost),
    lineTotal: Number(json.line_total),
    note: json.note,
    // Laravel's nested item JSON carries no timestamps; PurchaseOrderItem
    // requires them, so callers needing accurate values must fetch the item
    // via its own show endpoint. Nested reads only ever display fields above.
    createdAt: "",
    updatedAt: "",
  };
}

/** Nested under a purchase order — plain JsonResource, no purchase_order_id/timestamps. */
export interface PurchaseOrderPaymentJson {
  id: string;
  term_number: number;
  due_date: string | null;
  amount: number;
  is_paid: boolean;
  paid_date: string | null;
  note: string | null;
}

export function toPurchaseOrderPayment(
  json: PurchaseOrderPaymentJson,
  purchaseOrderId: string,
): PurchaseOrderPayment {
  return {
    id: json.id,
    purchaseOrderId,
    termNumber: json.term_number,
    dueDate: json.due_date,
    amount: Number(json.amount),
    isPaid: json.is_paid,
    paidDate: json.paid_date,
    note: json.note,
    createdAt: "",
    updatedAt: "",
  };
}

export interface PurchaseOrderAttrs {
  supplier_id: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  reference_no: string | null;
  notes: string | null;
  total_amount: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  items?: PurchaseOrderItemJson[];
  payments?: PurchaseOrderPaymentJson[];
}

export function toPurchaseOrder(resource: JsonApiResource<PurchaseOrderAttrs>): PurchaseOrder {
  const a = resource.attributes;
  return {
    id: resource.id,
    supplierId: a.supplier_id,
    status: a.status as PurchaseOrderStatus,
    orderDate: a.order_date,
    expectedDate: a.expected_date,
    referenceNo: a.reference_no,
    notes: a.notes,
    totalAmount: Number(a.total_amount),
    createdBy: a.created_by,
    createdAt: a.created_at ?? "",
    updatedAt: a.updated_at ?? "",
  };
}

export function toPurchaseOrderWithLines(
  resource: JsonApiResource<PurchaseOrderAttrs>,
): PurchaseOrder & { items: PurchaseOrderItem[]; payments: PurchaseOrderPayment[] } {
  return {
    ...toPurchaseOrder(resource),
    items: (resource.attributes.items ?? []).map((item) => toPurchaseOrderItem(item, resource.id)),
    payments: (resource.attributes.payments ?? []).map((payment) => toPurchaseOrderPayment(payment, resource.id)),
  };
}

export interface InventoryMovementAttrs {
  product_id: string;
  product_name?: string | null;
  location_id?: string | null;
  change_quantity: number;
  reason: string;
  reference_id: string | null;
  note: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string | null;
}

export function toInventoryMovement(resource: JsonApiResource<InventoryMovementAttrs>): InventoryMovement {
  const a = resource.attributes;
  return {
    id: resource.id,
    productId: a.product_id,
    productName: a.product_name ?? null,
    locationId: a.location_id ?? null,
    changeQuantity: Number(a.change_quantity),
    reason: a.reason as InventoryReason,
    referenceId: a.reference_id,
    note: a.note,
    createdBy: a.created_by,
    createdByName: a.created_by_name ?? null,
    createdAt: a.created_at ?? "",
  };
}

export interface CompanyAttrs {
  name: string;
  is_active: boolean;
  invoice_number_mode?: string | null;
  ai_plan_id?: number;
  created_at: string | null;
}

export function toCompany(resource: JsonApiResource<CompanyAttrs>): Company {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    isActive: a.is_active,
    invoiceNumberMode: a.invoice_number_mode === "incremental" ? "incremental" : "random",
    aiPlanId: (a.ai_plan_id ?? 1) as AiPlanId,
    createdAt: a.created_at ?? "",
  };
}

export interface CompanyStatsAttrs extends CompanyAttrs {
  ai_plan_id?: number;
  product_count: number;
  category_count: number;
  supplier_count: number;
  customer_count: number;
  sale_count: number;
  user_count: number;
  stock_units: number;
}

export function toCompanyStats(resource: JsonApiResource<CompanyStatsAttrs>): CompanyStats {
  const a = resource.attributes;
  return {
    ...toCompany(resource),
    productCount: a.product_count,
    categoryCount: a.category_count,
    supplierCount: a.supplier_count,
    customerCount: a.customer_count,
    saleCount: a.sale_count,
    userCount: a.user_count,
    stockUnits: a.stock_units,
  };
}

export interface LocationAttrs {
  company_id: string;
  name: string;
  type: string;
  address: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export function toLocation(resource: JsonApiResource<LocationAttrs>): Location {
  const a = resource.attributes;
  return {
    id: resource.id,
    companyId: a.company_id,
    name: a.name,
    type: a.type as LocationType,
    address: a.address,
    isActive: a.is_active,
    createdAt: a.created_at ?? "",
    updatedAt: a.updated_at ?? "",
  };
}

export interface StockTransferAttrs {
  company_id: string;
  from_location_id: string;
  to_location_id: string;
  from_location_name: string | null;
  to_location_name: string | null;
  status: string;
  created_by: string | null;
  received_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string | null;
    quantity: number;
  }>;
}

export function toStockTransfer(resource: JsonApiResource<StockTransferAttrs>): StockTransfer {
  const a = resource.attributes;
  return {
    id: resource.id,
    companyId: a.company_id,
    fromLocationId: a.from_location_id,
    toLocationId: a.to_location_id,
    fromLocationName: a.from_location_name,
    toLocationName: a.to_location_name,
    status: a.status as StockTransferStatus,
    createdBy: a.created_by,
    receivedAt: a.received_at,
    createdAt: a.created_at ?? "",
    updatedAt: a.updated_at ?? "",
    items: (a.items ?? []).map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: Number(item.quantity),
    })),
  };
}
