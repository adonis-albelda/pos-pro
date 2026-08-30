"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { AiPlanId, CompanyStats, InvoiceNumberMode } from "@double-a/shared-types";
import {
  companyStats,
  createCompany as apiCreateCompany,
  createUser,
  listCompanyUsers,
  listDemoAccessCodes,
  listUsers,
  openCompany as apiOpenCompany,
  resetUserPassword,
  resetUserPin,
  setCompanyInvoiceMode,
  setUserDemoFlag,
  updateCompany,
} from "@double-a/api-client/queries";
import { createScopedClient } from "@/lib/api/client";
import { exitActingSession, getBrowserApiClient, startActingSession } from "@/lib/api/browser-client";
import { queryKeys } from "./keys";

function patchCompanyStatsRow(
  queryClient: QueryClient,
  companyId: string,
  patch: Partial<CompanyStats>,
): void {
  queryClient.setQueryData<CompanyStats[]>(queryKeys.companies.stats(), (current) => {
    if (!current) return current;
    return current.map((row) => (row.id === companyId ? { ...row, ...patch } : row));
  });
}

/**
 * Superadmin-only platform read — every company's row. Refetch on mount so a
 * fresh visit after create-company picks up the new row without a manual refresh.
 */
export function useCompanyStats() {
  return useQuery({
    queryKey: queryKeys.companies.stats(),
    queryFn: () => companyStats(getBrowserApiClient()),
    refetchOnMount: "always",
  });
}

/** Call after setCompanyActive (Server Action) succeeds — revalidatePath doesn't touch this cache. */
export function useInvalidateCompanyStats() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats() }),
    [queryClient],
  );
}

/**
 * Superadmin company-detail user list via GET /superadmin/companies/:id/users —
 * no openCompany scoped token on the client.
 */
export function useCompanyUsers(companyId: string) {
  return useQuery({
    queryKey: queryKeys.companies.users(companyId),
    queryFn: () => listCompanyUsers(getBrowserApiClient(), companyId, { includeInactive: true }),
    refetchOnMount: "always",
  });
}

/** Call after company-user mutations succeed. */
export function useInvalidateCompanyUsers(companyId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.companies.users(companyId) }),
    [queryClient, companyId],
  );
}

export function useSetCompanyActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, isActive }: { companyId: string; isActive: boolean }) =>
      updateCompany(getBrowserApiClient(), companyId, { isActive }),
    onSuccess: (company) => {
      patchCompanyStatsRow(queryClient, company.id, { isActive: company.isActive });
    },
  });
}

export function useSetCompanyAiPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, aiPlanId }: { companyId: string; aiPlanId: AiPlanId }) =>
      updateCompany(getBrowserApiClient(), companyId, { aiPlanId }),
    onSuccess: (company) => {
      patchCompanyStatsRow(queryClient, company.id, { aiPlanId: company.aiPlanId });
    },
  });
}

export function useSetCompanyInvoiceMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, mode }: { companyId: string; mode: InvoiceNumberMode }) =>
      setCompanyInvoiceMode(getBrowserApiClient(), companyId, mode),
    onSuccess: (mode, { companyId }) => {
      patchCompanyStatsRow(queryClient, companyId, { invoiceNumberMode: mode });
    },
  });
}

async function bootstrapCompanyAdmin(companyId: string, password: string, pin: string): Promise<void> {
  const opened = await apiOpenCompany(getBrowserApiClient(), companyId);
  const scoped = createScopedClient(opened.token);
  const users = await listUsers(scoped, { includeInactive: true });
  const admin = users.find((user) => user.role === "admin");
  if (!admin) {
    throw new Error("Company was created but its admin user could not be found to finish setup.");
  }
  await resetUserPassword(scoped, admin.id, password);
  await resetUserPin(scoped, admin.id, pin);
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      adminName: string;
      adminEmail: string;
      adminPassword: string;
      adminPin: string;
    }) => {
      const company = await apiCreateCompany(getBrowserApiClient(), {
        name: input.name,
        adminName: input.adminName,
        adminEmail: input.adminEmail,
        adminPassword: input.adminPassword,
      });
      await bootstrapCompanyAdmin(company.id, input.adminPassword, input.adminPin);
      return company;
    },
    onSuccess: async (company) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats() });
      toast.success(`${company.name} created.`);
      router.push("/platform");
    },
  });
}

export function useOpenCompany() {
  const router = useRouter();
  return useMutation({
    mutationFn: (companyId: string) => apiOpenCompany(getBrowserApiClient(), companyId),
    onSuccess: (opened) => {
      startActingSession(opened.token, { id: opened.company.id, name: opened.company.name });
      router.push("/");
    },
  });
}

export function useExitCompany() {
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      exitActingSession();
    },
    onSuccess: () => {
      router.push("/platform");
    },
  });
}

export function useAddCompanyAdmin(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      email: string;
      password: string;
      pin: string;
    }) => {
      const opened = await apiOpenCompany(getBrowserApiClient(), companyId);
      const scoped = createScopedClient(opened.token);
      const admin = await createUser(scoped, {
        name: input.name,
        email: input.email,
        role: "admin",
        password: input.password,
      });
      await resetUserPassword(scoped, admin.id, input.password);
      if (input.pin) await resetUserPin(scoped, admin.id, input.pin);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.users(companyId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats() });
    },
  });
}

export function useResetCompanyUserPassword() {
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      resetUserPassword(getBrowserApiClient(), userId, password),
  });
}

export function useResetCompanyUserPin() {
  return useMutation({
    mutationFn: ({ userId, pin }: { userId: string; pin: string }) =>
      resetUserPin(getBrowserApiClient(), userId, pin),
  });
}

export function useSetCompanyUserDemoFlag(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isDemo }: { userId: string; isDemo: boolean }) =>
      setUserDemoFlag(getBrowserApiClient(), userId, isDemo),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.companies.users(companyId) });
    },
  });
}

/** Every demo@store.com access code issued so far, newest first — refetches on mount for the same reason useCompanyStats does. */
export function useDemoAccessCodes() {
  return useQuery({
    queryKey: [...queryKeys.companies.all, "demo-access-codes"] as const,
    queryFn: () => listDemoAccessCodes(getBrowserApiClient()),
    refetchOnMount: "always",
  });
}
