"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listAccessCatalog,
  updateUserAccess,
  type AccessRoleName,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useAccessCatalog() {
  return useQuery({
    queryKey: queryKeys.access.catalog(),
    queryFn: () => listAccessCatalog(getBrowserApiClient()),
  });
}

export function useUpdateUserAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      role,
      permissions,
    }: {
      userId: string;
      role: AccessRoleName;
      permissions: string[];
    }) => updateUserAccess(getBrowserApiClient(), userId, { role, permissions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.session.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.access.all });
    },
  });
}
