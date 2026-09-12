"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Plus, Save, Trash2 } from "lucide-react";
import { formatMoney, roundMoney } from "@double-a/shared-types";
import type { Location, Supplier } from "@double-a/shared-types";
import type { ProductVariantListRow } from "@double-a/api-client/queries";
import {
  Button,
  Combobox,
  ErrorNote,
  Field,
  IconButton,
  Input,
  MoneyInput,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  MatchProductCombobox,
  variantListLabel,
} from "@/app/(dashboard)/receiving/match-product-combobox";
import { createPurchaseOrderAction } from "./actions";
import { useInvalidatePurchaseOrders } from "@/lib/query/purchase-orders";

interface ItemRow {
  key: string;
  productId: string;
  variantId: string;
  quantityOrdered: string;
  unitCost: string;
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

export function CreatePurchaseOrderForm({
  suppliers,
  locations,
  defaultSupplierId,
  defaultLocationId,
  defaultOrderDate,
}: {
  suppliers: Supplier[];
  locations: Location[];
  defaultSupplierId?: string;
  defaultLocationId?: string;
  defaultOrderDate: string;
}) {
  const router = useRouter();
  const invalidatePurchaseOrders = useInvalidatePurchaseOrders();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? suppliers[0]?.id ?? "");
  const [locationId, setLocationId] = useState(defaultLocationId ?? locations[0]?.id ?? "");
  const [orderDate, setOrderDate] = useState(defaultOrderDate);
  const [expectedDate, setExpectedDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");

  const [items, setItems] = useState<ItemRow[]>([
    { key: newKey(), productId: "", variantId: "", quantityOrdered: "1", unitCost: "" },
  ]);
  const [pickedVariants, setPickedVariants] = useState<Map<string, ProductVariantListRow>>(
    () => new Map(),
  );

  const total = roundMoney(
    items.reduce((sum, item) => {
      const qty = Number(item.quantityOrdered) || 0;
      const cost = Number(item.unitCost) || 0;
      return sum + qty * cost;
    }, 0),
  );

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function pickVariant(key: string, variant: ProductVariantListRow) {
    setPickedVariants((previous) => new Map(previous).set(variant.id, variant));
    updateItem(key, {
      productId: variant.productId,
      variantId: variant.id,
      unitCost: String(variant.costPrice),
    });
  }

  function clearProduct(key: string) {
    updateItem(key, { productId: "", variantId: "", unitCost: "" });
  }

  function excludeVariantIds(currentKey: string): string[] {
    return items
      .filter((item) => item.key !== currentKey && item.variantId)
      .map((item) => item.variantId);
  }

  function addItem() {
    setItems((previous) => [
      ...previous,
      { key: newKey(), productId: "", variantId: "", quantityOrdered: "1", unitCost: "" },
    ]);
  }

  function removeItem(key: string) {
    setItems((previous) =>
      previous.length > 1 ? previous.filter((item) => item.key !== key) : previous,
    );
  }

  function submit() {
    setError(null);

    if (!supplierId) {
      setError("Pick a supplier.");
      return;
    }

    const cleanItems = items
      .filter((item) => item.productId && Number(item.quantityOrdered) > 0)
      .map((item) => {
        const variant = item.variantId ? pickedVariants.get(item.variantId) : undefined;
        const raw = Number(item.quantityOrdered) || 0;
        const quantityOrdered = Math.max(0.001, Number(raw.toFixed(3)));
        return {
          productId: item.productId,
          productName: variant ? variantListLabel(variant) : "Unknown product",
          quantityOrdered,
          unitCost: Math.max(0, Number(item.unitCost) || 0),
        };
      });

    if (cleanItems.length === 0) {
      setError("Add at least one line item.");
      return;
    }

    startTransition(async () => {
      const result = await createPurchaseOrderAction({
        supplierId,
        locationId: locationId || null,
        orderDate,
        expectedDate: expectedDate || null,
        referenceNo: referenceNo.trim() || null,
        notes: notes.trim() || null,
        items: cleanItems,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      invalidatePurchaseOrders();
      router.push(`/purchase-orders/${result.id}` as Route);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-surface p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Supplier" required>
            <Combobox
              value={supplierId}
              onChange={setSupplierId}
              options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              placeholder="Search suppliers…"
            />
          </Field>
          <Field label="Location" hint="Which branch this order is for." required={false}>
            <Combobox
              value={locationId}
              onChange={setLocationId}
              options={locations.map((location) => ({ value: location.id, label: location.name }))}
              placeholder="Search branches…"
            />
          </Field>
          <Field label="Order date" required>
            <Input
              type="date"
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
            />
          </Field>
          <Field label="Expected date" hint="Optional." required={false}>
            <Input
              type="date"
              value={expectedDate}
              onChange={(event) => setExpectedDate(event.target.value)}
            />
          </Field>
          <Field
            label="Reference no."
            hint="Supplier's invoice/PO number, optional."
            required={false}
          >
            <Input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Notes" required={false}>
            <RichTextEditor value={notes} onChange={setNotes} placeholder="Optional" />
          </Field>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <h2 className="text-heading-sm font-semibold">Line items</h2>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th numeric>Qty ordered</Th>
              <Th numeric>Unit cost</Th>
              <Th numeric>Line total</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const qty = Number(item.quantityOrdered) || 0;
              const cost = Number(item.unitCost) || 0;
              const picked = item.variantId ? pickedVariants.get(item.variantId) : undefined;
              return (
                <tr key={item.key}>
                  <Td>
                    <MatchProductCombobox
                      excludeVariantIds={excludeVariantIds(item.key)}
                      value={item.variantId}
                      selectedLabel={picked ? variantListLabel(picked) : undefined}
                      onPick={(variant) => pickVariant(item.key, variant)}
                      onClear={() => clearProduct(item.key)}
                      placeholder="Search your catalogue…"
                    />
                  </Td>
                  <Td numeric>
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      className="num text-right"
                      value={item.quantityOrdered}
                      onChange={(event) =>
                        updateItem(item.key, { quantityOrdered: event.target.value })
                      }
                    />
                  </Td>
                  <Td numeric>
                    <MoneyInput
                      type="number"
                      min="0"
                      step="0.01"
                      className="text-right"
                      value={item.unitCost}
                      onChange={(event) => updateItem(item.key, { unitCost: event.target.value })}
                    />
                  </Td>
                  <Td numeric className="font-medium">
                    {formatMoney(qty * cost)}
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton
                        icon={Trash2}
                        label="Remove line"
                        tone="danger"
                        onClick={() => removeItem(item.key)}
                      />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <div className="flex items-center justify-between border-t border-border px-4 py-4 sm:px-6">
          <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addItem}>
            Add line
          </Button>
          <p className="text-body-lg font-semibold">
            Total <span className="num">{formatMoney(total)}</span>
          </p>
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="sticky bottom-0 z-10 rounded-md border border-border bg-surface px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-6">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => router.push("/purchase-orders" as Route)}
          >
            Cancel
          </Button>
          <Button icon={Save} loading={pending} onClick={submit} className="w-full sm:w-auto">
            {pending ? "Creating..." : "Create purchase order"}
          </Button>
        </div>
      </div>
    </div>
  );
}
