"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Camera, Copy, Eye, EyeOff, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import type { Product } from "@double-a/shared-types";
import { formatPercent, marginPercent, stockLevel } from "@double-a/shared-types";
import { Badge, IconButton, IconLink, Money, Table, Td, Th } from "@/components/ui";
import { ConfirmDialog } from "@/components/overlay";
import {
  useCloneProduct,
  useDeleteProduct,
  useRestoreProduct,
  useSetProductActive,
} from "@/lib/query/products";

export function ProductsTable({
  products,
  fetching = false,
  trashed = false,
}: {
  products: Product[];
  fetching?: boolean;
  trashed?: boolean;
}) {
  const router = useRouter();
  const [hiding, setHiding] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const setActive = useSetProductActive();
  const cloneProduct = useCloneProduct();
  const deleteProduct = useDeleteProduct();
  const restoreProduct = useRestoreProduct();

  function clone(product: Product) {
    cloneProduct.mutate(product.id, {
      onSuccess: (created) => {
        toast.success(`Cloned as "${created.name}". Give it its own SKU.`);
        router.push(`/products/${created.id}` as Route);
      },
      onError: (error) => {
        const message =
          error instanceof ApiError ? error.message : "Could not clone this product.";
        toast.error(message);
      },
    });
  }

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

  function confirmDelete() {
    if (!deleting) return;
    deleteProduct.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(`Deleted ${deleting.name}.`);
        setDeleting(null);
      },
      onError: (error) => {
        const message =
          error instanceof ApiError ? error.message : "Could not delete this product.";
        toast.error(message);
      },
    });
  }

  function restore(product: Product) {
    restoreProduct.mutate(product.id, {
      onSuccess: () => toast.success(`Restored ${product.name}.`),
      onError: (error) => {
        const message =
          error instanceof ApiError ? error.message : "Could not restore this product.";
        toast.error(message);
      },
    });
  }

  return (
    <>
      <Table fetching={fetching}>
        <thead>
          <tr>
            <Th className="sticky left-0 z-10 border-r border-border bg-paper">Product</Th>
            <Th>SKU</Th>
            <Th>Category</Th>
            <Th>Supplier</Th>
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
                <Td className="sticky left-0 z-10 border-r border-border bg-surface font-medium">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-paper">
                      {product.photoUrl ? (
                        <img src={product.photoUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <Camera size={14} strokeWidth={2} className="text-ink-muted" />
                      )}
                    </span>
                    {product.name}
                    {product.isBundle ? <Badge tone="neutral">Bundle</Badge> : null}
                  </div>
                </Td>
                <Td className="num text-ink-muted">{product.sku ?? "—"}</Td>
                <Td className="text-ink-muted">{product.category ?? "—"}</Td>
                <Td className="text-ink-muted">{product.supplierNames || "—"}</Td>
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
                    {trashed ? (
                      <IconButton
                        icon={RotateCcw}
                        label="Restore product"
                        disabled={restoreProduct.isPending}
                        onClick={() => restore(product)}
                      />
                    ) : (
                      <>
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
                        <IconButton
                          icon={Copy}
                          label="Clone product"
                          disabled={cloneProduct.isPending}
                          onClick={() => clone(product)}
                        />
                        <IconButton
                          icon={Trash2}
                          label="Delete product"
                          tone="danger"
                          onClick={() => setDeleting(product)}
                        />
                      </>
                    )}
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

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deleteProduct.isPending}
        title="Delete product?"
        description={
          deleting
            ? `${deleting.name} stops appearing on terminals after their next sync. Stock and sales history stay — restore it from the Deleted filter any time.`
            : ""
        }
        confirmLabel="Delete product"
      />
    </>
  );
}
