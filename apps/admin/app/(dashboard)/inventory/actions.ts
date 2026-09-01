"use server";

import { revalidatePath } from "next/cache";
import { isValidQuantity, QUANTITY_DECIMALS } from "@double-a/shared-types";
import { adjustStock, getProduct, type AdjustStockReason } from "@double-a/api-client/queries";

function roundQuantity(value: number): number {
  return Number(value.toFixed(QUANTITY_DECIMALS));
}
import type { FormState } from "@/lib/form-state";
import { getAuthedClient } from "@/lib/api/session";

const REASONS: AdjustStockReason[] = ["restock", "adjustment", "oversell_correction"];
const MODES = ["in", "out", "count"] as const;
type Mode = (typeof MODES)[number];

/**
 * Every stock change goes through this. It writes an inventory_movements row
 * and a trigger applies it to products.stock_quantity, so stock always equals
 * the sum of its movements.
 *
 * Three ways in: add units, remove units, or state the counted total after a
 * stock take. A count is still recorded as the difference — the movement row is
 * the fact, the count is only how the number was arrived at, and the difference
 * is worked out here against the server's stock rather than against whatever the
 * browser was last told.
 */
export async function moveStock(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const productId = String(formData.get("product_id") ?? "");
  const reason = String(formData.get("reason") ?? "") as AdjustStockReason;
  const rawMode = String(formData.get("mode") ?? "in");
  const mode: Mode = (MODES as readonly string[]).includes(rawMode)
    ? (rawMode as Mode)
    : "in";
  const rawMagnitude = Number(formData.get("quantity") ?? Number.NaN);
  const note = String(formData.get("note") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const baselineRaw = formData.get("baseline_quantity");
  const baselineQuantity =
    baselineRaw !== null && baselineRaw !== "" && Number.isFinite(Number(baselineRaw))
      ? roundQuantity(Number(baselineRaw))
      : null;

  if (!productId) return { error: "Pick a product.", ok: false };
  if (!REASONS.includes(reason)) return { error: "Pick a reason.", ok: false };

  const client = getAuthedClient();

  // The product's decimal mode decides whether a fraction is allowed here, so
  // it is always fetched — count mode needs its stock anyway.
  const product = await getProduct(client, productId);
  if (!product) return { error: "That product no longer exists.", ok: false };

  // When the header scopes a location, use the location-scoped stock the
  // picker already showed (ShowProduct has no location_id). Otherwise fall
  // back to the company-wide total on the product row.
  const recordedStock = baselineQuantity ?? product.stockQuantity;

  const floor = mode === "count" ? 0 : product.allowDecimal ? 0.001 : 1;
  const magnitude = roundQuantity(rawMagnitude);
  if (!isValidQuantity(magnitude, product.allowDecimal, floor)) {
    const wholeOnly = product.allowDecimal ? "" : " whole";
    return {
      error:
        mode === "count"
          ? `Counted quantity must be a${wholeOnly} number, 0 or more.`
          : `Quantity must be a${wholeOnly} number greater than zero.`,
      ok: false,
    };
  }

  let changeQuantity = mode === "out" ? -magnitude : magnitude;
  let movementNote = note;

  if (mode === "count") {
    changeQuantity = roundQuantity(magnitude - recordedStock);
    if (changeQuantity === 0) {
      return {
        error: `The count matches what is recorded (${recordedStock}). Nothing to record.`,
        ok: false,
      };
    }

    const counted = `Counted ${magnitude}, was ${recordedStock}`;
    movementNote = note ? `${counted}. ${note}` : counted;
  }

  try {
    // GAP: POST /products/{id}/adjust-stock (adjustStock in
    // packages/api-client/src/queries/products.ts) has no `created_by`
    // parameter — the old RPC took an explicit actor id, the new endpoint
    // presumably attributes the movement to the authenticated bearer token
    // server-side. There is nothing left for this action to pass.
    await adjustStock(client, productId, {
      changeQuantity,
      reason,
      note: movementNote || undefined,
      locationId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `Could not record the movement: ${message}`, ok: false };
  }

  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/");
  return { error: null, ok: true };
}
