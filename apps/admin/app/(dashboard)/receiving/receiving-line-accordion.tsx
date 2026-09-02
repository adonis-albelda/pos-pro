"use client";

import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Pencil,
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
  supplierSkuHint,
  supplierSkuInputValue,
  supplierSkuUsesAiExtraction,
  lineIsFlagged,
  lineIsResolved,
  stockAfterReceive,
  suggestPrice,
  type LineRow,
} from "./receiving-line-utils";

const HALF_ROW = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 max-sm:grid-cols-1";
const HALF_CELL = "min-w-0 w-full";

function ReadOnlyMoneyField({ label, value }: { label: string; value: number }) {
  return (
    <div className={HALF_CELL}>
      <Field label={label}>
        <div className="flex min-h-11 w-full items-center rounded-sm border border-border bg-canvas px-3">
          <Money value={value} className="text-ink-muted" />
        </div>
      </Field>
    </div>
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
  const supplierSkuValue = supplierSkuInputValue(row, matchedProduct);
  const usesAiSupplierSku = supplierSkuUsesAiExtraction(row, matchedProduct);
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
      <div className="flex items-center gap-1 px-2 py-2 sm:px-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-sm px-2 py-1 text-left"
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
        <IconButton
          icon={row.excluded ? RotateCcw : Trash2}
          label={row.excluded ? "Restore line" : "Remove line"}
          tone={row.excluded ? "neutral" : "danger"}
          onClick={(event) => {
            event.stopPropagation();
            onToggleExcluded();
          }}
        />
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div
            className={`space-y-4 ${inputsDisabled ? "pointer-events-none opacity-50" : ""}`}
            aria-disabled={inputsDisabled}
          >
            <div
              className={
                showInternalSku || (row.productId && internalSku) ? HALF_ROW : "w-full"
              }
            >
              <div className={showInternalSku || (row.productId && internalSku) ? HALF_CELL : "w-full"}>
              <Field label="Item name" required>
                <Input
                  value={row.name}
                  onChange={(event) => onUpdate({ name: event.target.value })}
                  placeholder="As written on the receipt"
                  disabled={inputsDisabled}
                />
              </Field>
              </div>

              {showInternalSku ? (
                <div className={HALF_CELL}>
                <Field label="Internal SKU" hint="Optional. Your store's product code.">
                  <Input
                    value={row.sku}
                    onChange={(event) => onUpdate({ sku: event.target.value })}
                    placeholder="e.g. PIPE-001"
                    disabled={inputsDisabled}
                  />
                </Field>
                </div>
              ) : row.productId && internalSku ? (
                <div className={HALF_CELL}>
                <Field label="Internal SKU">
                  <div className="flex min-h-11 w-full items-center rounded-sm border border-border bg-canvas px-3 text-body text-ink-muted">
                    {internalSku}
                  </div>
                </Field>
                </div>
              ) : null}
            </div>

            <div className={HALF_ROW}>
              <div className={HALF_CELL}>
              <Field
                label="Supplier SKU"
                hint={
                  usesAiSupplierSku
                    ? "Exact code from AI extraction."
                    : supplierSkuHint(row, matchedProduct)
                }
              >
                <div className="flex w-full items-center gap-1">
                  <Input
                    value={supplierSkuValue}
                    onChange={(event) => onUpdate({ receiptSupplierSku: event.target.value })}
                    placeholder="Code from the receipt"
                    disabled={inputsDisabled}
                    className="min-w-0 flex-1"
                  />
                  {row.originalReceiptSupplierSku.trim() ? (
                    <IconButton
                      icon={Pencil}
                      label="Supplier SKU — exact one from AI extraction"
                      tone={usesAiSupplierSku ? "primary" : "neutral"}
                      disabled={inputsDisabled || usesAiSupplierSku}
                      onClick={() =>
                        onUpdate({ receiptSupplierSku: row.originalReceiptSupplierSku })
                      }
                    />
                  ) : null}
                </div>
              </Field>
              </div>

              <div className={HALF_CELL}>
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
              </div>
            </div>

            {showMatchPicker ? (
              <div className="rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-3 sm:px-4">
                <p className="text-caption font-medium text-ink">Match product</p>
                <p className="mt-1 text-caption leading-relaxed text-ink-muted">
                  Link this line to a product you already sell. Stock and prices apply to that
                  item — use this when the receipt item is not new. Leave empty only if you are
                  adding a brand-new product.
                </p>
                <div className="relative mt-3 w-full">
                  <Combobox
                    className={row.productId ? "w-full pr-10" : "w-full"}
                    menuMinWidth={560}
                    value={row.productId ?? ""}
                    onChange={onPickProduct}
                    options={matchProducts.map((p) => ({
                      value: p.id,
                      label: p.name,
                      sublabel: p.sku ?? undefined,
                    }))}
                    placeholder="Search your catalogue…"
                    disabled={inputsDisabled}
                  />
                  {row.productId ? (
                    <IconButton
                      icon={X}
                      label="Remove product match"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      onClick={onClearProduct}
                    />
                  ) : null}
                </div>
              </div>
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

            <div className={HALF_ROW}>
              <ReadOnlyMoneyField
                label="Cost price"
                value={row.existingCostPrice ?? (Number(row.unitCost) || 0)}
              />

              <div className={HALF_CELL}>
              <Field label="New cost price" required>
                <div className="relative w-full">
                  <MoneyInput
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full min-w-0 pr-10 text-right"
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
                      className="absolute top-1/2 right-0 -translate-y-1/2"
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
            </div>

            <div className={HALF_ROW}>
              <ReadOnlyMoneyField
                label="Shelf price"
                value={row.existingPrice ?? (Number(row.appliedPrice) || 0)}
              />

              <div className={HALF_CELL}>
              <Field label="New shelf price" required>
                <div className="relative w-full">
                  <MoneyInput
                    type="number"
                    min="0"
                    step="0.01"
                    className={`w-full min-w-0 pr-10 text-right ${
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
                      className="absolute top-1/2 right-0 -translate-y-1/2"
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
              </div>
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
