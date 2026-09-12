"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachExpenseReceipt,
  listExpenses,
  sumExpenses,
  type ExpenseDayRange,
  type ExpenseFilterOptions,
} from "@double-a/api-client/queries";
import type { MultipartFile } from "@double-a/api-client";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/** No range = every expense (list page). Pass a range for a day-bounded read (dashboard/reports). */
export function useExpenses(range?: ExpenseDayRange, filter?: ExpenseFilterOptions) {
  return useQuery({
    queryKey: queryKeys.expenses.list({ ...range, ...filter }),
    queryFn: () => listExpenses(getBrowserApiClient(), range, filter),
  });
}

/** Just the total for a shop-day range — CLAUDE.md §14's Net = revenue − expenses card, no row list needed. */
export function useExpensesTotal(range: ExpenseDayRange, filter?: ExpenseFilterOptions) {
  return useQuery({
    queryKey: queryKeys.expenses.sum({ ...range, ...filter }),
    queryFn: () => sumExpenses(getBrowserApiClient(), range, filter),
    staleTime: 60_000,
  });
}

/** Call after saveExpense/removeExpense (Server Actions) succeed — revalidatePath doesn't touch this cache. */
export function useInvalidateExpenses() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
}

/** Optional proof photo — attaches after the expense itself already exists. */
export function useAttachExpenseReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, photo }: { id: string; photo: MultipartFile }) =>
      attachExpenseReceipt(getBrowserApiClient(), id, photo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
    },
  });
}
