import type { ApiClient } from "@double-a/api-client";
import { ApiError } from "@double-a/api-client";
import { getFeatureFlags } from "@double-a/api-client/queries";
import { toCsv, type CsvValue } from "@/lib/csv";
import { storeToday } from "@/lib/date-range";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { isShopAdmin } from "@/lib/authz";

/** Blocks demo shops with more than 30 products from exporting product data. */
export async function assertDemoProductExportAllowed(
  client: ApiClient,
): Promise<Response | null> {
  try {
    await client.get("/v1/export/products-eligibility");
    return null;
  } catch (error) {
    if (error instanceof ApiError && error.isForbidden) {
      return new Response(`${error.message}\n`, { status: 403 });
    }
    throw error;
  }
}

/**
 * Every export route (sales, products, customers, ...) calls this — one
 * choke point, so the "export" feature flag only needs checking here rather
 * than in each of the ~10 route.ts files. This is the "block it on the API
 * side too" half for a feature that has no dedicated Laravel endpoint of its
 * own (export is Next.js route handlers calling existing read endpoints);
 * getFeatureFlags() still reads its answer from the Laravel API, same
 * source of truth a superadmin's toggle actually writes to.
 *
 * Every export also carries supplier prices and margin, so each route checks
 * the role itself rather than trusting that the button was only ever shown
 * to the owner. The API refuses a non-admin read too; this just turns that
 * into a clear 403 instead of a stack trace.
 */
export async function csvExport(
  name: string,
  build: (client: ApiClient) => Promise<{ headers: string[]; rows: CsvValue[][] }>,
): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Sign in to download this file.\n", { status: 401 });
  }
  if (!isShopAdmin(user)) {
    return new Response("Downloads are for the owner's account.\n", { status: 403 });
  }

  const flags = await getFeatureFlags(getAuthedClient());
  if (flags.export === false) {
    return new Response("Export has been turned off for this shop.\n", { status: 403 });
  }

  let csv: string;
  try {
    const { headers, rows } = await build(getAuthedClient());
    csv = toCsv(headers, rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Could not build the file: ${message}\n`, { status: 500 });
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${storeToday()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
