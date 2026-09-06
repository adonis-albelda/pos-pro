"use client";

import { useEffect, useState } from "react";
import { checkSku, checkSupplierSku, type SkuConflict } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";

/** How long to wait after the last keystroke before firing the check. */
const DEBOUNCE_MS = 3000;

/**
 * Realtime duplicate check for a SKU or Supplier SKU field — debounces
 * `value` by 3s, then calls the matching check endpoint. One hook, every
 * surface (product form, variant rows, receiving, import) uses it so the
 * behavior and timing never drift between pages.
 */
export function useSkuAvailability({
  kind,
  value,
  supplierId,
  excludeProductId,
  excludeVariantId,
  excludePivotId,
}: {
  kind: "sku" | "supplier_sku";
  value: string;
  /** Required (and only meaningful) for kind: "supplier_sku". */
  supplierId?: string | null;
  /** Meaningful only for kind: "sku" — the internal SKU still lives on products/product_variants. */
  excludeProductId?: string | null;
  excludeVariantId?: string | null;
  /** Meaningful only for kind: "supplier_sku" — the product_variant_suppliers row being edited, if any. */
  excludePivotId?: string | null;
}): { checking: boolean; conflict: SkuConflict | null } {
  const [debounced, setDebounced] = useState("");
  const [checking, setChecking] = useState(false);
  const [conflict, setConflict] = useState<SkuConflict | null>(null);

  useEffect(() => {
    const trimmed = value.trim();
    const timer = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if ("" === debounced) {
      setConflict(null);
      setChecking(false);
      return;
    }
    if ("supplier_sku" === kind && !supplierId) {
      setConflict(null);
      setChecking(false);
      return;
    }

    let alive = true;
    setChecking(true);

    const client = getBrowserApiClient();
    const request =
      "sku" === kind
        ? checkSku(client, debounced, {
            excludeProductId: excludeProductId ?? undefined,
            excludeVariantId: excludeVariantId ?? undefined,
          })
        : checkSupplierSku(client, supplierId as string, debounced, {
            excludePivotId: excludePivotId ?? undefined,
          });

    void request
      .then((result) => {
        if (alive) setConflict(result.conflict);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- excludeProductId/excludeVariantId/excludePivotId/supplierId are stable per mount for this field; only the debounced value should re-trigger.
  }, [debounced, kind]);

  return { checking, conflict };
}
