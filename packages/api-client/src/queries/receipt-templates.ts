import type { ReceiptTemplate, ReceiptTemplateFontSize } from "@double-a/shared-types";
import type { ApiClient, JsonApiResource } from "../http";
import { type ReceiptTemplateAttrs, toReceiptTemplate } from "../mappers";

export interface ReceiptTemplateInput {
  name: string;
  title?: string | null;
  description?: string | null;
  fontSize?: ReceiptTemplateFontSize;
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
  isActive?: boolean;
}

function toPayload(input: Partial<ReceiptTemplateInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.fontSize !== undefined) payload.font_size = input.fontSize;
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
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  return payload;
}

/** Every custom receipt template this company has defined (e.g. "Kitchen Order"), ordered by name. Admin-only; nothing pulls these to mobile yet. */
export async function listReceiptTemplates(client: ApiClient): Promise<ReceiptTemplate[]> {
  const { data } = await client.get<{ data: JsonApiResource<ReceiptTemplateAttrs>[] }>(
    "/receipt-templates",
  );
  return data.map(toReceiptTemplate);
}

export async function createReceiptTemplate(
  client: ApiClient,
  input: ReceiptTemplateInput,
): Promise<ReceiptTemplate> {
  const { data } = await client.post<{ data: JsonApiResource<ReceiptTemplateAttrs> }>(
    "/receipt-templates",
    toPayload(input),
    { idempotent: true },
  );
  return toReceiptTemplate(data);
}

export async function updateReceiptTemplate(
  client: ApiClient,
  id: string,
  patch: Partial<ReceiptTemplateInput>,
): Promise<ReceiptTemplate> {
  const { data } = await client.patch<{ data: JsonApiResource<ReceiptTemplateAttrs> }>(
    `/receipt-templates/${id}`,
    toPayload(patch),
  );
  return toReceiptTemplate(data);
}

export async function deleteReceiptTemplate(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/receipt-templates/${id}`);
}
