"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMyAvatar,
  me,
  updateMe,
  uploadMyAvatar,
  type UpdateMeInput,
} from "@double-a/api-client/queries";
import type { MultipartFile } from "@double-a/api-client";
import { getBrowserApiClient, hasBrowserSession } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

/**
 * The signed-in user, fetched client-side — backs AdminGate's isShopAdmin()
 * gate on every dashboard page that used to run that check in a Server
 * Component before rendering anything. `enabled: hasBrowserSession()` skips
 * the call entirely (and leaves `data` undefined, same as "not an admin")
 * when there's no session cookie at all, rather than firing a request bound
 * to 401.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.session.me(),
    queryFn: () => me(getBrowserApiClient()),
    enabled: hasBrowserSession(),
    staleTime: 60_000,
    retry: false,
  });
}

/** Self-service name/email/username edit — /profile page, not the owner-only Users page. */
export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => updateMe(getBrowserApiClient(), input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session.me() });
    },
  });
}

export function useUploadMyAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (avatar: MultipartFile) => uploadMyAvatar(getBrowserApiClient(), avatar),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session.me() });
    },
  });
}

export function useDeleteMyAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteMyAvatar(getBrowserApiClient()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.session.me() });
    },
  });
}
