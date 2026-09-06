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
  detachProductAttribute,
  generateProductVariants,
  listCompanyAttributes,
  listProductAttributes,
  listProductVariants,
  removeProductVariantSupplier,
  updateProductVariant,
  updateProductVariantSupplier,
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

export function useAddProductVariantSupplier(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      variantId,
      ...input
    }: { variantId: string } & Parameters<typeof addProductVariantSupplier>[2]) =>
      addProductVariantSupplier(getBrowserApiClient(), variantId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
    },
  });
}

export function useRemoveProductVariantSupplier(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => removeProductVariantSupplier(getBrowserApiClient(), linkId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
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
