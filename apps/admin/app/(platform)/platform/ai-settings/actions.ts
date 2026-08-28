"use server";

import { updatePlatformAiSettings } from "@double-a/api-client/queries";
import { ApiError } from "@double-a/api-client";
import { requireSuperadmin } from "@/lib/platform";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Unknown error";
}

export async function savePlatformAiSettingsAction(limits: {
  photoExtractWeeklyLimit: number;
  vectorSearchWeeklyLimit: number;
}): Promise<{ error: string | null }> {
  const { client } = await requireSuperadmin();

  try {
    await updatePlatformAiSettings(client, limits);
  } catch (error) {
    return { error: errorMessage(error) };
  }

  return { error: null };
}
