import type { GoodsReceipt } from "@double-a/api-client/queries";

/**
 * Discrepancy badge is PO-only: at least one line's received qty differs
 * from ordered. Ad-hoc receipts and "new product" flags are not discrepancies.
 */
export function receiptHasCountDiscrepancy(receipt: GoodsReceipt): boolean {
  if (!receipt.purchaseOrderId) return false;
  return receipt.items.some(
    (item) =>
      item.quantityOrdered !== null &&
      Math.abs(item.quantityReceived - item.quantityOrdered) > 0.001,
  );
}
