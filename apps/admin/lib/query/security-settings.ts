"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disableMfa,
  enableMfa,
  confirmMfa,
  getMfaStatus,
  getSecuritySettings,
  regenerateMfaRecoveryCodes,
  updateSecuritySettings,
} from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

export function useSecuritySettings() {
  return useQuery({
    queryKey: queryKeys.securitySettings.detail(),
    queryFn: () => getSecuritySettings(getBrowserApiClient()),
    staleTime: 60_000,
  });
}

export function useUpdateSecuritySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mfaRequired: boolean) => updateSecuritySettings(getBrowserApiClient(), mfaRequired),
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.securitySettings.detail(), settings);
    },
  });
}

export function useMfaStatus() {
  return useQuery({
    queryKey: queryKeys.mfaStatus.detail(),
    queryFn: () => getMfaStatus(getBrowserApiClient()),
    staleTime: 30_000,
  });
}

export function useEnableMfa() {
  return useMutation({ mutationFn: () => enableMfa(getBrowserApiClient()) });
}

export function useConfirmMfa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => confirmMfa(getBrowserApiClient(), code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mfaStatus.all });
    },
  });
}

export function useDisableMfa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => disableMfa(getBrowserApiClient(), password),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mfaStatus.all });
    },
  });
}

export function useRegenerateMfaRecoveryCodes() {
  return useMutation({
    mutationFn: (password: string) => regenerateMfaRecoveryCodes(getBrowserApiClient(), password),
  });
}
