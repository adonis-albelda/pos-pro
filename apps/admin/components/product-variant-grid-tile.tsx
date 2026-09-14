"use client";

import { Minus, Package, Trash2 } from "lucide-react";
import type { ProductVariantListRow } from "@double-a/api-client/queries";
import { formatMoney, formatQuantity, stockLevel } from "@double-a/shared-types";
import { Badge } from "@/components/ui";

/** "Red / L" — blank for a product's only/default variant, which has no combination of its own. */
function combinationLabel(row: ProductVariantListRow): string {
  return row.attributeValues.map((value) => value.value).filter(Boolean).join(" / ");
}

/**
 * "By variant" grid tile — one row per SKU instead of per product, same
 * split as the Products page's own product/variant view toggle
 * (app/(dashboard)/products/page.tsx). See ProductGridTile for the
 * product-level equivalent this mirrors.
 */
export function ProductVariantGridTile({
  row,
  quantityInCart,
  onAdd,
  onRemove,
}: {
  row: ProductVariantListRow;
  quantityInCart: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const level = stockLevel(row.stockQuantity, row.productReorderPoint);
  const outOfStock = row.stockQuantity <= 0;
  const inCart = quantityInCart > 0;
  const unitSuffix = row.productUnit === "pc" ? "" : ` ${row.productUnit}`;
  const RemoveIcon = quantityInCart === 1 ? Trash2 : Minus;
  const combo = combinationLabel(row);

  return (
    <button
      type="button"
      onClick={onAdd}
      className={`flex min-h-[124px] flex-col justify-between rounded-sm border p-3 text-left transition-all duration-150 ${
        inCart
          ? "border-2 border-primary bg-primary-tint"
          : "border-border bg-surface hover:z-10 hover:-translate-y-0.5 hover:scale-[1.02] hover:border-primary/40 hover:bg-surface hover:shadow-lg"
      } ${outOfStock ? "opacity-70" : ""}`}
    >
      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <Package size={14} strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 block text-body font-semibold text-ink">{row.productName}</span>
            {combo ? <span className="block text-caption text-ink-muted">{combo}</span> : null}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="num text-body-lg font-bold text-primary-dark">{formatMoney(row.price)}</span>
          {row.productUnit === "pc" ? null : (
            <span className="text-caption text-ink-muted">/{row.productUnit}</span>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {level === "out" ? (
          <Badge tone="danger">Out of stock</Badge>
        ) : level === "low" ? (
          <Badge tone="warning">{formatQuantity(row.stockQuantity)}{unitSuffix} left</Badge>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" />
            <span className="num text-caption text-ink-muted">
              {formatQuantity(row.stockQuantity)}
              {unitSuffix} in stock
            </span>
          </span>
        )}

        {inCart ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                event.preventDefault();
                onRemove();
              }
            }}
            aria-label={
              quantityInCart === 1
                ? `Remove ${row.productName} from cart`
                : `Take one ${row.productName} off the cart, ${quantityInCart} on it`
            }
            className="ml-auto flex cursor-pointer items-center gap-1 rounded-sm bg-primary px-2 py-1 text-caption font-bold text-on-primary hover:bg-primary-dark"
          >
            <RemoveIcon size={13} strokeWidth={2.5} />
            {quantityInCart} in cart
          </span>
        ) : null}
      </div>
    </button>
  );
}
