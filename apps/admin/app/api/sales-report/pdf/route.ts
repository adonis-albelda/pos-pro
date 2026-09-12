import {
  getStoreSettings,
  reportByCashier,
  reportByCategory,
  reportByDevice,
  reportByLocation,
  reportByPaymentMethod,
  reportProfit,
  reportRefundsVoids,
  reportTopProducts,
} from "@double-a/api-client/queries";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { isShopAdmin } from "@/lib/authz";
import { salesReportToPdf } from "@/lib/sales-report-pdf";

export const runtime = "nodejs";

/** `day` is a shop-day yyyy-mm-dd (fromDay/toDay from lib/date-range.ts), not `range.to`'s exclusive next-day instant. */
function formatDayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Print Sales Report — reuses every report endpoint already built for the
 * Sales Dashboard (packages/api-client/src/queries/reports.ts), scoped by
 * the same `from`/`to` shop-day range the dashboard's date picker produces.
 * No new backend query/aggregation logic; see lib/sales-report-pdf.ts.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Sign in to download this file.\n", { status: 401 });
  }
  if (!isShopAdmin(user)) {
    return new Response("Downloads are for the owner's account.\n", { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const fromDay = url.searchParams.get("fromDay");
  const toDay = url.searchParams.get("toDay");

  if (!from || !to || !fromDay || !toDay) {
    return new Response("Missing from/to date range.\n", { status: 400 });
  }

  const range = { from, to };

  try {
    const client = getAuthedClient();
    const [profit, topProducts, categories, paymentMethods, byLocation, byCashier, byDevice, refundsVoids, store] =
      await Promise.all([
        reportProfit(client, range),
        reportTopProducts(client, range, 10),
        reportByCategory(client, range),
        reportByPaymentMethod(client, range),
        reportByLocation(client, range),
        reportByCashier(client, range),
        reportByDevice(client, range),
        reportRefundsVoids(client, range),
        getStoreSettings(client),
      ]);

    const body = await salesReportToPdf({
      store,
      fromLabel: formatDayLabel(fromDay),
      toLabel: formatDayLabel(toDay),
      generatedByName: user.name,
      profit,
      topProducts,
      categories,
      paymentMethods,
      byLocation,
      byCashier,
      byDevice,
      refundsVoids,
    });

    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="sales-report-${fromDay}-to-${toDay}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Could not build the PDF: ${message}\n`, { status: 500 });
  }
}
