"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPlatformSecuritySettings, updatePlatformSecuritySettings } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function usePlatformSecuritySettings() {
  return useQuery({
    queryKey: queryKeys.platformSecuritySettings.detail(),
    queryFn: () => getPlatformSecuritySettings(getBrowserApiClient()),
  });
}

export function useUpdatePlatformSecuritySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (superadminMfaRequired: boolean) =>
      updatePlatformSecuritySettings(getBrowserApiClient(), superadminMfaRequired),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.platformSecuritySettings.detail(), settings);
    },
  });
}
