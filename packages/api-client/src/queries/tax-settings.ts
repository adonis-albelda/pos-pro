import type { TaxSettings } from "@double-a/shared-types";
import type { ApiClient } from "../http";

interface TaxSettingsAttrs {
  is_vat_registered: boolean;
  vat_rate: number;
  auto_apply_complex_discounts: boolean;
}

function toTaxSettings(data: TaxSettingsAttrs): TaxSettings {
  return {
    isVatRegistered: data.is_vat_registered,
    vatRate: data.vat_rate,
    autoApplyComplexDiscounts: data.auto_apply_complex_discounts,
  };
}

export async function getTaxSettings(client: ApiClient): Promise<TaxSettings> {
  const { data } = await client.get<{ data: TaxSettingsAttrs }>("/tax-settings");
  return toTaxSettings(data);
}

export async function updateTaxSettings(
  client: ApiClient,
  patch: Partial<TaxSettings>,
): Promise<TaxSettings> {
  const body: Partial<TaxSettingsAttrs> = {};
  if (patch.isVatRegistered !== undefined) body.is_vat_registered = patch.isVatRegistered;
  if (patch.vatRate !== undefined) body.vat_rate = patch.vatRate;
  if (patch.autoApplyComplexDiscounts !== undefined) {
    body.auto_apply_complex_discounts = patch.autoApplyComplexDiscounts;
  }
  const { data } = await client.patch<{ data: TaxSettingsAttrs }>("/tax-settings", body);
  return toTaxSettings(data);
}
