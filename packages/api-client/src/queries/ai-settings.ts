import type { ApiClient } from "../http";

export interface AiUsageBucket {
  weeklyLimit: number;
  used: number;
  remaining: number;
  overageCount?: number;
  overageChargePeso?: number;
  unitOverageChargePeso?: number | null;
}

export interface CompanyAiSettings {
  platformAvailable: boolean;
  enabled: boolean;
  bypassesLimits: boolean;
  photoExtract: AiUsageBucket;
  vectorSearch: AiUsageBucket;
  weekResetsAt: string;
}

interface CompanyAiSettingsAttrs {
  platform_available: boolean;
  enabled: boolean;
  bypasses_limits: boolean;
  photo_extract: {
    weekly_limit: number;
    used: number;
    remaining: number;
    overage_count: number;
    overage_charge_peso: number;
    unit_overage_charge_peso: number | null;
  };
  vector_search: {
    weekly_limit: number;
    used: number;
    remaining: number;
  };
  week_resets_at: string;
}

function mapUsageBucket(
  bucket: CompanyAiSettingsAttrs["photo_extract"] | CompanyAiSettingsAttrs["vector_search"],
): AiUsageBucket {
  if ("overage_count" in bucket) {
    return {
      weeklyLimit: bucket.weekly_limit,
      used: bucket.used,
      remaining: bucket.remaining,
      overageCount: bucket.overage_count,
      overageChargePeso: bucket.overage_charge_peso,
      unitOverageChargePeso: bucket.unit_overage_charge_peso,
    };
  }

  return {
    weeklyLimit: bucket.weekly_limit,
    used: bucket.used,
    remaining: bucket.remaining,
  };
}

function mapCompanyAiSettings(data: CompanyAiSettingsAttrs): CompanyAiSettings {
  return {
    platformAvailable: data.platform_available,
    enabled: data.enabled,
    bypassesLimits: data.bypasses_limits,
    photoExtract: mapUsageBucket(data.photo_extract),
    vectorSearch: mapUsageBucket(data.vector_search),
    weekResetsAt: data.week_resets_at,
  };
}

export async function getCompanyAiSettings(client: ApiClient): Promise<CompanyAiSettings> {
  const result = await client.get<{ data: CompanyAiSettingsAttrs }>("/ai-settings");
  return mapCompanyAiSettings(result.data);
}

export async function updateCompanyAiSettings(
  client: ApiClient,
  enabled: boolean,
): Promise<CompanyAiSettings> {
  const result = await client.patch<{ data: CompanyAiSettingsAttrs }>("/ai-settings", { enabled });
  return mapCompanyAiSettings(result.data);
}
