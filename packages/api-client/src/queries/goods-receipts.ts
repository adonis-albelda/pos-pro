import { ApiError, type ApiClient, type JsonApiPage, type JsonApiResource } from "../http";

export interface ExtractedReceiptLine {
  name: string;
  sku: string | null;
  quantityReceived: number | null;
  unitCost: number | null;
  productId: string | null;
  matchedBy: "internal" | "supplier" | null;
  existingPrice: number | null;
  existingCostPrice: number | null;
  purchaseOrderItemId: string | null;
  quantityOrdered: number | null;
  isFlagged: boolean;
}

interface ExtractedReceiptLineAttrs {
  name: string;
  sku: string | null;
  quantity_received: number | null;
  unit_cost: number | null;
  product_id: string | null;
  matched_by: "internal" | "supplier" | null;
  existing_price: number | null;
  existing_cost_price: number | null;
  purchase_order_item_id: string | null;
  quantity_ordered: number | null;
  is_flagged: boolean;
}

function fromLineAttrs(line: ExtractedReceiptLineAttrs): ExtractedReceiptLine {
  return {
    name: line.name,
    sku: line.sku,
    quantityReceived: line.quantity_received,
    unitCost: line.unit_cost,
    productId: line.product_id,
    matchedBy: line.matched_by,
    existingPrice: line.existing_price,
    existingCostPrice: line.existing_cost_price,
    purchaseOrderItemId: line.purchase_order_item_id,
    quantityOrdered: line.quantity_ordered,
    isFlagged: line.is_flagged,
  };
}

/** Vision extraction runs server-side (DeliveryReceiptExtractor via Laravel AI / OpenAI). */
export async function extractGoodsReceiptPhoto(
  client: ApiClient,
  photo: File,
  purchaseOrderId?: string | null,
): Promise<ExtractedReceiptLine[]> {
  const formData = new FormData();
  formData.set("photo", photo);
  if (purchaseOrderId) {
    formData.set("purchase_order_id", purchaseOrderId);
  }

  const result = await client.postMultipart<{ data: ExtractedReceiptLineAttrs[] }>(
    "/goods-receipts/extract-photo",
    formData,
  );

  return result.data.map(fromLineAttrs);
}

export interface GoodsReceiptItem {
  id: string;
  productId: string | null;
  purchaseOrderItemId: string | null;
  matchedBy: "internal" | "supplier" | null;
  name: string;
  sku: string | null;
  quantityOrdered: number | null;
  quantityReceived: number;
  unitCost: number;
  appliedPrice: number | null;
  isFlagged: boolean;
  note: string | null;
}

export interface GoodsReceipt {
  id: string;
  locationId: string;
  supplierId: string | null;
  supplierName: string | null;
  purchaseOrderId: string | null;
  referenceNo: string | null;
  photoUrl: string | null;
  notes: string | null;
  hasDiscrepancy: boolean;
  receivedBy: string | null;
  receivedAt: string;
  items: GoodsReceiptItem[];
}

interface GoodsReceiptItemAttrs {
  id: string;
  product_id: string | null;
  purchase_order_item_id: string | null;
  matched_by: "internal" | "supplier" | null;
  name: string;
  sku: string | null;
  quantity_ordered: number | null;
  quantity_received: number;
  unit_cost: number;
  applied_price: number | null;
  is_flagged: boolean;
  note: string | null;
}

interface GoodsReceiptAttrs {
  location_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_order_id: string | null;
  reference_no: string | null;
  photo_url: string | null;
  notes: string | null;
  has_discrepancy: boolean;
  received_by: string | null;
  received_at: string;
  items: GoodsReceiptItemAttrs[];
}

function toGoodsReceipt(resource: JsonApiResource<GoodsReceiptAttrs>): GoodsReceipt {
  const attrs = resource.attributes;
  return {
    id: resource.id,
    locationId: attrs.location_id,
    supplierId: attrs.supplier_id,
    supplierName: attrs.supplier_name,
    purchaseOrderId: attrs.purchase_order_id,
    referenceNo: attrs.reference_no,
    photoUrl: attrs.photo_url,
    notes: attrs.notes,
    hasDiscrepancy: attrs.has_discrepancy,
    receivedBy: attrs.received_by,
    receivedAt: attrs.received_at,
    items: attrs.items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      purchaseOrderItemId: item.purchase_order_item_id,
      matchedBy: item.matched_by,
      name: item.name,
      sku: item.sku,
      quantityOrdered: item.quantity_ordered,
      quantityReceived: item.quantity_received,
      unitCost: item.unit_cost,
      appliedPrice: item.applied_price,
      isFlagged: item.is_flagged,
      note: item.note,
    })),
  };
}

export interface GoodsReceiptItemInput {
  name: string;
  sku: string | null;
  quantityReceived: number;
  unitCost: number;
  productId: string | null;
  matchedBy: "internal" | "supplier" | null;
  purchaseOrderItemId: string | null;
  quantityOrdered: number | null;
  appliedPrice: number | null;
  isFlagged: boolean;
  note: string | null;
}

export interface CreateGoodsReceiptInput {
  locationId: string;
  supplierId?: string | null;
  supplierName?: string | null;
  purchaseOrderId?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
  photo?: File | null;
  items: GoodsReceiptItemInput[];
}

function toItemsJson(items: GoodsReceiptItemInput[]): string {
  return JSON.stringify(
    items.map((item) => ({
      name: item.name,
      sku: item.sku,
      quantity_received: item.quantityReceived,
      unit_cost: item.unitCost,
      product_id: item.productId,
      matched_by: item.matchedBy,
      purchase_order_item_id: item.purchaseOrderItemId,
      quantity_ordered: item.quantityOrdered,
      applied_price: item.appliedPrice,
      is_flagged: item.isFlagged,
      note: item.note,
    })),
  );
}

export async function createGoodsReceipt(
  client: ApiClient,
  input: CreateGoodsReceiptInput,
): Promise<GoodsReceipt> {
  const formData = new FormData();
  formData.set("location_id", input.locationId);
  if (input.supplierId) formData.set("supplier_id", input.supplierId);
  if (input.supplierName) formData.set("supplier_name", input.supplierName);
  if (input.purchaseOrderId) formData.set("purchase_order_id", input.purchaseOrderId);
  if (input.referenceNo) formData.set("reference_no", input.referenceNo);
  if (input.notes) formData.set("notes", input.notes);
  if (input.photo) formData.set("photo", input.photo);
  formData.set("items_json", toItemsJson(input.items));

  const { data } = await client.postMultipart<{ data: JsonApiResource<GoodsReceiptAttrs> }>(
    "/goods-receipts",
    formData,
  );
  return toGoodsReceipt(data);
}

export interface GoodsReceiptsFilter {
  purchaseOrderId?: string;
  supplierId?: string;
  page?: number;
  pageSize?: number;
}

export async function listGoodsReceipts(
  client: ApiClient,
  filter: GoodsReceiptsFilter = {},
): Promise<GoodsReceipt[]> {
  const page = await client.get<JsonApiPage<GoodsReceiptAttrs>>("/goods-receipts", {
    purchase_order_id: filter.purchaseOrderId,
    supplier_id: filter.supplierId,
    page: filter.page ?? 1,
    per_page: filter.pageSize ?? 50,
  });
  return page.data.map(toGoodsReceipt);
}

export async function getGoodsReceipt(client: ApiClient, id: string): Promise<GoodsReceipt | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<GoodsReceiptAttrs> }>(
      `/goods-receipts/${id}`,
    );
    return toGoodsReceipt(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
