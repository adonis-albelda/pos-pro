import { getDb } from "./index";

/** Minimal snapshot for POS chrome — full quotas stay on the server. */
export interface LocalAiSettings {
  platformAvailable: boolean;
  enabled: boolean;
}

const DEFAULT_AI_SETTINGS: LocalAiSettings = {
  platformAvailable: false,
  enabled: false,
};

export async function getLocalAiSettings(): Promise<LocalAiSettings> {
  const row = await getDb().getFirstAsync<{
    platform_available: number;
    enabled: number;
  }>(
    `SELECT platform_available, enabled
       FROM ai_settings
      WHERE id = 1`,
  );

  if (!row) return DEFAULT_AI_SETTINGS;

  return {
    platformAvailable: row.platform_available === 1,
    enabled: row.enabled === 1,
  };
}

export async function saveLocalAiSettings(settings: LocalAiSettings): Promise<void> {
  await getDb().runAsync(
    `UPDATE ai_settings
        SET platform_available = ?,
            enabled = ?
      WHERE id = 1`,
    settings.platformAvailable ? 1 : 0,
    settings.enabled ? 1 : 0,
  );
}
