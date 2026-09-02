"use client";

import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  RotateCcw,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { formatMoney, formatQuantity, roundMoney } from "@double-a/shared-types";
import type { Product } from "@double-a/shared-types";
import {
  Badge,
  Button,
  Combobox,
  Field,
  IconButton,
  Input,
  Money,
  MoneyInput,
} from "@/components/ui";
import {
  headerDisplayName,
  headerSkuSnippet,
  internalSkuDisplay,
  supplierSkuDisplay,
  supplierSkuHint,
  lineIsFlagged,
  lineIsResolved,
  stockAfterReceive,
  suggestPrice,
  type LineRow,
} from "./receiving-line-utils";

const FIELD_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-3";

function ReadOnlyMoneyField({ label, value }: { label: string; value: number }) {
  return (
    <Field label={label}>
      <div className="flex min-h-11 w-full items-center rounded-sm border border-border bg-canvas px-3">
        <Money value={value} className="text-ink-muted" />
      </div>
    </Field>
  );
}

function ChangeLine({
  label,
  before,
  after,
  formatValue,
  newLabel = "New",
}: {
  label: string;
  before: number | null;
  after: number | null;
  formatValue: (value: number) => string;
  newLabel?: string;
}) {
  if (before === null && after === null) {
    return (
      <p className="text-caption text-ink-muted">
        <span className="font-medium text-ink">{label}:</span> —
      </p>
    );
  }

  if (before === null && after !== null) {
    return (
      <p className="text-caption text-ink">
        <span className="font-medium">{label}:</span>{" "}
        <span className="text-ink-muted">{newLabel}</span>{" "}
        <span className="font-medium">{formatValue(after)}</span>
      </p>
    );
  }

  if (before !== null && after === null) {
    return (
      <p className="text-caption text-ink">
        <span className="font-medium">{label}:</span>{" "}
        <span className="text-ink-muted">{formatValue(before)}</span>
        <span className="text-ink-muted"> — unchanged</span>
      </p>
    );
  }

  if (before === after) {
    return (
      <p className="text-caption text-ink">
        <span className="font-medium">{label}:</span>{" "}
        <span className="text-ink-muted">{formatValue(before!)}</span>
        <span className="text-ink-muted"> → </span>
        <span className="font-medium">{formatValue(after!)}</span>
        <span className="text-ink-muted"> (no change)</span>
      </p>
    );
  }

  return (
    <p className="text-caption text-ink">
      <span className="font-medium">{label}:</span>{" "}
      <span className="text-ink-muted">{formatValue(before!)}</span>
      <span className="text-ink-muted"> → </span>
      <span className="font-medium text-primary">{formatValue(after!)}</span>
    </p>
  );
}

export function ReceivingLineAccordion({
  row,
  index,
  expanded,
  onToggle,
  hasSupplier,
  showMatchPicker,
  showInternalSku,
  matchedProduct,
  currentStock,
  matchProducts,
  onUpdate,
  onPickProduct,
  onClearProduct,
  onResolve,
  onToggleExcluded,
}: {
  row: LineRow;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  hasSupplier: boolean;
  showMatchPicker: boolean;
  /** When true, show the editable internal SKU field (new products). */
  showInternalSku: boolean;
  /** Matched catalogue product — used for supplier SKU fallback. */
  matchedProduct?: Product;
  /** Branch stock for a matched catalogue product. */
  currentStock: number | null;
  matchProducts: Product[];
  onUpdate: (patch: Partial<LineRow>) => void;
  onPickProduct: (productId: string) => void;
  onClearProduct: () => void;
  onResolve: () => void;
  onToggleExcluded: () => void;
}) {
  const flagged = lineIsFlagged(row);
  const resolved = lineIsResolved(row);
  const displayName = headerDisplayName(row);
  const skuSnippet = headerSkuSnippet(row, matchedProduct);
  const supplierSku = supplierSkuDisplay(row, matchedProduct);
  const internalSku = internalSkuDisplay(row, matchedProduct);
  const qty = Number(row.quantityReceived) || 0;
  const newCost = row.unitCost.trim() !== "" ? Number(row.unitCost) : null;
  const newShelf = row.appliedPrice.trim() !== "" ? Number(row.appliedPrice) : null;
  const nextStock = row.productId ? stockAfterReceive(currentStock, qty) : null;
  const inputsDisabled = !hasSupplier || row.excluded;

  return (
    <div
      className={`mt-3 rounded-md border ${
        row.excluded
          ? "border-border bg-canvas opacity-60"
          : !hasSupplier
            ? "border-border bg-canvas opacity-70"
            : resolved
              ? "border-border bg-surface"
              : "border-warning/40 bg-warning/5"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <span className="shrink-0 text-caption font-semibold text-ink-muted">#{index + 1}</span>
        {row.excluded ? null : resolved ? (
          <CheckCircle2 size={16} className="shrink-0 text-success" strokeWidth={2} />
        ) : (
          <CircleAlert size={16} className="shrink-0 text-warning-ink" strokeWidth={2} />
        )}
        <div className="min-w-0 flex-1">
          {row.excluded ? (
            <>
              <p className="truncate text-body font-medium text-danger">This item will not be included</p>
              <p className="truncate text-caption text-ink-muted">{displayName}</p>
            </>
          ) : (
            <>
              <p className="truncate text-body font-medium text-ink">{displayName}</p>
              <p className="truncate text-caption text-ink-muted">{skuSnippet}</p>
            </>
          )}
        </div>
        {row.excluded ? (
          <Badge tone="neutral">Removed</Badge>
        ) : !row.productId ? (
          <Badge tone="neutral">New product</Badge>
        ) : flagged ? (
          <Badge tone="warning">Review</Badge>
        ) : (
          <Badge tone="success">Existing product</Badge>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div
            className={`space-y-4 ${inputsDisabled ? "pointer-events-none opacity-50" : ""}`}
            aria-disabled={inputsDisabled}
          >
            <Field label="Item name" required>
              <Input
                value={row.name}
                onChange={(event) => onUpdate({ name: event.target.value })}
                placeholder="As written on the receipt"
                disabled={inputsDisabled}
              />
            </Field>

            {supplierSku ? (
              <Field label="Supplier SKU" hint={supplierSkuHint(row, matchedProduct)}>
                <div className="flex min-h-11 w-full items-center rounded-sm border border-border bg-canvas px-3 text-body text-ink">
                  {supplierSku}
                </div>
              </Field>
            ) : null}

            {showMatchPicker ? (
              <Field label="Match product" hint="Link to an existing product in your catalogue.">
                <div className="flex items-center gap-2">
                  <Combobox
                    className="min-w-0 flex-1"
                    menuMinWidth={360}
                    value={row.productId ?? ""}
                    onChange={onPickProduct}
                    options={matchProducts.map((p) => ({
                      value: p.id,
                      label: p.name,
                      sublabel: p.sku ?? undefined,
                    }))}
                    placeholder="Match an existing product…"
                    disabled={inputsDisabled}
                  />
                  {row.productId ? (
                    <IconButton icon={X} label="Remove product match" onClick={onClearProduct} />
                  ) : null}
                </div>
              </Field>
            ) : null}

            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
              <p className="mb-1.5 text-caption font-semibold text-ink">After this receipt</p>
              <div className="space-y-1">
                {row.productId && currentStock !== null ? (
                  <ChangeLine
                    label="Stock"
                    before={currentStock}
                    after={nextStock}
                    formatValue={(value) => formatQuantity(value)}
                  />
                ) : qty > 0 ? (
                  <ChangeLine
                    label="Stock"
                    before={null}
                    after={qty}
                    formatValue={(value) => formatQuantity(value)}
                    newLabel="Starts at"
                  />
                ) : (
                  <ChangeLine label="Stock" before={null} after={null} formatValue={formatQuantity} />
                )}
                <ChangeLine
                  label="Cost"
                  before={row.existingCostPrice}
                  after={newCost}
                  formatValue={(value) => formatMoney(value)}
                />
                <ChangeLine
                  label="Shelf price"
                  before={row.existingPrice}
                  after={newShelf}
                  formatValue={(value) => formatMoney(value)}
                />
              </div>
            </div>

            <div className={FIELD_GRID}>
              <Field label="Quantity" required>
                <div className="flex w-full items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    className="num w-full min-w-0 text-right"
                    value={row.quantityReceived}
                    onChange={(event) => onUpdate({ quantityReceived: event.target.value })}
                    disabled={inputsDisabled}
                  />
                  {row.quantityReceived !== row.originalQuantityReceived ? (
                    <IconButton
                      icon={RotateCcw}
                      label="Reset to original quantity"
                      onClick={() => onUpdate({ quantityReceived: row.originalQuantityReceived })}
                    />
                  ) : null}
                </div>
                {row.quantityOrdered !== null ? (
                  <p className="mt-1 text-caption text-ink-muted">
                    Ordered {formatQuantity(row.quantityOrdered)}
                  </p>
                ) : null}
              </Field>

              <ReadOnlyMoneyField
                label="Current cost"
                value={row.existingCostPrice ?? (Number(row.unitCost) || 0)}
              />

              <Field label="New cost price" required>
                <div className="flex w-full items-center gap-1">
                  <MoneyInput
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full min-w-0 text-right"
                    value={row.unitCost}
                    disabled={inputsDisabled}
                    onChange={(event) => {
                      const unitCost = Number(event.target.value) || 0;
                      const nextAppliedPrice =
                        row.existingPrice !== null && row.existingCostPrice !== null
                          ? String(suggestPrice(unitCost, row.existingPrice, row.existingCostPrice))
                          : row.appliedPrice;
                      onUpdate({ unitCost: event.target.value, appliedPrice: nextAppliedPrice });
                    }}
                  />
                  {row.unitCost !== row.originalUnitCost ? (
                    <IconButton
                      icon={RotateCcw}
                      label="Reset to original cost"
                      onClick={() => {
                        const unitCost = Number(row.originalUnitCost) || 0;
                        const nextAppliedPrice =
                          row.existingPrice !== null && row.existingCostPrice !== null
                            ? String(suggestPrice(unitCost, row.existingPrice, row.existingCostPrice))
                            : row.originalAppliedPrice;
                        onUpdate({ unitCost: row.originalUnitCost, appliedPrice: nextAppliedPrice });
                      }}
                    />
                  ) : null}
                </div>
                {row.existingCostPrice !== null ? (
                  (() => {
                    const delta = roundMoney((Number(row.unitCost) || 0) - row.existingCostPrice!);
                    if (delta === 0) {
                      return <p className="mt-1 text-caption text-ink-muted">No change</p>;
                    }
                    return (
                      <p className={`mt-1 text-caption ${delta > 0 ? "text-danger" : "text-success"}`}>
                        {delta > 0 ? "+" : "−"}
                        {formatMoney(Math.abs(delta))} vs current
                      </p>
                    );
                  })()
                ) : (
                  <p className="mt-1 text-caption text-ink-muted">New product</p>
                )}
              </Field>
            </div>

            <div className={FIELD_GRID}>
              <ReadOnlyMoneyField
                label="Current shelf price"
                value={row.existingPrice ?? (Number(row.appliedPrice) || 0)}
              />

              <Field label="New shelf price" required>
                <div className="flex w-full items-center gap-1">
                  <MoneyInput
                    type="number"
                    min="0"
                    step="0.01"
                    className={`w-full min-w-0 text-right ${
                      !row.productId && !(Number(row.appliedPrice) > 0)
                        ? "border-danger focus:ring-danger/30"
                        : ""
                    }`}
                    value={row.appliedPrice}
                    disabled={inputsDisabled}
                    onChange={(event) => onUpdate({ appliedPrice: event.target.value })}
                  />
                  {row.appliedPrice !== row.originalAppliedPrice ? (
                    <IconButton
                      icon={RotateCcw}
                      label="Reset to original selling price"
                      onClick={() => onUpdate({ appliedPrice: row.originalAppliedPrice })}
                    />
                  ) : null}
                </div>
                {!row.productId && !(Number(row.appliedPrice) > 0) ? (
                  <p className="mt-1 text-caption font-medium text-danger">Needs a value</p>
                ) : row.existingPrice !== null ? (
                  (() => {
                    const delta = roundMoney((Number(row.appliedPrice) || 0) - row.existingPrice!);
                    if (delta === 0) {
                      return <p className="mt-1 text-caption text-ink-muted">No change</p>;
                    }
                    return (
                      <p className={`mt-1 text-caption ${delta > 0 ? "text-success" : "text-danger"}`}>
                        {delta > 0 ? "+" : "−"}
                        {formatMoney(Math.abs(delta))} vs current
                      </p>
                    );
                  })()
                ) : null}
              </Field>

              {showInternalSku ? (
                <Field label="Internal SKU" hint="Optional. Your store's product code.">
                  <Input
                    value={row.sku}
                    onChange={(event) => onUpdate({ sku: event.target.value })}
                    placeholder="e.g. PIPE-001"
                    disabled={inputsDisabled}
                  />
                </Field>
              ) : row.productId && internalSku ? (
                <Field label="Internal SKU">
                  <div className="flex min-h-11 w-full items-center rounded-sm border border-border bg-canvas px-3 text-body text-ink-muted">
                    {internalSku}
                  </div>
                </Field>
              ) : (
                <div className="hidden sm:block" aria-hidden />
              )}
            </div>

            {showInternalSku ? (
              <Field
                label="Shop visibility"
                hint={
                  row.createHidden
                    ? "Hidden from the shop floor until you finish the full product details."
                    : "Will show on terminals right away after this receipt saves."
                }
              >
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3">
                  <input
                    type="checkbox"
                    checked={row.createHidden}
                    onChange={(event) => onUpdate({ createHidden: event.target.checked })}
                    disabled={inputsDisabled}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="text-body">Hide from shop</span>
                </label>
              </Field>
            ) : null}

            <Field label="Note">
              <Input
                value={row.note}
                onChange={(event) => onUpdate({ note: event.target.value })}
                placeholder={flagged ? "Note (e.g. short by 2)" : "Optional note"}
                disabled={inputsDisabled}
              />
            </Field>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              {row.excluded ? (
                <Button type="button" variant="secondary" size="sm" icon={RotateCcw} onClick={onToggleExcluded}>
                  Restore line
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" icon={Trash2} onClick={onToggleExcluded}>
                  Remove line
                </Button>
              )}
            </div>
            {!row.excluded && !resolved && hasSupplier ? (
              <Button type="button" variant="secondary" size="sm" icon={WandSparkles} onClick={onResolve}>
                Resolve this item
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
