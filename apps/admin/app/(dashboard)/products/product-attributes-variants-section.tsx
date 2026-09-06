"use client";

import { useState } from "react";
import {
  Boxes,
  ChevronDown,
  ExternalLink,
  Layers,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@double-a/shared-types";
import type { CompanyAttribute, ProductVariant, VariantSupplierLink } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Combobox,
  Field,
  IconButton,
  Input,
  MoneyInput,
  Money,
  Select,
} from "@/components/ui";
import { Dialog } from "@/components/overlay";
import {
  useAddProductVariantSupplier,
  useAttachProductAttribute,
  useCompanyAttributes,
  useCreateCompanyAttribute,
  useCreateCompanyAttributeValue,
  useDeleteCompanyAttributeValue,
  useDeleteProductVariant,
  useDetachProductAttribute,
  useGenerateProductVariants,
  useProductAttributes,
  useProductVariants,
  useRemoveProductVariantSupplier,
  useUpdateProductVariant,
  useUpdateProductVariantSupplier,
} from "@/lib/query/attributes";
import { useAdjustProductStock } from "@/lib/query/products";
import { useLocations } from "@/lib/query/locations";
import { useSuppliers } from "@/lib/query/suppliers";
import { useSkuAvailability } from "@/lib/use-sku-check";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function AttributeValueBadge({
  value,
  onRemove,
}: {
  value: { id: string; value: string };
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-canvas px-2 text-caption">
      {value.value}
      <button type="button" onClick={onRemove} aria-label={`Remove ${value.value}`} className="text-ink-muted hover:text-danger">
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  );
}

function AttachedAttributeCard({ productId, attribute }: { productId: string; attribute: CompanyAttribute }) {
  const [newValue, setNewValue] = useState("");
  const createValue = useCreateCompanyAttributeValue();
  const deleteValue = useDeleteCompanyAttributeValue();
  const detach = useDetachProductAttribute(productId);

  function addValue() {
    const value = newValue.trim();
    if (!value) return;
    createValue.mutate(
      { attributeId: attribute.id, value },
      {
        onSuccess: () => setNewValue(""),
        onError: (error) => toast.error(errorMessage(error, "Could not add that value.")),
      },
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body font-medium text-ink">{attribute.name}</p>
        <IconButton
          icon={Trash2}
          label={`Remove ${attribute.name} from this product`}
          tone="danger"
          onClick={() => detach.mutate(attribute.id, {
            onError: (error) => toast.error(errorMessage(error, "Could not remove this choice.")),
          })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {attribute.values.map((value) => (
          <AttributeValueBadge
            key={value.id}
            value={value}
            onRemove={() =>
              deleteValue.mutate(value.id, {
                onError: (error) => toast.error(errorMessage(error, "Could not remove this value.")),
              })
            }
          />
        ))}
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Input
            value={newValue}
            onChange={(event) => setNewValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addValue();
              }
            }}
            placeholder="Add value…"
            className="h-7 w-28 text-caption"
          />
          <IconButton icon={Plus} label="Add value" onClick={addValue} disabled={!newValue.trim()} />
        </span>
      </div>
    </div>
  );
}

/**
 * One row per linked supplier — its own editable Supplier SKU (with its own
 * realtime duplicate check) and price, a "make default" action, and remove.
 * No "which supplier does this belong to" ambiguity the way a single
 * product/variant-level supplier_sku column used to have: this row already
 * knows exactly which supplier it's for.
 */
function VariantSupplierLinkRow({ productId, link }: { productId: string; link: VariantSupplierLink }) {
  const update = useUpdateProductVariantSupplier(productId);
  const remove = useRemoveProductVariantSupplier(productId);
  const [sku, setSku] = useState(link.supplierSku ?? "");
  const [price, setPrice] = useState(link.supplierPrice !== null ? String(link.supplierPrice) : "");

  const skuCheck = useSkuAvailability({
    kind: "supplier_sku",
    value: sku,
    supplierId: link.supplierId,
    excludePivotId: link.id,
  });

  function saveSku() {
    update.mutate(
      { linkId: link.id, supplierSku: sku.trim() || null },
      { onError: (error) => toast.error(errorMessage(error, "Could not save this supplier's code.")) },
    );
  }

  function savePrice() {
    const trimmed = price.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (null !== parsed && !Number.isFinite(parsed)) return;
    update.mutate(
      { linkId: link.id, supplierPrice: parsed },
      { onError: (error) => toast.error(errorMessage(error, "Could not save this supplier's price.")) },
    );
  }

  function makeDefault() {
    update.mutate(
      { linkId: link.id, isDefault: true },
      { onError: (error) => toast.error(errorMessage(error, "Could not set this as the default supplier.")) },
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-2.5 rounded-sm border border-border bg-canvas px-3 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 self-center">
        <span className="truncate text-body font-medium text-ink">{link.supplierName ?? "Unknown supplier"}</span>
        <a
          href={`/suppliers/${link.supplierId}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${link.supplierName ?? "supplier"} in a new tab`}
          className="text-ink-muted transition-colors hover:text-primary"
        >
          <ExternalLink size={13} strokeWidth={2} />
        </a>
        {link.isDefault ? (
          <Badge tone="success">Default</Badge>
        ) : (
          <button
            type="button"
            onClick={makeDefault}
            disabled={update.isPending}
            className="text-caption text-ink-muted underline-offset-2 hover:text-primary hover:underline disabled:opacity-50"
          >
            Make default
          </button>
        )}
      </div>
      <div className="w-36 shrink-0">
        <Input
          value={sku}
          onChange={(event) => setSku(event.target.value)}
          onBlur={saveSku}
          placeholder="Supplier SKU"
          className="h-9"
        />
        {skuCheck.conflict ? (
          <p className="mt-1 text-[11px] text-danger">Already used by {skuCheck.conflict.name}.</p>
        ) : skuCheck.checking ? (
          <p className="mt-1 text-[11px] text-ink-muted">Checking…</p>
        ) : null}
      </div>
      <div className="w-28 shrink-0">
        <MoneyInput
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          onBlur={savePrice}
          className="h-9"
        />
      </div>
      <IconButton
        icon={X}
        label={`Remove ${link.supplierName ?? "supplier"}`}
        tone="danger"
        disabled={remove.isPending}
        onClick={() =>
          remove.mutate(link.id, {
            onError: (error) => toast.error(errorMessage(error, "Could not remove this supplier.")),
          })
        }
      />
    </div>
  );
}

/**
 * Which suppliers carry this exact variant, and at what SKU/price each —
 * separate from the product's own catalogue data. A t-shirt's Red/L might
 * come from a different supplier (and code) than its Blue/S, and the same
 * variant can be sourced from more than one supplier at once.
 */
function VariantSupplierLinksEditor({
  productId,
  variant,
}: {
  productId: string;
  variant: ProductVariant;
}) {
  const suppliersQuery = useSuppliers();
  const add = useAddProductVariantSupplier(productId);
  const [picking, setPicking] = useState("");

  const linkedSupplierIds = new Set(variant.suppliers.map((link) => link.supplierId));
  const available = (suppliersQuery.data ?? []).filter((supplier) => !linkedSupplierIds.has(supplier.id));

  function addSupplier(supplierId: string) {
    if (!supplierId) return;
    add.mutate(
      { variantId: variant.id, supplierId },
      { onError: (error) => toast.error(errorMessage(error, "Could not add this supplier.")) },
    );
    setPicking("");
  }

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex shrink-0 items-center gap-1.5 text-body font-medium text-ink">
          <Truck size={16} strokeWidth={2} />
          Suppliers
        </span>
        <Combobox
          value={picking}
          onChange={addSupplier}
          placeholder={add.isPending ? "Adding…" : "Add a supplier…"}
          disabled={add.isPending}
          emptyLabel={
            suppliersQuery.data?.length === 0
              ? "No suppliers on file yet."
              : available.length === 0
                ? "Every supplier is already linked."
                : "No matches."
          }
          options={available.map((supplier) => ({
            value: supplier.id,
            label: supplier.name,
            sublabel: supplier.contactPerson ?? supplier.phone ?? undefined,
          }))}
          className="w-64"
        />
      </div>
      <div className="space-y-2">
        {variant.suppliers.map((link) => (
          <VariantSupplierLinkRow key={link.id} productId={productId} link={link} />
        ))}
        {variant.suppliers.length === 0 ? (
          <p className="text-body text-ink-muted">No suppliers linked yet.</p>
        ) : null}
      </div>
    </div>
  );
}

const STOCK_ADJUST_MODES = [
  { key: "in", label: "Add stock", reason: "restock" as const },
  { key: "out", label: "Remove stock", reason: "adjustment" as const },
] as const;

/**
 * Second, narrower entry point to the same adjust-stock action the
 * /inventory page's own restock/adjust flow calls — reachable right from
 * the variant it targets, so a merchant never has to leave the product page
 * to correct a count. "Set counted total" mode stays /inventory-only: that
 * flow already has this location's current quantity loaded to compute the
 * delta from, which this compact widget doesn't fetch.
 */
function VariantStockButton({
  productId,
  variantId,
  variantLabel,
}: {
  productId: string;
  variantId: string;
  variantLabel: string;
}) {
  const locationsQuery = useLocations({ type: "branch" });
  const adjustStock = useAdjustProductStock(productId);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<(typeof STOCK_ADJUST_MODES)[number]["key"]>("in");
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  function openDialog() {
    setMode("in");
    setLocationId(locationsQuery.data?.[0]?.id ?? "");
    setQuantity("");
    setNote("");
    setOpen(true);
  }

  function submit() {
    const magnitude = Number(quantity);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }
    if (!locationId) {
      toast.error("Choose a branch.");
      return;
    }

    const preset = STOCK_ADJUST_MODES.find((option) => option.key === mode);
    adjustStock.mutate(
      {
        changeQuantity: mode === "out" ? -magnitude : magnitude,
        reason: preset?.reason ?? "adjustment",
        locationId,
        variantId,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Stock updated.");
          setOpen(false);
        },
        onError: (error) => toast.error(errorMessage(error, "Could not adjust stock.")),
      },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1.5 text-caption text-primary hover:underline"
      >
        <Boxes size={13} strokeWidth={2} className="shrink-0" />
        Adjust stock
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Adjust stock"
        description={`${variantLabel} — records a movement, same as Inventory.`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {STOCK_ADJUST_MODES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMode(option.key)}
                className={`rounded-sm border px-3 py-2 text-body font-medium transition-colors ${
                  mode === option.key
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-surface text-ink hover:bg-canvas"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Field label="Branch" required>
            <Select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
              <option value="">Choose branch</option>
              {(locationsQuery.data ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity" required>
            <Input
              type="number"
              min="0.001"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field label="Note" required={false}>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" loading={adjustStock.isPending} onClick={submit}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Below a variant row's SKU cell — the 3s-debounced realtime duplicate check's result. */
function RowSkuFeedback({
  checking,
  conflict,
}: {
  checking: boolean;
  conflict: { name: string } | null;
}) {
  if (conflict) {
    return (
      <p className="mt-1 w-32 text-[11px] text-danger">
        This SKU is already used by {conflict.name}.
      </p>
    );
  }
  if (checking) {
    return <p className="mt-1 text-[11px] text-ink-muted">Checking…</p>;
  }
  return null;
}

const HALF_ROW = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 max-sm:grid-cols-1";
const HALF_CELL = "min-w-0 w-full";

/**
 * One collapsible card per variant — same interaction pattern as receiving's
 * ReceivingLineAccordion (collapsed summary row, click to expand into a
 * roomy two-column field grid), swapped in for a cramped table row so each
 * variant's SKU/price/supplier fields have real space.
 */
function VariantAccordionRow({
  productId,
  variant,
  expanded,
  onToggle,
}: {
  productId: string;
  variant: ProductVariant;
  expanded: boolean;
  onToggle: () => void;
}) {
  const update = useUpdateProductVariant(productId);
  const remove = useDeleteProductVariant(productId);
  const [sku, setSku] = useState(variant.sku ?? "");
  const [barcode, setBarcode] = useState(variant.barcode ?? "");
  const [price, setPrice] = useState(String(variant.price));
  const [costPrice, setCostPrice] = useState(String(variant.costPrice));

  function saveField(patch: Omit<Parameters<typeof update.mutate>[0], "variantId">) {
    update.mutate(
      { variantId: variant.id, ...patch },
      { onError: (error) => toast.error(errorMessage(error, "Could not save this variant.")) },
    );
  }

  const skuCheck = useSkuAvailability({ kind: "sku", value: sku, excludeVariantId: variant.id });

  const label = variant.attributeValues.map((v) => v.value).filter(Boolean).join(" / ") || "—";

  return (
    <div
      className={`origin-center rounded-md border transition-[transform,box-shadow,border-color] duration-200 ease-out motion-reduce:transition-none ${
        variant.isActive ? "border-border bg-surface" : "border-border bg-canvas opacity-70"
      } ${
        !expanded
          ? "hover:border-primary/40 hover:shadow-sm"
          : "border-primary/30"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-paper/80"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">{label}</p>
          <p className="mt-0.5 truncate text-caption text-ink-muted">
            {[sku || "No SKU", `Cost ${costPrice}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Money value={variant.price} className="shrink-0 text-body font-semibold" />
        {!variant.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
        <ChevronDown
          size={16}
          strokeWidth={2}
          className={`shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div className={HALF_ROW}>
            <div className={HALF_CELL}>
              <Field label="SKU">
                <Input
                  value={sku}
                  onChange={(event) => setSku(event.target.value)}
                  onBlur={() => saveField({ sku: sku.trim() || null })}
                />
              </Field>
              <RowSkuFeedback checking={skuCheck.checking} conflict={skuCheck.conflict} />
            </div>
            <div className={HALF_CELL}>
              <Field label="Barcode">
                <Input
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  onBlur={() => saveField({ barcode: barcode.trim() || null })}
                />
              </Field>
            </div>
          </div>

          <div className={HALF_ROW}>
            <div className={HALF_CELL}>
              <Field label="Shelf price">
                <MoneyInput
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  onBlur={() => {
                    const parsed = Number(price);
                    if (Number.isFinite(parsed)) saveField({ price: parsed });
                  }}
                />
              </Field>
            </div>
            <div className={HALF_CELL}>
              <Field label="Supplier price">
                <MoneyInput
                  type="number"
                  step="0.01"
                  min="0"
                  value={costPrice}
                  onChange={(event) => setCostPrice(event.target.value)}
                  onBlur={() => {
                    const parsed = Number(costPrice);
                    if (Number.isFinite(parsed)) saveField({ costPrice: parsed });
                  }}
                />
              </Field>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <VariantSupplierLinksEditor productId={productId} variant={variant} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <VariantStockButton productId={productId} variantId={variant.id} variantLabel={label} />
            <Button
              type="button"
              variant="danger"
              icon={Trash2}
              onClick={() =>
                remove.mutate(variant.id, {
                  onError: (error) => toast.error(errorMessage(error, "Could not delete this variant.")),
                })
              }
            >
              Delete variant
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GenerateVariantsForm({ productId, attributes }: { productId: string; attributes: CompanyAttribute[] }) {
  const generate = useGenerateProductVariants(productId);
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  function toggleValue(attributeId: string, valueId: string) {
    setSelected((prev) => {
      const current = prev[attributeId] ?? [];
      const next = current.includes(valueId)
        ? current.filter((id) => id !== valueId)
        : [...current, valueId];
      return { ...prev, [attributeId]: next };
    });
  }

  async function onGenerate() {
    const attributeSelections = attributes
      .map((attribute) => ({ companyAttributeId: attribute.id, valueIds: selected[attribute.id] ?? [] }))
      .filter((entry) => entry.valueIds.length > 0);

    if (attributeSelections.length !== attributes.length) {
      toast.error("Pick at least one value for every choice before generating.");
      return;
    }

    try {
      const created = await generate.mutateAsync(attributeSelections);
      toast.success(
        created.length > 0
          ? `Created ${created.length} new variant${created.length === 1 ? "" : "s"}.`
          : "Every combination already exists.",
      );
    } catch (error) {
      toast.error(errorMessage(error, "Could not generate variants."));
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border p-3">
      {attributes.map((attribute) => (
        <div key={attribute.id}>
          <p className="mb-1 text-caption font-medium text-ink-muted">{attribute.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {attribute.values.map((value) => {
              const active = (selected[attribute.id] ?? []).includes(value.id);
              return (
                <button
                  key={value.id}
                  type="button"
                  onClick={() => toggleValue(attribute.id, value.id)}
                  className={`rounded-sm border px-2 py-1 text-caption transition-colors ${
                    active
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface text-ink hover:bg-canvas"
                  }`}
                >
                  {value.value}
                </button>
              );
            })}
            {attribute.values.length === 0 ? (
              <span className="text-caption text-ink-muted">No values yet — add some above first.</span>
            ) : null}
          </div>
        </div>
      ))}
      <Button type="button" icon={Sparkles} loading={generate.isPending} onClick={onGenerate}>
        Generate variants
      </Button>
    </div>
  );
}

export function ProductAttributesAndVariantsSection({ product }: { product: Product }) {
  const allAttributesQuery = useCompanyAttributes();
  const attachedQuery = useProductAttributes(product.id);
  const variantsQuery = useProductVariants(product.id);
  const attach = useAttachProductAttribute(product.id);
  const createAttribute = useCreateCompanyAttribute();
  const [pickerValue, setPickerValue] = useState("");
  const [expandedVariantKey, setExpandedVariantKey] = useState<string | null>(null);

  const attached = attachedQuery.data ?? [];
  const attachedIds = new Set(attached.map((a) => a.id));
  const availableToAttach = (allAttributesQuery.data ?? []).filter((a) => !attachedIds.has(a.id));
  const nonDefaultVariants = (variantsQuery.data ?? []).filter((v) => !v.isDefault);
  const defaultVariant = (variantsQuery.data ?? []).find((v) => v.isDefault);

  function onAttachExisting(id: string) {
    if (!id) return;
    attach.mutate(id, {
      onSuccess: () => setPickerValue(""),
      onError: (error) => toast.error(errorMessage(error, "Could not attach this choice.")),
    });
  }

  function onCreateAndAttach(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    createAttribute.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => {
          attach.mutate(created.id, {
            onError: (error) => toast.error(errorMessage(error, "Could not attach this choice.")),
          });
        },
        onError: (error) => toast.error(errorMessage(error, "Could not create that choice.")),
      },
    );
  }

  return (
    <Card>
      <CardHeader
        icon={Tag}
        title="Variants"
        description="Size, color, or anything else this product varies by. Leave empty for a simple product — price and cost above still apply directly."
      />
      <CardBody className="space-y-4">
        {attached.length > 0 ? (
          <div className="space-y-3">
            {attached.map((attribute) => (
              <AttachedAttributeCard key={attribute.id} productId={product.id} attribute={attribute} />
            ))}
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-sm rounded-md border border-dashed border-success/50 bg-success/5 px-4 py-4">
          <Field label="Add a choice" hint="Pick an existing one, or type a new name to create it.">
            <Combobox
              value={pickerValue}
              onChange={(value) => {
                setPickerValue(value);
                onAttachExisting(value);
              }}
              placeholder="Choose or type to create"
              options={availableToAttach.map((a) => ({ value: a.id, label: a.name }))}
              creatable
              createOptionLabel={(typed) => `“${typed}” doesn't exist — create it`}
              onCreate={onCreateAndAttach}
            />
          </Field>
        </div>

        {attached.length === 0 && defaultVariant ? (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="mx-auto max-w-sm">
              <VariantSupplierLinksEditor productId={product.id} variant={defaultVariant} />
            </div>
            <div className="flex justify-center">
              <VariantStockButton
                productId={product.id}
                variantId={defaultVariant.id}
                variantLabel={product.name}
              />
            </div>
          </div>
        ) : null}

        {attached.length > 0 ? (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-ink-muted" />
              <p className="text-body font-medium text-ink">Combinations</p>
            </div>

            {nonDefaultVariants.length > 0 ? (
              <div className="space-y-2">
                {nonDefaultVariants.map((variant) => (
                  <VariantAccordionRow
                    key={variant.id}
                    productId={product.id}
                    variant={variant}
                    expanded={expandedVariantKey === variant.id}
                    onToggle={() =>
                      setExpandedVariantKey((current) => (current === variant.id ? null : variant.id))
                    }
                  />
                ))}
              </div>
            ) : null}

            <GenerateVariantsForm productId={product.id} attributes={attached} />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
