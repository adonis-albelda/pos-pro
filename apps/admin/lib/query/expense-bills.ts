"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listExpenseBills,
  listUpcomingExpenseBills,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useExpenseBills(params?: { active?: boolean }) {
  return useQuery({
    queryKey: queryKeys.expenseBills.list(params),
    queryFn: () => listExpenseBills(getBrowserApiClient(), params),
  });
}

export function useUpcomingExpenseBills(days = 30) {
  return useQuery({
    queryKey: queryKeys.expenseBills.upcoming(days),
    queryFn: () => listUpcomingExpenseBills(getBrowserApiClient(), days),
  });
}

export function useInvalidateExpenseBills() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.expenseBills.all });
    void client.invalidateQueries({ queryKey: queryKeys.expenses.all });
  };
}
