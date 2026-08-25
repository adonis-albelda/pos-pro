import {
  ArrowDownToLine,
  ArrowUpFromLine,
  PackageCheck,
  PackagePlus,
  Replace,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { InventoryReason } from "@double-a/shared-types";

/**
 * One name and one icon per reason, shared by the movement table, the filter
 * and the CSV export, so the same event is never called two things.
 */
export const REASON_LABELS: Record<InventoryReason, string> = {
  sale: "Sale",
  restock: "Restock",
  adjustment: "Adjustment",
  oversell_correction: "Oversell correction",
  void_restore: "Sale voided",
  replace_restore: "Item replaced",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};

export const REASON_ICONS: Record<InventoryReason, LucideIcon> = {
  sale: ShoppingCart,
  restock: PackagePlus,
  adjustment: SlidersHorizontal,
  oversell_correction: PackageCheck,
  void_restore: RotateCcw,
  replace_restore: Replace,
  transfer_out: ArrowUpFromLine,
  transfer_in: ArrowDownToLine,
};

export const REASONS = Object.keys(REASON_LABELS) as InventoryReason[];

export function isReason(value: string | undefined): value is InventoryReason {
  return REASONS.includes((value ?? "") as InventoryReason);
}

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason as InventoryReason] ?? reason;
}

export function reasonIcon(reason: string): LucideIcon {
  return REASON_ICONS[reason as InventoryReason] ?? SlidersHorizontal;
}

/** A movement points at a sale only for the two reasons a sale creates. */
export function movementSaleId(reason: string, referenceId: string | null): string | null {
  if (!referenceId) return null;
  return reason === "sale" || reason === "void_restore" ? referenceId : null;
}
