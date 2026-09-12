"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCashMovement,
  getCashFlowSummary,
  listCashFlowLedger,
  type CashFlowRange,
  type CashMovementInput,
} from "@double-a/api-client/queries";
import type { CashFlowLedgerEntry } from "@double-a/shared-types";
import { getBrowserApiClient } from "@/lib/api/browser-client";

const CASH_FLOW_KEY = ["cash-flow"] as const;

export function useCashFlowSummary(range: CashFlowRange) {
  return useQuery({
    queryKey: [...CASH_FLOW_KEY, "summary", range] as const,
    queryFn: () => getCashFlowSummary(getBrowserApiClient(), range),
  });
}

export function useCashFlowLedger(
  range: CashFlowRange & {
    direction?: "in" | "out";
    type?: CashFlowLedgerEntry["type"];
    page?: number;
    pageSize?: number;
  },
) {
  return useQuery({
    queryKey: [...CASH_FLOW_KEY, "ledger", range] as const,
    placeholderData: keepPreviousData,
    queryFn: () => listCashFlowLedger(getBrowserApiClient(), range),
  });
}

export function useCreateCashMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CashMovementInput) => createCashMovement(getBrowserApiClient(), input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASH_FLOW_KEY });
    },
  });
}
