"use server";

import { generateDemoAccessCode } from "@double-a/api-client/queries";
import { ApiError } from "@double-a/api-client";
import { requireSuperadmin } from "@/lib/platform";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Unknown error";
}

export async function generateDemoAccessCodeAction(): Promise<{ code: string | null; error: string | null }> {
  const { client } = await requireSuperadmin();

  try {
    const { code } = await generateDemoAccessCode(client);
    return { code, error: null };
  } catch (error) {
    return { code: null, error: errorMessage(error) };
  }
}
