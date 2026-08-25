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
 * Superadmin-only list of a company's shop users — no acting_company_id
 * token. Prefer this over openCompany()+listUsers() from the browser so the
 * scoped bearer never reaches client JS (CLAUDE.md §15). Response already
 * excludes role "superadmin", matching IndexUsersController.
 */
export async function listCompanyUsers(
  client: ApiClient,
  companyId: string,
  options: { includeInactive?: boolean } = {},
): Promise<User[]> {
  const { data } = await client.get<{ data: JsonApiResource<UserAttrs>[] }>(
    `/superadmin/companies/${companyId}/users`,
  );
  const users = data.map(toUser);
  return options.includeInactive ? users : users.filter((user) => user.isActive);
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

export interface DemoAccessRedemption {
  id: string;
  email: string;
  code: string;
  usedAt: string | null;
  createdAt: string | null;
}

/**
 * Codes are generated by the external site that hands out demo access,
 * calling POST /superadmin/demo-access-codes directly with a static API key
 * (VerifyDemoAccessApiKey) — not from this app, and not with a Sanctum
 * token, so there's no client function for it here. This is the read-only
 * side: every prospect email a code has been issued to, redeemed or not.
 */
export async function listDemoAccessCodes(client: ApiClient): Promise<DemoAccessRedemption[]> {
  const { data } = await client.get<{
    data: { id: string; email: string; code: string; used_at: string | null; created_at: string | null }[];
  }>("/superadmin/demo-access-codes");

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    code: row.code,
    usedAt: row.used_at,
    createdAt: row.created_at,
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

/**
 * Flags (or unflags) a shop user as a demo/sandbox login. The access code
 * that gates such an account's login is generated on a separate site — this
 * only decides which account that gate applies to.
 */
export async function setUserDemoFlag(client: ApiClient, userId: string, isDemo: boolean): Promise<User> {
  const { data } = await client.patch<{ data: JsonApiResource<UserAttrs> }>(
    `/superadmin/users/${userId}/demo-flag`,
    { is_demo: isDemo },
  );
  return toUser(data);
}
