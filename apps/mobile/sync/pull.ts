import type { PullResult } from "@double-a/shared-types";
import { countProducts, getCompanyAiSettings, pullSync } from "@double-a/api-client/queries";
import { replaceAddonGroups } from "@/db/addon-groups";
import { saveLocalAiSettings } from "@/db/ai-settings";
import { replaceCategories } from "@/db/categories";
import { replaceSyncedCustomers } from "@/db/customers";
import { replaceFeatureFlags } from "@/db/feature-flags";
import { getSyncMeta, recordSyncSuccess } from "@/db/meta";
import { countLocalProducts, replaceProducts, upsertProducts } from "@/db/products";
import { replaceVariants, upsertVariants } from "@/db/product-variants";
import { saveLocalReceiptLayout } from "@/db/receipt-layout";
import { saveLocalStoreSettings } from "@/db/store";
import { replaceUsers, upsertUsers } from "@/db/users";
import { getApiClient } from "@/lib/api/session";
import { getActiveLocationId, setActiveLocationId } from "@/lib/device";

/**
 * Fetching is one HTTP round trip — there is no byte-level signal to report
 * mid-flight, so it counts as a flat slice of the bar. Writing to SQLite is
 * genuinely row-by-row, so products (almost always the biggest table by far)
 * carries the rest of the bar, proportional to rows actually written.
 */
const FETCH_WEIGHT = 20;

/**
 * Step two of sync: master data down from the Tally API, overwriting local
 * rows.
 *
 * Incremental — only rows whose `updated_at` is past the high water mark
 * from the last pull. The mark advances to `server_time`, a timestamp the
 * API captures atomically as part of the same request (`PullController`) —
 * simpler and safer than the old approach of taking the max `updated_at`
 * across the returned rows, and it always advances (there's no "nothing
 * changed, mark stays put" case to reason about).
 *
 * Stock figures are for the active location (device enrolled branch, or the
 * branch an admin tablet selected). Customers/categories stay company-wide.
 */
export async function pull(
  options: {
    full?: boolean;
    /**
     * Wholesale replace instead of upsert for products/users — the Sync
     * tab's explicit "Replace everything" action. Always implies a full
     * fetch (`since` is meaningless against a table about to be dropped).
     */
    replace?: boolean;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<PullResult> {
  const client = getApiClient();
  const meta = await getSyncMeta();
  let since = options.full || options.replace ? null : meta.highWaterMark;
  const locationId = await getActiveLocationId();

  // The old PostgREST page cap (1,000 rows) doesn't apply to the Tally API,
  // but a device that fell behind before this migration could still be
  // short of the office catalogue — keep the same count-mismatch fallback
  // to a full product pull.
  if (since) {
    const [remoteCount, localCount] = await Promise.all([
      countProducts(client, { includeInactive: true }),
      countLocalProducts(),
    ]);
    if (localCount < remoteCount) since = null;
  }

  const result = await pullSync(client, { since, locationId });
  options.onProgress?.(FETCH_WEIGHT);

  if (result.locationId) {
    await setActiveLocationId(result.locationId);
  }

  const writeProducts = options.replace ? replaceProducts : upsertProducts;
  const writeUsers = options.replace ? replaceUsers : upsertUsers;
  const writeVariants = options.replace ? replaceVariants : upsertVariants;

  await writeProducts(result.products, (done, total) => {
    const span = 100 - FETCH_WEIGHT - 5;
    options.onProgress?.(FETCH_WEIGHT + Math.round((done / total) * span));
  });
  await writeVariants(result.variants);

  // PIN hashes stay on the server — unlock calls verify-pin live. Local
  // users rows are for sale attribution after the shift starts, not
  // credentials.
  await writeUsers(result.users);
  await replaceCategories(result.categories);
  await replaceSyncedCustomers(result.customers);
  await replaceFeatureFlags(result.featureFlags);
  await replaceAddonGroups(result.addonGroups);

  try {
    const aiSettings = await getCompanyAiSettings(client);
    await saveLocalAiSettings({
      platformAvailable: aiSettings.platformAvailable,
      enabled: aiSettings.enabled,
    });
  } catch (error: unknown) {
    console.warn("AI settings pull failed — keeping last snapshot", error);
  }

  if (result.storeSettings) await saveLocalStoreSettings(result.storeSettings);
  if (result.receiptLayout) await saveLocalReceiptLayout(result.receiptLayout);

  await recordSyncSuccess(new Date().toISOString(), result.serverTime);
  options.onProgress?.(100);

  return {
    products: result.products.length,
    variants: result.variants.length,
    users: result.users.length,
    serverTimestamp: result.serverTime,
  };
}
