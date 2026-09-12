import type { ApiClient } from "../http";

/** {key: enabled} for the caller's own company — what admin and mobile both hide/show UI by. */
export async function getFeatureFlags(client: ApiClient): Promise<Record<string, boolean>> {
  const result = await client.get<{ data: Record<string, boolean> }>("/feature-flags");
  return result.data;
}

export interface FeatureFlagOverride {
  companyId: string;
  companyName: string;
  enabled: boolean;
}

export interface FeatureFlagAdmin {
  key: string;
  label: string;
  description: string | null;
  /** Informational display label only (e.g. "Standard+") — not an enforced gate. */
  plan: string;
  /** The "for all companies" default. */
  enabled: boolean;
  overrides: FeatureFlagOverride[];
}

interface FeatureFlagAdminAttrs {
  key: string;
  label: string;
  description: string | null;
  plan: string;
  enabled: boolean;
  overrides: { company_id: string; company_name: string; enabled: boolean }[];
}

/** Superadmin-only (CLAUDE.md §15) — every flag, its global default, and every company overriding it. */
export async function listFeatureFlagsAdmin(client: ApiClient): Promise<FeatureFlagAdmin[]> {
  const result = await client.get<{ data: FeatureFlagAdminAttrs[] }>("/superadmin/feature-flags");
  return result.data.map((flag) => ({
    key: flag.key,
    label: flag.label,
    description: flag.description,
    plan: flag.plan,
    enabled: flag.enabled,
    overrides: flag.overrides.map((override) => ({
      companyId: override.company_id,
      companyName: override.company_name,
      enabled: override.enabled,
    })),
  }));
}

/** Sets the global default for everyone — a per-company override still wins over this. */
export async function updateFeatureFlag(
  client: ApiClient,
  key: string,
  enabled: boolean,
): Promise<void> {
  await client.patch(`/superadmin/feature-flags/${key}`, { enabled });
}

/** enabled=null clears the override, reverting that one company to the global default. */
export async function setCompanyFeatureOverride(
  client: ApiClient,
  companyId: string,
  key: string,
  enabled: boolean | null,
): Promise<void> {
  await client.put(`/superadmin/companies/${companyId}/feature-flags/${key}`, { enabled });
}
