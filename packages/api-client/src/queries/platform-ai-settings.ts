import type { ApiClient } from "../http";

export interface PlatformAiSettings {
  photoExtractWeeklyLimit: number;
  vectorSearchWeeklyLimit: number;
}

interface PlatformAiSettingsAttrs {
  photo_extract_weekly_limit: number;
  vector_search_weekly_limit: number;
}

function mapPlatformAiSettings(data: PlatformAiSettingsAttrs): PlatformAiSettings {
  return {
    photoExtractWeeklyLimit: data.photo_extract_weekly_limit,
    vectorSearchWeeklyLimit: data.vector_search_weekly_limit,
  };
}

export async function getPlatformAiSettings(client: ApiClient): Promise<PlatformAiSettings> {
  const result = await client.get<{ data: PlatformAiSettingsAttrs }>("/superadmin/ai-settings");
  return mapPlatformAiSettings(result.data);
}

export async function updatePlatformAiSettings(
  client: ApiClient,
  limits: {
    photoExtractWeeklyLimit: number;
    vectorSearchWeeklyLimit: number;
  },
): Promise<PlatformAiSettings> {
  const result = await client.patch<{ data: PlatformAiSettingsAttrs }>("/superadmin/ai-settings", {
    photo_extract_weekly_limit: limits.photoExtractWeeklyLimit,
    vector_search_weekly_limit: limits.vectorSearchWeeklyLimit,
  });
  return mapPlatformAiSettings(result.data);
}
