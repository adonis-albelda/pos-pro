"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee,
  type UpsertEmployeeInput,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useEmployees() {
  return useQuery({
    queryKey: queryKeys.employees.list(),
    queryFn: () => listEmployees(getBrowserApiClient()),
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertEmployeeInput) => createEmployee(getBrowserApiClient(), input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<UpsertEmployeeInput> }) =>
      updateEmployee(getBrowserApiClient(), id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEmployee(getBrowserApiClient(), id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
    },
  });
}
