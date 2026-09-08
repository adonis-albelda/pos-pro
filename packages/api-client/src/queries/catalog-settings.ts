import type { ApiClient } from "../http";

/** The acting company's product-catalog preferences — owner-only to change. */
export interface CatalogSettings {
  variantSignalDetectionEnabled: boolean;
}

interface CatalogSettingsAttrs {
  variant_signal_detection_enabled: boolean;
}

export async function getCatalogSettings(client: ApiClient): Promise<CatalogSettings> {
  const { data } = await client.get<{ data: CatalogSettingsAttrs }>("/catalog-settings");
  return { variantSignalDetectionEnabled: data.variant_signal_detection_enabled };
}

export async function updateCatalogSettings(
  client: ApiClient,
  variantSignalDetectionEnabled: boolean,
): Promise<CatalogSettings> {
  const { data } = await client.patch<{ data: CatalogSettingsAttrs }>("/catalog-settings", {
    variant_signal_detection_enabled: variantSignalDetectionEnabled,
  });
  return { variantSignalDetectionEnabled: data.variant_signal_detection_enabled };
}
