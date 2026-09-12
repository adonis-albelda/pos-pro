"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, GitMerge, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import { listProductsPage, type ProductVariant } from "@double-a/api-client/queries";
import type { Product } from "@double-a/shared-types";
import { formatQuantity } from "@double-a/shared-types";
import { Dialog } from "@/components/overlay";
import { ProductPicker } from "@/components/product-picker";
import { Button, Field, Input, Money, MoneyInput } from "@/components/ui";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import {
  useCompanyAttributes,
  useCreateCompanyAttribute,
  useCreateCompanyAttributeValue,
  useProductVariants,
} from "@/lib/query/attributes";
import { useMoveProductInto } from "@/lib/query/products";

type Mode = "new_variant" | "merge";
type Step = "setup" | "preview";
type PriceChoice = "keep_target" | "use_source" | "highest" | "lowest" | "custom";

export type MoveIntoSource = {
  productId: string;
  productName: string;
  variantId?: string | null;
  /** Hint from the list row — refined from loaded variants when available. */
  stockQuantity?: number;
  price?: number;
};

/**
 * Catalog cleanup: move this product's sellable unit under another product
 * as an attributed variant, or fold suppliers+stock into an existing variant
 * when Size/etc. already matches. Setup → preview (stock + price choices).
 */
export function MoveIntoProductDialog({
  open,
  onClose,
  source,
}: {
  open: boolean;
  onClose: () => void;
  source: MoveIntoSource | null;
}) {
  const router = useRouter();
  const move = useMoveProductInto();
  const attributesQuery = useCompanyAttributes();
  const createAttribute = useCreateCompanyAttribute();
  const createValue = useCreateCompanyAttributeValue();

  const [step, setStep] = useState<Step>("setup");
  const [target, setTarget] = useState<Product | null>(null);
  const [mode, setMode] = useState<Mode>("new_variant");
  const [attributeId, setAttributeId] = useState("");
  const [valueId, setValueId] = useState("");
  const [newAttributeName, setNewAttributeName] = useState("");
  const [newValueLabel, setNewValueLabel] = useState("");
  const [mergeVariantId, setMergeVariantId] = useState("");
  const [mergeStock, setMergeStock] = useState(true);
  const [priceChoice, setPriceChoice] = useState<PriceChoice>("highest");
  const [customPrice, setCustomPrice] = useState("");

  const sourceVariantsQuery = useProductVariants(open && source ? source.productId : null);
  const targetVariantsQuery = useProductVariants(
    open && target && (mode === "merge" || step === "preview") ? target.id : null,
  );

  useEffect(() => {
    if (!open) return;
    setStep("setup");
    setTarget(null);
    setMode("new_variant");
    setAttributeId("");
    setValueId("");
    setNewAttributeName("");
    setNewValueLabel("");
    setMergeVariantId("");
    setMergeStock(true);
    setPriceChoice("highest");
    setCustomPrice("");
  }, [open, source?.productId]);

  const search = useCallback(
    async (term: string) => {
      const page = await listProductsPage(getBrowserApiClient(), {
        q: term,
        pageSize: 12,
        includeInactive: true,
      });
      return page.products.filter((product) => product.id !== source?.productId);
    },
    [source?.productId],
  );

  const attributes = attributesQuery.data ?? [];
  const selectedAttribute = attributes.find((attribute) => attribute.id === attributeId) ?? null;
  const valueOptions = selectedAttribute?.values ?? [];

  const sourceVariant = useMemo(() => {
    const rows = sourceVariantsQuery.data ?? [];
    if (source?.variantId) {
      return rows.find((variant) => variant.id === source.variantId) ?? null;
    }
    return rows.find((variant) => variant.isDefault) ?? rows[0] ?? null;
  }, [sourceVariantsQuery.data, source?.variantId]);

  const targetMergeVariant = useMemo(() => {
    if (!mergeVariantId) return null;
    return (targetVariantsQuery.data ?? []).find((variant) => variant.id === mergeVariantId) ?? null;
  }, [targetVariantsQuery.data, mergeVariantId]);

  const sourceStock = sourceVariant?.stockQuantity ?? source?.stockQuantity ?? 0;
  const sourcePrice = sourceVariant?.price ?? source?.price ?? 0;
  const targetStock = targetMergeVariant?.stockQuantity ?? 0;
  const targetPrice = targetMergeVariant?.price ?? target?.price ?? 0;

  const mergedStock = mergeStock ? sourceStock + targetStock : targetStock;

  const resolvedPrice = useMemo(() => {
    if (mode === "new_variant") {
      if (priceChoice === "custom") {
        const parsed = Number(customPrice);
        return Number.isFinite(parsed) ? parsed : sourcePrice;
      }
      return sourcePrice;
    }
    switch (priceChoice) {
      case "keep_target":
        return targetPrice;
      case "use_source":
        return sourcePrice;
      case "highest":
        return Math.max(sourcePrice, targetPrice);
      case "lowest":
        return Math.min(sourcePrice, targetPrice);
      case "custom": {
        const parsed = Number(customPrice);
        return Number.isFinite(parsed) ? parsed : Math.max(sourcePrice, targetPrice);
      }
    }
  }, [mode, priceChoice, customPrice, sourcePrice, targetPrice]);

  const mergeOptions = useMemo(() => {
    const rows = targetVariantsQuery.data ?? [];
    return rows.map((variant) => ({
      id: variant.id,
      label: variantLabel(variant, target?.name ?? "Product"),
      price: variant.price,
      stock: variant.stockQuantity ?? 0,
    }));
  }, [targetVariantsQuery.data, target?.name]);

  const attributePreviewLabel = useMemo(() => {
    if (mode !== "new_variant") return null;
    if (valueId) {
      const hit = valueOptions.find((value) => value.id === valueId);
      if (hit) return `${selectedAttribute?.name ?? "Attr"}: ${hit.value}`;
    }
    const typed = newValueLabel.trim();
    if (typed) {
      const attrName = (selectedAttribute?.name ?? newAttributeName.trim()) || "Size";
      return `${attrName}: ${typed}`;
    }
    return null;
  }, [
    mode,
    valueId,
    valueOptions,
    selectedAttribute,
    newValueLabel,
    newAttributeName,
  ]);

  async function ensureAttributeValueId(): Promise<string | null> {
    if (valueId) return valueId;

    const trimmedValue = newValueLabel.trim();
    if (!trimmedValue) return null;

    let resolvedAttributeId = attributeId;
    if (!resolvedAttributeId) {
      const name = newAttributeName.trim() || "Size";
      const existing = attributes.find(
        (attribute) => attribute.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        resolvedAttributeId = existing.id;
      } else {
        const created = await createAttribute.mutateAsync({ name, displayType: "dropdown" });
        resolvedAttributeId = created.id;
      }
      setAttributeId(resolvedAttributeId);
    }

    const createdValue = await createValue.mutateAsync({
      attributeId: resolvedAttributeId,
      value: trimmedValue,
    });
    setValueId(createdValue.id);
    return createdValue.id;
  }

  function canGoPreview(): boolean {
    if (!source || !target) return false;
    if (mode === "merge") return Boolean(mergeVariantId);
    if (valueId) return true;
    return newValueLabel.trim().length > 0;
  }

  async function goPreview() {
    if (!canGoPreview()) {
      toast.error(
        mode === "merge"
          ? "Pick which variant to merge into."
          : "Pick or type an attribute value (e.g. 10mm).",
      );
      return;
    }
    setMergeStock(true);
    if (mode === "merge") {
      setPriceChoice(sourcePrice === targetPrice ? "keep_target" : "highest");
      setCustomPrice(String(Math.max(sourcePrice, targetPrice)));
    } else {
      setPriceChoice("keep_target");
      setCustomPrice(String(sourcePrice));
    }
    setStep("preview");
  }

  async function confirm() {
    if (!source || !target) return;

    if (priceChoice === "custom" && !Number.isFinite(Number(customPrice))) {
      toast.error("Enter a valid custom price.");
      return;
    }

    try {
      if (mode === "merge") {
        const result = await move.mutateAsync({
          sourceProductId: source.productId,
          targetProductId: target.id,
          variantId: source.variantId ?? sourceVariant?.id,
          mergeIntoVariantId: mergeVariantId,
          mergeStock,
          price: resolvedPrice,
        });
        toast.success(`Merged into ${target.name}.`);
        onClose();
        router.push(`/products/${result.productId}` as Route);
        return;
      }

      const resolvedValueId = await ensureAttributeValueId();
      if (!resolvedValueId) {
        toast.error("Pick or type an attribute value (e.g. 10mm).");
        return;
      }

      const priceChanged = Math.abs(resolvedPrice - sourcePrice) > 0.0001;
      const result = await move.mutateAsync({
        sourceProductId: source.productId,
        targetProductId: target.id,
        variantId: source.variantId ?? sourceVariant?.id,
        attributeValueIds: [resolvedValueId],
        price: priceChanged ? resolvedPrice : null,
      });
      toast.success(`Moved under ${target.name} as a variant.`);
      onClose();
      router.push(`/products/${result.productId}` as Route);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Could not move this product.";
      toast.error(message);
    }
  }

  const pending =
    move.isPending || createAttribute.isPending || createValue.isPending;

  return (
    <Dialog
      open={open && source !== null}
      onClose={onClose}
      title={step === "setup" ? "Move into product" : "Preview merge"}
      description={
        source
          ? step === "setup"
            ? `Turn “${source.productName}” into a variant under a parent — or merge into an existing variant when it’s the same size from another supplier.`
            : "Check stock and shelf price before confirming."
          : undefined
      }
      className={step === "preview" ? "max-w-xl" : undefined}
      footer={
        <div className="flex justify-end gap-2">
          {step === "preview" ? (
            <Button
              type="button"
              variant="ghost"
              icon={ArrowLeft}
              onClick={() => setStep("setup")}
              disabled={pending}
            >
              Back
            </Button>
          ) : (
            <Button type="button" variant="ghost" icon={X} onClick={onClose} disabled={pending}>
              Cancel
            </Button>
          )}
          {step === "setup" ? (
            <Button
              type="button"
              icon={GitMerge}
              onClick={() => void goPreview()}
              disabled={!target || sourceVariantsQuery.isLoading}
            >
              Review…
            </Button>
          ) : (
            <Button
              type="button"
              icon={GitMerge}
              onClick={() => void confirm()}
              disabled={pending}
            >
              {mode === "merge" ? "Confirm merge" : "Confirm move"}
            </Button>
          )}
        </div>
      }
    >
      {step === "setup" ? (
        <div className="space-y-5">
          <ProductPicker
            selected={target}
            onSelect={setTarget}
            search={search}
            label="Parent product"
          />

          <fieldset className="space-y-2">
            <legend className="text-caption font-medium text-ink-muted">How</legend>
            <div className="flex flex-wrap gap-2">
              <ModeChip
                active={mode === "new_variant"}
                onClick={() => setMode("new_variant")}
                label="New variant"
              />
              <ModeChip
                active={mode === "merge"}
                onClick={() => setMode("merge")}
                label="Merge into existing"
              />
            </div>
          </fieldset>

          {mode === "new_variant" ? (
            <div className="space-y-3">
              <Field label="Attribute">
                <select
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body"
                  value={attributeId}
                  onChange={(event) => {
                    setAttributeId(event.target.value);
                    setValueId("");
                  }}
                >
                  <option value="">Create or pick…</option>
                  {attributes.map((attribute) => (
                    <option key={attribute.id} value={attribute.id}>
                      {attribute.name}
                    </option>
                  ))}
                </select>
              </Field>
              {!attributeId ? (
                <Field label="New attribute name">
                  <Input
                    value={newAttributeName}
                    onChange={(event) => setNewAttributeName(event.target.value)}
                    placeholder="Size"
                  />
                </Field>
              ) : null}
              <Field label="Value">
                {valueOptions.length > 0 ? (
                  <select
                    className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body"
                    value={valueId}
                    onChange={(event) => setValueId(event.target.value)}
                  >
                    <option value="">Pick or type below…</option>
                    {valueOptions.map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.value}
                      </option>
                    ))}
                  </select>
                ) : null}
              </Field>
              {!valueId ? (
                <Field label={valueOptions.length > 0 ? "Or type a new value" : "Value"}>
                  <Input
                    value={newValueLabel}
                    onChange={(event) => setNewValueLabel(event.target.value)}
                    placeholder="10mm"
                  />
                </Field>
              ) : null}
            </div>
          ) : (
            <Field label="Target variant">
              {!target ? (
                <p className="text-caption text-ink-muted">Pick a parent product first.</p>
              ) : targetVariantsQuery.isLoading ? (
                <p className="text-caption text-ink-muted">Loading variants…</p>
              ) : mergeOptions.length === 0 ? (
                <p className="text-caption text-ink-muted">
                  No variants on that product yet — use New variant instead.
                </p>
              ) : (
                <select
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body"
                  value={mergeVariantId}
                  onChange={(event) => setMergeVariantId(event.target.value)}
                >
                  <option value="">Select…</option>
                  {mergeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} · {option.price.toFixed(2)} · stock{" "}
                      {formatQuantity(option.stock)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>
      ) : (
        <PreviewBody
          sourceName={source?.productName ?? ""}
          targetName={target?.name ?? ""}
          mode={mode}
          attributeLabel={attributePreviewLabel}
          mergeVariantLabel={
            targetMergeVariant
              ? variantLabel(targetMergeVariant, target?.name ?? "Product")
              : null
          }
          sourceStock={sourceStock}
          targetStock={targetStock}
          mergedStock={mergedStock}
          mergeStock={mergeStock}
          onMergeStockChange={setMergeStock}
          sourcePrice={sourcePrice}
          targetPrice={targetPrice}
          resolvedPrice={resolvedPrice}
          priceChoice={priceChoice}
          onPriceChoiceChange={setPriceChoice}
          customPrice={customPrice}
          onCustomPriceChange={setCustomPrice}
        />
      )}
    </Dialog>
  );
}

function PreviewBody({
  sourceName,
  targetName,
  mode,
  attributeLabel,
  mergeVariantLabel,
  sourceStock,
  targetStock,
  mergedStock,
  mergeStock,
  onMergeStockChange,
  sourcePrice,
  targetPrice,
  resolvedPrice,
  priceChoice,
  onPriceChoiceChange,
  customPrice,
  onCustomPriceChange,
}: {
  sourceName: string;
  targetName: string;
  mode: Mode;
  attributeLabel: string | null;
  mergeVariantLabel: string | null;
  sourceStock: number;
  targetStock: number;
  mergedStock: number;
  mergeStock: boolean;
  onMergeStockChange: (value: boolean) => void;
  sourcePrice: number;
  targetPrice: number;
  resolvedPrice: number;
  priceChoice: PriceChoice;
  onPriceChoiceChange: (value: PriceChoice) => void;
  customPrice: string;
  onCustomPriceChange: (value: string) => void;
}) {
  const pricesDiffer = Math.abs(sourcePrice - targetPrice) > 0.0001;

  return (
    <div className="space-y-5">
      <div className="rounded-sm border border-border bg-paper px-3 py-3 text-body">
        <p className="font-semibold text-ink">{sourceName}</p>
        <p className="mt-1 text-caption text-ink-muted">
          {mode === "merge" ? (
            <>
              Merge into <span className="font-medium text-ink">{targetName}</span>
              {mergeVariantLabel ? (
                <>
                  {" "}
                  · <span className="text-ink">{mergeVariantLabel}</span>
                </>
              ) : null}
            </>
          ) : (
            <>
              Move under <span className="font-medium text-ink">{targetName}</span>
              {attributeLabel ? (
                <>
                  {" "}
                  as <span className="text-ink">{attributeLabel}</span>
                </>
              ) : null}
            </>
          )}
        </p>
      </div>

      {mode === "merge" ? (
        <section className="space-y-3">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
            Stock
          </h3>
          <div className="grid grid-cols-2 gap-3 text-body sm:grid-cols-3">
            <Stat label="Moving from" value={formatQuantity(sourceStock)} />
            <Stat label="Already on target" value={formatQuantity(targetStock)} />
            <Stat
              label="After confirm"
              value={formatQuantity(mergedStock)}
              emphasize
            />
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-border px-3 py-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={mergeStock}
              onChange={(event) => onMergeStockChange(event.target.checked)}
            />
            <span>
              <span className="block font-medium text-ink">Also merge stock</span>
              <span className="mt-0.5 block text-caption text-ink-muted">
                {mergeStock
                  ? `Add ${formatQuantity(sourceStock)} onto the target (${formatQuantity(targetStock)} → ${formatQuantity(mergedStock)}).`
                  : `Keep target at ${formatQuantity(targetStock)}. Source stock is cleared, not transferred.`}
              </span>
            </span>
          </label>
        </section>
      ) : (
        <section className="space-y-3">
          <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
            Stock
          </h3>
          <p className="text-body text-ink-muted">
            <span className="font-semibold text-ink">{formatQuantity(sourceStock)}</span>{" "}
            moves with this variant (same UUID — sales history stays).
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
          Shelf price
        </h3>
        {mode === "merge" ? (
          <>
            <div className="grid grid-cols-2 gap-3 text-body sm:grid-cols-3">
              <Stat label="Source" value={<Money value={sourcePrice} />} />
              <Stat label="Target" value={<Money value={targetPrice} />} />
              <Stat label="Result" value={<Money value={resolvedPrice} />} emphasize />
            </div>
            {pricesDiffer ? (
              <p className="text-caption text-ink-muted">
                Prices differ — pick which shelf price the merged variant keeps.
              </p>
            ) : (
              <p className="text-caption text-ink-muted">Both already at the same price.</p>
            )}
            <div className="space-y-2">
              <PriceRadio
                checked={priceChoice === "highest"}
                onChange={() => onPriceChoiceChange("highest")}
                label={
                  <>
                    Use highest (<Money value={Math.max(sourcePrice, targetPrice)} />)
                  </>
                }
              />
              <PriceRadio
                checked={priceChoice === "lowest"}
                onChange={() => onPriceChoiceChange("lowest")}
                label={
                  <>
                    Use lowest (<Money value={Math.min(sourcePrice, targetPrice)} />)
                  </>
                }
              />
              <PriceRadio
                checked={priceChoice === "keep_target"}
                onChange={() => onPriceChoiceChange("keep_target")}
                label={
                  <>
                    Keep target (<Money value={targetPrice} />)
                  </>
                }
              />
              <PriceRadio
                checked={priceChoice === "use_source"}
                onChange={() => onPriceChoiceChange("use_source")}
                label={
                  <>
                    Use source (<Money value={sourcePrice} />)
                  </>
                }
              />
              <PriceRadio
                checked={priceChoice === "custom"}
                onChange={() => onPriceChoiceChange("custom")}
                label="Custom price"
              />
            </div>
            {priceChoice === "custom" ? (
              <Field label="Custom shelf price">
                <MoneyInput
                  value={customPrice}
                  onChange={(event) => onCustomPriceChange(event.target.value)}
                />
              </Field>
            ) : null}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Current" value={<Money value={sourcePrice} />} />
              <Stat label="After move" value={<Money value={resolvedPrice} />} emphasize />
            </div>
            <div className="space-y-2">
              <PriceRadio
                checked={priceChoice !== "custom"}
                onChange={() => onPriceChoiceChange("keep_target")}
                label={
                  <>
                    Keep current (<Money value={sourcePrice} />)
                  </>
                }
              />
              <PriceRadio
                checked={priceChoice === "custom"}
                onChange={() => onPriceChoiceChange("custom")}
                label="Set a different price"
              />
            </div>
            {priceChoice === "custom" ? (
              <Field label="Shelf price after move">
                <MoneyInput
                  value={customPrice}
                  onChange={(event) => onCustomPriceChange(event.target.value)}
                />
              </Field>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-sm border px-3 py-2",
        emphasize ? "border-primary/40 bg-primary-tint" : "border-border bg-surface",
      ].join(" ")}
    >
      <p className="text-caption text-ink-muted">{label}</p>
      <p className={`mt-0.5 num font-semibold ${emphasize ? "text-primary" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

function PriceRadio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-body text-ink">
      <input type="radio" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function ModeChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-sm border px-3 py-1.5 text-caption font-medium transition-colors",
        active
          ? "border-primary bg-primary-tint text-primary"
          : "border-border bg-surface text-ink-muted hover:bg-paper",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function variantLabel(variant: ProductVariant, productName: string): string {
  const combo = variant.attributeValues
    .map((value) => value.value)
    .filter(Boolean)
    .join(" / ");
  if (variant.isDefault && !combo) return `${productName} (default)`;
  if (combo) return `${productName} — ${combo}`;
  return variant.sku ? `${productName} · ${variant.sku}` : productName;
}
