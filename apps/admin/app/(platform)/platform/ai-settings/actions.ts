"use server";

import { updatePlatformAiSettings } from "@double-a/api-client/queries";
import type { AiPlanId } from "@double-a/shared-types";
import { ApiError } from "@double-a/api-client";
import { requireSuperadmin } from "@/lib/platform";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Unknown error";
}

export async function savePlatformAiSettingsAction(settings: {
  photoOverageChargePeso: number;
  plans: Array<{
    id: AiPlanId;
    name?: string;
    photoExtractWeeklyLimit: number;
    vectorSearchWeeklyLimit: number;
  }>;
}): Promise<{ error: string | null }> {
  const { client } = await requireSuperadmin();

  try {
    await updatePlatformAiSettings(client, settings);
  } catch (error) {
    return { error: errorMessage(error) };
  }

  return { error: null };
}
