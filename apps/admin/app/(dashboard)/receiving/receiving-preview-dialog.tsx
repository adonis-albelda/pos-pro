"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, TriangleAlert, X } from "lucide-react";
import { formatMoney, formatQuantity } from "@double-a/shared-types";
import { Badge, Button, Money, Table, Td, Th } from "@/components/ui";
import { Dialog } from "@/components/overlay";

export interface ReceiptPreviewLine {
  key: string;
  name: string;
  sku: string;
  quantityReceived: number;
  unitCost: number;
  appliedPrice: number | null;
  productId: string | null;
  existingPrice: number | null;
  existingCostPrice: number | null;
  prevStock: number | null;
  isFlagged: boolean;
  note: string;
}

type CatalogFilter = "all" | "in-catalog" | "not-in-catalog";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function isInCatalog(row: ReceiptPreviewLine): boolean {
  return row.productId !== null;
}

function PriceBeforeAfter({
  before,
  after,
  emptyLabel = "—",
}: {
  before: number | null;
  after: number | null;
  emptyLabel?: string;
}) {
  if (after === null && before === null) {
    return <span className="text-caption text-ink-muted">{emptyLabel}</span>;
  }

  if (before === null && after !== null) {
    return (
      <div className="space-y-0.5">
        <p className="text-caption text-ink-muted">New</p>
        <Money value={after} />
      </div>
    );
  }

  if (before !== null && after === null) {
    return (
      <div className="space-y-0.5">
        <Money value={before} className="text-ink-muted" />
        <p className="text-caption text-ink-muted">Unchanged</p>
      </div>
    );
  }

  if (before === after) {
    return (
      <div className="space-y-0.5">
        <span className="tabular-nums text-ink-muted">
          {formatMoney(before!)}
          <span> → </span>
          {formatMoney(after!)}
        </span>
        <p className="text-caption text-ink-muted">No change</p>
      </div>
    );
  }

  return (
    <span className="tabular-nums">
      <span className="text-ink-muted">{formatMoney(before!)}</span>
      <span className="text-ink-muted"> → </span>
      <span className="font-medium text-ink">{formatMoney(after!)}</span>
    </span>
  );
}

function StatusBadge({ row }: { row: ReceiptPreviewLine }) {
  if (!row.productId) {
    return <Badge tone="neutral">New product</Badge>;
  }
  return <Badge tone="success">Existing product</Badge>;
}

export function ReceivingPreviewDialog({
  open,
  onClose,
  onConfirm,
  pending,
  supplierLabel,
  branchLabel,
  notes,
  referenceNo,
  lines,
  hasFlaggedLines,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
  supplierLabel: string;
  branchLabel: string;
  notes: string;
  referenceNo: string;
  lines: ReceiptPreviewLine[];
  hasFlaggedLines: boolean;
}) {
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");

  useEffect(() => {
    if (!open) setCatalogFilter("all");
  }, [open]);

  const inCatalogCount = useMemo(() => lines.filter(isInCatalog).length, [lines]);
  const notInCatalogCount = lines.length - inCatalogCount;

  const visibleLines = useMemo(() => {
    if (catalogFilter === "in-catalog") return lines.filter(isInCatalog);
    if (catalogFilter === "not-in-catalog") return lines.filter((row) => !isInCatalog(row));
    return lines;
  }, [catalogFilter, lines]);

  const filterOptions: { key: CatalogFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: lines.length },
    { key: "in-catalog", label: "Existing products", count: inCatalogCount },
    { key: "not-in-catalog", label: "New products", count: notInCatalogCount },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Review receipt before saving"
      description="Check supplier, branch, and every line — stock and prices update on save."
      className="max-h-[66vh] w-full sm:w-[66vw] sm:max-w-[66vw]"
    >
      <div className="space-y-5">
        <dl className="grid gap-3 rounded-md border border-border bg-canvas/40 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-caption font-medium text-ink-muted">Supplier</dt>
            <dd className="mt-0.5 text-body text-ink">{supplierLabel}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-ink-muted">Received at</dt>
            <dd className="mt-0.5 text-body text-ink">{branchLabel}</dd>
          </div>
          {referenceNo ? (
            <div>
              <dt className="text-caption font-medium text-ink-muted">Reference</dt>
              <dd className="mt-0.5 text-body text-ink">{referenceNo}</dd>
            </div>
          ) : null}
          <div className={referenceNo ? "" : "sm:col-span-2"}>
            <dt className="text-caption font-medium text-ink-muted">Notes</dt>
            <dd className="mt-0.5 text-body text-ink">{notes.trim() || "—"}</dd>
          </div>
        </dl>

        {hasFlaggedLines ? (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-caption text-warning-ink">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            Some items are new and not in your product list yet. You can still save this receipt.
            Use &ldquo;Hide from shop&rdquo; on each new line if you want them off the floor until
            their full details are finished.
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body font-medium text-ink">
              {visibleLines.length} of {lines.length} item{lines.length === 1 ? "" : "s"}
            </p>
            <fieldset>
              <legend className="sr-only">Filter by product type</legend>
              <div className="inline-flex gap-1 rounded-sm border border-border bg-paper p-1">
                {filterOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setCatalogFilter(option.key)}
                    aria-pressed={catalogFilter === option.key}
                    className={cx(
                      "cursor-pointer rounded-sm px-3 py-1.5 text-caption font-medium whitespace-nowrap transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                      catalogFilter === option.key
                        ? "bg-surface text-ink shadow-xs"
                        : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {option.label} ({option.count})
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {visibleLines.length === 0 ? (
            <p className="rounded-md border border-border px-4 py-6 text-center text-body text-ink-muted">
              No lines match this filter.
            </p>
          ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Status</Th>
                  <Th numeric>Qty</Th>
                  <Th numeric>Cost price</Th>
                  <Th numeric>Shelf price</Th>
                  <Th numeric>Stock</Th>
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((row) => {
                  const restocks = row.productId !== null;
                  const nextStock =
                    restocks && row.prevStock !== null
                      ? row.prevStock + row.quantityReceived
                      : null;

                  return (
                    <tr key={row.key}>
                      <Td>
                        <p className="font-medium text-ink">{row.name}</p>
                        {row.sku ? (
                          <p className="mt-0.5 text-caption text-ink-muted">{row.sku}</p>
                        ) : null}
                        {row.note.trim() ? (
                          <p className="mt-1 text-caption text-ink-muted">{row.note}</p>
                        ) : null}
                      </Td>
                      <Td>
                        <StatusBadge row={row} />
                        {row.isFlagged ? (
                          <p className="mt-1 text-caption text-warning-ink">Flagged</p>
                        ) : null}
                      </Td>
                      <Td numeric>{formatQuantity(row.quantityReceived)}</Td>
                      <Td numeric>
                        <PriceBeforeAfter before={row.existingCostPrice} after={row.unitCost} />
                      </Td>
                      <Td numeric>
                        <PriceBeforeAfter before={row.existingPrice} after={row.appliedPrice} />
                      </Td>
                      <Td numeric>
                        {restocks && row.prevStock !== null && nextStock !== null ? (
                          <span className="tabular-nums">
                            {formatQuantity(row.prevStock)}
                            <span className="text-ink-muted"> → </span>
                            {formatQuantity(nextStock)}
                          </span>
                        ) : (
                          <span className="text-caption text-ink-muted">No stock change</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" icon={X} onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" icon={Save} loading={pending} onClick={() => void onConfirm()}>
            Save receipt
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
