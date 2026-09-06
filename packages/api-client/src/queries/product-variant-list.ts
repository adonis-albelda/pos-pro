import type { ApiClient, JsonApiPage, JsonApiResource } from "../http";
import type { ProductSort, ProductStockState } from "./products";

/**
 * One row per variant, company-wide — the Products page's variant view.
 * Distinct from `ProductVariant` in `./attributes` (that one is a single
 * product's own variant-CRUD shape); this one borrows the parent product's
 * own fields (name/category/unit/reorder point/...) that a variant has no
 * concept of, since `GET /product-variants` joins back to `products` for
 * exactly that reason — see IndexAllProductVariantsController (Laravel).
 */
export interface ProductVariantListRow {
  id: string;
  productId: string;
  productName: string;
  productCategory: string | null;
  productCategoryId: string | null;
  productUnit: string;
  productReorderPoint: number;
  productPhotoUrl: string | null;
  productIsBundle: boolean;
  productIsActive: boolean;
  sku: string | null;
  barcode: string | null;
  price: number;
  costPrice: number;
  stockQuantity: number;
  isDefault: boolean;
  isActive: boolean;
  /** e.g. ["Red", "L"] — empty when this is a product's only/default variant. */
  attributeValues: { companyAttributeId: string | null; companyAttributeValueId: string; value: string | null }[];
  /** Every supplier this variant is sourced from, each at its own SKU/price — see VariantSupplierLink (./attributes). */
  suppliers: {
    id: string;
    supplierId: string;
    supplierName: string | null;
    supplierSku: string | null;
    supplierSkuDisplay: string | null;
    supplierPrice: number | null;
    isDefault: boolean;
  }[];
  updatedAt: string;
}

interface ProductVariantListAttrs {
  product_id: string;
  product_name: string;
  product_category: string | null;
  product_category_id: string | null;
  product_unit: string;
  product_reorder_point: number;
  product_photo_url: string | null;
  product_is_bundle: boolean;
  product_is_active: boolean;
  sku: string | null;
  barcode: string | null;
  price: number;
  cost_price: number;
  stock_quantity: number;
  is_default: boolean;
  is_active: boolean;
  attribute_values: { company_attribute_id: string | null; company_attribute_value_id: string; value: string | null }[];
  suppliers: {
    id: string;
    supplier_id: string;
    supplier_name: string | null;
    supplier_sku: string | null;
    supplier_sku_display: string | null;
    supplier_price: number | null;
    is_default: boolean;
  }[];
  updated_at: string;
}

function toProductVariantListRow(resource: JsonApiResource<ProductVariantListAttrs>): ProductVariantListRow {
  const a = resource.attributes;
  return {
    id: resource.id,
    productId: a.product_id,
    productName: a.product_name,
    productCategory: a.product_category,
    productCategoryId: a.product_category_id,
    productUnit: a.product_unit,
    productReorderPoint: a.product_reorder_point,
    productPhotoUrl: a.product_photo_url,
    productIsBundle: a.product_is_bundle,
    productIsActive: a.product_is_active,
    sku: a.sku,
    barcode: a.barcode,
    price: Number(a.price),
    costPrice: Number(a.cost_price),
    stockQuantity: Number(a.stock_quantity),
    isDefault: a.is_default,
    isActive: a.is_active,
    attributeValues: (a.attribute_values ?? []).map((value) => ({
      companyAttributeId: value.company_attribute_id,
      companyAttributeValueId: value.company_attribute_value_id,
      value: value.value,
    })),
    suppliers: (a.suppliers ?? []).map((link) => ({
      id: link.id,
      supplierId: link.supplier_id,
      supplierName: link.supplier_name,
      supplierSku: link.supplier_sku,
      supplierSkuDisplay: link.supplier_sku_display ?? link.supplier_sku,
      supplierPrice: link.supplier_price,
      isDefault: link.is_default,
    })),
    updatedAt: a.updated_at,
  };
}

export interface ListProductVariantsPageOptions {
  q?: string;
  page?: number;
  pageSize?: number;
  includeInactive?: boolean;
  categoryId?: string;
  supplierId?: string;
  locationId?: string;
  state?: ProductStockState;
  sort?: ProductSort;
  trashed?: "only";
}

export async function listProductVariantsPage(
  client: ApiClient,
  options: ListProductVariantsPageOptions = {},
): Promise<{ variants: ProductVariantListRow[]; total: number; lastPage: number }> {
  const page = await client.get<JsonApiPage<ProductVariantListAttrs>>("/product-variants", {
    search: options.q,
    category_id: options.categoryId,
    supplier_id: options.supplierId,
    location_id: options.locationId,
    is_active: options.state || options.includeInactive ? undefined : true,
    state: options.state,
    sort: options.sort,
    trashed: options.trashed,
    page: options.page ?? 1,
    per_page: options.pageSize ?? 25,
  });

  return {
    variants: page.data.map(toProductVariantListRow),
    total: page.meta?.total ?? page.data.length,
    lastPage: page.meta?.last_page ?? 1,
  };
}
