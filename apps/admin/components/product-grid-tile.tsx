"use client";

import { Minus, Package, Tag, Trash2 } from "lucide-react";
import type { Product } from "@double-a/shared-types";
import { formatMoney, formatQuantity, stockLevel } from "@double-a/shared-types";
import { Badge } from "@/components/ui";

/**
 * Web equivalent of the mobile POS's product tile
 * (apps/mobile/components/product-tile.tsx) — click to add, same stock badge
 * and in-cart chip. Stock is read live (`product.stockQuantity`), not an
 * offline estimate — admin has no offline mode (CLAUDE.md §5).
 */
export function ProductGridTile({
  product,
  quantityInCart,
  onAdd,
  onRemove,
}: {
  product: Product;
  quantityInCart: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const level = stockLevel(product.stockQuantity, product.reorderPoint);
  const outOfStock = product.stockQuantity <= 0;
  const inCart = quantityInCart > 0;
  const unitSuffix = product.unit === "pc" ? "" : ` ${product.unit}`;
  const RemoveIcon = quantityInCart === 1 ? Trash2 : Minus;

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
          <span className="line-clamp-2 text-body font-semibold text-ink">{product.name}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="num text-body-lg font-bold text-primary-dark">
            {formatMoney(product.price)}
          </span>
          {product.unit === "pc" ? null : (
            <span className="text-caption text-ink-muted">/{product.unit}</span>
          )}
        </div>
        {product.bulkPrice !== null && product.bulkMinQuantity !== null ? (
          <div className="flex items-center gap-1 text-caption text-accent-ink">
            <Tag size={11} strokeWidth={2.5} />
            <span className="num">
              {formatMoney(product.bulkPrice)} from {product.bulkMinQuantity}
              {unitSuffix}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {level === "out" ? (
          <Badge tone="danger">Out of stock</Badge>
        ) : level === "low" ? (
          <Badge tone="warning">{formatQuantity(product.stockQuantity)}{unitSuffix} left</Badge>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success" />
            <span className="num text-caption text-ink-muted">
              {formatQuantity(product.stockQuantity)}
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
                ? `Remove ${product.name} from cart`
                : `Take one ${product.name} off the cart, ${quantityInCart} on it`
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
