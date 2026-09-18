"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReceiptTemplate,
  deleteReceiptTemplate,
  listReceiptTemplates,
  updateReceiptTemplate,
  type ReceiptTemplateInput,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useReceiptTemplates() {
  return useQuery({
    queryKey: queryKeys.receiptTemplates.list(),
    queryFn: () => listReceiptTemplates(getBrowserApiClient()),
  });
}

export function useInvalidateReceiptTemplates() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.receiptTemplates.all });
}

export function useCreateReceiptTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceiptTemplateInput) => createReceiptTemplate(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.receiptTemplates.all });
    },
  });
}

export function useUpdateReceiptTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ReceiptTemplateInput> }) =>
      updateReceiptTemplate(getBrowserApiClient(), id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.receiptTemplates.all });
    },
  });
}

export function useDeleteReceiptTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReceiptTemplate(getBrowserApiClient(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.receiptTemplates.all });
    },
  });
}
