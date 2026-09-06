"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUnit, deleteUnit, listUnits, updateUnit } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/** Units rarely change — cached for the session, refetched on window focus like everything else. */
export function useUnits() {
  return useQuery({
    queryKey: queryKeys.units.list(),
    queryFn: () => listUnits(getBrowserApiClient()),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; abbreviation?: string | null }) =>
      createUnit(getBrowserApiClient(), input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.units.list() });
    },
  });
}

export function useUpdateUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Parameters<typeof updateUnit>[2]) =>
      updateUnit(getBrowserApiClient(), id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.units.list() });
    },
  });
}

export function useDeleteUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUnit(getBrowserApiClient(), id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.units.list() });
    },
  });
}
