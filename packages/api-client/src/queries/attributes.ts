import { ApiError, type ApiClient, type JsonApiResource } from "../http";
import { appendMultipartFile, type MultipartFile } from "../multipart";

export interface CompanyAttributeValue {
  id: string;
  companyAttributeId: string;
  value: string;
  sortOrder: number;
  hexCode: string | null;
}

export interface CompanyAttribute {
  id: string;
  name: string;
  displayType: "dropdown" | "color_swatch" | "text";
  values: CompanyAttributeValue[];
}

/** One supplier this variant is sourced from, at its own SKU/price — see ProductVariantSupplier (Laravel). */
export interface VariantSupplierLink {
  /** The product_variant_suppliers row's own id — pass as excludePivotId/for update-delete calls. */
  id: string;
  supplierId: string;
  supplierName: string | null;
  supplierSku: string | null;
  /** "SUP-{supplierName}-{supplierSku}" — composed live, always unambiguous since each link owns exactly one supplier. */
  supplierSkuDisplay: string | null;
  supplierPrice: number | null;
  isDefault: boolean;
  lastOrderedAt: string | null;
}

export type PricingStrategy = "highest" | "lowest" | "weighted_average";
export type MarginType = "percent" | "fixed";

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string | null;
  barcode: string | null;
  /** Falls back to the parent product's own photo when this variant has none of its own. */
  photoUrl: string | null;
  /** Whether photoUrl is this variant's own photo (true) vs inherited from the product (false) — a Remove action only makes sense when true. */
  hasOwnPhoto: boolean;
  price: number;
  /** Resolved from `suppliers[].supplierPrice` per `pricingStrategy` — margin reporting only, not merchant-editable. */
  costPrice: number;
  pricingStrategy: PricingStrategy;
  unitId: string | null;
  unit: { id: string; name: string; abbreviation: string | null } | null;
  reorderPoint: number;
  replenishQuantity: number;
  /** Merchant-set suggestion input only — "percent" is cost * (1 + marginValue/100) (see `shelfPriceFromMarkup`), "fixed" is cost + marginValue (a flat peso amount). Never auto-applied to price. */
  marginType: MarginType;
  marginValue: number | null;
  isDefault: boolean;
  isActive: boolean;
  isBundle: boolean;
  /** This kit SKU's recipe. Empty when not a kit / not loaded. */
  bundleItems: {
    productId: string;
    name: string | null;
    sku: string | null;
    unit: string | null;
    quantity: number;
    costPrice: number;
  }[];
  attributeValues: { companyAttributeId: string | null; companyAttributeValueId: string; value: string | null }[];
  /** Every supplier this variant is sourced from — a t-shirt's Red/L might come from a different supplier (and code/price) than its Blue/S. */
  suppliers: VariantSupplierLink[];
  /** Company-wide total across every location. Null only when the query this came from never selected it. */
  stockQuantity: number | null;
}

interface CompanyAttributeValueAttrs {
  company_attribute_id: string;
  value: string;
  sort_order: number;
  hex_code: string | null;
}

interface CompanyAttributeAttrs {
  name: string;
  display_type: string;
  values: { id: string; value: string; sort_order: number; hex_code: string | null }[];
}

/** Shape when nested inside a variant's own `suppliers[]` array (VariantSupplierLinks::toArray, PHP) — a plain array item, so its own id is embedded rather than living at the JsonApi resource's top level. */
interface VariantSupplierLinkAttrs {
  id: string;
  supplier_id: string;
  supplier_name: string | null;
  supplier_sku: string | null;
  supplier_sku_display: string | null;
  supplier_price: number | null;
  is_default: boolean;
  last_ordered_at: string | null;
}

/** Shape when this link is its own top-level JsonApi resource (ProductVariantSupplierResource — add/update endpoints) — the id lives on the resource itself, not inside attributes. */
interface StandaloneVariantSupplierLinkAttrs {
  variant_id: string;
  supplier_id: string;
  supplier_name: string | null;
  supplier_sku: string | null;
  supplier_sku_display: string | null;
  supplier_price: number | null;
  is_default: boolean;
  last_ordered_at: string | null;
}

function toVariantSupplierLinkResource(resource: JsonApiResource<StandaloneVariantSupplierLinkAttrs>): VariantSupplierLink {
  const a = resource.attributes;
  return {
    id: resource.id,
    supplierId: a.supplier_id,
    supplierName: a.supplier_name,
    supplierSku: a.supplier_sku,
    supplierSkuDisplay: a.supplier_sku_display ?? a.supplier_sku,
    supplierPrice: a.supplier_price,
    isDefault: a.is_default,
    lastOrderedAt: a.last_ordered_at,
  };
}

interface ProductVariantAttrs {
  product_id: string;
  sku: string | null;
  barcode: string | null;
  photo_url: string | null;
  has_own_photo: boolean;
  price: number;
  cost_price: number;
  pricing_strategy: PricingStrategy;
  unit_id: string | null;
  unit: { id: string; name: string; abbreviation: string | null } | null;
  reorder_point: number;
  replenish_quantity: number;
  margin_type: MarginType;
  margin_value: number | null;
  is_default: boolean;
  is_active: boolean;
  is_bundle: boolean;
  bundle_items?: {
    product_id: string;
    name: string | null;
    sku: string | null;
    unit: string | null;
    quantity: number;
    cost_price: number;
  }[];
  attribute_values: { company_attribute_id: string | null; company_attribute_value_id: string; value: string | null }[];
  suppliers: VariantSupplierLinkAttrs[];
  stock_quantity: number | null;
}

function toVariantSupplierLink(a: VariantSupplierLinkAttrs): VariantSupplierLink {
  return {
    id: a.id,
    supplierId: a.supplier_id,
    supplierName: a.supplier_name,
    supplierSku: a.supplier_sku,
    supplierSkuDisplay: a.supplier_sku_display ?? a.supplier_sku,
    supplierPrice: a.supplier_price,
    isDefault: a.is_default,
    lastOrderedAt: a.last_ordered_at,
  };
}

function toCompanyAttributeValue(resource: JsonApiResource<CompanyAttributeValueAttrs>): CompanyAttributeValue {
  const a = resource.attributes;
  return {
    id: resource.id,
    companyAttributeId: a.company_attribute_id,
    value: a.value,
    sortOrder: a.sort_order,
    hexCode: a.hex_code,
  };
}

function toCompanyAttribute(resource: JsonApiResource<CompanyAttributeAttrs>): CompanyAttribute {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    displayType: a.display_type as CompanyAttribute["displayType"],
    values: a.values.map((value) => ({
      id: value.id,
      companyAttributeId: resource.id,
      value: value.value,
      sortOrder: value.sort_order,
      hexCode: value.hex_code,
    })),
  };
}

function toProductVariant(resource: JsonApiResource<ProductVariantAttrs>): ProductVariant {
  const a = resource.attributes;
  return {
    id: resource.id,
    productId: a.product_id,
    sku: a.sku,
    barcode: a.barcode,
    photoUrl: a.photo_url,
    hasOwnPhoto: a.has_own_photo,
    price: Number(a.price),
    costPrice: Number(a.cost_price),
    pricingStrategy: a.pricing_strategy,
    unitId: a.unit_id,
    unit: a.unit,
    reorderPoint: a.reorder_point,
    replenishQuantity: a.replenish_quantity,
    marginType: a.margin_type,
    marginValue: a.margin_value !== null ? Number(a.margin_value) : null,
    isDefault: a.is_default,
    isActive: a.is_active,
    isBundle: Boolean(a.is_bundle),
    bundleItems: (a.bundle_items ?? []).map((item) => ({
      productId: item.product_id,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      quantity: Number(item.quantity),
      costPrice: Number(item.cost_price),
    })),
    attributeValues: (a.attribute_values ?? []).map((value) => ({
      companyAttributeId: value.company_attribute_id,
      companyAttributeValueId: value.company_attribute_value_id,
      value: value.value,
    })),
    suppliers: (a.suppliers ?? []).map(toVariantSupplierLink),
    stockQuantity: a.stock_quantity !== null ? Number(a.stock_quantity) : null,
  };
}

export async function listCompanyAttributes(client: ApiClient): Promise<CompanyAttribute[]> {
  const { data } = await client.get<{ data: JsonApiResource<CompanyAttributeAttrs>[] }>("/attributes");
  return data.map(toCompanyAttribute);
}

export async function createCompanyAttribute(
  client: ApiClient,
  input: { name: string; displayType?: CompanyAttribute["displayType"] },
): Promise<CompanyAttribute> {
  const { data } = await client.post<{ data: JsonApiResource<CompanyAttributeAttrs> }>("/attributes", {
    name: input.name,
    display_type: input.displayType,
  });
  return toCompanyAttribute(data);
}

export async function deleteCompanyAttribute(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/attributes/${id}`);
}

export async function createCompanyAttributeValue(
  client: ApiClient,
  attributeId: string,
  input: { value: string; sortOrder?: number; hexCode?: string | null },
): Promise<CompanyAttributeValue> {
  const { data } = await client.post<{ data: JsonApiResource<CompanyAttributeValueAttrs> }>(
    `/attributes/${attributeId}/values`,
    { value: input.value, sort_order: input.sortOrder, hex_code: input.hexCode },
  );
  return toCompanyAttributeValue(data);
}

export async function deleteCompanyAttributeValue(client: ApiClient, valueId: string): Promise<void> {
  await client.delete(`/attributes/values/${valueId}`);
}

/** Attributes already attached to this product (with their full value sets), for the product form's Attributes section. */
export async function listProductAttributes(client: ApiClient, productId: string): Promise<CompanyAttribute[]> {
  const { data } = await client.get<{ data: JsonApiResource<CompanyAttributeAttrs>[] }>(
    `/products/${productId}/attributes`,
  );
  return data.map(toCompanyAttribute);
}

export async function attachProductAttribute(
  client: ApiClient,
  productId: string,
  companyAttributeId: string,
): Promise<void> {
  await client.post(`/products/${productId}/attributes`, { company_attribute_id: companyAttributeId });
}

export async function detachProductAttribute(
  client: ApiClient,
  productId: string,
  companyAttributeId: string,
): Promise<void> {
  await client.delete(`/products/${productId}/attributes/${companyAttributeId}`);
}

export async function listProductVariants(client: ApiClient, productId: string): Promise<ProductVariant[]> {
  const { data } = await client.get<{ data: JsonApiResource<ProductVariantAttrs>[] }>(
    `/products/${productId}/variants`,
  );
  return data.map(toProductVariant);
}

export async function generateProductVariants(
  client: ApiClient,
  productId: string,
  attributes: { companyAttributeId: string; valueIds: string[] }[],
): Promise<ProductVariant[]> {
  const { data } = await client.post<{ data: JsonApiResource<ProductVariantAttrs>[] }>(
    `/products/${productId}/variants/generate`,
    {
      attributes: attributes.map((a) => ({ company_attribute_id: a.companyAttributeId, value_ids: a.valueIds })),
    },
  );
  return data.map(toProductVariant);
}

/**
 * One shot for a product with no attribute yet: create the attribute, its
 * values, attach it, and generate a variant per value — see
 * QuickCreateAttributeAndGenerateVariantsAction. The first value reuses
 * the product's existing default variant (its own SKU/price/stock carry
 * over); the rest are fresh, same as generateProductVariants().
 */
export async function quickCreateAttributeAndGenerateVariants(
  client: ApiClient,
  productId: string,
  input: { attributeName: string; values: string[] },
): Promise<ProductVariant[]> {
  const { data } = await client.post<{ data: JsonApiResource<ProductVariantAttrs>[] }>(
    `/products/${productId}/attributes/quick-create`,
    { attribute_name: input.attributeName, values: input.values },
  );
  return data.map(toProductVariant);
}

export async function updateProductVariant(
  client: ApiClient,
  variantId: string,
  patch: Partial<{
    sku: string | null;
    barcode: string | null;
    price: number;
    pricingStrategy: PricingStrategy;
    unitId: string | null;
    reorderPoint: number;
    replenishQuantity: number;
    marginType: MarginType;
    marginValue: number | null;
    isActive: boolean;
    isBundle: boolean;
  }>,
): Promise<ProductVariant> {
  const payload: Record<string, unknown> = {};
  if (patch.sku !== undefined) payload.sku = patch.sku;
  if (patch.barcode !== undefined) payload.barcode = patch.barcode;
  if (patch.price !== undefined) payload.price = patch.price;
  if (patch.pricingStrategy !== undefined) payload.pricing_strategy = patch.pricingStrategy;
  if (patch.unitId !== undefined) payload.unit_id = patch.unitId;
  if (patch.reorderPoint !== undefined) payload.reorder_point = patch.reorderPoint;
  if (patch.replenishQuantity !== undefined) payload.replenish_quantity = patch.replenishQuantity;
  if (patch.marginType !== undefined) payload.margin_type = patch.marginType;
  if (patch.marginValue !== undefined) payload.margin_value = patch.marginValue;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;
  if (patch.isBundle !== undefined) payload.is_bundle = patch.isBundle;

  const { data } = await client.patch<{ data: JsonApiResource<ProductVariantAttrs> }>(
    `/product-variants/${variantId}`,
    payload,
  );
  return toProductVariant(data);
}

/** Replace-all recipe for one kit SKU. */
export async function setVariantBundleItems(
  client: ApiClient,
  variantId: string,
  items: { productId: string; quantity: number }[],
): Promise<ProductVariant> {
  const { data } = await client.put<{ data: JsonApiResource<ProductVariantAttrs> }>(
    `/product-variants/${variantId}/bundle-items`,
    { items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity })) },
  );
  return toProductVariant(data);
}

/** Convert component stock into this kit SKU's stock at one location. */
export async function assembleVariantBundle(
  client: ApiClient,
  variantId: string,
  input: { quantity: number; locationId: string; note?: string | null },
): Promise<ProductVariant> {
  const { data } = await client.post<{ data: JsonApiResource<ProductVariantAttrs> }>(
    `/product-variants/${variantId}/assemble`,
    { quantity: input.quantity, location_id: input.locationId, note: input.note },
  );
  return toProductVariant(data);
}

/** Links one supplier to this variant, with its own SKU/price — the first link a variant ever gets becomes its default automatically. */
export async function addProductVariantSupplier(
  client: ApiClient,
  variantId: string,
  input: { supplierId: string; supplierSku?: string | null; supplierPrice?: number | null },
): Promise<VariantSupplierLink> {
  const { data } = await client.post<{ data: JsonApiResource<StandaloneVariantSupplierLinkAttrs> }>(
    `/product-variants/${variantId}/suppliers`,
    {
      supplier_id: input.supplierId,
      supplier_sku: input.supplierSku,
      supplier_price: input.supplierPrice,
    },
  );
  return toVariantSupplierLinkResource(data);
}

/** Edits one existing link's own SKU/price/default flag. Setting isDefault unsets any other default for the same variant. */
export async function updateProductVariantSupplier(
  client: ApiClient,
  linkId: string,
  patch: Partial<{ supplierSku: string | null; supplierPrice: number | null; isDefault: boolean }>,
): Promise<VariantSupplierLink> {
  const payload: Record<string, unknown> = {};
  if (patch.supplierSku !== undefined) payload.supplier_sku = patch.supplierSku;
  if (patch.supplierPrice !== undefined) payload.supplier_price = patch.supplierPrice;
  if (patch.isDefault !== undefined) payload.is_default = patch.isDefault;

  const { data } = await client.patch<{ data: JsonApiResource<StandaloneVariantSupplierLinkAttrs> }>(
    `/product-variant-suppliers/${linkId}`,
    payload,
  );
  return toVariantSupplierLinkResource(data);
}

export async function removeProductVariantSupplier(client: ApiClient, linkId: string): Promise<void> {
  await client.delete(`/product-variant-suppliers/${linkId}`);
}

export async function deleteProductVariant(client: ApiClient, variantId: string): Promise<void> {
  try {
    await client.delete(`/product-variants/${variantId}`);
  } catch (error) {
    if (error instanceof ApiError && error.isValidation) {
      throw new Error(Object.values(error.errors ?? {})[0]?.[0] ?? "Could not delete this variant.");
    }
    throw error;
  }
}

/** Server resizes to a mobile-friendly size and re-encodes as WebP — send the original file as-is. */
export async function uploadProductVariantPhoto(
  client: ApiClient,
  variantId: string,
  photo: MultipartFile,
): Promise<ProductVariant> {
  const formData = new FormData();
  await appendMultipartFile(formData, "photo", photo);
  const { data } = await client.postMultipart<{ data: JsonApiResource<ProductVariantAttrs> }>(
    `/product-variants/${variantId}/photo`,
    formData,
  );
  return toProductVariant(data);
}

export async function deleteProductVariantPhoto(client: ApiClient, variantId: string): Promise<ProductVariant> {
  const { data } = await client.delete<{ data: JsonApiResource<ProductVariantAttrs> }>(
    `/product-variants/${variantId}/photo`,
  );
  return toProductVariant(data);
}

/** One image in a variant's gallery — see ProductVariant.photoUrl for the single "cover" image every other reader (POS tiles, receipts, mobile sync) relies on instead. */
export interface VariantGalleryPhoto {
  id: string;
  variantId: string;
  url: string;
  sortOrder: number;
  isCover: boolean;
  createdAt: string | null;
}

interface VariantGalleryPhotoAttrs {
  variant_id: string;
  url: string;
  sort_order: number;
  is_cover: boolean;
  created_at: string | null;
}

function toVariantGalleryPhoto(resource: JsonApiResource<VariantGalleryPhotoAttrs>): VariantGalleryPhoto {
  const a = resource.attributes;
  return {
    id: resource.id,
    variantId: a.variant_id,
    url: a.url,
    sortOrder: a.sort_order,
    isCover: a.is_cover,
    createdAt: a.created_at,
  };
}

export async function listVariantPhotos(client: ApiClient, variantId: string): Promise<VariantGalleryPhoto[]> {
  const { data } = await client.get<{ data: JsonApiResource<VariantGalleryPhotoAttrs>[] }>(
    `/product-variants/${variantId}/photos`,
  );
  return data.map(toVariantGalleryPhoto);
}

/** Adds one photo to the gallery. First photo for a variant is auto-promoted to cover server-side. */
export async function uploadVariantPhoto(
  client: ApiClient,
  variantId: string,
  photo: MultipartFile,
): Promise<VariantGalleryPhoto[]> {
  const formData = new FormData();
  await appendMultipartFile(formData, "photo", photo);
  const { data } = await client.postMultipart<{ data: JsonApiResource<VariantGalleryPhotoAttrs>[] }>(
    `/product-variants/${variantId}/photos`,
    formData,
  );
  return data.map(toVariantGalleryPhoto);
}

/** Removing the cover promotes the next photo (if any) server-side. */
export async function deleteVariantPhoto(client: ApiClient, photoId: string): Promise<VariantGalleryPhoto[]> {
  const { data } = await client.delete<{ data: JsonApiResource<VariantGalleryPhotoAttrs>[] }>(
    `/product-variant-photos/${photoId}`,
  );
  return data.map(toVariantGalleryPhoto);
}

export async function reorderVariantPhotos(
  client: ApiClient,
  variantId: string,
  photoIds: string[],
  setCoverId?: string,
): Promise<VariantGalleryPhoto[]> {
  const { data } = await client.patch<{ data: JsonApiResource<VariantGalleryPhotoAttrs>[] }>(
    `/product-variants/${variantId}/photos/reorder`,
    { photo_ids: photoIds, set_cover_id: setCoverId },
  );
  return data.map(toVariantGalleryPhoto);
}

export interface VariantLocationStock {
  locationId: string;
  locationName: string;
  quantity: number;
}

/** Every active branch's current quantity for this variant — zero-filled for branches with no stock row yet. */
export async function getVariantStockByLocation(client: ApiClient, variantId: string): Promise<VariantLocationStock[]> {
  const { data } = await client.get<{
    data: { location_id: string; location_name: string; quantity: number }[];
  }>(`/product-variants/${variantId}/stock-by-location`);
  return data.map((row) => ({
    locationId: row.location_id,
    locationName: row.location_name,
    quantity: Number(row.quantity),
  }));
}
