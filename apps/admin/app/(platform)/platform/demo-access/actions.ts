"use server";

import { generateDemoAccessCode } from "@double-a/api-client/queries";
import { ApiError } from "@double-a/api-client";
import { requireSuperadmin } from "@/lib/platform";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Unknown error";
}

export async function generateDemoAccessCodeAction(
  email: string,
): Promise<{ email: string | null; code: string | null; validForDate: string | null; error: string | null }> {
  const { client } = await requireSuperadmin();

  try {
    const result = await generateDemoAccessCode(client, email);
    return { email: result.email, code: result.code, validForDate: result.validForDate, error: null };
  } catch (error) {
    return { email: null, code: null, validForDate: null, error: errorMessage(error) };
  }
}
