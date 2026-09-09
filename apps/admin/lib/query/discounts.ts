"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createComplexDiscountRule,
  createDiscountRule,
  deleteComplexDiscountRule,
  deleteDiscountRule,
  getTaxSettings,
  listComplexDiscountRules,
  listDiscountRules,
  updateComplexDiscountRule,
  updateDiscountRule,
  updateTaxSettings,
  type UpsertComplexDiscountRuleInput,
  type UpsertDiscountRuleInput,
} from "@double-a/api-client/queries";
import type { TaxSettings } from "@double-a/shared-types";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useDiscountRules() {
  return useQuery({
    queryKey: queryKeys.discountRules.list(),
    queryFn: () => listDiscountRules(getBrowserApiClient()),
  });
}

export function useCreateDiscountRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertDiscountRuleInput) => createDiscountRule(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.discountRules.all });
    },
  });
}

export function useUpdateDiscountRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<UpsertDiscountRuleInput> & { isActive?: boolean } }) =>
      updateDiscountRule(getBrowserApiClient(), id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.discountRules.all });
    },
  });
}

export function useDeleteDiscountRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDiscountRule(getBrowserApiClient(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.discountRules.all });
    },
  });
}

export function useComplexDiscountRules() {
  return useQuery({
    queryKey: queryKeys.complexDiscountRules.list(),
    queryFn: () => listComplexDiscountRules(getBrowserApiClient()),
  });
}

export function useCreateComplexDiscountRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertComplexDiscountRuleInput) =>
      createComplexDiscountRule(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.complexDiscountRules.all });
    },
  });
}

export function useUpdateComplexDiscountRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<UpsertComplexDiscountRuleInput> }) =>
      updateComplexDiscountRule(getBrowserApiClient(), id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.complexDiscountRules.all });
    },
  });
}

export function useDeleteComplexDiscountRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteComplexDiscountRule(getBrowserApiClient(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.complexDiscountRules.all });
    },
  });
}

export function useTaxSettings() {
  return useQuery({
    queryKey: queryKeys.taxSettings.detail(),
    queryFn: () => getTaxSettings(getBrowserApiClient()),
    staleTime: 60_000,
  });
}

export function useUpdateTaxSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<TaxSettings>) => updateTaxSettings(getBrowserApiClient(), patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.taxSettings.detail(), settings);
    },
  });
}
