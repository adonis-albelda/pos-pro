"use client";

import { useState } from "react";
import { Info, Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@double-a/shared-types";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Combobox,
  Field,
  IconButton,
  Input,
  Select,
} from "@/components/ui";
import { useLocations } from "@/lib/query/locations";
import { useAssembleBundle, useProducts, useSetBundleItems } from "@/lib/query/products";

export interface BundleRow {
  key: string;
  productId: string;
  quantity: string;
}

function newRowKey(): string {
  return Math.random().toString(36).slice(2);
}

export function emptyBundleRow(): BundleRow {
  return { key: newRowKey(), productId: "", quantity: "1" };
}

export function bundleRowsFromProduct(product: Product | null | undefined): BundleRow[] {
  const items = product?.bundleItems ?? [];
  if (items.length === 0) return [emptyBundleRow()];
  return items.map((item) => ({
    key: newRowKey(),
    productId: item.productId,
    quantity: String(item.quantity),
  }));
}

/**
 * Recipe editor — component picker + quantity per row. Kits and the product
 * itself are excluded: no nested kits, no self-reference.
 */
export function BundleItemsEditor({
  rows,
  onChange,
  excludeProductId,
}: {
  rows: BundleRow[];
  onChange: (rows: BundleRow[]) => void;
  excludeProductId?: string;
}) {
  const productsQuery = useProducts({ includeInactive: false, pageSize: 200 });
  const candidates = (productsQuery.data?.products ?? []).filter(
    (candidate) => !candidate.isBundle && candidate.id !== excludeProductId,
  );

  function updateRow(key: string, patch: Partial<BundleRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange([...rows, emptyBundleRow()]);
  }

  function removeRow(key: string) {
    onChange(rows.length > 1 ? rows.filter((row) => row.key !== key) : rows);
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <span className="text-caption font-medium text-ink-muted">Components</span>
      {rows.map((row) => {
        const usedElsewhere = new Set(
          rows
            .filter((other) => other.key !== row.key && other.productId)
            .map((other) => other.productId),
        );
        return (
          <div key={row.key} className="flex items-start gap-2">
            <div className="w-full">
              <Combobox
                value={row.productId}
                onChange={(productId) => updateRow(row.key, { productId })}
                placeholder={productsQuery.isPending ? "Loading products…" : "Select product"}
                emptyLabel="Every matching product is already on another row."
                options={candidates
                  .filter((candidate) => !usedElsewhere.has(candidate.id))
                  .map((candidate) => ({
                    value: candidate.id,
                    label: candidate.name,
                  }))}
              />
            </div>
            <div className="w-28 shrink-0">
              <Input
                type="number"
                min="0.001"
                step="any"
                placeholder="Qty"
                value={row.quantity}
                onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
              />
            </div>
            <IconButton
              icon={Trash2}
              label="Remove component"
              tone="danger"
              disabled={rows.length === 1}
              onClick={() => removeRow(row.key)}
            />
          </div>
        );
      })}
      <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addRow}>
        Add another component
      </Button>
    </div>
  );
}

/** Checkbox + recipe fields shared by Details (single) and variant panel (multi). */
export function BundleFields({
  isBundle,
  onIsBundleChange,
  rows,
  onRowsChange,
  excludeProductId,
  checkboxName = "is_bundle",
  includeFormSentinel = true,
}: {
  isBundle: boolean;
  onIsBundleChange: (next: boolean) => void;
  rows: BundleRow[];
  onRowsChange: (rows: BundleRow[]) => void;
  excludeProductId?: string;
  checkboxName?: string;
  /** Details form only — lets the server action tell checked vs absent. */
  includeFormSentinel?: boolean;
}) {
  return (
    <>
      <div className="sm:col-span-2">
        {includeFormSentinel ? <input type="hidden" name="is_bundle_field" value="1" /> : null}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3">
          <input
            type="checkbox"
            name={checkboxName}
            checked={isBundle}
            onChange={(event) => onIsBundleChange(event.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-body">This is a bundle assembled from other products</span>
        </label>
      </div>
      {isBundle ? (
        <BundleItemsEditor rows={rows} onChange={onRowsChange} excludeProductId={excludeProductId} />
      ) : (
        <p className="flex items-start gap-2 text-caption text-ink-muted sm:col-span-2">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Its own price and stock, same as any product. Turn this on to define which products
            (and how many of each) it&apos;s made from.
          </span>
        </p>
      )}
    </>
  );
}

/**
 * Stock isn't editable here — it only moves through Inventory (or Assemble).
 * Live mutation, not part of the surrounding form submit.
 */
export function AssembleBundleSection({ product }: { product: Product }) {
  const assemble = useAssembleBundle();
  const locationsQuery = useLocations({ type: "branch" });
  const branches = locationsQuery.data ?? [];
  const [quantity, setQuantity] = useState("1");
  const [locationId, setLocationId] = useState("");

  async function onAssemble() {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be greater than zero.");
      return;
    }
    if (!locationId) {
      toast.error("Choose a location.");
      return;
    }
    try {
      const updated = await assemble.mutateAsync({
        id: product.id,
        quantity: qty,
        locationId,
      });
      toast.success(`Assembled ${qty}× ${updated.name}.`);
      setQuantity("1");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assemble this bundle.");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Assemble"
        description="Converts component stock into bundle stock at one location, right now."
      />
      <CardBody>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quantity to assemble" required>
            <Input
              type="number"
              min="0.001"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field label="Location" required>
            <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">Choose branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              icon={Package}
              loading={assemble.isPending}
              onClick={onAssemble}
              className="w-full"
            >
              Assemble
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Persist recipe rows via setBundleItems — empty list clears when not a kit. */
export async function persistBundleRows(
  setBundleItems: ReturnType<typeof useSetBundleItems>,
  productId: string,
  isBundle: boolean,
  rows: BundleRow[],
): Promise<void> {
  if (!isBundle) {
    await setBundleItems.mutateAsync({ id: productId, items: [] });
    return;
  }
  const validRows = rows.filter((row) => row.productId && Number(row.quantity) > 0);
  await setBundleItems.mutateAsync({
    id: productId,
    items: validRows.map((row) => ({
      productId: row.productId,
      quantity: Number(row.quantity),
    })),
  });
}
