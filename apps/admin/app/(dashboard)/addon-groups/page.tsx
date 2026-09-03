"use client";

import { useEffect, useState } from "react";
import { Camera, Layers, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@double-a/shared-types";
import type { AddonGroup, AddonGroupItem } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Field,
  IconButton,
  Input,
  Money,
  MoneyInput,
  PageHeader,
  Select,
} from "@/components/ui";
import { useProducts } from "@/lib/query/products";
import { useProductVariants } from "@/lib/query/attributes";
import {
  useAddAddonGroupItem,
  useAddonGroups,
  useCreateAddonGroup,
  useDeleteAddonGroup,
  useDeleteAddonGroupItem,
  useDeleteAddonGroupItemPhoto,
  useUpdateAddonGroup,
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
function AddonItemPhoto({ item }: { item: AddonGroupItem }) {
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

function AddItemForm({ groupId }: { groupId: string }) {
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
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-caption hover:bg-canvas"
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

function AddonGroupCard({ group }: { group: AddonGroup }) {
  const update = useUpdateAddonGroup();
  const remove = useDeleteAddonGroup();
  const removeItem = useDeleteAddonGroupItem();

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-body font-medium text-ink">{group.name}</p>
            <Badge tone="neutral">{group.selectionType === "single" ? "Pick one" : "Pick any"}</Badge>
            {group.isRequired ? <Badge tone="warning">Required</Badge> : null}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-caption text-ink-muted">
              <input
                type="checkbox"
                checked={group.isRequired}
                onChange={(event) =>
                  update.mutate(
                    { id: group.id, isRequired: event.target.checked },
                    { onError: (error) => toast.error(errorMessage(error, "Could not save this change.")) },
                  )
                }
              />
              Required
            </label>
            <Select
              value={group.selectionType}
              onChange={(event) =>
                update.mutate(
                  { id: group.id, selectionType: event.target.value as AddonGroup["selectionType"] },
                  { onError: (error) => toast.error(errorMessage(error, "Could not save this change.")) },
                )
              }
              className="h-8 w-32 text-caption"
            >
              <option value="multiple">Pick any</option>
              <option value="single">Pick one</option>
            </Select>
            <IconButton
              icon={Trash2}
              label={`Delete ${group.name}`}
              tone="danger"
              onClick={() => {
                if (!window.confirm(`Delete "${group.name}"? This removes it from every product it's attached to.`)) return;
                remove.mutate(group.id, {
                  onError: (error) => toast.error(errorMessage(error, "Could not delete this group.")),
                });
              }}
            />
          </div>
        </div>

        {group.items.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 text-caption">
                <span className="flex items-center gap-2">
                  <AddonItemPhoto item={item} />
                  {item.productName ?? "—"}
                  {item.variantLabel ? <span className="text-ink-muted"> · {item.variantLabel}</span> : null}
                </span>
                <div className="flex items-center gap-2">
                  <Money value={item.effectivePrice} className="font-medium" />
                  {item.extraPrice !== null ? (
                    <span className="text-ink-muted">(override)</span>
                  ) : null}
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
        ) : null}

        <AddItemForm groupId={group.id} />
      </CardBody>
    </Card>
  );
}

export default function AddonGroupsPage() {
  const groupsQuery = useAddonGroups();
  const createGroup = useCreateAddonGroup();
  const [name, setName] = useState("");

  function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    createGroup.mutate(
      { name: trimmed },
      {
        onSuccess: () => setName(""),
        onError: (error) => toast.error(errorMessage(error, "Could not create that group.")),
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Layers}
        title="Add-on groups"
        description="Merchant-configurable extras — Toppings, Drill Accessories — attached to one or more products. Selecting during a sale ships with the POS variant picker."
      />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-64">
              <Field label="New group">
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onCreate();
                    }
                  }}
                  placeholder="e.g. Toppings"
                />
              </Field>
            </div>
            <Button type="button" icon={Plus} onClick={onCreate} loading={createGroup.isPending} disabled={!name.trim()}>
              Add group
            </Button>
          </div>
        </CardBody>
      </Card>

      {groupsQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : groupsQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {errorMessage(groupsQuery.error, "Could not load add-on groups.")}
        </Card>
      ) : (groupsQuery.data ?? []).length === 0 ? (
        <Card className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Layers size={24} className="text-ink-muted" />
          <p className="text-body text-ink-muted">No add-on groups yet — add one above.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {(groupsQuery.data ?? []).map((group) => (
            <AddonGroupCard key={group.id} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}
