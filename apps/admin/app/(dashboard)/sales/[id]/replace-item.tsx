"use client";

import { useState, useTransition } from "react";
import { Repeat } from "lucide-react";
import type { Product, SaleItem } from "@double-a/shared-types";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { ProductPicker } from "@/components/product-picker";
import { useInvalidateSales } from "@/lib/query/sales";
import { replaceSaleItemAction, searchProductsForReplace } from "./actions";

/**
 * Swaps one line item for a different product. Available only while the
 * line hasn't already been replaced — the original stays on the record
 * either way (CLAUDE.md §6), this just decides what counts toward the
 * total going forward.
 */
export function ReplaceItem({ saleId, item }: { saleId: string; item: SaleItem }) {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const invalidate = useInvalidateSales();

  function close() {
    if (pending) return;
    setOpen(false);
    setProduct(null);
    setQuantity(String(item.quantity));
    setError(null);
  }

  function confirm() {
    if (!product) {
      setError("Pick the replacement product first.");
      return;
    }
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        await replaceSaleItemAction(saleId, item.id, product.id, parsed);
        invalidate();
        setOpen(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not replace this line item.");
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" icon={Repeat} onClick={() => setOpen(true)}>
        Replace
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title={`Replace ${item.productName}`}
        description="The original line stays on the record — this adds a new line for the replacement and updates the total."
      >
        <div className="space-y-4">
          <ProductPicker
            selected={product}
            onSelect={setProduct}
            search={searchProductsForReplace}
            label="Replacement product"
          />

          <Field label="Quantity" hint={`Originally sold as ${item.quantity}.`} required>
            <Input
              type="number"
              inputMode="decimal"
              min={0.001}
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="num"
            />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button icon={Repeat} loading={pending} onClick={confirm} disabled={!product}>
              {pending ? "Replacing..." : "Replace item"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
