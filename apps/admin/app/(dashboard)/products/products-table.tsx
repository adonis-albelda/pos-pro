"use client";

import { useState } from "react";
import type { Route } from "next";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import type { Product } from "@double-a/shared-types";
import { formatPercent, marginPercent, stockLevel } from "@double-a/shared-types";
import { Badge, IconButton, IconLink, Money, Table, Td, Th } from "@/components/ui";
import { ConfirmDialog } from "@/components/overlay";
import { useSetProductActive } from "@/lib/query/products";

export function ProductsTable({
  products,
}: {
  products: Product[];
}) {
  const [hiding, setHiding] = useState<Product | null>(null);
  const setActive = useSetProductActive();

  function confirmHide() {
    if (!hiding) return;
    setActive.mutate(
      { id: hiding.id, isActive: !hiding.isActive },
      {
        onSuccess: () => setHiding(null),
        onError: (error) => {
          const message =
            error instanceof ApiError ? error.message : "Could not update this product.";
          toast.error(message);
        },
      },
    );
  }

  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>SKU</Th>
            <Th>Category</Th>
            <Th>Sold by</Th>
            <Th numeric>Supplier price</Th>
            <Th numeric>Shelf price</Th>
            <Th numeric>Margin</Th>
            <Th numeric>Stock</Th>
            <Th>State</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const level = stockLevel(product.stockQuantity, product.reorderPoint);
            const margin = marginPercent(product.price, product.costPrice);

            return (
              <tr key={product.id} className={product.isActive ? "" : "opacity-60"}>
                <Td className="font-medium">{product.name}</Td>
                <Td className="num text-ink-muted">{product.sku ?? "—"}</Td>
                <Td className="text-ink-muted">{product.category ?? "—"}</Td>
                <Td className="text-ink-muted">{product.unit}</Td>
                <Td numeric className="text-ink-muted">
                  <Money value={product.costPrice} />
                </Td>
                <Td numeric>
                  <Money value={product.price} />
                  {product.bulkPrice !== null && product.bulkMinQuantity !== null ? (
                    <span className="mt-0.5 block text-caption text-ink-muted">
                      {product.bulkMinQuantity}+ at <Money value={product.bulkPrice} />
                    </span>
                  ) : null}
                </Td>
                <Td numeric className={margin < 0 ? "font-semibold text-danger" : ""}>
                  {formatPercent(margin)}
                </Td>
                <Td numeric>
                  {product.stockQuantity}
                  <span className="mt-0.5 block text-caption text-ink-muted">
                    reorder at {product.reorderPoint}
                  </span>
                </Td>
                <Td>
                  {!product.isActive ? (
                    <Badge tone="neutral">Hidden</Badge>
                  ) : level === "out" ? (
                    <Badge tone="danger">Out of stock</Badge>
                  ) : level === "low" ? (
                    <Badge tone="warning">Low stock</Badge>
                  ) : (
                    <Badge tone="success">In stock</Badge>
                  )}
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <IconLink
                      icon={Pencil}
                      label="Edit product"
                      href={`/products/${product.id}` as Route}
                    />
                    <IconButton
                      icon={product.isActive ? EyeOff : Eye}
                      label={
                        product.isActive ? "Hide from terminals" : "Show on terminals"
                      }
                      onClick={() => setHiding(product)}
                    />
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <ConfirmDialog
        open={hiding !== null}
        onClose={() => setHiding(null)}
        onConfirm={confirmHide}
        pending={setActive.isPending}
        title={hiding?.isActive ? "Hide product?" : "Show product?"}
        description={
          hiding?.isActive
            ? `${hiding.name} will stop appearing on terminals after their next sync. Stock and sales history stay.`
            : `${hiding?.name ?? "This product"} will show on terminals again after their next sync.`
        }
        confirmLabel={hiding?.isActive ? "Hide product" : "Show product"}
      />
    </>
  );
}
