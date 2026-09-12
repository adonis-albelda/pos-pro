"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLoyaltyReward,
  deleteLoyaltyReward,
  getLoyaltyProgram,
  listLoyaltyLedger,
  listLoyaltyRewards,
  saveLoyaltyProgram,
  updateLoyaltyReward,
  type LoyaltyLedgerFilter,
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
