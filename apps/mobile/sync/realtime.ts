import type Echo from "laravel-echo";
import type { Channel } from "laravel-echo";
import {
  getPosProduct,
  toComplexDiscountRule,
  toDiscountRule,
  toLoyaltyProgram,
  toLoyaltyReward,
  toProduct,
  toProductVariant,
  toScheduleAssignment,
  toTaxSettings,
  toWorkSchedule,
  type ComplexDiscountRuleAttrs,
  type DiscountRuleAttrs,
  type LoyaltyRewardAttrs,
  type LoyaltySettingsAttrs,
  type ProductAttrs,
  type ProductVariantAttrs,
  type ScheduleAssignmentAttrs,
  type TaxSettingsAttrs,
  type WorkScheduleAttrs,
} from "@double-a/api-client";
import {
  deleteLocalComplexDiscountRule,
  deleteLocalDiscountRule,
  saveLocalTaxSettings,
  upsertLocalComplexDiscountRule,
  upsertLocalDiscountRule,
} from "@/db/discounts";
import { deleteLocalLoyaltyReward, saveLocalLoyaltyProgram, upsertLocalLoyaltyReward } from "@/db/loyalty";
import { updateProductCatalogFields, updateProductStock, upsertProducts } from "@/db/products";
import { updateVariantCatalogFields, updateVariantStock, upsertVariants } from "@/db/product-variants";
import {
  deleteLocalScheduleAssignment,
  deleteLocalWorkSchedule,
  upsertLocalScheduleAssignment,
  upsertLocalWorkSchedule,
} from "@/db/schedules";
import { apiUrl } from "@/lib/api/client";
import { getApiClient, getSessionToken } from "@/lib/api/session";

/**
 * require(), not `import Echo from "laravel-echo"` / `import Pusher from
 * "pusher-js/react-native"` — Metro's ESM-default interop for these two
 * packages has produced a non-constructor default export under Hermes
 * ("Object cannot be used as a constructor") depending on exactly how each
 * package's CJS/ESM fields line up. require() returns the raw
 * `module.exports` with no interop step, so `.default ?? <the export
 * itself>` below always lands on the real class regardless of which shape
 * either package ships.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
const EchoModule = require("laravel-echo");
const EchoCtor: typeof Echo = EchoModule.default ?? EchoModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
const PusherModule = require("pusher-js/react-native");
// The react-native build exports the class as a *named* `.Pusher` property
// (`module.exports.Pusher = r`), unlike the node/web builds which export it
// as the module itself / `.default` — this is the actual "Object cannot be
// used as a constructor" cause: falling through to `.default` here lands on
// `undefined`, then on the whole `{ Pusher }` wrapper object, not the class.
const PusherCtor = PusherModule.Pusher ?? PusherModule.default ?? PusherModule;

interface StockUpdatedPayload {
  product_id: string;
  location_id: string;
  quantity: number;
}

interface ProductUpdatedPayload {
  id: string;
  type: string;
  attributes: ProductAttrs;
}

/**
 * Variant realtime, emitted by the backend (App\Events\VariantStockUpdated /
 * VariantUpdated) alongside the product events, same channels:
 *
 *   - VariantStockUpdated → `location.{locationId}.stock`, `.variant.stock.updated`,
 *     fired from InventoryMovementObserver for every movement's own variant
 *     row (in addition to the product-level, summed-across-variants tick).
 *   - VariantUpdated → `company.{companyId}`, `.variant.updated`, fired from
 *     ProductVariantObserver::updated() for any variant (default or not)
 *     whose own catalogue fields changed. No stock_quantity, same reasoning
 *     as ProductUpdated — the stock channel's own event is the only writer.
 */
interface VariantStockUpdatedPayload {
  variant_id: string;
  product_id: string;
  location_id: string;
  quantity: number;
}

interface VariantUpdatedPayload {
  id: string;
  type: string;
  attributes: ProductVariantAttrs;
}

/**
 * ProductCreated / ProductVariantCreated (backend) — a brand-new row this
 * device has never seen, so unlike every other catalog event above there's
 * no local row to patch. Signal only (an id), not the full attributes: a
 * partial socket payload can't safely satisfy every column/join a fresh
 * INSERT needs (supplier links, addon groups, attribute values), so this
 * triggers a single-row fetch (getPosProduct) instead — same resource shape
 * and stock scoping a pull already uses, just for the one product a signal
 * just named. See refetchAndUpsertProduct below.
 */
interface ProductCreatedPayload {
  id: string;
}

interface VariantCreatedPayload {
  id: string;
  product_id: string;
}

/**
 * Discount/tax realtime — fired by Laravel's Store/Update/Destroy discount
 * controllers and UpdateTaxSettingsController. All on the same
 * `company.{companyId}` channel already used for catalogue events, since
 * discount rules, complex promos, and tax settings are company-scoped,
 * never location-scoped:
 *
 *   - DiscountRuleUpdated → event `.discount-rule.updated`, fired on every
 *     create/update from admin's discount rule form (a deactivation is just
 *     an update with is_active: false — CLAUDE.md-style soft delete, same
 *     as products). Payload a JSON:API resource shaped like
 *     DiscountRuleAttrs (packages/api-client).
 *   - DiscountRuleDeleted → event `.discount-rule.deleted`, only for an
 *     actual row deletion (packages/api-client's deleteDiscountRule).
 *     Payload `{ id }`.
 *   - ComplexDiscountRuleUpdated / ComplexDiscountRuleDeleted → identical
 *     shape, `.complex-discount-rule.updated` / `.complex-discount-rule.deleted`,
 *     ComplexDiscountRuleAttrs.
 *   - TaxSettingsUpdated → event `.tax-settings.updated`, fired on every
 *     admin save (packages/api-client's updateTaxSettings). Payload
 *     `{ data: TaxSettingsAttrs }` — same envelope as GET /tax-settings,
 *     not a JSON:API resource (tax_settings has no id, it's a single row).
 */
interface DiscountRuleUpdatedPayload {
  id: string;
  type: string;
  attributes: DiscountRuleAttrs;
}

interface ComplexDiscountRuleUpdatedPayload {
  id: string;
  type: string;
  attributes: ComplexDiscountRuleAttrs;
}

interface DiscountRuleDeletedPayload {
  id: string;
}

interface TaxSettingsUpdatedPayload {
  data: TaxSettingsAttrs;
}

/**
 * Loyalty realtime — fired by Store/Update/DestroyLoyaltyRewardController
 * and UpdateLoyaltySettingsController. Same `company.{companyId}` channel —
 * loyalty is company-scoped, same as discounts.
 *
 *   - LoyaltyRewardUpdated → `.loyalty-reward.updated`, JSON:API resource
 *     shaped like LoyaltyRewardAttrs.
 *   - LoyaltyRewardDeleted → `.loyalty-reward.deleted`, payload `{ id }`.
 *   - LoyaltySettingsUpdated → `.loyalty-settings.updated`, payload
 *     `{ data: LoyaltySettingsAttrs }` — same envelope as GET
 *     /loyalty-settings, not a JSON:API resource (a single row on companies).
 */
interface LoyaltyRewardUpdatedPayload {
  id: string;
  type: string;
  attributes: LoyaltyRewardAttrs;
}

interface LoyaltyRewardDeletedPayload {
  id: string;
}

interface LoyaltySettingsUpdatedPayload {
  data: LoyaltySettingsAttrs;
}

/**
 * Work schedule / assignment realtime — fired by Store/Update/Destroy
 * controllers for both resources. Same `company.{companyId}` channel —
 * schedules are company-scoped, no location dimension.
 *
 *   - WorkScheduleUpdated / WorkScheduleDeleted → `.work-schedule.updated` /
 *     `.work-schedule.deleted`, JSON:API resource shaped like
 *     WorkScheduleAttrs / `{ id }`.
 *   - ScheduleAssignmentUpdated / ScheduleAssignmentDeleted →
 *     `.schedule-assignment.updated` / `.schedule-assignment.deleted`,
 *     ScheduleAssignmentAttrs / `{ id }`.
 */
interface WorkScheduleUpdatedPayload {
  id: string;
  type: string;
  attributes: WorkScheduleAttrs;
}

interface ScheduleAssignmentUpdatedPayload {
  id: string;
  type: string;
  attributes: ScheduleAssignmentAttrs;
}

interface ScheduleDeletedPayload {
  id: string;
}

let echo: Echo<"reverb"> | null = null;
let connectedLocationId: string | null = null;
let connectedCompanyId: string | null = null;
/** Guards against .product.created and .variant.created (its auto-created default variant) both naming the same product at once — the fetch below is idempotent, this just skips the redundant second network call. */
const productRefetchInFlight = new Set<string>();

/**
 * Serializes every realtime DB write against this file's single SQLite
 * connection. Broadcasts fire in rapid, unordered bursts (a new product +
 * its variants + their stock ticks can all land within milliseconds of each
 * other) — expo-sqlite has no queueing of its own, so an explicit
 * multi-statement transaction (refetchAndUpsertProduct's upsertProducts/
 * upsertVariants) racing a concurrent plain UPDATE from a sibling listener
 * corrupts its internal transaction bookkeeping ("Call to function
 * 'NativeDatabase.execAsync' has been rejected... cannot rollback - no
 * transaction is active"). Every listener below routes its write through
 * this so only one is ever touching the DB at a time.
 */
let writeQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Fetch one product + its variants and write them in, for a device that has never seen this row before. */
async function refetchAndUpsertProduct(productId: string, locationId: string, onDone: () => void): Promise<void> {
  if (productRefetchInFlight.has(productId)) return;
  productRefetchInFlight.add(productId);

  try {
    const { product, variants } = await getPosProduct(getApiClient(), productId, locationId);
    if (product) await serialized(() => upsertProducts([product]));
    if (variants.length > 0) await serialized(() => upsertVariants(variants));
    onDone();
  } catch (error) {
    // Same non-fatal treatment as every other realtime listener — the next
    // manual Sync/Pull still catches this row regardless.
    console.warn("[realtime] product/variant created refetch failed", error);
  } finally {
    productRefetchInFlight.delete(productId);
  }
}
/** The real Pusher-protocol socket state — "connected" is the only state that means what the store-header dot promises. Not the same as `echo !== null`, which is true the instant Echo is constructed, well before the handshake finishes (or fails). */
let socketState = "disconnected";

/**
 * Live stock ticks for one branch (ProductStockUpdated) plus company-wide
 * catalogue edits (ProductUpdated — name/price/unit/etc, never stock; see
 * updateProductCatalogFields's own comment for why those two stay separate
 * writers). Connects only while effective-online (see sync-provider.tsx's
 * lifecycle effect) — offline mode or no connectivity means this never
 * runs, same spirit as CLAUDE.md's old "no real-time subscriptions on
 * mobile" rule, just now scoped to "unless online mode says otherwise."
 */
export async function connectRealtime(
  locationId: string,
  companyId: string,
  onStockTick: () => void,
  onStateChange?: (connected: boolean) => void,
  /** Fired (in addition to onStockTick) the moment a brand-new product's id is known — lets a mounted product grid play an entrance animation for that one tile instead of a plain silent appearance. */
  onProductCreated?: (productId: string) => void,
): Promise<void> {
  if (echo && connectedLocationId === locationId && connectedCompanyId === companyId) return;
  disconnectRealtime();

  const token = await getSessionToken();
  if (!token) return;

  const host = process.env.EXPO_PUBLIC_REVERB_HOST;
  const key = process.env.EXPO_PUBLIC_REVERB_APP_KEY;
  if (!host || !key) return; // Not configured on this build — fail quiet, same as any other optional feature.

  const scheme = process.env.EXPO_PUBLIC_REVERB_SCHEME ?? "https";
  const port = Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? (scheme === "https" ? 443 : 80));
  const authEndpoint = `${apiUrl().replace(/\/v1\/?$/, "")}/broadcasting/auth`;
  if (__DEV__) console.warn("[realtime] authEndpoint:", authEndpoint);

  echo = new EchoCtor({
    broadcaster: "reverb",
    Pusher: PusherCtor,
    key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === "https",
    enabledTransports: ["ws", "wss"],
    // Sanctum bearer token, not a cookie session — Echo attaches this as the
    // Authorization header on /broadcasting/auth, same as every other
    // request this app makes (see lib/api/session.ts). Broadcast::routes()
    // registers at the app root, not under /v1 — apiUrl() is API-v1-scoped
    // (…/v1), so it has to be stripped here or this 404s.
    authEndpoint,
    bearerToken: token,
  });

  // Echo has no public "connected" API of its own — the real Pusher client
  // underneath (echo.connector.pusher) does. Not in laravel-echo's types,
  // hence the cast; this is the same object pusher-js's own docs point at
  // for connection-state debugging.
  const pusherConnection = (
    echo as unknown as { connector: { pusher: { connection: PusherConnectionLike } } }
  ).connector?.pusher?.connection;

  if (pusherConnection) {
    pusherConnection.bind("state_change", (states: { current: string }) => {
      socketState = states.current;
      onStateChange?.(states.current === "connected");
      if (__DEV__) console.warn("[realtime] socket state:", states.current);
    });
  }

  const stockChannel: Channel = echo.private(`location.${locationId}.stock`);
  stockChannel.listen(".stock.updated", (payload: StockUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] stock.updated", payload);
    void serialized(() => updateProductStock(payload.product_id, payload.quantity)).then((found) => {
      // false means this device never had the product locally at all — a
      // plain UPDATE can't fix that, only a real fetch can. Same self-heal
      // as .product.created/.variant.created below, just reached from a
      // stock tick instead of a creation signal.
      if (found) onStockTick();
      else void refetchAndUpsertProduct(payload.product_id, locationId, onStockTick);
    });
  });
  stockChannel.listen(".variant.stock.updated", (payload: VariantStockUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] variant.stock.updated", payload);
    void serialized(() => updateVariantStock(payload.variant_id, payload.quantity)).then((found) => {
      if (found) onStockTick();
      else void refetchAndUpsertProduct(payload.product_id, locationId, onStockTick);
    });
  });
  stockChannel.error((error: unknown) => {
    // Almost always a 403/422 from /broadcasting/auth — wrong location_id
    // scoping, an expired token, or REVERB_* env pointed at the wrong host.
    console.warn("[realtime] channel auth failed", error);
  });

  const catalogChannel: Channel = echo.private(`company.${companyId}`);
  catalogChannel.listen(".product.updated", (payload: ProductUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] product.updated", payload);
    void serialized(() => updateProductCatalogFields(toProduct(payload))).then(onStockTick);
  });
  catalogChannel.listen(".variant.updated", (payload: VariantUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] variant.updated", payload);
    void serialized(() => updateVariantCatalogFields(toProductVariant(payload))).then(onStockTick);
  });
  catalogChannel.listen(".product.created", (payload: ProductCreatedPayload) => {
    if (__DEV__) console.warn("[realtime] product.created", payload);
    onProductCreated?.(payload.id);
    void refetchAndUpsertProduct(payload.id, locationId, onStockTick);
  });
  catalogChannel.listen(".variant.created", (payload: VariantCreatedPayload) => {
    if (__DEV__) console.warn("[realtime] variant.created", payload);
    onProductCreated?.(payload.product_id);
    void refetchAndUpsertProduct(payload.product_id, locationId, onStockTick);
  });
  catalogChannel.listen(".discount-rule.updated", (payload: DiscountRuleUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] discount-rule.updated", payload);
    void serialized(() => upsertLocalDiscountRule(toDiscountRule(payload))).then(onStockTick);
  });
  catalogChannel.listen(".discount-rule.deleted", (payload: DiscountRuleDeletedPayload) => {
    if (__DEV__) console.warn("[realtime] discount-rule.deleted", payload);
    void serialized(() => deleteLocalDiscountRule(payload.id)).then(onStockTick);
  });
  catalogChannel.listen(".complex-discount-rule.updated", (payload: ComplexDiscountRuleUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] complex-discount-rule.updated", payload);
    void serialized(() => upsertLocalComplexDiscountRule(toComplexDiscountRule(payload))).then(onStockTick);
  });
  catalogChannel.listen(".complex-discount-rule.deleted", (payload: DiscountRuleDeletedPayload) => {
    if (__DEV__) console.warn("[realtime] complex-discount-rule.deleted", payload);
    void serialized(() => deleteLocalComplexDiscountRule(payload.id)).then(onStockTick);
  });
  catalogChannel.listen(".tax-settings.updated", (payload: TaxSettingsUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] tax-settings.updated", payload);
    void serialized(() => saveLocalTaxSettings(toTaxSettings(payload.data))).then(onStockTick);
  });
  catalogChannel.listen(".loyalty-reward.updated", (payload: LoyaltyRewardUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] loyalty-reward.updated", payload);
    void serialized(() => upsertLocalLoyaltyReward(toLoyaltyReward(payload))).then(onStockTick);
  });
  catalogChannel.listen(".loyalty-reward.deleted", (payload: LoyaltyRewardDeletedPayload) => {
    if (__DEV__) console.warn("[realtime] loyalty-reward.deleted", payload);
    void serialized(() => deleteLocalLoyaltyReward(payload.id)).then(onStockTick);
  });
  catalogChannel.listen(".loyalty-settings.updated", (payload: LoyaltySettingsUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] loyalty-settings.updated", payload);
    void serialized(() => saveLocalLoyaltyProgram(toLoyaltyProgram(payload.data))).then(onStockTick);
  });
  catalogChannel.listen(".work-schedule.updated", (payload: WorkScheduleUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] work-schedule.updated", payload);
    void serialized(() => upsertLocalWorkSchedule(toWorkSchedule(payload))).then(onStockTick);
  });
  catalogChannel.listen(".work-schedule.deleted", (payload: ScheduleDeletedPayload) => {
    if (__DEV__) console.warn("[realtime] work-schedule.deleted", payload);
    void serialized(() => deleteLocalWorkSchedule(payload.id)).then(onStockTick);
  });
  catalogChannel.listen(".schedule-assignment.updated", (payload: ScheduleAssignmentUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] schedule-assignment.updated", payload);
    void serialized(() => upsertLocalScheduleAssignment(toScheduleAssignment(payload))).then(onStockTick);
  });
  catalogChannel.listen(".schedule-assignment.deleted", (payload: ScheduleDeletedPayload) => {
    if (__DEV__) console.warn("[realtime] schedule-assignment.deleted", payload);
    void serialized(() => deleteLocalScheduleAssignment(payload.id)).then(onStockTick);
  });
  catalogChannel.error((error: unknown) => {
    console.warn("[realtime] catalog channel auth failed", error);
  });

  connectedLocationId = locationId;
  connectedCompanyId = companyId;
}

export function disconnectRealtime(): void {
  echo?.disconnect();
  echo = null;
  connectedLocationId = null;
  connectedCompanyId = null;
  socketState = "disconnected";
}

export function isRealtimeConnected(): boolean {
  return socketState === "connected";
}

interface PusherConnectionLike {
  bind(event: "state_change", callback: (states: { current: string }) => void): void;
}
