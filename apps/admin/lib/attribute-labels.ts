import type { CompanyAttribute } from "@double-a/api-client/queries";

/** Combobox / select label: `Size (global option)` or `Size (product level)`. */
export function attributePickerLabel(
  attribute: Pick<CompanyAttribute, "name" | "productId">,
  alreadyAdded = false,
): string {
  const scope = attribute.productId ? "product level" : "global option";
  const base = `${attribute.name} (${scope})`;
  return alreadyAdded ? `${base} (already added)` : base;
}
