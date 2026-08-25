import type { Company, CompanyStats, InvoiceNumberMode, User } from "@double-a/shared-types";
import type { ApiClient, DataEnvelope, JsonApiOne, JsonApiResource } from "../http";
import { type CompanyAttrs, type CompanyStatsAttrs, type UserAttrs, toCompany, toCompanyStats, toUser } from "../mappers";

/**
 * Superadmin-only (CLAUDE.md §15): create companies, list them, view
 * platform-wide stats, rename/enable/disable, "Open company" (impersonation
 * via a scoped bearer token, not a second login), and reset another shop
 * user's password/PIN. `company_id` is always null for the caller here —
 * these routes are never scoped by an acting company.
 */

export interface CreateCompanyInput {
  name: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface UpdateCompanyInput {
  name?: string;
  isActive?: boolean;
}

export interface OpenCompanyResult {
  company: Company;
  /** New bearer token scoped to this company via acting_company_id — swap the stored session token to this. */
  token: string;
  tokenType: string;
}

export async function listCompanies(client: ApiClient): Promise<Company[]> {
  const { data } = await client.get<{ data: JsonApiResource<CompanyAttrs>[] }>("/superadmin/companies");
  return data.map(toCompany);
}

/**
 * `GET /superadmin/companies/stats` (`CompanyStatsController`) returns a
 * plain `{ data: [...] }` envelope of flat rows, not JSON:API — it builds
 * each row as a raw array rather than through `CompanyResource`. The field
 * names line up 1:1 with `CompanyStatsAttrs`, so each row is wrapped as a
 * `JsonApiResource` here to reuse the existing `toCompanyStats` mapper
 * rather than duplicating its field mapping.
 */
export async function companyStats(client: ApiClient): Promise<CompanyStats[]> {
  const { data } = await client.get<DataEnvelope<Array<CompanyStatsAttrs & { id: string }>>>(
    "/superadmin/companies/stats",
  );
  return data.map((row) => toCompanyStats({ type: "companies", id: row.id, attributes: row }));
}

export async function createCompany(client: ApiClient, input: CreateCompanyInput): Promise<Company> {
  const { data } = await client.post<{ data: JsonApiResource<CompanyAttrs> }>(
    "/superadmin/companies",
    {
      name: input.name,
      admin_name: input.adminName,
      admin_email: input.adminEmail,
      admin_password: input.adminPassword,
    },
    { idempotent: true },
  );
  return toCompany(data);
}

export async function updateCompany(client: ApiClient, id: string, patch: UpdateCompanyInput): Promise<Company> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.isActive !== undefined) payload.is_active = patch.isActive;

  const { data } = await client.patch<{ data: JsonApiResource<CompanyAttrs> }>(
    `/superadmin/companies/${id}`,
    payload,
  );
  return toCompany(data);
}

/**
 * Issues a new bearer token carrying `acting_company_id`, scoping the
 * superadmin's own session to this company's shop API (CLAUDE.md §15 —
 * impersonation, not a second login). The caller (auth layer) must swap its
 * stored session token to the returned one; this function only fetches it.
 */
export async function openCompany(client: ApiClient, companyId: string): Promise<OpenCompanyResult> {
  const response = await client.post<JsonApiOne<CompanyAttrs>>(`/superadmin/companies/${companyId}/open`);
  const meta = response.meta as { token: string; token_type: string };
  return {
    company: toCompany(response.data),
    token: meta.token,
    tokenType: meta.token_type,
  };
}

/**
 * "incremental" (JH-000001, a locked counter) or "random" (JH-7K4QX2N9,
 * unguessable) — see AssignInvoiceNumber. Superadmin-only; deliberately not
 * part of `updateStoreSettings` (queries/settings.ts), which the shop admin's
 * own settings page writes to.
 */
export async function setCompanyInvoiceMode(
  client: ApiClient,
  companyId: string,
  mode: InvoiceNumberMode,
): Promise<InvoiceNumberMode> {
  const { data } = await client.put<DataEnvelope<{ company_id: string; invoice_number_mode: string }>>(
    `/superadmin/companies/${companyId}/invoice-mode`,
    { mode },
  );
  return data.invoice_number_mode === "incremental" ? "incremental" : "random";
}

export interface DemoAccessCode {
  id: string;
  code: string;
  usedAt: string | null;
  createdAt: string;
}

/**
 * Mints a one-time login code for the demo@store.com account — the
 * superadmin copies the returned code and sends it to a prospect
 * out-of-band (personal message/email). Nothing delivers it for them.
 */
export async function generateDemoAccessCode(client: ApiClient): Promise<DemoAccessCode> {
  const { data } = await client.post<{ data: { code: string; created_at: string | null } }>(
    "/superadmin/demo-access-codes",
  );
  return { id: data.code, code: data.code, usedAt: null, createdAt: data.created_at ?? "" };
}

export async function listDemoAccessCodes(client: ApiClient): Promise<DemoAccessCode[]> {
  const { data } = await client.get<{
    data: { id: string; code: string; used_at: string | null; created_at: string | null }[];
  }>("/superadmin/demo-access-codes");

  return data.map((row) => ({
    id: row.id,
    code: row.code,
    usedAt: row.used_at,
    createdAt: row.created_at ?? "",
  }));
}

export async function resetUserPassword(client: ApiClient, userId: string, password: string): Promise<User> {
  const { data } = await client.post<{ data: JsonApiResource<UserAttrs> }>(
    `/superadmin/users/${userId}/reset-password`,
    { password },
  );
  return toUser(data);
}

export async function resetUserPin(client: ApiClient, userId: string, pin: string): Promise<User> {
  const { data } = await client.post<{ data: JsonApiResource<UserAttrs> }>(
    `/superadmin/users/${userId}/reset-pin`,
    { pin },
  );
  return toUser(data);
}
