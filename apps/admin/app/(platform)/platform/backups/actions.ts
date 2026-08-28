"use server";

import { ApiError } from "@double-a/api-client";
import { createDatabaseBackup } from "@double-a/api-client/queries";
import { requireSuperadmin } from "@/lib/platform";

export async function triggerDatabaseBackupAction(): Promise<{ error: string | null }> {
  const { client } = await requireSuperadmin();

  try {
    await createDatabaseBackup(client);
    return { error: null };
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.message };
    }
    const message = error instanceof Error ? error.message : "Could not start backup.";
    return { error: message };
  }
}
