import { ApiError, type ApiClient, type JsonApiResource } from "../http";

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

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string | null;
  supplierSku: string | null;
  barcode: string | null;
  price: number;
  costPrice: number;
  isDefault: boolean;
  isActive: boolean;
  attributeValues: { companyAttributeId: string | null; companyAttributeValueId: string; value: string | null }[];
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

interface ProductVariantAttrs {
  product_id: string;
  sku: string | null;
  supplier_sku: string | null;
  barcode: string | null;
  price: number;
  cost_price: number;
  is_default: boolean;
  is_active: boolean;
  attribute_values: { company_attribute_id: string | null; company_attribute_value_id: string; value: string | null }[];
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
    supplierSku: a.supplier_sku,
    barcode: a.barcode,
    price: Number(a.price),
    costPrice: Number(a.cost_price),
    isDefault: a.is_default,
    isActive: a.is_active,
    attributeValues: (a.attribute_values ?? []).map((value) => ({
      companyAttributeId: value.company_attribute_id,
      companyAttributeValueId: value.company_attribute_value_id,
      value: value.value,
    })),
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

export async function updateProductVariant(
  client: ApiClient,
  variantId: string,
  patch: Partial<{
    sku: string | null;
    supplierSku: string | null;
    barcode: string | null;
    price: number;
    costPrice: number;
    isActive: boolean;
  }>,
): Promise<ProductVariant> {
  const payload: Record<string, unknown> = {};
  if (patch.sku !== undefined) payload.sku = patch.sku;
  if (patch.supplierSku !== undefined) payload.supplier_sku = patch.supplierSku;
  if (patch.barcode !== undefined) payload.barcode = patch.barcode;
  if (patch.price !== undefined) payload.price = patch.price;
  if (patch.costPrice !== undefined) payload.cost_price = patch.costPrice;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;

  const { data } = await client.patch<{ data: JsonApiResource<ProductVariantAttrs> }>(
    `/product-variants/${variantId}`,
    payload,
  );
  return toProductVariant(data);
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
