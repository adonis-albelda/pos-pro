import type { ApiClient } from "../http";

/**
 * One-time onboarding survey answer for the caller's own company — see
 * BusinessTypeCatalog (Laravel) / BUSINESS_TYPES (shared-types). Mobile
 * calls this once after setup; losing the answer (network error) just means
 * a blank field, so callers don't need to retry aggressively.
 */
export async function updateCompanyBusinessType(client: ApiClient, businessType: string): Promise<void> {
  await client.patch<{ data: { business_type: string | null } }>("/company/business-type", {
    business_type: businessType,
  });
}
