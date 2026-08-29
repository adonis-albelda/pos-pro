"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Check, Package, Search } from "lucide-react";
import { Button, Card, CardHeader, ErrorNote, Input, SuccessNote } from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateSuppliers, useSupplierProductOptions, useSupplierProducts } from "@/lib/query/suppliers";
import { saveSupplierProducts } from "../actions";

/**
 * The detail page's Products tab — a full-height picker, not the cramped
 * inline checklist SupplierForm carries for the create/list-edit flows.
 * Pre-checks from useSupplierProducts (the read side of the replace-all
 * setSupplierProducts write) instead of opening blank.
 */
export function SupplierProductsPanel({ supplierId }: { supplierId: string }) {
  const productsQuery = useSupplierProductOptions();
  const linkedQuery = useSupplierProducts(supplierId);
  const invalidate = useInvalidateSuppliers();

  const [state, action, pending] = useActionState(saveSupplierProducts, EMPTY_FORM_STATE);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string> | null>(null);

  const linkedIds = useMemo(
    () => (linkedQuery.data ?? []).map((product) => product.id),
    [linkedQuery.data],
  );

  // Seeds `selected` once the real linked set has loaded — a plain useState
  // initializer would only ever see the empty array from before the fetch
  // resolved, since this component never remounts between loading and ready.
  useEffect(() => {
    if (linkedQuery.data && selected === null) {
      setSelected(new Set(linkedIds));
    }
  }, [linkedQuery.data, linkedIds, selected]);

  useEffect(() => {
    if (state.ok) invalidate();
  }, [state.ok, invalidate]);

  const visibleProducts = useMemo(() => {
    const products = productsQuery.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(needle) ||
        (product.sku ?? "").toLowerCase().includes(needle),
    );
  }, [productsQuery.data, search]);

  function toggle(productId: string) {
    setSelected((previous) => {
      const next = new Set(previous ?? []);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((previous) => new Set([...(previous ?? []), ...visibleProducts.map((p) => p.id)]));
  }

  function clearAllVisible() {
    const visibleIds = new Set(visibleProducts.map((p) => p.id));
    setSelected((previous) => new Set([...(previous ?? [])].filter((id) => !visibleIds.has(id))));
  }

  const isLoading = productsQuery.isPending || linkedQuery.isPending || selected === null;
  const selectedCount = selected?.size ?? 0;

  return (
    <Card>
      <CardHeader
        icon={Package}
        title="Products this supplier carries"
        description="A convenience list for building purchase orders faster — not a restriction on what you can order."
      />
      <div className="space-y-4 px-4 py-5 sm:px-6">
        {isLoading ? (
          <p className="text-body text-ink-muted">Loading…</p>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={supplierId} />
            <input type="hidden" name="product_ids" value={Array.from(selected ?? []).join(",")} />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex-1">
                <Input
                  icon={Search}
                  placeholder="Filter products by name or SKU…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={selectAllVisible}>
                  Select all shown
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearAllVisible}>
                  Clear shown
                </Button>
              </div>
            </div>

            <div className="rounded-sm border border-border">
              <div className="max-h-[28rem] overflow-y-auto p-2">
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
                        checked={selected?.has(product.id) ?? false}
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

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-caption text-ink-muted">{selectedCount} selected</p>
              {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
              {state.ok ? <SuccessNote>Saved.</SuccessNote> : null}
              <Button type="submit" loading={pending} icon={Check} className="w-full sm:w-auto">
                {pending ? "Saving..." : "Save linked products"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
