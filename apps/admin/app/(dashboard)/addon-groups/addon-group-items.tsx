"use client";

import { useEffect, useState } from "react";
import { Camera, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@double-a/shared-types";
import type { AddonGroupItem } from "@double-a/api-client/queries";
import { Button, Field, IconButton, Input, Money, MoneyInput, Select } from "@/components/ui";
import { useProducts } from "@/lib/query/products";
import { useProductVariants } from "@/lib/query/attributes";
import {
  useAddAddonGroupItem,
  useDeleteAddonGroupItem,
  useDeleteAddonGroupItemPhoto,
  useUploadAddonGroupItemPhoto,
} from "@/lib/query/addon-groups";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * A per-addon photo, distinct from its linked variant's own product photo —
 * falls back to that product photo (AddonGroupResource, server-side) until
 * a merchant uploads something specific to this addon slot.
 */
export function AddonItemPhoto({ item }: { item: AddonGroupItem }) {
  const upload = useUploadAddonGroupItemPhoto();
  const remove = useDeleteAddonGroupItemPhoto();
  const busy = upload.isPending || remove.isPending;

  return (
    <div className="group relative shrink-0">
      <label
        className="flex size-8 cursor-pointer items-center justify-center overflow-hidden rounded-sm border border-border bg-paper"
        aria-label={item.photoUrl ? `Change photo for ${item.productName ?? "this item"}` : `Add a photo for ${item.productName ?? "this item"}`}
      >
        {item.photoUrl ? (
          // Plain img: the URL is an arbitrary MinIO/S3 host, same reasoning as the product photo.
          <img src={item.photoUrl} alt="" className="size-full object-cover" />
        ) : (
          <Camera size={14} strokeWidth={2} className="text-ink-muted" />
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            const photo = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!photo) return;
            upload.mutate(
              { itemId: item.id, photo },
              { onError: (error) => toast.error(errorMessage(error, "Could not upload that photo.")) },
            );
          }}
          className="hidden"
        />
      </label>
      {item.photoUrl ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            remove.mutate(item.id, {
              onError: (error) => toast.error(errorMessage(error, "Could not remove that photo.")),
            })
          }
          aria-label="Remove photo"
          className="absolute -top-1.5 -right-1.5 hidden size-4 items-center justify-center rounded-full bg-danger text-white group-hover:flex"
        >
          <X size={10} strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}

/** Every item currently in a group — photo, product/variant label, price, remove. */
export function AddonGroupItemsList({ items }: { items: AddonGroupItem[] }) {
  const removeItem = useDeleteAddonGroupItem();

  if (items.length === 0) return null;

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-caption">
          <span className="flex items-center gap-2">
            <AddonItemPhoto item={item} />
            {item.productName ?? "—"}
            {item.variantLabel ? <span className="text-ink-muted"> · {item.variantLabel}</span> : null}
          </span>
          <div className="flex items-center gap-2">
            <Money value={item.effectivePrice} className="font-medium" />
            {item.extraPrice !== null ? <span className="text-ink-muted">(override)</span> : null}
            <IconButton
              icon={Trash2}
              label={`Remove ${item.productName ?? "item"}`}
              tone="danger"
              onClick={() =>
                removeItem.mutate(item.id, {
                  onError: (error) => toast.error(errorMessage(error, "Could not remove this item.")),
                })
              }
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Search existing products, pick a variant if it has more than one, optional price override, add as a group item. */
export function AddItemForm({ groupId }: { groupId: string }) {
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [extraPrice, setExtraPrice] = useState("");
  const productsQuery = useProducts({ q: search, pageSize: 10 }, { enabled: search.trim().length > 0 });
  const variantsQuery = useProductVariants(productId || null);
  const addItem = useAddAddonGroupItem();

  const products: Product[] = productsQuery.data?.products ?? [];
  const variants = variantsQuery.data ?? [];

  useEffect(() => {
    if (variants.length === 1 && variantId !== variants[0]!.id) {
      setVariantId(variants[0]!.id);
    }
  }, [variants, variantId]);

  function pickProduct(id: string) {
    setProductId(id);
    setVariantId("");
    setSearch("");
  }

  function onAdd() {
    if (!variantId) {
      toast.error("Pick a product (and variant, if it has more than one).");
      return;
    }
    addItem.mutate(
      { groupId, variantId, extraPrice: extraPrice.trim() ? Number(extraPrice) : null },
      {
        onSuccess: () => {
          setProductId("");
          setVariantId("");
          setExtraPrice("");
        },
        onError: (error) => toast.error(errorMessage(error, "Could not add this item.")),
      },
    );
  }

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      {!productId ? (
        <Field label="Search products">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Type a product name…"
          />
          {products.length > 0 ? (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-sm border border-border">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => pickProduct(product.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-caption transition-colors hover:bg-canvas"
                >
                  <span>{product.name}</span>
                  <Money value={product.price} className="text-ink-muted" />
                </button>
              ))}
            </div>
          ) : null}
        </Field>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-canvas px-2 py-1.5 text-caption">
            {selectedProduct?.name ?? "…"}
            <button type="button" onClick={() => pickProduct("")} aria-label="Change product">
              <X size={12} strokeWidth={2} />
            </button>
          </div>

          {variants.length > 1 ? (
            <Field label="Variant">
              <Select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                <option value="">Choose variant</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.attributeValues.map((v) => v.value).filter(Boolean).join(" / ") || variant.sku || "Default"}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Price override" hint="Leave blank to use the product's own price">
            <MoneyInput
              type="number"
              step="0.01"
              min="0"
              value={extraPrice}
              onChange={(event) => setExtraPrice(event.target.value)}
              className="w-32"
            />
          </Field>
          <Button type="button" icon={Plus} onClick={onAdd} loading={addItem.isPending} disabled={!variantId}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
