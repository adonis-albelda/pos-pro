import {
  getProductStats,
  getStoreSettings,
  listBelowReorder,
  listOversold,
  reportInventoryValuation,
  reportInventoryValuationSummary,
} from "@double-a/api-client/queries";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { isShopAdmin } from "@/lib/authz";
import { inventoryReportToPdf } from "@/lib/inventory-report-pdf";

export const runtime = "nodejs";

// Same reasoning as app/api/sales-report/pdf/route.ts — the shared ApiClient
// sets no request timeout anywhere, so a slow/unreachable backend would
// otherwise hang this route's Promise.all forever.
const REPORT_BUILD_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label} took too long (over ${Math.round(ms / 1000)}s) — check the API connection and try again.`)),
        ms,
      );
    }),
  ]);
}

/**
 * Print Inventory Report — reuses every query already built for the
 * Inventory page's stat cards and CSV export
 * (packages/api-client/src/queries/{products,reports}.ts). No date range —
 * a snapshot of what's on the shelves right now, same as
 * reportInventoryValuation() itself. No new backend/aggregation logic; see
 * lib/inventory-report-pdf.ts.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Sign in to download this file.\n", { status: 401 });
  }
  if (!isShopAdmin(user)) {
    return new Response("Downloads are for the owner's account.\n", { status: 403 });
  }

  try {
    const client = getAuthedClient();
    const [stats, byCategory, belowReorder, oversold, valuation, store] = await withTimeout(
      Promise.all([
        getProductStats(client),
        reportInventoryValuationSummary(client),
        listBelowReorder(client),
        listOversold(client),
        reportInventoryValuation(client),
        getStoreSettings(client),
      ]),
      REPORT_BUILD_TIMEOUT_MS,
      "Building the inventory report",
    );

    const body = await inventoryReportToPdf({
      store,
      generatedByName: user.name,
      stats,
      byCategory,
      belowReorder,
      oversold,
      valuation,
    });

    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="inventory-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Could not build the PDF: ${message}\n`, { status: 500 });
  }
}
