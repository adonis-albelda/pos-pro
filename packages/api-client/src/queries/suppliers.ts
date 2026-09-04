import type { Product, Supplier } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiResource } from "../http";
import { type ProductAttrs, type SupplierAttrs, toProduct, toSupplier } from "../mappers";

export interface SupplierInput {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;
  email?: string | null;
  secondaryEmail?: string | null;
  address?: string | null;
  tin?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

function toPayload(input: Partial<SupplierInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.contactPerson !== undefined) payload.contact_person = input.contactPerson;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.secondaryPhone !== undefined) payload.secondary_phone = input.secondaryPhone;
  if (input.email !== undefined) payload.email = input.email;
  if (input.secondaryEmail !== undefined) payload.secondary_email = input.secondaryEmail;
  if (input.address !== undefined) payload.address = input.address;
  if (input.tin !== undefined) payload.tin = input.tin;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  return payload;
}

/**
 * GAP: `GET /suppliers` (IndexSuppliersController) takes no query params — it
 * always returns every supplier, active and inactive, unpaginated. The old
 * PostgREST query filtered `is_active` server-side; that filter is now done
 * client-side here instead.
 */
export async function listSuppliers(
  client: ApiClient,
  options: { includeInactive?: boolean } = {},
): Promise<Supplier[]> {
  const { data } = await client.get<{ data: JsonApiResource<SupplierAttrs>[] }>("/suppliers");
  const suppliers = data.map(toSupplier);
  return options.includeInactive ? suppliers : suppliers.filter((s) => s.isActive);
}

export async function getSupplier(client: ApiClient, id: string): Promise<Supplier | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<SupplierAttrs> }>(`/suppliers/${id}`);
    return toSupplier(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createSupplier(client: ApiClient, input: SupplierInput): Promise<Supplier> {
  const { data } = await client.post<{ data: JsonApiResource<SupplierAttrs> }>(
    "/suppliers",
    toPayload(input),
  );
  return toSupplier(data);
}

export async function updateSupplier(
  client: ApiClient,
  id: string,
  patch: Partial<SupplierInput>,
): Promise<Supplier> {
  const { data } = await client.patch<{ data: JsonApiResource<SupplierAttrs> }>(
    `/suppliers/${id}`,
    toPayload(patch),
  );
  return toSupplier(data);
}

/**
 * Blocked at the database by `purchase_orders.supplier_id` being
 * `restrictOnDelete()` once the supplier has any order history — same
 * constraint as before, just enforced by Postgres/Laravel instead of
 * Supabase's Postgres directly. Surfaces as a normal thrown `ApiError`.
 */
export async function deleteSupplier(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/suppliers/${id}`);
}

/**
 * Unpaid installment terms across a supplier's non-cancelled purchase
 * orders — a query, never a stored column. `SupplierBalanceController`
 * returns a plain `{ data: { supplier_id, balance } }` envelope, not a
 * JSON:API resource.
 */
export async function supplierBalance(client: ApiClient, supplierId: string): Promise<number> {
  const { data } = await client.get<{ data: { supplier_id: string; balance: number } }>(
    `/suppliers/${supplierId}/balance`,
  );
  return Number(data.balance);
}

/**
 * Replace-all for which products a supplier carries. `PUT
 * /suppliers/{supplier}/products` (SetSupplierProductsController) is a
 * plain, non-JSON:API endpoint — `{ data: { supplier_id, product_ids } }` —
 * and echoes back only the ids it just saved, never product names. Use
 * `listSupplierProducts` below to read the full linked list back (with
 * names) after a save, or to pre-check an edit picker.
 */
export async function setSupplierProducts(
  client: ApiClient,
  supplierId: string,
  productIds: string[],
): Promise<string[]> {
  const { data } = await client.put<{ data: { supplier_id: string; product_ids: string[] } }>(
    `/suppliers/${supplierId}/products`,
    { product_ids: productIds },
  );
  return data.product_ids;
}

/** The read side of setSupplierProducts's replace-all write — what this supplier is currently linked to. */
export async function listSupplierProducts(
  client: ApiClient,
  supplierId: string,
): Promise<Product[]> {
  const { data } = await client.get<{ data: JsonApiResource<ProductAttrs>[] }>(
    `/suppliers/${supplierId}/products`,
  );
  return data.map(toProduct);
}

/**
 * `GET /suppliers/balances` (`IndexSupplierBalancesController`) — one
 * grouped query for every supplier's balance, company-wide. Replaced the
 * old N-parallel-`supplierBalance()`-calls fan-out, which was tripping the
 * auth-protected rate limiter on shops with more than a handful of
 * suppliers. Only positive balances come back — a supplier owed nothing is
 * simply absent from the map; callers already default a missing key to 0.
 */
export async function listSupplierBalances(client: ApiClient): Promise<Record<string, number>> {
  const { data } = await client.get<{ data: Record<string, number> }>("/suppliers/balances");
  return data;
}
