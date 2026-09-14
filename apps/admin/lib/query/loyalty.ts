"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  awardLoyaltyPoints,
  createLoyaltyEarningRule,
  createLoyaltyReward,
  deleteLoyaltyEarningRule,
  deleteLoyaltyReward,
  getLoyaltyProgram,
  listLoyaltyEarningRules,
  listLoyaltyLedger,
  listLoyaltyRewards,
  saveLoyaltyProgram,
  updateLoyaltyEarningRule,
  updateLoyaltyReward,
  type LoyaltyLedgerFilter,
  type UpsertLoyaltyEarningRuleInput,
  type UpsertLoyaltyProgramInput,
  type UpsertLoyaltyRewardInput,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useLoyaltyProgram() {
  return useQuery({
    queryKey: queryKeys.loyaltyProgram.detail(),
    queryFn: () => getLoyaltyProgram(getBrowserApiClient()),
  });
}

export function useSaveLoyaltyProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertLoyaltyProgramInput) => saveLoyaltyProgram(getBrowserApiClient(), input),
    onSuccess: (program) => {
      queryClient.setQueryData(queryKeys.loyaltyProgram.detail(), program);
    },
  });
}

export function useLoyaltyRewards() {
  return useQuery({
    queryKey: queryKeys.loyaltyRewards.list(),
    queryFn: () => listLoyaltyRewards(getBrowserApiClient()),
  });
}

export function useCreateLoyaltyReward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertLoyaltyRewardInput) => createLoyaltyReward(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyaltyRewards.all });
    },
  });
}

export function useUpdateLoyaltyReward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<UpsertLoyaltyRewardInput> }) =>
      updateLoyaltyReward(getBrowserApiClient(), id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyaltyRewards.all });
    },
  });
}

export function useDeleteLoyaltyReward() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLoyaltyReward(getBrowserApiClient(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyaltyRewards.all });
    },
  });
}

export function useLoyaltyEarningRules() {
  return useQuery({
    queryKey: queryKeys.loyaltyEarningRules.list(),
    queryFn: () => listLoyaltyEarningRules(getBrowserApiClient()),
  });
}

export function useCreateLoyaltyEarningRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertLoyaltyEarningRuleInput) => createLoyaltyEarningRule(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyaltyEarningRules.all });
    },
  });
}

export function useUpdateLoyaltyEarningRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<UpsertLoyaltyEarningRuleInput> }) =>
      updateLoyaltyEarningRule(getBrowserApiClient(), id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyaltyEarningRules.all });
    },
  });
}

export function useDeleteLoyaltyEarningRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLoyaltyEarningRule(getBrowserApiClient(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyaltyEarningRules.all });
    },
  });
}

/** For a sale whose matching rule is manual-only — see AwardLoyaltyPointsController. */
export function useAwardLoyaltyPoints() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (saleId: string) => awardLoyaltyPoints(getBrowserApiClient(), saleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.loyaltyLedger.all });
    },
  });
}

export function useLoyaltyLedger(filter: LoyaltyLedgerFilter = {}) {
  return useQuery({
    queryKey: queryKeys.loyaltyLedger.list({
      customerId: filter.customerId,
      type: filter.type,
      page: filter.page,
    }),
    queryFn: () => listLoyaltyLedger(getBrowserApiClient(), filter),
    placeholderData: (previous) => previous,
  });
}
