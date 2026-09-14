"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookCopy, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { ReadyCatalogCategory } from "@double-a/api-client/queries";
import {
  Button,
  Card,
  CardBody,
  Field,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { useReadyCatalogCategories } from "@/lib/query/catalogs";

const STORE_TYPES = [
  { value: "supermarket", label: "Supermarket" },
  { value: "sari-sari", label: "Sari-sari", disabled: true },
  { value: "hardware", label: "Hardware", disabled: true },
] as const;

const LOAD_MORE_THRESHOLD_PX = 400;

function productKey(categoryId: string, name: string): string {
  return `${categoryId}::${name}`;
}

function CategoryAccordion({
  block,
  selected,
  onToggleProduct,
  onToggleAll,
  onImport,
}: {
  block: ReadyCatalogCategory;
  selected: Set<string>;
  onToggleProduct: (name: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onImport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const keys = block.products.map((p) => productKey(block.id, p.name));
  const selectedCount = keys.filter((k) => selected.has(k)).length;
  const allSelected = keys.length > 0 && selectedCount === keys.length;
  const someSelected = selectedCount > 0 && !allSelected;

  return (
    <Card>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <ChevronDown
            size={18}
            className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
            {block.category}
          </span>
          <span className="shrink-0 text-caption text-ink-muted">
            {selectedCount}/{block.products.length}
          </span>
        </button>
        <label
          className="flex shrink-0 items-center gap-2 text-caption text-ink-muted"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => onToggleAll(e.target.checked)}
          />
          Select all
        </label>
      </div>

      {open ? (
        <CardBody className="space-y-3">
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {block.products.map((product) => {
              const key = productKey(block.id, product.name);
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-sm px-1 py-1.5 hover:bg-paper">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={checked}
                      onChange={(e) => onToggleProduct(product.name, e.target.checked)}
                    />
                    <span className="min-w-0">
                      <span className="block text-body text-ink">{product.name}</span>
                      {product.variants.length > 0 ? (
                        <span className="mt-0.5 block text-caption text-ink-muted">
                          {product.variants.join(" · ")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end border-t border-border pt-3">
            <Button type="button" onClick={onImport}>
              Import products
            </Button>
          </div>
        </CardBody>
      ) : null}
    </Card>
  );
}

export default function ReadyCatalogPage() {
  const [storeType, setStoreType] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const catalogQuery = useReadyCatalogCategories(storeType || null);
  const categories = useMemo(
    () => catalogQuery.data?.pages.flatMap((page) => page.categories) ?? [],
    [catalogQuery.data],
  );
  const total = catalogQuery.data?.pages[0]?.total ?? 0;

  // Clear selection when switching store type.
  useEffect(() => {
    setSelected(new Set());
  }, [storeType]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !storeType) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry?.isIntersecting &&
          catalogQuery.hasNextPage &&
          !catalogQuery.isFetchingNextPage
        ) {
          void catalogQuery.fetchNextPage();
        }
      },
      { rootMargin: `${LOAD_MORE_THRESHOLD_PX}px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeType, catalogQuery.hasNextPage, catalogQuery.isFetchingNextPage]);

  const selectedByCategoryId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of selected) {
      const sep = key.indexOf("::");
      if (sep < 0) continue;
      const categoryId = key.slice(0, sep);
      const name = key.slice(sep + 2);
      const list = map.get(categoryId) ?? [];
      list.push(name);
      map.set(categoryId, list);
    }
    return map;
  }, [selected]);

  function toggleProduct(categoryId: string, name: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = productKey(categoryId, name);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAll(categoryId: string, products: { name: string }[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of products) {
        const key = productKey(categoryId, p.name);
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function onImport(block: ReadyCatalogCategory) {
    const names = selectedByCategoryId.get(block.id) ?? [];
    if (names.length === 0) {
      toast.error("Select at least one product");
      return;
    }
    toast.message("Import coming soon", {
      description: `${names.length} product${names.length === 1 ? "" : "s"} in “${block.category}”.`,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookCopy}
        title="Ready Catalog"
        description="Starter product lists by store type. Pick a category, select products, then import into your shop catalogue."
      />

      <Card>
        <CardBody className="max-w-md">
          <Field label="Store type" hint="More store types land as we seed them.">
            <Select
              value={storeType}
              onChange={(e) => setStoreType(e.target.value)}
            >
              <option value="">Select store type…</option>
              {STORE_TYPES.map((t) => (
                <option key={t.value} value={t.value} disabled={"disabled" in t && t.disabled}>
                  {t.label}
                  {"disabled" in t && t.disabled ? " (soon)" : ""}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      {!storeType ? (
        <Card className="px-4 py-10 text-center text-body text-ink-muted">
          Choose a store type to see available starter catalogs.
        </Card>
      ) : catalogQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : catalogQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {catalogQuery.error instanceof Error
            ? catalogQuery.error.message
            : "Could not load catalogs."}
        </Card>
      ) : categories.length === 0 ? (
        <Card className="px-4 py-10 text-center text-body text-ink-muted">
          No ready catalogs for this store type yet.
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-caption text-ink-muted">
            {categories[0]?.name ?? "Catalog"} · showing {categories.length}
            {total > categories.length ? ` of ${total}` : ""} categories
          </p>
          {categories.map((block) => (
            <CategoryAccordion
              key={block.id}
              block={block}
              selected={selected}
              onToggleProduct={(name, checked) => toggleProduct(block.id, name, checked)}
              onToggleAll={(checked) => toggleAll(block.id, block.products, checked)}
              onImport={() => onImport(block)}
            />
          ))}
          <div ref={sentinelRef} className="h-8" aria-hidden />
          {catalogQuery.isFetchingNextPage ? (
            <p className="py-2 text-center text-caption text-ink-muted">Loading more…</p>
          ) : null}
          {!catalogQuery.hasNextPage && categories.length > 0 ? (
            <p className="py-2 text-center text-caption text-ink-muted">End of catalog</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
