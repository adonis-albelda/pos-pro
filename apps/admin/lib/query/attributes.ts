"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addProductVariantSupplier,
  attachProductAttribute,
  createCompanyAttribute,
  createCompanyAttributeValue,
  deleteCompanyAttribute,
  deleteCompanyAttributeValue,
  deleteProductVariant,
  deleteProductVariantPhoto,
  deleteVariantPhoto,
  detachProductAttribute,
  generateProductVariants,
  getVariantStockByLocation,
  listCompanyAttributes,
  listProductAttributes,
  listProductVariants,
  listVariantPhotos,
  quickCreateAttributeAndGenerateVariants,
  removeProductVariantSupplier,
  reorderVariantPhotos,
  updateProductVariant,
  updateProductVariantSupplier,
  uploadProductVariantPhoto,
  uploadVariantPhoto,
  type ProductVariant,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useCompanyAttributes() {
  return useQuery({
    queryKey: queryKeys.attributes.list(),
    queryFn: () => listCompanyAttributes(getBrowserApiClient()),
  });
}

export function useCreateCompanyAttribute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createCompanyAttribute>[1]) =>
      createCompanyAttribute(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attributes.all });
    },
  });
}

/**
 * A product's attached-attributes query (`["products", "attributes",
 * productId]`) embeds each attribute's own values inline — it's a separate
 * cache entry from the company-wide list (`queryKeys.attributes`), so a
 * write that only touches an attribute's name/values still has to
 * invalidate this prefix too, or an already-open product page won't see it
 * without a full reload. productId isn't known inside these
 * not-product-scoped hooks, so this invalidates every product's attached
 * list rather than one.
 */
const PRODUCT_ATTRIBUTES_PREFIX = ["products", "attributes"] as const;

export function useDeleteCompanyAttribute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCompanyAttribute(getBrowserApiClient(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attributes.all });
      void queryClient.invalidateQueries({ queryKey: PRODUCT_ATTRIBUTES_PREFIX });
    },
  });
}

export function useCreateCompanyAttributeValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      attributeId,
      ...input
    }: { attributeId: string } & Parameters<typeof createCompanyAttributeValue>[2]) =>
      createCompanyAttributeValue(getBrowserApiClient(), attributeId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attributes.all });
      void queryClient.invalidateQueries({ queryKey: PRODUCT_ATTRIBUTES_PREFIX });
    },
  });
}

export function useDeleteCompanyAttributeValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (valueId: string) => deleteCompanyAttributeValue(getBrowserApiClient(), valueId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attributes.all });
      void queryClient.invalidateQueries({ queryKey: PRODUCT_ATTRIBUTES_PREFIX });
    },
  });
}

export function useProductAttributes(productId: string | null) {
  return useQuery({
    queryKey: ["products", "attributes", productId],
    queryFn: () => listProductAttributes(getBrowserApiClient(), productId as string),
    enabled: productId !== null,
  });
}

export function useProductVariants(productId: string | null) {
  return useQuery({
    queryKey: ["products", "variants", productId],
    queryFn: () => listProductVariants(getBrowserApiClient(), productId as string),
    enabled: productId !== null,
  });
}

export function useAttachProductAttribute(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyAttributeId: string) =>
      attachProductAttribute(getBrowserApiClient(), productId, companyAttributeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "attributes", productId] });
    },
  });
}

export function useDetachProductAttribute(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyAttributeId: string) =>
      detachProductAttribute(getBrowserApiClient(), productId, companyAttributeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "attributes", productId] });
    },
  });
}

export function useGenerateProductVariants(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attributes: Parameters<typeof generateProductVariants>[2]) =>
      generateProductVariants(getBrowserApiClient(), productId, attributes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
    },
  });
}

export function useQuickCreateAttributeAndGenerateVariants(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof quickCreateAttributeAndGenerateVariants>[2]) =>
      quickCreateAttributeAndGenerateVariants(getBrowserApiClient(), productId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attributes.all });
      void queryClient.invalidateQueries({ queryKey: ["products", "attributes", productId] });
      void queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
    },
  });
}

export function useUpdateProductVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, ...patch }: { variantId: string } & Parameters<typeof updateProductVariant>[2]) =>
      updateProductVariant(getBrowserApiClient(), variantId, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
    },
  });
}

/** Query key `useProductVariants` reads — kept in one place so the optimistic patches below can't drift from it. */
function variantsQueryKey(productId: string) {
  return ["products", "variants", productId] as const;
}

export function useAddProductVariantSupplier(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      variantId,
      ...input
    }: { variantId: string } & Parameters<typeof addProductVariantSupplier>[2]) =>
      addProductVariantSupplier(getBrowserApiClient(), variantId, input),
    // Patched into the cache directly instead of only invalidating — the
    // Sheet showing this list is driven by this same query's data, and
    // waiting on a background refetch left the drawer showing the old list
    // until it was closed and reopened.
    onSuccess: (link, { variantId }) => {
      queryClient.setQueryData<ProductVariant[]>(variantsQueryKey(productId), (current) =>
        current?.map((variant) =>
          variant.id === variantId ? { ...variant, suppliers: [...variant.suppliers, link] } : variant,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: variantsQueryKey(productId) });
    },
  });
}

export function useUpdateProductVariantSupplier(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      linkId,
      ...patch
    }: { linkId: string } & Parameters<typeof updateProductVariantSupplier>[2]) =>
      updateProductVariantSupplier(getBrowserApiClient(), linkId, patch),
    onSuccess: (link) => {
      queryClient.setQueryData<ProductVariant[]>(variantsQueryKey(productId), (current) =>
        current?.map((variant) =>
          variant.suppliers.some((existing) => existing.id === link.id)
            ? { ...variant, suppliers: variant.suppliers.map((existing) => (existing.id === link.id ? link : existing)) }
            : variant,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: variantsQueryKey(productId) });
    },
  });
}

export function useRemoveProductVariantSupplier(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => removeProductVariantSupplier(getBrowserApiClient(), linkId),
    onSuccess: (_data, linkId) => {
      queryClient.setQueryData<ProductVariant[]>(variantsQueryKey(productId), (current) =>
        current?.map((variant) =>
          variant.suppliers.some((existing) => existing.id === linkId)
            ? { ...variant, suppliers: variant.suppliers.filter((existing) => existing.id !== linkId) }
            : variant,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: variantsQueryKey(productId) });
    },
  });
}

export function useDeleteProductVariant(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => deleteProductVariant(getBrowserApiClient(), variantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
    },
  });
}

export function useUploadProductVariantPhoto(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, photo }: { variantId: string; photo: File }) =>
      uploadProductVariantPhoto(getBrowserApiClient(), variantId, photo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
    },
  });
}

export function useDeleteProductVariantPhoto(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) => deleteProductVariantPhoto(getBrowserApiClient(), variantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
    },
  });
}

export function useVariantPhotos(variantId: string | null) {
  return useQuery({
    queryKey: ["product-variants", "photos", variantId],
    queryFn: () => listVariantPhotos(getBrowserApiClient(), variantId as string),
    enabled: variantId !== null,
  });
}

export function useUploadVariantPhoto(variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photo: File) => uploadVariantPhoto(getBrowserApiClient(), variantId, photo),
    onSuccess: (photos) => {
      queryClient.setQueryData(["product-variants", "photos", variantId], photos);
    },
  });
}

export function useDeleteVariantPhoto(variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => deleteVariantPhoto(getBrowserApiClient(), photoId),
    onSuccess: (photos) => {
      queryClient.setQueryData(["product-variants", "photos", variantId], photos);
    },
  });
}

export function useReorderVariantPhotos(variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ photoIds, setCoverId }: { photoIds: string[]; setCoverId?: string }) =>
      reorderVariantPhotos(getBrowserApiClient(), variantId, photoIds, setCoverId),
    onSuccess: (photos) => {
      queryClient.setQueryData(["product-variants", "photos", variantId], photos);
    },
  });
}

export function useVariantStockByLocation(variantId: string | null) {
  return useQuery({
    queryKey: ["product-variants", "stock-by-location", variantId],
    queryFn: () => getVariantStockByLocation(getBrowserApiClient(), variantId as string),
    enabled: variantId !== null,
  });
}
