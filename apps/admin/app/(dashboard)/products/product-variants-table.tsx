"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Camera, Copy, Eye, EyeOff, GitMerge, Monitor, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import type { ProductVariantListRow } from "@double-a/api-client/queries";
import { formatPercent, marginPercent, stockLevel } from "@double-a/shared-types";
import { Badge, Money, Table, Td, Th } from "@/components/ui";
import { ConfirmDialog } from "@/components/overlay";
import {
  useCloneProduct,
  useDeleteProduct,
  useRestoreProduct,
  useSetProductActive,
} from "@/lib/query/products";
import { MoveIntoProductDialog } from "./move-into-product-dialog";
import { ProductRowActionsMenu } from "./product-row-actions-menu";

/** "Red / L" — blank for a product's only/default variant, which has no combination of its own. */
function combinationLabel(variant: ProductVariantListRow): string {
  return variant.attributeValues.map((value) => value.value).filter(Boolean).join(" / ");
}

/** A variant can be sourced from several suppliers — the default one is what a dense table row shows. */
function defaultSupplierLink(variant: ProductVariantListRow) {
  return variant.suppliers.find((link) => link.isDefault) ?? variant.suppliers[0] ?? null;
}

function moreSuffix(supplierCount: number): string {
  return supplierCount > 1 ? ` (+${supplierCount - 1} more)` : "";
}

const SUPPLIER_LINK_CLASS =
  "text-ink-muted transition-colors hover:text-primary hover:underline";

function VariantSupplierCell({ variant }: { variant: ProductVariantListRow }) {
  const link = defaultSupplierLink(variant);
  if (!link) return "—";

  const name = link.supplierName?.trim() || "Supplier";

  return (
    <>
      <a
        href={`/suppliers/${link.supplierId}`}
        target="_blank"
        rel="noopener noreferrer"
        className={SUPPLIER_LINK_CLASS}
      >
        {name}
      </a>
      {moreSuffix(variant.suppliers.length)}
    </>
  );
}

/**
 * Same columns/actions as ProductsTable, one row per variant instead of per
 * product. Row actions (View/Hide/Clone/Delete/Restore) are still product-
 * scoped — hiding, cloning, or deleting a SKU has always meant the whole
 * product, so every action here targets `variant.productId`, identical to
 * what clicking the same action on the product-level row already does.
 */
export function ProductVariantsTable({
  variants,
  fetching = false,
  trashed = false,
}: {
  variants: ProductVariantListRow[];
  fetching?: boolean;
  trashed?: boolean;
}) {
  const router = useRouter();
  const [hiding, setHiding] = useState<ProductVariantListRow | null>(null);
  const [deleting, setDeleting] = useState<ProductVariantListRow | null>(null);
  const [moving, setMoving] = useState<ProductVariantListRow | null>(null);
  const setActive = useSetProductActive();
  const cloneProduct = useCloneProduct();
  const deleteProduct = useDeleteProduct();
  const restoreProduct = useRestoreProduct();

  function clone(variant: ProductVariantListRow) {
    cloneProduct.mutate(variant.productId, {
      onSuccess: (created) => {
        toast.success(`Cloned as "${created.name}". Give it its own SKU.`);
        router.push(`/products/${created.id}` as Route);
      },
      onError: (error) => {
        const message = error instanceof ApiError ? error.message : "Could not clone this product.";
        toast.error(message);
      },
    });
  }

  function confirmHide() {
    if (!hiding) return;
    setActive.mutate(
      { id: hiding.productId, isActive: !hiding.productIsActive },
      {
        onSuccess: () => setHiding(null),
        onError: (error) => {
          const message = error instanceof ApiError ? error.message : "Could not update this product.";
          toast.error(message);
        },
      },
    );
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteProduct.mutate(deleting.productId, {
      onSuccess: () => {
        toast.success(`Deleted ${deleting.productName}.`);
        setDeleting(null);
      },
      onError: (error) => {
        const message = error instanceof ApiError ? error.message : "Could not delete this product.";
        toast.error(message);
      },
    });
  }

  function restore(variant: ProductVariantListRow) {
    restoreProduct.mutate(variant.productId, {
      onSuccess: () => toast.success(`Restored ${variant.productName}.`),
      onError: (error) => {
        const message = error instanceof ApiError ? error.message : "Could not restore this product.";
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
            <Th numeric>Cost price</Th>
            <Th numeric>Shelf price</Th>
            <Th numeric>Margin</Th>
            <Th numeric>Stock</Th>
            <Th>State</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => {
            const level = stockLevel(variant.stockQuantity, variant.productReorderPoint);
            const margin = marginPercent(variant.price, variant.costPrice);
            const combination = combinationLabel(variant);

            return (
              <tr key={variant.id} className={variant.productIsActive ? "" : "opacity-60"}>
                <Td className="sticky left-0 z-10 border-r border-border bg-surface font-medium">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-paper">
                      {variant.productPhotoUrl ? (
                        <img src={variant.productPhotoUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <Camera size={14} strokeWidth={2} className="text-ink-muted" />
                      )}
                    </span>
                    <span>
                      {variant.productName}
                      {combination ? (
                        <span className="mt-0.5 block text-caption font-normal text-ink-muted">
                          {combination}
                        </span>
                      ) : null}
                    </span>
                    {variant.productIsBundle ? <Badge tone="neutral">Bundle</Badge> : null}
                  </div>
                </Td>
                <Td className="num text-ink-muted">{variant.sku ?? "—"}</Td>
                <Td className="text-ink-muted">{variant.productCategory ?? "—"}</Td>
                <Td className="text-ink-muted">
                  <VariantSupplierCell variant={variant} />
                </Td>
                <Td className="text-ink-muted">{variant.productUnit}</Td>
                <Td numeric className="text-ink-muted">
                  <Money value={variant.costPrice} />
                </Td>
                <Td numeric>
                  <Money value={variant.price} />
                </Td>
                <Td numeric className={margin < 0 ? "font-semibold text-danger" : ""}>
                  {formatPercent(margin)}
                </Td>
                <Td numeric>
                  {variant.stockQuantity}
                  <span className="mt-0.5 block text-caption text-ink-muted">
                    reorder at {variant.productReorderPoint}
                  </span>
                </Td>
                <Td>
                  {!variant.productIsActive ? (
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
                  <div className="flex justify-end">
                    <ProductRowActionsMenu
                      label={variant.productName}
                      items={
                        trashed
                          ? [
                              {
                                id: "restore",
                                label: "Restore product",
                                icon: RotateCcw,
                                disabled: restoreProduct.isPending,
                                onSelect: () => restore(variant),
                              },
                            ]
                          : [
                              {
                                id: "view",
                                label: "View product",
                                icon: Eye,
                                href: `/products/${variant.productId}`,
                              },
                              {
                                id: "hide",
                                label: variant.productIsActive
                                  ? "Hide from terminals"
                                  : "Show on terminals",
                                icon: variant.productIsActive ? EyeOff : Monitor,
                                onSelect: () => setHiding(variant),
                              },
                              {
                                id: "clone",
                                label: "Clone product",
                                icon: Copy,
                                disabled: cloneProduct.isPending,
                                onSelect: () => clone(variant),
                              },
                              {
                                id: "move-into",
                                label: "Move into product…",
                                icon: GitMerge,
                                onSelect: () => setMoving(variant),
                              },
                              {
                                id: "delete",
                                label: "Delete product",
                                icon: Trash2,
                                tone: "danger",
                                onSelect: () => setDeleting(variant),
                              },
                            ]
                      }
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
        title={hiding?.productIsActive ? "Hide product?" : "Show product?"}
        description={
          hiding?.productIsActive
            ? `${hiding.productName} will stop appearing on terminals after their next sync. Stock and sales history stay.`
            : `${hiding?.productName ?? "This product"} will show on terminals again after their next sync.`
        }
        confirmLabel={hiding?.productIsActive ? "Hide product" : "Show product"}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deleteProduct.isPending}
        title="Delete product?"
        description={
          deleting
            ? `${deleting.productName} stops appearing on terminals after their next sync. Stock and sales history stay — restore it from the Deleted filter any time.`
            : ""
        }
        confirmLabel="Delete product"
      />

      <MoveIntoProductDialog
        open={moving !== null}
        onClose={() => setMoving(null)}
        source={
          moving
            ? {
                productId: moving.productId,
                productName: moving.productName,
                variantId: moving.id,
                stockQuantity: moving.stockQuantity,
                price: moving.price,
              }
            : null
        }
      />
    </>
  );
}
