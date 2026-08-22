import type { Customer, CustomerOpenSale, CustomerPayment } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiResource } from "../http";
import {
  type CustomerAttrs,
  type CustomerOpenSaleJson,
  type CustomerPaymentJson,
  toCustomer,
  toCustomerOpenSale,
  toCustomerPayment,
} from "../mappers";

export interface CustomerInput {
  /**
   * Client-generated UUID for a customer created offline (CLAUDE.md rule 11 —
   * same as sales). `StoreCustomerRequest` validates `id` as `sometimes|uuid`
   * and `StoreCustomerPayload`/`StoreCustomerController` pass it straight
   * through to `Customer::create()` when present, so this is a real
   * capability, not a gap: an offline-created customer keeps the id the
   * device generated at creation time.
   */
  id?: string;
  name: string;
  address?: string | null;
  contact?: string | null;
}

function toPayload(input: Partial<CustomerInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.name !== undefined) payload.name = input.name;
  if (input.address !== undefined) payload.address = input.address;
  if (input.contact !== undefined) payload.contact = input.contact;
  return payload;
}

/**
 * Every customer the office or a terminal has recorded. Pulled whole to the
 * POS (like categories): the table stays small, and a wholesale fetch is how
 * a deleted customer leaves a device. `IndexCustomersController` takes no
 * query params — always the full company list, ordered by name.
 */
export async function listCustomers(client: ApiClient): Promise<Customer[]> {
  const { data } = await client.get<{ data: JsonApiResource<CustomerAttrs>[] }>("/customers");
  return data.map(toCustomer);
}

export async function getCustomer(client: ApiClient, id: string): Promise<Customer | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<CustomerAttrs> }>(`/customers/${id}`);
    return toCustomer(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * `StoreCustomerController` needs an `Idempotency-Key` header — `idempotent:
 * true` has `ApiClient` generate one.
 */
export async function createCustomer(client: ApiClient, input: CustomerInput): Promise<Customer> {
  const { data } = await client.post<{ data: JsonApiResource<CustomerAttrs> }>(
    "/customers",
    toPayload(input),
    { idempotent: true },
  );
  return toCustomer(data);
}

export async function updateCustomer(
  client: ApiClient,
  id: string,
  patch: Partial<Omit<CustomerInput, "id">>,
): Promise<Customer> {
  const { data } = await client.patch<{ data: JsonApiResource<CustomerAttrs> }>(
    `/customers/${id}`,
    toPayload(patch),
  );
  return toCustomer(data);
}

export async function deleteCustomer(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/customers/${id}`);
}

/**
 * RENAMED from `pushCustomers` — that name collided with the real CLAUDE.md
 * §1 sync-push primitive in `queries/pos.ts`, which hits the dedicated bulk
 * endpoint `POST /pos/sync/customers` (`PushCustomersController` →
 * `PushCustomersAction::handle()`, a single `insertOrIgnore` call — genuinely
 * idempotent and much closer to the old Supabase
 * `upsert(rows, { onConflict: "id" })` than what this function does). Sync
 * push must call `pushCustomers` from `queries/pos.ts`, not this.
 *
 * This function is N sequential `POST /customers` calls instead — useful for
 * an admin-side batch of one-off customer creations, not offline sync
 * batches. Each call carries its own Idempotency-Key, which only protects
 * against literally re-sending the same HTTP request — not a second JS call
 * for a customer id that already landed server-side (e.g. the response was
 * lost after a partial failure). That retry hits a duplicate-id conflict
 * instead of a no-op. Sequential (not parallel) so the first failure stops
 * the batch.
 */
export async function bulkCreateCustomers(client: ApiClient, rows: CustomerInput[]): Promise<void> {
  for (const row of rows) {
    await createCustomer(client, row);
  }
}

/**
 * Utang balance — sum(unpaid credit sales) minus sum(payments), computed
 * live server-side (CustomerBalanceQuery). A query, never a stored column,
 * same shape as `supplierBalance`.
 */
export async function customerBalance(client: ApiClient, customerId: string): Promise<number> {
  const { data } = await client.get<{ data: { customer_id: string; balance: number } }>(
    `/customers/${customerId}/balance`,
  );
  return Number(data.balance);
}

/**
 * Every customer who currently owes utang, company-wide — one real grouped
 * query server-side (`GET /customers/credit/outstanding`), NOT the
 * N-parallel-calls pattern `listSupplierBalances` uses.
 */
export async function listCustomerBalances(client: ApiClient): Promise<Record<string, number>> {
  const { data } = await client.get<{ data: Record<string, number> }>("/customers/credit/outstanding");
  return data;
}

/** FIFO preview only — which of a customer's credit sales are still open, oldest first. Never a stored allocation. */
export async function listCustomerOpenSales(client: ApiClient, customerId: string): Promise<CustomerOpenSale[]> {
  const { data } = await client.get<{ data: CustomerOpenSaleJson[] }>(`/customers/${customerId}/open-sales`);
  return data.map(toCustomerOpenSale);
}

export async function listCustomerPayments(client: ApiClient, customerId: string): Promise<CustomerPayment[]> {
  const { data } = await client.get<{ data: CustomerPaymentJson[] }>(`/customers/${customerId}/payments`);
  return data.map(toCustomerPayment);
}

export interface RecordCustomerPaymentInput {
  amount: number;
  paidAt?: string;
  note?: string | null;
}

/** `Idempotency-Key` required — a retried "record ₱500" request (flaky connection at the counter) must never double-record. */
export async function recordCustomerPayment(
  client: ApiClient,
  customerId: string,
  input: RecordCustomerPaymentInput,
): Promise<CustomerPayment> {
  const { data } = await client.post<{ data: CustomerPaymentJson }>(
    `/customers/${customerId}/payments`,
    { amount: input.amount, paid_at: input.paidAt ?? null, note: input.note ?? null },
    { idempotent: true },
  );
  return toCustomerPayment(data);
}
