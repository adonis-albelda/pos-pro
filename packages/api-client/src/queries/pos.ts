import type {
  Category,
  Customer,
  Product,
  ReceiptLayout,
  SaleWithItems,
  StoreSettings,
  User,
} from "@double-a/shared-types";
import type { ApiClient, DataEnvelope, JsonApiOne } from "../http";
import {
  type CategoryAttrs,
  type CustomerAttrs,
  type ProductAttrs,
  type ReceiptLayoutAttrs,
  type StoreSettingAttrs,
  type UserAttrs,
  toCategory,
  toCustomer,
  toProduct,
  toReceiptLayout,
  toStoreSettings,
  toUser,
} from "../mappers";

/**
 * POS-specific primitives: device enrollment, cashier PIN, and the two raw
 * sync calls (push, pull). This file is the network layer only — CLAUDE.md
 * §1's push-then-pull ordering, "stop on push failure," and the pull-only
 * Refresh action all belong to apps/mobile's sync orchestration (a later
 * phase), not here. Flag-patching (`PATCH /sales/{sale}/flags`) lives in
 * queries/sales.ts, built separately — not duplicated here.
 */

/** Meta block Sanctum-issuing endpoints (login, enroll) attach next to the user resource. */
export interface AuthTokenMeta {
  token: string;
  token_type: string;
  /** Null for a device token — enrollment issues a non-expiring session. */
  expires_at: string | null;
}

export interface EnrolledDevice {
  user: User;
  token: string;
  tokenType: string;
  expiresAt: string | null;
}

/**
 * Runs on an ADMIN's authenticated ApiClient — `EnrollDeviceController`
 * requires the caller to already be an admin. The returned token is a
 * *different* session: it belongs to the newly created device user and is
 * what the mobile app then persists as its own long-lived (non-expiring)
 * bearer token. Callers must not confuse the admin's client with the token
 * in this return value — they are two separate sessions from this point on.
 */
export async function enrollDevice(client: ApiClient, deviceName: string): Promise<EnrolledDevice> {
  const { data, meta } = await client.post<JsonApiOne<UserAttrs> & { meta: AuthTokenMeta }>(
    "/pos/devices/enroll",
    { device_name: deviceName },
    { idempotent: true },
  );
  return {
    user: toUser(data),
    token: meta.token,
    tokenType: meta.token_type,
    expiresAt: meta.expires_at,
  };
}

export interface VerifyCashierPinInput {
  userId: string;
  pin: string;
}

export interface VerifyCashierPinResult {
  verified: boolean;
  /**
   * Set only when the unlocked cashier's own role is admin — a short-lived
   * Sanctum token minted on that admin, not the device. Policies gated on
   * actsAsAdmin() (suppliers, expenses, purchase orders, some reports) need
   * a real admin principal; the terminal's own device token never has one.
   */
  adminToken: string | null;
  adminTokenExpiresAt: string | null;
}

/**
 * Live cashier unlock check (CLAUDE.md §1 — unlock is always a network
 * call). The raw PIN string goes over the wire; the server hashes and
 * compares against `pin_hash`. Never round-trips a hash. Response is a
 * plain `{ verified, admin_token, admin_token_expires_at }` object, not
 * JSON:API-wrapped.
 */
export async function verifyCashierPin(
  client: ApiClient,
  input: VerifyCashierPinInput,
): Promise<VerifyCashierPinResult> {
  const result = await client.post<{
    verified: boolean;
    admin_token: string | null;
    admin_token_expires_at: string | null;
  }>("/pos/cashiers/verify-pin", {
    user_id: input.userId,
    pin: input.pin,
  });
  return {
    verified: result.verified,
    adminToken: result.admin_token,
    adminTokenExpiresAt: result.admin_token_expires_at,
  };
}

export interface CashierPin {
  id: string;
  pinHash: string | null;
}

/**
 * PIN hashes for this company's cashiers/admins, pulled so a device can
 * verify a PIN when actually offline — distinct from `verifyCashierPin`
 * above, which is the always-live check the unlock screen calls first.
 * Response shape is `{ data: [{ id, pin_hash }] }`: a plain JsonResource
 * collection, not JSON:API (no `type`/`attributes`).
 */
export async function listCashierPins(client: ApiClient): Promise<CashierPin[]> {
  const { data } = await client.get<DataEnvelope<{ id: string; pin_hash: string | null }[]>>(
    "/pos/cashiers/pins",
  );
  return data.map((row) => ({ id: row.id, pinHash: row.pin_hash }));
}

export interface PushCustomerInput {
  /** Client-generated UUID — required, per CLAUDE.md §11 (offline-created row, same rule as sales). */
  id: string;
  name: string;
  address?: string | null;
  contact?: string | null;
}

/**
 * NOTE: `PushCustomersRequest::rules()` only validates `id`/`name`/`address`/
 * `contact` — `created_at`/`updated_at` are not accepted from the client and
 * `PushCustomersAction` always stamps them with `now()` server-side. The old
 * Supabase push sent a local `updated_at`; that value now has nowhere to go.
 * Not a functional gap (sync doesn't read customer `updated_at` off a high
 * water mark — customers are pulled whole every time per CLAUDE.md §11), but
 * worth knowing if a future call site starts relying on it.
 */
function toPushCustomerPayload(input: PushCustomerInput): Record<string, unknown> {
  return {
    id: input.id,
    name: input.name,
    address: input.address ?? null,
    contact: input.contact ?? null,
  };
}

/**
 * Push step 1 (CLAUDE.md §1): local customers up to the server, before
 * sales (`sales.customer_id` is a foreign key). `PushCustomersAction` does a
 * bulk `insertOrIgnore` — already-synced ids are silently skipped, so this
 * is safe to retry. Confirmed client-supplied `id` IS accepted (required
 * uuid in `PushCustomersRequest`), matching CLAUDE.md §3 / §11 — no gap.
 */
export async function pushCustomers(client: ApiClient, customers: PushCustomerInput[]): Promise<void> {
  if (customers.length === 0) return;
  await client.post<{ message: string }>(
    "/pos/sync/customers",
    { customers: customers.map(toPushCustomerPayload) },
    { idempotent: true },
  );
}

/**
 * `PushSalesRequest` accepts `id`/`items.*.id` as required uuids — confirmed
 * client-generated sale and sale-item ids ARE accepted, matching CLAUDE.md
 * §3. No gap. `company_id` is deliberately never sent: `PushSalesAction`
 * does not read it off the payload, so the server must stamp it from the
 * caller's own company context — sending a client value would either be
 * silently dropped or (worse) trusted, and CLAUDE.md §15 says shop writes
 * must never cross `company_id`.
 */
function toPushSalePayload(sale: SaleWithItems): Record<string, unknown> {
  return {
    id: sale.id,
    user_id: sale.userId,
    customer_id: sale.customerId,
    total_amount: sale.totalAmount,
    discount_amount: sale.discountAmount,
    payment_method: sale.paymentMethod,
    status: sale.status,
    device_id: sale.deviceId,
    customer_name: sale.customerName,
    customer_address: sale.customerAddress,
    customer_contact: sale.customerContact,
    is_paid: sale.isPaid,
    fulfillment: sale.fulfillment,
    delivery_completed: sale.deliveryCompleted,
    // Admin tablet POS may switch branches — devices' value is ignored server-side.
    location_id: sale.locationId ?? undefined,
    created_at: sale.createdAt,
    items: sale.items.map((item) => ({
      id: item.id,
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: item.subtotal,
      list_price: item.listPrice,
      unit_cost: item.unitCost,
    })),
  };
}

export interface PushSalesResult {
  /** Ids Laravel actually inserted this call — an id already on the server (a retried push) is skipped, not re-listed here. */
  createdIds: string[];
  /** Sale id -> server-assigned invoice number, for the ids above. */
  invoiceNumbers: Record<string, string>;
}

/**
 * Push step 2 (CLAUDE.md §1), after `pushCustomers`. `PushSalesAction`
 * skips any incoming sale id that already exists server-side, so a retried
 * push (e.g. after a dropped connection) is safe. Each new sale is created
 * transactionally with its items, mirroring the old per-row Postgres
 * triggers (stock decrement, etc.) that fired on insert.
 */
export async function pushSales(client: ApiClient, sales: SaleWithItems[]): Promise<PushSalesResult> {
  if (sales.length === 0) return { createdIds: [], invoiceNumbers: {} };
  const { data } = await client.post<DataEnvelope<{ created_ids: string[]; invoice_numbers: Record<string, string> }>>(
    "/pos/sync/sales",
    { sales: sales.map(toPushSalePayload) },
    { idempotent: true },
  );
  return { createdIds: data.created_ids, invoiceNumbers: data.invoice_numbers ?? {} };
}

export interface PullSyncResult {
  /** New high-water-mark cursor (`last_synced_at`) — persist this, not device time. */
  serverTime: string;
  /** Branch/warehouse the stock_quantity figures belong to. */
  locationId: string | null;
  products: Product[];
  users: User[];
  categories: Category[];
  customers: Customer[];
  storeSettings: StoreSettings | null;
  receiptLayout: ReceiptLayout | null;
  /** {key: enabled} — whole-replace, same as categories (CLAUDE.md §1). */
  featureFlags: Record<string, boolean>;
}

interface PullSyncResponse {
  server_time: string;
  location_id?: string | null;
  products: { type: string; id: string; attributes: ProductAttrs }[];
  users: { type: string; id: string; attributes: UserAttrs }[];
  categories: { type: string; id: string; attributes: CategoryAttrs }[];
  customers: { type: string; id: string; attributes: CustomerAttrs }[];
  store_settings: { type: string; id: string; attributes: StoreSettingAttrs } | null;
  receipt_layout: { type: string; id: string; attributes: ReceiptLayoutAttrs } | null;
  feature_flags: Record<string, boolean>;
}

type WireResource<A> = { type: string; id: string; attributes: A };

/**
 * A malformed row (missing `attributes`, or one that throws while mapping)
 * must not take down the whole pull — a POS terminal mid-onboarding has no
 * good recovery from a hard crash here. Skips the bad row with a
 * console.warn instead of throwing; every other row still lands.
 */
function mapResourceList<T, A>(
  items: WireResource<A>[] | undefined,
  label: string,
  toDomain: (resource: WireResource<A>) => T,
): T[] {
  if (!Array.isArray(items)) {
    console.warn(`pullSync: "${label}" was not an array in the response — treating as empty.`);
    return [];
  }
  const results: T[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || !item.attributes) {
      console.warn(`pullSync: skipping malformed "${label}" row (missing attributes):`, item);
      continue;
    }
    try {
      results.push(toDomain(item));
    } catch (error) {
      console.warn(`pullSync: skipping "${label}" row that failed to map:`, item, error);
    }
  }
  return results;
}

function mapSingleResource<T, A>(
  item: WireResource<A> | null | undefined,
  label: string,
  toDomain: (resource: WireResource<A>) => T,
): T | null {
  if (!item) return null;
  if (!item.attributes) {
    console.warn(`pullSync: "${label}" was present but missing attributes — treating as absent.`);
    return null;
  }
  try {
    return toDomain(item);
  } catch (error) {
    console.warn(`pullSync: "${label}" failed to map — treating as absent:`, error);
    return null;
  }
}

/**
 * Push step 2 (pull side of sync — CLAUDE.md §1). Serves BOTH the Sync tab's
 * pull step and the pull-only "Refresh" action: callers who only want a
 * refresh simply never call `pushSales`/`pushCustomers` first, then call
 * this the same way. `since` omitted (or undefined) pulls everything —
 * matches `PullController`, which treats a missing `since` query param as
 * "no filter." Categories/customers/store_settings/receipt_layout come back
 * whole every call (CLAUDE.md §1, §9, §10, §11); products/users are
 * filtered server-side to `updated_at > since` when `since` is given.
 */
export async function pullSync(
  client: ApiClient,
  options: { since?: string | null; locationId?: string | null } = {},
): Promise<PullSyncResult> {
  const { data } = await client.get<DataEnvelope<PullSyncResponse>>("/pos/sync/pull", {
    since: options.since ?? undefined,
    location_id: options.locationId ?? undefined,
  });

  return {
    serverTime: data.server_time,
    locationId: data.location_id ?? null,
    products: mapResourceList(data.products, "products", toProduct),
    users: mapResourceList(data.users, "users", toUser),
    categories: mapResourceList(data.categories, "categories", toCategory),
    customers: mapResourceList(data.customers, "customers", toCustomer),
    storeSettings: mapSingleResource(data.store_settings, "store_settings", toStoreSettings),
    receiptLayout: mapSingleResource(data.receipt_layout, "receipt_layout", toReceiptLayout),
    featureFlags: data.feature_flags ?? {},
  };
}
