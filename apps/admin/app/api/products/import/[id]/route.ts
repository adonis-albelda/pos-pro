import { NextResponse } from "next/server";
import { getProductImportStatus } from "@double-a/api-client/queries";
import { getAuthedClient } from "@/lib/api/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  try {
    const status = await getProductImportStatus(getAuthedClient(), id);
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read import status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
