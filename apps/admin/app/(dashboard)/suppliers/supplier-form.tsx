"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Search, Truck } from "lucide-react";
import {
  SUPPLIER_ADDRESS_MAX,
  SUPPLIER_CONTACT_PERSON_MAX,
  SUPPLIER_EMAIL_MAX,
  SUPPLIER_NAME_MAX,
  SUPPLIER_NOTES_MAX,
  SUPPLIER_PHONE_MAX,
  SUPPLIER_TIN_MAX,
} from "@double-a/shared-types";
import type { Product, Supplier } from "@double-a/shared-types";
import { Button, ErrorNote, Field, Input, SuccessNote, Textarea } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateSuppliers } from "@/lib/query/suppliers";
import { saveSupplier } from "./actions";

export function SupplierForm({
  supplier,
  products,
  linkedProductIds,
  onDone,
}: {
  supplier?: Supplier;
  products: Product[];
  /** Already-checked products, when editing. Empty (not undefined) when creating. */
  linkedProductIds?: string[];
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveSupplier, EMPTY_FORM_STATE);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(linkedProductIds ?? []),
  );
  const invalidate = useInvalidateSuppliers();

  useEffect(() => {
    if (state.ok) {
      invalidate();
      onDone?.();
    }
    // invalidate is stable enough for this effect; only state.ok/onDone gate re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, onDone]);

  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(needle) ||
        (product.sku ?? "").toLowerCase().includes(needle),
    );
  }, [products, search]);

  function toggle(productId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((previous) => new Set([...previous, ...visibleProducts.map((p) => p.id)]));
  }

  function clearAllVisible() {
    const visibleIds = new Set(visibleProducts.map((p) => p.id));
    setSelected((previous) => new Set([...previous].filter((id) => !visibleIds.has(id))));
  }

  return (
    <form action={action} className="space-y-4">
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <input type="hidden" name="product_ids" value={Array.from(selected).join(",")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input
            name="name"
            defaultValue={supplier?.name}
            required
            maxLength={SUPPLIER_NAME_MAX}
          />
        </Field>
        <Field label="Contact person" required={false}>
          <Input
            name="contact_person"
            defaultValue={supplier?.contactPerson ?? ""}
            maxLength={SUPPLIER_CONTACT_PERSON_MAX}
          />
        </Field>
        <Field label="Phone" required={false}>
          <Input
            name="phone"
            defaultValue={supplier?.phone ?? ""}
            maxLength={SUPPLIER_PHONE_MAX}
          />
        </Field>
        <Field label="Secondary phone" required={false}>
          <Input
            name="secondary_phone"
            defaultValue={supplier?.secondaryPhone ?? ""}
            maxLength={SUPPLIER_PHONE_MAX}
          />
        </Field>
        <Field label="Email" required={false}>
          <Input
            name="email"
            type="email"
            defaultValue={supplier?.email ?? ""}
            maxLength={SUPPLIER_EMAIL_MAX}
          />
        </Field>
        <Field label="Secondary email" required={false}>
          <Input
            name="secondary_email"
            type="email"
            defaultValue={supplier?.secondaryEmail ?? ""}
            maxLength={SUPPLIER_EMAIL_MAX}
          />
        </Field>
      </div>

      <Field label="Address" required={false}>
        <Input
          name="address"
          defaultValue={supplier?.address ?? ""}
          maxLength={SUPPLIER_ADDRESS_MAX}
        />
      </Field>

      <Field label="TIN" hint="Doubles as the VAT registration number when the supplier is VAT-registered." required={false}>
        <Input
          name="tin"
          defaultValue={supplier?.tin ?? ""}
          maxLength={SUPPLIER_TIN_MAX}
        />
      </Field>

      <Field label="Notes" hint="Payment terms, delivery quirks, anything else worth remembering." required={false}>
        <Textarea name="notes" defaultValue={supplier?.notes ?? ""} maxLength={SUPPLIER_NOTES_MAX} rows={3} />
      </Field>

      {supplier ? (
        <Field
          label="Active"
          hint="Off hides it from new purchase orders. Existing orders are unaffected."
          required={false}
        >
          <label className="flex min-h-11 items-center gap-2 rounded-sm border border-border bg-surface px-3 text-body">
            <input
              type="checkbox"
              name="is_active"
              value="true"
              defaultChecked={supplier.isActive}
              className="size-4 accent-primary"
            />
            Supplier is active
          </label>
        </Field>
      ) : null}

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-caption font-medium text-ink-muted">
            Products this supplier carries
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-caption font-medium text-primary hover:underline"
            >
              Select all shown
            </button>
            <button
              type="button"
              onClick={clearAllVisible}
              className="text-caption font-medium text-ink-muted hover:text-ink hover:underline"
            >
              Clear shown
            </button>
          </div>
        </div>
        <div className="rounded-sm border border-border">
          <div className="border-b border-border p-2">
            <Input
              icon={Search}
              placeholder="Filter by name or SKU…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {visibleProducts.length === 0 ? (
              <p className="px-2 py-3 text-caption text-ink-muted">No products match.</p>
            ) : (
              visibleProducts.map((product) => (
                <label
                  key={product.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-body hover:bg-paper"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary"
                    checked={selected.has(product.id)}
                    onChange={() => toggle(product.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{product.name}</span>
                  {product.category ? (
                    <span className="shrink-0 text-caption text-ink-muted">{product.category}</span>
                  ) : null}
                  {product.sku ? (
                    <span className="shrink-0 text-caption text-ink-muted">{product.sku}</span>
                  ) : null}
                </label>
              ))
            )}
          </div>
        </div>
        <p className="mt-1 text-caption text-ink-muted">{selected.size} selected</p>
      </div>

      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? <SuccessNote>Saved.</SuccessNote> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          type="submit"
          loading={pending}
          icon={supplier ? Check : Truck}
          className="w-full sm:w-auto"
        >
          {pending ? "Saving..." : supplier ? "Save changes" : "Add supplier"}
        </Button>
        {onDone ? (
          <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
