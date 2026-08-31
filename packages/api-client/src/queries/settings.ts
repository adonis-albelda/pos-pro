import {
  DEFAULT_RECEIPT_LAYOUT,
  DEFAULT_STORE_SETTINGS,
  type ReceiptLayout,
  type StoreSettings,
} from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiResource } from "../http";
import { appendMultipartFile } from "../multipart";
import { type ReceiptLayoutAttrs, type StoreSettingAttrs, toReceiptLayout, toStoreSettings } from "../mappers";

export interface StoreSettingsInput {
  name?: string;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  receiptFooter?: string | null;
  invoicePrefix?: string | null;
  invoiceDigits?: number;
  invoiceNextNumber?: number;
}

function toStoreSettingsPayload(input: StoreSettingsInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.logoUrl !== undefined) payload.logo_url = input.logoUrl;
  if (input.address !== undefined) payload.address = input.address;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.receiptFooter !== undefined) payload.receipt_footer = input.receiptFooter;
  if (input.invoicePrefix !== undefined) payload.invoice_prefix = input.invoicePrefix;
  if (input.invoiceDigits !== undefined) payload.invoice_digits = input.invoiceDigits;
  if (input.invoiceNextNumber !== undefined) payload.invoice_next_number = input.invoiceNextNumber;
  return payload;
}

/**
 * The one settings row for the caller's company. ShowStoreSettingController
 * uses `findOrFail` (404 if the company's row is missing) rather than
 * Supabase's `.maybeSingle()` returning null — falls back to
 * DEFAULT_STORE_SETTINGS on a 404, same contract callers had before.
 */
export async function getStoreSettings(client: ApiClient): Promise<StoreSettings> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<StoreSettingAttrs> }>("/store-settings");
    return toStoreSettings(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return DEFAULT_STORE_SETTINGS;
    throw error;
  }
}

export async function updateStoreSettings(client: ApiClient, patch: StoreSettingsInput): Promise<StoreSettings> {
  const { data } = await client.patch<{ data: JsonApiResource<StoreSettingAttrs> }>(
    "/store-settings",
    toStoreSettingsPayload(patch),
  );
  return toStoreSettings(data);
}

/** Uploads a logo to S3 and returns the updated settings row. */
export async function uploadStoreLogo(client: ApiClient, logo: File | Blob): Promise<StoreSettings> {
  const formData = new FormData();
  if (typeof File !== "undefined" && logo instanceof File) {
    appendMultipartFile(formData, "logo", logo);
  } else {
    formData.append("logo", logo);
  }
  const { data } = await client.postMultipart<{ data: JsonApiResource<StoreSettingAttrs> }>(
    "/store-settings/logo",
    formData,
  );
  return toStoreSettings(data);
}

/** Deletes the logo object from S3 and clears logo_url. */
export async function deleteStoreLogo(client: ApiClient): Promise<StoreSettings> {
  const { data } = await client.delete<{ data: JsonApiResource<StoreSettingAttrs> }>("/store-settings/logo");
  return toStoreSettings(data);
}

export interface ReceiptLayoutInput {
  showShopName?: boolean;
  showAddress?: boolean;
  showPhone?: boolean;
  showLogoLine?: boolean;
  showCashier?: boolean;
  showTerminal?: boolean;
  showCustomer?: boolean;
  showDiscounts?: boolean;
  showPayment?: boolean;
  showFooter?: boolean;
}

function toReceiptLayoutPayload(input: ReceiptLayoutInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.showShopName !== undefined) payload.show_shop_name = input.showShopName;
  if (input.showAddress !== undefined) payload.show_address = input.showAddress;
  if (input.showPhone !== undefined) payload.show_phone = input.showPhone;
  if (input.showLogoLine !== undefined) payload.show_logo_line = input.showLogoLine;
  if (input.showCashier !== undefined) payload.show_cashier = input.showCashier;
  if (input.showTerminal !== undefined) payload.show_terminal = input.showTerminal;
  if (input.showCustomer !== undefined) payload.show_customer = input.showCustomer;
  if (input.showDiscounts !== undefined) payload.show_discounts = input.showDiscounts;
  if (input.showPayment !== undefined) payload.show_payment = input.showPayment;
  if (input.showFooter !== undefined) payload.show_footer = input.showFooter;
  return payload;
}

/**
 * Same findOrFail-then-404 shape as store settings; falls back to
 * DEFAULT_RECEIPT_LAYOUT. `paperWidthMm`/`columns`/`printerModel` are locked
 * literal types on the domain `ReceiptLayout` — `toReceiptLayout()` hardcodes
 * them to match the shop's one printer, even though the API does echo them back.
 */
export async function getReceiptLayout(client: ApiClient): Promise<ReceiptLayout> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<ReceiptLayoutAttrs> }>("/receipt-layout");
    return toReceiptLayout(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return DEFAULT_RECEIPT_LAYOUT;
    throw error;
  }
}

/** Only the boolean print toggles are writable — paper width/columns/printer model are not sent, see getReceiptLayout(). */
export async function updateReceiptLayout(client: ApiClient, patch: ReceiptLayoutInput): Promise<ReceiptLayout> {
  const { data } = await client.patch<{ data: JsonApiResource<ReceiptLayoutAttrs> }>(
    "/receipt-layout",
    toReceiptLayoutPayload(patch),
  );
  return toReceiptLayout(data);
}
