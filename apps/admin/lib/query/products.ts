"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  adjustStock,
  assembleBundle,
  cloneProduct,
  countProducts,
  createFullProduct,
  deleteProduct,
  deleteProductPhoto,
  dismissVariantSignal,
  getNextSku,
  getProduct,
  getProductStats,
  listBelowReorder,
  listProductLabelsPage,
  listProductsPage,
  listProductVariantsPage,
  restoreProduct,
  setBundleItems,
  setProductActive,
  updateProduct,
  uploadProductPhoto,
  type CreateFullProductInput,
  type ListProductsPageOptions,
  type ListProductVariantsPageOptions,
  type ProductInput,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/**
 * Wraps listProductsPage's own "if the requested page is past the end,
 * re-fetch the last valid page" correction (the same two-step logic
 * products/page.tsx used to do inline as a Server Component) so callers
 * always get a page that actually has rows on it, without a second useQuery.
 */
export function useProducts(
  options: ListProductsPageOptions = {},
  queryOptions: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.products.list({ ...options }),
    placeholderData: keepPreviousData,
    enabled: queryOptions.enabled ?? true,
    queryFn: async () => {
      const client = getBrowserApiClient();
      const pageSize = options.pageSize ?? 25;
      const first = await listProductsPage(client, options);
      const pageCount = Math.max(1, Math.ceil(first.total / pageSize));
      const requestedPage = options.page ?? 1;
      const safePage = Math.min(requestedPage, pageCount);

      if (safePage === requestedPage || first.total === 0) {
        return { ...first, page: safePage, pageCount };
      }

      const corrected = await listProductsPage(client, { ...options, page: safePage });
      return { ...corrected, page: safePage, pageCount };
    },
  });
}

/**
 * Same "requested page past the end → refetch the last valid page"
 * correction as `useProducts`, against the company-wide variant list
 * (`GET /product-variants`) instead — the Products page's variant view.
 */
export function useProductVariantsList(
  options: ListProductVariantsPageOptions = {},
  queryOptions: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.products.variantsList({ ...options }),
    placeholderData: keepPreviousData,
    enabled: queryOptions.enabled ?? true,
    queryFn: async () => {
      const client = getBrowserApiClient();
      const pageSize = options.pageSize ?? 25;
      const first = await listProductVariantsPage(client, options);
      const pageCount = Math.max(1, Math.ceil(first.total / pageSize));
      const requestedPage = options.page ?? 1;
      const safePage = Math.min(requestedPage, pageCount);

      if (safePage === requestedPage || first.total === 0) {
        return { ...first, page: safePage, pageCount };
      }

      const corrected = await listProductVariantsPage(client, { ...options, page: safePage });
      return { ...corrected, page: safePage, pageCount };
    },
  });
}

/** Single product for the edit page. */
export function useProduct(id: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: async () => {
      const product = await getProduct(getBrowserApiClient(), id);
      if (!product) throw new Error("Product not found");
      return product;
    },
    enabled: Boolean(id),
  });
}

/** Header stat cards — one aggregate query, not a whole-catalogue walk. */
export function useProductStats(options: { locationId?: string } = {}) {
  return useQuery({
    queryKey: [...queryKeys.products.all, "stats", options] as const,
    queryFn: () => getProductStats(getBrowserApiClient(), options),
  });
}

/** Total product count — used by launcher/summary pages that just need a number, not the rows. */
export function useProductCount(options: { includeInactive?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.products.count(options),
    queryFn: () => countProducts(getBrowserApiClient(), options),
  });
}

/** Lean, paginated, searchable id/sku/name/category picker for the Product QR/barcode label sheet. */
export function useProductLabelsPage(
  options: { q?: string; categoryId?: string; page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: [...queryKeys.products.all, "labels", options] as const,
    placeholderData: keepPreviousData,
    queryFn: () => listProductLabelsPage(getBrowserApiClient(), options),
  });
}

/** Products at or below their own reorder point — the Reports "Reorder list" and dashboard's low-stock card. */
export function useBelowReorder() {
  return useQuery({
    queryKey: queryKeys.products.belowReorder(),
    queryFn: () => listBelowReorder(getBrowserApiClient()),
  });
}

/** Call after saveProduct (Server Action) succeeds — revalidatePath doesn't touch this cache. */
export function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
    [queryClient],
  );
}

/**
 * Client-side, not a Server Action — a toggle needs its error (e.g. the
 * demo-account 403) to reach a toast directly, which a Server Action
 * crashing into Next's generic error boundary never did.
 */
export function useSetProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setProductActive(getBrowserApiClient(), id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useCloneProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cloneProduct(getBrowserApiClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

/** Plain client-side patch — for the create-with-variants wizard's step-1 revisit, which has no bundle/photo-deferred complexity to route through the saveProduct server action for. */
export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<ProductInput>) =>
      updateProduct(getBrowserApiClient(), id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

/**
 * The whole create-product wizard in one request — see
 * CreateFullProductAction (Laravel). Nothing above this call ever writes
 * to the database; the product, its brand/tag attachments, opening stock,
 * gallery photos, suppliers, and (with-variants) generated variants all
 * land in one transaction.
 */
export function useCreateFullProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      photos,
      variantPhotos,
    }: {
      input: CreateFullProductInput;
      photos?: File[];
      /** With-variants only — outer index matches `input.variants` order. */
      variantPhotos?: File[][];
    }) => createFullProduct(getBrowserApiClient(), input, photos ?? [], variantPhotos ?? []),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProduct(getBrowserApiClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useRestoreProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreProduct(getBrowserApiClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useUploadProductPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, photo }: { id: string; photo: File }) =>
      uploadProductPhoto(getBrowserApiClient(), id, photo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useDeleteProductPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProductPhoto(getBrowserApiClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useDismissVariantSignal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissVariantSignal(getBrowserApiClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useSetBundleItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, items }: { id: string; items: { productId: string; quantity: number }[] }) =>
      setBundleItems(getBrowserApiClient(), id, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

export function useAssembleBundle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      quantity,
      locationId,
      note,
    }: {
      id: string;
      quantity: number;
      locationId: string;
      note?: string | null;
    }) => assembleBundle(getBrowserApiClient(), id, { quantity, locationId, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

/**
 * Claims (not previews) the next sequential SKU — call once, on mount, for
 * a brand-new product's prefilled-but-editable SKU field. A mutation, not a
 * query: it has a side effect (advances the company's counter), so it must
 * never re-fire on a re-render or a refetch.
 */
export function useClaimNextSku() {
  return useMutation({
    mutationFn: () => getNextSku(getBrowserApiClient()),
  });
}

/**
 * Second, narrower entry point to the same backend action the /inventory
 * page's own restock/adjust flow already calls — reachable from the product
 * form so a merchant never has to leave it to correct a count. That page's
 * own moveStock Server Action is untouched.
 */
export function useAdjustProductStock(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof adjustStock>[2]) =>
      adjustStock(getBrowserApiClient(), productId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      queryClient.invalidateQueries({ queryKey: ["products", "variants", productId] });
    },
  });
}
