"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import type { Product } from "@double-a/shared-types";
import { formatQuantity, stockLevel } from "@double-a/shared-types";
import { Badge, Button, Field, Input, Money } from "@/components/ui";
import { AiSearchDialog } from "@/components/ai-search-dialog";

/**
 * A shop with hundreds of lines cannot be scrolled in a `<select>`, and
 * whoever's picking usually knows the name, SKU, or barcode. Originally
 * built for inventory's stock-form.tsx; shared here so a sale's line items
 * (replace-item, create-sale) use the exact same search/select instead of a
 * second implementation.
 */
export function ProductPicker({
  selected,
  onSelect,
  search,
  label = "Product",
  enableAiSearch = false,
}: {
  selected: Product | null;
  onSelect: (product: Product | null) => void;
  search: (term: string) => Promise<Product[]>;
  label?: string;
  /** Gate behind the `product_vector_search` feature flag at the call site. */
  enableAiSearch?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<Product[]>([]);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      void search(term).then(setMatches);
    }, 150);
    return () => clearTimeout(handle);
  }, [term, open, search]);

  if (selected) {
    const level = stockLevel(selected.stockQuantity, selected.reorderPoint);

    return (
      <div className="rounded-sm border border-primary/30 bg-primary-tint px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-body-lg font-semibold">{selected.name}</p>
            <p className="mt-0.5 truncate text-caption text-ink-muted">
              {selected.sku ? <span className="num">{selected.sku}</span> : "No SKU"}
              {selected.category ? ` · ${selected.category}` : ""}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
              <span>
                On hand{" "}
                <span className="num font-semibold text-ink">
                  {formatQuantity(selected.stockQuantity)}
                </span>{" "}
                {selected.unit}
              </span>
              <span>·</span>
              <span>
                price <Money value={selected.price} className="text-ink" />
              </span>
              {selected.stockQuantity < 0 ? (
                <Badge tone="danger">Oversold</Badge>
              ) : level === "out" ? (
                <Badge tone="danger">Out of stock</Badge>
              ) : level === "low" ? (
                <Badge tone="warning">Low stock</Badge>
              ) : null}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={X}
            onClick={() => {
              onSelect(null);
              setTerm("");
              setOpen(true);
            }}
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label={label} hint="Search by name, SKU or barcode.">
            <Input
              icon={Search}
              value={term}
              placeholder="Start typing a product…"
              autoComplete="off"
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setTerm(event.target.value);
                setOpen(true);
              }}
            />
          </Field>
        </div>
        {enableAiSearch ? (
          <Button
            type="button"
            variant="secondary"
            icon={Sparkles}
            aria-label="Smart search with AI"
            onClick={() => {
              setOpen(false);
              setAiSearchOpen(true);
            }}
          />
        ) : null}
      </div>

      {enableAiSearch ? (
        <AiSearchDialog
          open={aiSearchOpen}
          onClose={() => setAiSearchOpen(false)}
          onSelect={(product) => onSelect(product)}
        />
      ) : null}

      {open ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-sm border border-border bg-surface py-1 shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-body text-ink-muted">
              Nothing matches that. Products are added on the Products page.
            </li>
          ) : (
            matches.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(product);
                    setOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-paper"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-medium">
                      {product.name}
                    </span>
                    <span className="block truncate text-caption text-ink-muted">
                      {product.sku ? <span className="num">{product.sku}</span> : "No SKU"}
                      {product.category ? ` · ${product.category}` : ""}
                    </span>
                  </span>
                  <span className="num shrink-0 text-caption text-ink-muted">
                    {formatQuantity(product.stockQuantity)} {product.unit}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
