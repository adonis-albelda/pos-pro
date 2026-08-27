import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listProductsPage, type ListProductsPageOptions } from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { queryKeys } from "./keys";

export function useProducts(options: ListProductsPageOptions = {}) {
  return useQuery({
    queryKey: queryKeys.products.list({ ...options }),
    queryFn: () => listProductsPage(getAdminApiClient(), options),
  });
}

/** Call after createProduct/updateProduct/adjustStock succeed. */
export function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
}
