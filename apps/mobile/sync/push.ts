import {
  validateSaleForPush,
  type LocalSaleWithItems,
  type PushResult,
} from "@double-a/shared-types";
import { patchSaleFlags, pushCustomers, pushSales } from "@double-a/api-client/queries";
import {
  listPendingCustomers,
  markCustomersSynced,
} from "@/db/customers";
import {
  listFlagPendingSales,
  listPendingSales,
  markFlagsSynced,
  markSalesSynced,
} from "@/db/sales";
import { getEnrolledCompanyId } from "@/lib/device";
import { getApiClient } from "@/lib/api/session";

const BATCH_SIZE = 50;

/**
 * Step one of sync: local customers and sales up to the Tally API.
 *
 * Customers first — sales.customer_id is a foreign key. Then new sales. Then
 * flag patches for sales that already landed but had paid/delivery flipped
 * later (`patch_sale_flags` is the only write path for those columns).
 *
 * Rows are only marked synced after the upload for their batch succeeds. If
 * the connection drops halfway, whatever did not land stays pending and
 * goes again next time. Sync stops here on failure and never proceeds to
 * the pull.
 *
 * `company_id` is never sent — the server stamps it from the caller's own
 * company context (CLAUDE.md §15: shop writes must never cross company_id).
 * Sale/item rows go over the wire as-is (`pushSales` builds the payload
 * straight off `Sale`/`SaleItem` fields) — no manual row-shaping needed
 * here anymore, unlike the old Supabase insert-row builders.
 */
export async function push(): Promise<PushResult> {
  const client = getApiClient();
  const companyId = await getEnrolledCompanyId();
  if (!companyId) {
    throw new Error(
      "This terminal is not linked to a company. Finish setup before syncing.",
    );
  }

  const pendingCustomers = await listPendingCustomers();
  if (pendingCustomers.length > 0) {
    await pushCustomers(
      client,
      pendingCustomers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        address: customer.address,
        contact: customer.contact,
      })),
    );
    await markCustomersSynced(pendingCustomers.map((customer) => customer.id));
  }

  const pending = await listPendingSales();

  // A malformed row would fail its whole batch, so bad rows are held back rather
  // than blocking every other sale on the device.
  const valid: LocalSaleWithItems[] = [];
  const rejected: { id: string; errors: string[] }[] = [];

  for (const sale of pending) {
    const result = validateSaleForPush(sale, sale.items);
    if (result.ok) valid.push(sale);
    else rejected.push({ id: sale.id, errors: result.errors });
  }

  if (rejected.length > 0) {
    console.warn("Sales held back from sync:", rejected);
  }

  let salesPushed = 0;
  let itemsPushed = 0;
  const invoiceNumbers: Record<string, string> = {};

  for (let index = 0; index < valid.length; index += BATCH_SIZE) {
    const batch = valid.slice(index, index + BATCH_SIZE);

    const result = await pushSales(client, batch);
    Object.assign(invoiceNumbers, result.invoiceNumbers);

    const syncedAt = new Date().toISOString();
    await markSalesSynced(
      batch.map((sale) => sale.id),
      syncedAt,
      result.invoiceNumbers,
    );

    salesPushed += batch.length;
    itemsPushed += batch.reduce((count, sale) => count + sale.items.length, 0);
  }

  const flagPending = await listFlagPendingSales();
  for (const sale of flagPending) {
    await patchSaleFlags(client, sale.id, {
      isPaid: sale.isPaid,
      deliveryCompleted: sale.deliveryCompleted,
    });
  }
  await markFlagsSynced(flagPending.map((sale) => sale.id));

  if (rejected.length > 0 && salesPushed === 0 && pending.length > 0) {
    throw new Error(
      `${rejected.length} sale(s) could not be sent because their totals do not add up. Show this terminal to an admin.`,
    );
  }

  return { salesPushed, itemsPushed, invoiceNumbers };
}
