import { getPurchaseOrder, getStoreSettings, getSupplier } from "@double-a/api-client/queries";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { isShopAdmin } from "@/lib/authz";
import { purchaseOrderToPdf } from "@/lib/purchase-order-pdf";

export const runtime = "nodejs";

/** Download a printable purchase order for sending to the supplier. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Sign in to download this file.\n", { status: 401 });
  }
  if (!isShopAdmin(user)) {
    return new Response("Downloads are for the owner's account.\n", { status: 403 });
  }

  const { id } = await context.params;
  const client = getAuthedClient();
  const order = await getPurchaseOrder(client, id);

  if (!order) {
    return new Response("Purchase order not found.\n", { status: 404 });
  }

  try {
    const [supplier, store] = await Promise.all([
      getSupplier(client, order.supplierId),
      getStoreSettings(client),
    ]);
    const body = await purchaseOrderToPdf({ order, supplier, store });
    const slug = order.referenceNo?.trim().replace(/[^\w-]+/g, "-") || order.id.slice(0, 8);

    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="purchase-order-${slug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Could not build the PDF: ${message}\n`, { status: 500 });
  }
}
