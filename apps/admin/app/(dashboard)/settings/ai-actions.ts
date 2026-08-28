"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@double-a/api-client";
import { updateCompanyAiSettings } from "@double-a/api-client/queries";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient } from "@/lib/api/session";

export async function saveAiSettings(enabled: boolean): Promise<FormState> {
  const client = getAuthedClient();

  try {
    await updateCompanyAiSettings(client, enabled);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message, ok: false };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not save AI settings: ${message}`, ok: false };
  }

  revalidatePath("/settings");
  return { error: null, ok: true };
}
