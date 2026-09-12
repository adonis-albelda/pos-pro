import { getStockTransfer, getStoreSettings } from "@double-a/api-client/queries";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { stockTransferToPdf } from "@/lib/stock-transfer-pdf";

export const runtime = "nodejs";

/** Download a printable stock transfer document. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Sign in to download this file.\n", { status: 401 });
  }

  const { id } = await context.params;
  const client = getAuthedClient();
  const transfer = await getStockTransfer(client, id);

  if (!transfer) {
    return new Response("Stock transfer not found.\n", { status: 404 });
  }

  try {
    const store = await getStoreSettings(client);
    const body = await stockTransferToPdf({ transfer, store });
    const slug = transfer.id.slice(0, 8);

    return new Response(Buffer.from(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="stock-transfer-ST-${slug}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Could not build the PDF: ${message}\n`, { status: 500 });
  }
}
