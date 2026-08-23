import { lineProfit } from "@double-a/shared-types";
import { listSalesPage, listUsers } from "@double-a/api-client/queries";
import { resolveRange } from "@/lib/date-range";
import { csvExport } from "@/lib/export-route";

/** Well past a busy month on one terminal. */
const MAX_SALES = 5000;

/**
 * One row per line item, not per sale: this is the file that gets opened in a
 * spreadsheet and pivoted, and a sale total alone cannot answer "which
 * products did we discount in March".
 *
 * GAP: IndexSalesController has no date-range filter and SaleResource carries
 * no cashier name (see queries/sales.ts) — walks pages of the (optionally
 * status-filtered) listing, filters to the requested range client-side, and
 * joins the cashier name against a separately fetched user list.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const { range } = resolveRange({
    preset: params.get("preset") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });

  const status = params.get("status") ?? undefined;

  return csvExport("sales", async (client) => {
    const users = await listUsers(client, { includeInactive: true });
    const cashierNameById = new Map(users.map((user) => [user.id, user.name]));

    const sales = [];
    let page = 1;
    for (;;) {
      const result = await listSalesPage(client, { status, page, pageSize: 200 });
      sales.push(
        ...result.sales.filter((sale) => sale.createdAt >= range.from && sale.createdAt < range.to),
      );
      if (sales.length >= MAX_SALES || page >= result.lastPage) break;
      page += 1;
    }

    const rows = sales.slice(0, MAX_SALES).flatMap((sale) =>
      sale.items.map((item) => [
        sale.createdAt,
        sale.id,
        sale.invoiceNumber,
        (sale.userId && cashierNameById.get(sale.userId)) ?? null,
        sale.deviceId,
        sale.paymentMethod,
        sale.status,
        // Blank on most rows: only a delivery or an account sale carries these.
        sale.customerName,
        sale.customerContact,
        sale.customerAddress,
        item.productName,
        item.quantity,
        item.listPrice,
        item.unitPrice,
        item.unitCost,
        item.subtotal,
        lineProfit(item.unitPrice, item.unitCost, item.quantity),
      ]),
    );

    return {
      headers: [
        "sold_at",
        "sale_id",
        "invoice_number",
        "cashier",
        "terminal",
        "payment",
        "status",
        "customer_name",
        "customer_contact",
        "customer_address",
        "product",
        "quantity",
        "list_price",
        "unit_price",
        "unit_cost",
        "subtotal",
        "line_profit",
      ],
      rows,
    };
  });
}
