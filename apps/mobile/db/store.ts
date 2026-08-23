import { DEFAULT_STORE_SETTINGS, type StoreSettings } from "@double-a/shared-types";
import { getDb } from "./index";

/**
 * Who the shop is, as this device last pulled it. Read-only here — the office
 * owns these values and a terminal only ever overwrites its copy.
 */
export async function getLocalStoreSettings(): Promise<StoreSettings> {
  const row = await getDb().getFirstAsync<{
    name: string;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
    receipt_footer: string | null;
    invoice_prefix: string | null;
    invoice_digits: number | null;
    invoice_next_number: number | null;
    updated_at: string | null;
  }>(
    `SELECT name, logo_url, address, phone, receipt_footer,
            invoice_prefix, invoice_digits, invoice_next_number, updated_at
       FROM store_settings
      WHERE id = 1`,
  );

  if (!row) return DEFAULT_STORE_SETTINGS;

  return {
    name: row.name,
    logoUrl: row.logo_url,
    address: row.address,
    phone: row.phone,
    receiptFooter: row.receipt_footer,
    invoicePrefix: row.invoice_prefix,
    invoiceDigits: row.invoice_digits ?? 6,
    invoiceNextNumber: row.invoice_next_number ?? 1,
    updatedAt: row.updated_at ?? "",
  };
}

export async function saveLocalStoreSettings(settings: StoreSettings): Promise<void> {
  await getDb().runAsync(
    `UPDATE store_settings
        SET name = ?,
            logo_url = ?,
            address = ?,
            phone = ?,
            receipt_footer = ?,
            invoice_prefix = ?,
            invoice_digits = ?,
            invoice_next_number = ?,
            updated_at = ?
      WHERE id = 1`,
    settings.name,
    settings.logoUrl,
    settings.address,
    settings.phone,
    settings.receiptFooter,
    settings.invoicePrefix,
    settings.invoiceDigits,
    settings.invoiceNextNumber,
    settings.updatedAt,
  );
}
