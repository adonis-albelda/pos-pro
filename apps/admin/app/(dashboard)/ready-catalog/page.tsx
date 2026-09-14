"use client";

import { useEffect, useMemo, useState } from "react";
import { BookCopy, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { ReadyCatalogCategory, ReadyCatalogSummary } from "@double-a/api-client/queries";
import {
  Button,
  Card,
  CardBody,
  Field,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { useReadyCatalog, useReadyCatalogs } from "@/lib/query/catalogs";

const STORE_TYPES = [
  { value: "supermarket", label: "Supermarket" },
  { value: "sari-sari", label: "Sari-sari", disabled: true },
  { value: "hardware", label: "Hardware", disabled: true },
] as const;

function productKey(category: string, name: string): string {
  return `${category}::${name}`;
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
  const keys = block.products.map((p) => productKey(block.category, p.name));
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
              const key = productKey(block.category, product.name);
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

function CatalogPicker({
  catalogs,
  selectedId,
  onSelect,
}: {
  catalogs: ReadyCatalogSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (catalogs.length <= 1) return null;

  return (
    <Field label="Catalog">
      <Select
        value={selectedId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          Choose a catalog…
        </option>
        {catalogs.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name ?? c.id}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export default function ReadyCatalogPage() {
  const [storeType, setStoreType] = useState<string>("");
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const listQuery = useReadyCatalogs(storeType || null);
  const detailQuery = useReadyCatalog(catalogId);

  // Auto-pick when the list has exactly one catalog for the store type.
  useEffect(() => {
    const rows = listQuery.data;
    if (!rows) return;
    if (rows.length === 1) {
      setCatalogId(rows[0]!.id);
      return;
    }
    if (catalogId && !rows.some((r) => r.id === catalogId)) {
      setCatalogId(null);
    }
  }, [listQuery.data, catalogId]);

  // Clear selection when switching catalogs.
  useEffect(() => {
    setSelected(new Set());
  }, [catalogId]);

  const categories = detailQuery.data?.products ?? [];

  const selectedByCategory = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of selected) {
      const sep = key.indexOf("::");
      if (sep < 0) continue;
      const category = key.slice(0, sep);
      const name = key.slice(sep + 2);
      const list = map.get(category) ?? [];
      list.push(name);
      map.set(category, list);
    }
    return map;
  }, [selected]);

  function toggleProduct(category: string, name: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = productKey(category, name);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAll(category: string, products: { name: string }[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of products) {
        const key = productKey(category, p.name);
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function onImport(category: string) {
    const names = selectedByCategory.get(category) ?? [];
    if (names.length === 0) {
      toast.error("Select at least one product");
      return;
    }
    // Import write path lands in a follow-up — selection UX only for now.
    toast.message("Import coming soon", {
      description: `${names.length} product${names.length === 1 ? "" : "s"} in “${category}”.`,
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
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Store type" hint="More store types land as we seed them.">
            <Select
              value={storeType}
              onChange={(e) => {
                setStoreType(e.target.value);
                setCatalogId(null);
                setSelected(new Set());
              }}
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

          {storeType ? (
            listQuery.isPending ? (
              <Skeleton className="h-10" />
            ) : listQuery.isError ? (
              <p className="self-end text-body text-danger">
                {listQuery.error instanceof Error
                  ? listQuery.error.message
                  : "Could not load catalogs."}
              </p>
            ) : (listQuery.data?.length ?? 0) === 0 ? (
              <p className="self-end text-body text-ink-muted">
                No ready catalogs for this store type yet.
              </p>
            ) : (
              <CatalogPicker
                catalogs={listQuery.data ?? []}
                selectedId={catalogId}
                onSelect={setCatalogId}
              />
            )
          ) : null}
        </CardBody>
      </Card>

      {!storeType ? (
        <Card className="px-4 py-10 text-center text-body text-ink-muted">
          Choose a store type to see available starter catalogs.
        </Card>
      ) : catalogId && detailQuery.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : catalogId && detailQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {detailQuery.error instanceof Error
            ? detailQuery.error.message
            : "Could not load this catalog."}
        </Card>
      ) : catalogId ? (
        <div className="space-y-3">
          <p className="text-caption text-ink-muted">
            {detailQuery.data?.name ?? "Catalog"} · {categories.length} categories
          </p>
          {categories.map((block) => (
            <CategoryAccordion
              key={block.category}
              block={block}
              selected={selected}
              onToggleProduct={(name, checked) => toggleProduct(block.category, name, checked)}
              onToggleAll={(checked) => toggleAll(block.category, block.products, checked)}
              onImport={() => onImport(block.category)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
