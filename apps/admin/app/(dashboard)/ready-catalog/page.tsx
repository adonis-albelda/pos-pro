"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BookCopy, ChevronDown, Loader2, Package, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import type { ReadyCatalogCategory, ReadyCatalogProduct } from "@double-a/api-client/queries";
import {
  Button,
  Card,
  CardBody,
  Field,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { useInvalidateCategories } from "@/lib/query/categories";
import { useReadyCatalogCategories } from "@/lib/query/catalogs";
import { queryKeys } from "@/lib/query/keys";
import { importReadyCatalogProducts } from "@/lib/ready-catalog-import";
import { useQueryClient } from "@tanstack/react-query";

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
  importing,
  onToggleProduct,
  onToggleAll,
  onImport,
}: {
  block: ReadyCatalogCategory;
  selected: Set<string>;
  importing: boolean;
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
    <Card className="flex h-full flex-col">
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
            disabled={importing}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => onToggleAll(e.target.checked)}
          />
          Select all
        </label>
      </div>

      {open ? (
        <CardBody className="flex flex-1 flex-col space-y-3">
          <ul className="max-h-72 flex-1 space-y-2 overflow-y-auto">
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
                      disabled={importing}
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
            <Button type="button" loading={importing} disabled={importing} onClick={onImport}>
              Import products
            </Button>
          </div>
        </CardBody>
      ) : null}
    </Card>
  );
}

type ImportConfirmState = {
  block: ReadyCatalogCategory;
  products: ReadyCatalogProduct[];
};

type ImportProgressState = {
  category: string;
  total: number;
  done: number;
  currentName: string;
  complete: boolean;
};

function ImportProgressOverlay({ progress }: { progress: ImportProgressState }) {
  const labelId = useId();
  const percent =
    progress.total <= 0
      ? 0
      : progress.complete
        ? 100
        : Math.min(99, Math.round(((progress.done + 0.5) / progress.total) * 100));
  const stepLabel =
    progress.total <= 0
      ? "0 of 0"
      : progress.complete
        ? `${progress.total} of ${progress.total}`
        : `${Math.min(progress.done + 1, progress.total)} of ${progress.total}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="presentation"
    >
      <div className="absolute inset-0 bg-ink/40" aria-hidden />
      <div
        role="status"
        aria-live="polite"
        aria-labelledby={labelId}
        className="relative z-10 flex w-full max-w-md flex-col items-center gap-5 rounded-lg border border-border bg-surface px-8 py-10 shadow-lg"
      >
        <div className="relative flex size-16 items-center justify-center">
          <Package size={36} strokeWidth={1.75} className="text-primary" aria-hidden />
          {!progress.complete ? (
            <Loader2
              size={22}
              className="absolute -right-1 -bottom-1 animate-spin text-ink-muted"
              aria-hidden
            />
          ) : null}
        </div>
        <div className="w-full space-y-3 text-center">
          <div>
            <p id={labelId} className="text-heading-sm font-semibold text-ink">
              {progress.complete
                ? "Import complete"
                : `Importing into ${progress.category}`}
            </p>
            {!progress.complete && progress.currentName ? (
              <p className="mt-1 truncate text-caption text-ink-muted">{progress.currentName}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-caption">
              <span className="text-ink-muted">{progress.complete ? "Done" : stepLabel}</span>
              <span className="font-medium tabular-nums text-ink">{percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              />
            </div>
          </div>
          <p className="text-caption text-ink-muted">Please wait — do not close this page.</p>
        </div>
      </div>
    </div>
  );
}

export default function ReadyCatalogPage() {
  const [storeType, setStoreType] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [importingCategoryId, setImportingCategoryId] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState<ImportConfirmState | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);

  const catalogQuery = useReadyCatalogCategories(storeType || null);
  const invalidateCategories = useInvalidateCategories();
  const queryClient = useQueryClient();

  const categories = useMemo(
    () => catalogQuery.data?.pages.flatMap((page) => page.categories) ?? [],
    [catalogQuery.data],
  );
  const total = catalogQuery.data?.pages[0]?.total ?? 0;

  useEffect(() => {
    setSelected(new Set());
    setConfirmImport(null);
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

  const productsByCategoryId = useMemo(() => {
    const map = new Map<string, ReadyCatalogProduct[]>();
    for (const block of categories) {
      map.set(block.id, block.products);
    }
    return map;
  }, [categories]);

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

  function requestImport(block: ReadyCatalogCategory) {
    const all = productsByCategoryId.get(block.id) ?? [];
    const picked = all.filter((p) => selected.has(productKey(block.id, p.name)));
    if (picked.length === 0) {
      toast.error("Select at least one product");
      return;
    }
    setConfirmImport({ block, products: picked });
  }

  async function runConfirmedImport() {
    if (!confirmImport) return;
    const { block, products: picked } = confirmImport;
    setConfirmImport(null);
    setImportingCategoryId(block.id);
    setImportProgress({
      category: block.category,
      total: picked.length,
      done: 0,
      currentName: picked[0]?.name ?? "",
      complete: false,
    });

    try {
      const result = await importReadyCatalogProducts(
        getBrowserApiClient(),
        block.category,
        picked,
        (done, totalCount, name) => {
          setImportProgress({
            category: block.category,
            total: totalCount,
            done,
            currentName: name || "",
            complete: done >= totalCount && totalCount > 0,
          });
        },
      );

      invalidateCategories();
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.attributes.all });

      setSelected((prev) => {
        const next = new Set(prev);
        for (const p of picked) next.delete(productKey(block.id, p.name));
        return next;
      });

      setImportProgress((prev) =>
        prev ? { ...prev, done: picked.length, currentName: "", complete: true } : prev,
      );

      if (result.failed.length === 0) {
        toast.success(`Imported ${result.created} product${result.created === 1 ? "" : "s"}`);
      } else if (result.created === 0) {
        toast.error(
          `Import failed: ${result.failed[0]?.name ?? "product"} — ${result.failed[0]?.message ?? ""}`,
        );
      } else {
        toast.warning(
          `Imported ${result.created}, ${result.failed.length} failed (e.g. ${result.failed[0]?.name})`,
        );
      }

      // Brief beat on 100% so cashier sees completion, then dismiss.
      await new Promise((resolve) => window.setTimeout(resolve, 600));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImportingCategoryId(null);
      setImportProgress(null);
    }
  }

  const confirmCount = confirmImport?.products.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BookCopy}
        title="Ready Catalog"
        description="Starter product lists by store type. Pick a category, select products, then import into your shop catalogue."
      />

      <div className="flex items-start gap-3 rounded-md border border-warning/50 bg-warning/12 px-4 py-3 text-[#8a6516]">
        <TriangleAlert size={20} className="mt-0.5 shrink-0" aria-hidden />
        <div className="min-w-0 text-body">
          <p className="font-semibold">These starter lists need a cleanup pass</p>
          <p className="mt-1 text-caption leading-relaxed opacity-90">
            Ready catalogs come from mixed price lists and OCR scrapes — expect duplicates,
            odd sizes, and messy names. After import, review your catalogue: remove redundant
            items, fix labels, and set real prices so the floor list stays tidy.
          </p>
        </div>
      </div>

      <Card>
        <CardBody className="max-w-md">
          <Field label="Store type" hint="More store types land as we seed them.">
            <Select value={storeType} onChange={(e) => setStoreType(e.target.value)}>
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
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-14" />
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
          <div className="grid gap-3 sm:grid-cols-2">
            {categories.map((block) => (
              <CategoryAccordion
                key={block.id}
                block={block}
                selected={selected}
                importing={importingCategoryId === block.id}
                onToggleProduct={(name, checked) => toggleProduct(block.id, name, checked)}
                onToggleAll={(checked) => toggleAll(block.id, block.products, checked)}
                onImport={() => requestImport(block)}
              />
            ))}
          </div>
          <div ref={sentinelRef} className="h-8" aria-hidden />
          {catalogQuery.isFetchingNextPage ? (
            <p className="py-2 text-center text-caption text-ink-muted">Loading more…</p>
          ) : null}
          {!catalogQuery.hasNextPage && categories.length > 0 ? (
            <p className="py-2 text-center text-caption text-ink-muted">End of catalog</p>
          ) : null}
        </div>
      )}

      <Dialog
        open={confirmImport !== null}
        onClose={() => {
          if (importingCategoryId) return;
          setConfirmImport(null);
        }}
        title="Confirm import"
        description={
          confirmImport
            ? `${confirmCount} product${confirmCount === 1 ? "" : "s"} from ${confirmImport.block.category} — review before importing.`
            : undefined
        }
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              icon={X}
              onClick={() => setConfirmImport(null)}
              disabled={importingCategoryId !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              icon={Package}
              onClick={() => void runConfirmedImport()}
              disabled={importingCategoryId !== null || confirmCount === 0}
            >
              Import {confirmCount} product{confirmCount === 1 ? "" : "s"}
            </Button>
          </div>
        }
      >
        {confirmImport ? (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {confirmImport.products.map((product) => (
              <li
                key={product.name}
                className="rounded-sm border border-border bg-paper px-3 py-2"
              >
                <p className="text-body font-medium text-ink">{product.name}</p>
                {product.variants.length > 0 ? (
                  <p className="mt-0.5 text-caption text-ink-muted">
                    {product.variants.join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Dialog>

      {importProgress ? <ImportProgressOverlay progress={importProgress} /> : null}
    </div>
  );
}
