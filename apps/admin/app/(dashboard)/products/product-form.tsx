"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Clock,
  FileText,
  History,
  ImageOff,
  Info,
  Layers,
  Package,
  Plus,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@double-a/shared-types";
import {
  defaultAllowDecimal,
  formatMoney,
  formatPercent,
  isProductUnit,
  marginPercent,
  PRODUCT_UNITS,
  shelfPriceFromMarkup,
  UNIT_LABELS,
} from "@double-a/shared-types";
import {
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Combobox,
  ErrorNote,
  Field,
  FileInput,
  IconButton,
  Input,
  Money,
  MoneyInput,
  Select,
  SuccessNote,
  Textarea,
} from "@/components/ui";
import { indentLabel, type CategoryOption } from "@/lib/category-options";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { isImageFile, NOT_AN_IMAGE_MESSAGE } from "@/lib/is-image-file";
import { useLocations } from "@/lib/query/locations";
import { useProductVariants } from "@/lib/query/attributes";
import {
  useAssembleBundle,
  useClaimNextSku,
  useDeleteProductPhoto,
  useInvalidateProducts,
  useProducts,
  useSetBundleItems,
  useUploadProductPhoto,
} from "@/lib/query/products";
import { useSkuAvailability } from "@/lib/use-sku-check";
import { saveProduct } from "./actions";
import { ProductActivitySection } from "./product-activity-section";
import { ProductAddonGroupsSection } from "./product-addon-groups-section";
import { ProductAttributesAndVariantsSection } from "./product-attributes-variants-section";
import { ProductInventorySection } from "./product-inventory-section";

const PRODUCT_FORM_TABS = [
  { id: "details", label: "Details", icon: FileText },
  { id: "variants", label: "Variants", icon: Layers },
  { id: "addons", label: "Add-ons", icon: Tag },
  { id: "inventory", label: "Inventory", icon: History },
  { id: "activity", label: "Activity", icon: Clock },
] as const;

type ProductFormTab = (typeof PRODUCT_FORM_TABS)[number]["id"];

interface BundleRow {
  key: string;
  productId: string;
  quantity: string;
}

function newRowKey(): string {
  return Math.random().toString(36).slice(2);
}

function emptyBundleRow(): BundleRow {
  return { key: newRowKey(), productId: "", quantity: "1" };
}

/**
 * The recipe editor — component picker + quantity per row, same shape as
 * the stock-transfers multi-row form. Bundles and the product itself are
 * excluded from the picker: no nested bundles, no self-reference.
 */
function BundleItemsEditor({
  rows,
  onChange,
  excludeProductId,
}: {
  rows: BundleRow[];
  onChange: (rows: BundleRow[]) => void;
  excludeProductId?: string;
}) {
  const productsQuery = useProducts({ includeInactive: false, pageSize: 200 });
  const candidates = (productsQuery.data?.products ?? []).filter(
    (candidate) => !candidate.isBundle && candidate.id !== excludeProductId,
  );

  function updateRow(key: string, patch: Partial<BundleRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    onChange([...rows, emptyBundleRow()]);
  }

  function removeRow(key: string) {
    onChange(rows.length > 1 ? rows.filter((row) => row.key !== key) : rows);
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <span className="text-caption font-medium text-ink-muted">
        Components
      </span>
      {rows.map((row) => {
        const usedElsewhere = new Set(
          rows
            .filter((other) => other.key !== row.key && other.productId)
            .map((other) => other.productId),
        );
        return (
          <div key={row.key} className="flex items-start gap-2">
            <div className="w-full">
              <Combobox
                value={row.productId}
                onChange={(productId) => updateRow(row.key, { productId })}
                placeholder={
                  productsQuery.isPending
                    ? "Loading products…"
                    : "Select product"
                }
                emptyLabel="Every matching product is already on another row."
                options={candidates
                  .filter((candidate) => !usedElsewhere.has(candidate.id))
                  .map((candidate) => ({
                    value: candidate.id,
                    label: candidate.name,
                  }))}
              />
            </div>
            <div className="w-28 shrink-0">
              <Input
                type="number"
                min="0.001"
                step="any"
                placeholder="Qty"
                value={row.quantity}
                onChange={(event) =>
                  updateRow(row.key, { quantity: event.target.value })
                }
              />
            </div>
            <IconButton
              icon={Trash2}
              label="Remove component"
              tone="danger"
              disabled={rows.length === 1}
              onClick={() => removeRow(row.key)}
            />
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={Plus}
        onClick={addRow}
      >
        Add another component
      </Button>
    </div>
  );
}

/**
 * Stock isn't editable here — it only moves through Inventory (or, for a
 * bundle, through Assemble below). One assemble converts component stock
 * into bundle stock at one location; it's a live mutation, not part of the
 * surrounding form's submit, since it needs its own success/error toast.
 */
function AssembleBundleSection({ product }: { product: Product }) {
  const assemble = useAssembleBundle();
  const locationsQuery = useLocations({ type: "branch" });
  const branches = locationsQuery.data ?? [];
  const [quantity, setQuantity] = useState("1");
  const [locationId, setLocationId] = useState("");

  async function onAssemble() {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be greater than zero.");
      return;
    }
    if (!locationId) {
      toast.error("Choose a location.");
      return;
    }
    try {
      const updated = await assemble.mutateAsync({
        id: product.id,
        quantity: qty,
        locationId,
      });
      toast.success(`Assembled ${qty}× ${updated.name}.`);
      setQuantity("1");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not assemble this bundle.",
      );
    }
  }

  return (
    <Card>
      <CardHeader
        title="Assemble"
        description="Converts component stock into bundle stock at one location, right now."
      />
      <CardBody>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quantity to assemble" required>
            <Input
              type="number"
              min="0.001"
              step="any"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field label="Location" required>
            <Select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">Choose branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              icon={Package}
              loading={assemble.isPending}
              onClick={onAssemble}
              className="w-full"
            >
              Assemble
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Below the SKU field — the 3s-debounced realtime duplicate check's result. */
function SkuFeedback({
  checking,
  conflict,
}: {
  checking: boolean;
  conflict: { name: string } | null;
}) {
  if (conflict) {
    return (
      <p className="mt-1 text-caption text-danger">
        This SKU is already used by {conflict.name}.
      </p>
    );
  }
  if (checking) {
    return <p className="mt-1 text-caption text-ink-muted">Checking…</p>;
  }
  return null;
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </CardBody>
    </Card>
  );
}

/**
 * Editing an existing product uploads immediately on file pick (own
 * mutation, not part of the surrounding form's submit) — same reasoning as
 * the toggle buttons elsewhere in admin: an ApiError needs to reach a toast
 * directly, not Next's generic error boundary. Server resizes + converts to
 * WebP; nothing happens client-side.
 *
 * Creating a new product has no id to upload against yet, so the picked
 * file is held here and handed back to the parent form via
 * onPendingFileChange — it uploads once saveProduct returns the new id.
 */
function ProductPhotoSection({
  product,
  pendingFile,
  onPendingFileChange,
}: {
  product?: Product;
  pendingFile?: File | null;
  onPendingFileChange?: (file: File | null) => void;
}) {
  const uploadPhoto = useUploadProductPhoto();
  const deletePhoto = useDeleteProductPhoto();
  const [preview, setPreview] = useState<string | null>(null);
  const busy = uploadPhoto.isPending || deletePhoto.isPending;

  const pendingPreview = pendingFile ? URL.createObjectURL(pendingFile) : null;
  const shown = product ? (preview ?? product.photoUrl) : pendingPreview;

  function onPick(file: File | undefined) {
    if (!file) return;

    if (!isImageFile(file)) {
      toast.error(NOT_AN_IMAGE_MESSAGE);
      return;
    }

    if (!product) {
      onPendingFileChange?.(file);
      return;
    }

    setPreview(URL.createObjectURL(file));
    uploadPhoto.mutate(
      { id: product.id, photo: file },
      {
        onSuccess: () => toast.success("Photo updated."),
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not upload this photo.",
          ),
        onSettled: () => setPreview(null),
      },
    );
  }

  function onRemove() {
    if (!product) {
      onPendingFileChange?.(null);
      return;
    }
    deletePhoto.mutate(product.id, {
      onSuccess: () => toast.success("Photo removed."),
      onError: (error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not remove this photo.",
        ),
    });
  }

  return (
    <Card>
      <CardHeader
        title="Photo"
        description="Shown on mobile terminals and the product list. Resized and converted automatically."
      />
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-paper">
            {shown ? (
              // Plain img: the URL is an arbitrary MinIO/S3 host, same reasoning as the store logo.
              <img src={shown} alt="" className="size-full object-cover" />
            ) : (
              <Camera size={22} strokeWidth={2} className="text-ink-muted" />
            )}
          </span>

          <div className="min-w-0 flex-1 space-y-2">
            <Field
              label="Upload a photo"
              hint={
                product
                  ? "JPEG, PNG or WebP, under 8 MB."
                  : "JPEG, PNG or WebP, under 8 MB. Uploaded once you save."
              }
              required={false}
            >
              <FileInput
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => onPick(event.currentTarget.files?.[0])}
              />
            </Field>
            {(product?.photoUrl && !preview) || (!product && pendingFile) ? (
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className="flex items-center gap-2 text-caption text-ink-muted hover:text-danger disabled:opacity-50"
              >
                <ImageOff size={14} strokeWidth={2} />
                Remove photo
              </button>
            ) : null}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export function ProductForm({
  product,
  categories,
  cancelHref = "/products",
  saveRedirectHref,
}: {
  product?: Product;
  categories: CategoryOption[];
  cancelHref?: string;
  saveRedirectHref?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    saveProduct,
    EMPTY_FORM_STATE,
  );
  const invalidate = useInvalidateProducts();
  const uploadPhoto = useUploadProductPhoto();
  const setBundleItems = useSetBundleItems();
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const locationsQuery = useLocations({ type: "branch" });
  const branches = locationsQuery.data ?? [];
  const singleBranch = branches.length === 1 ? branches[0] : null;

  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [costPrice, setCostPrice] = useState(
    product ? String(product.costPrice) : "",
  );
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "pc");
  const [allowDecimal, setAllowDecimal] = useState(
    product?.allowDecimal ?? defaultAllowDecimal("pc"),
  );
  const [decimalTouched, setDecimalTouched] = useState(false);
  const [isBundle, setIsBundle] = useState(product?.isBundle ?? false);

  const [sku, setSku] = useState(product?.sku ?? "");
  const claimNextSku = useClaimNextSku();
  const claimedSkuRef = useRef(false);

  useEffect(() => {
    if (product || claimedSkuRef.current) return;
    claimedSkuRef.current = true;
    claimNextSku.mutate(undefined, {
      onSuccess: (claimed) => setSku((current) => (current === "" ? claimed : current)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- claim exactly once, on mount, for a brand-new product.
  }, []);

  // The product's own sku is mirrored onto its default variant's sku column
  // (ProductObserver), so the conflict check must also exclude that variant
  // id — otherwise editing a product re-finds its own mirrored row via the
  // product_variants table and reports it as a conflict with itself.
  const variantsQuery = useProductVariants(product?.id ?? null);
  const defaultVariant =
    variantsQuery.data?.find((variant) => variant.isDefault) ?? variantsQuery.data?.[0] ?? null;
  const skuCheck = useSkuAvailability({
    kind: "sku",
    value: sku,
    excludeProductId: product?.id ?? null,
    excludeVariantId: defaultVariant?.id ?? null,
  });
  const [bundleRows, setBundleRows] = useState<BundleRow[]>(() =>
    product?.bundleItems.length
      ? product.bundleItems.map((item) => ({
          key: newRowKey(),
          productId: item.productId,
          quantity: String(item.quantity),
        }))
      : [emptyBundleRow()],
  );
  const finishedSaveIdRef = useRef<string | null>(null);
  const [tab, setTab] = useState<ProductFormTab>("details");

  function onUnitChange(next: string) {
    if (!isProductUnit(next)) return;
    setUnit(next);
    if (!decimalTouched) setAllowDecimal(defaultAllowDecimal(next));
  }

  useEffect(() => {
    if (!state.ok || !state.id) return;
    if (finishedSaveIdRef.current === state.id) return;
    finishedSaveIdRef.current = state.id;

    const productId = state.id;
    const photoToUpload = pendingPhoto;
    if (photoToUpload) setPendingPhoto(null);

    async function finish() {
      if (photoToUpload) {
        try {
          await uploadPhoto.mutateAsync({ id: productId, photo: photoToUpload });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Product saved, but the photo could not be uploaded — add it from the product's edit page.",
          );
        }
      }

      const bundleId = productId ?? product?.id;
      const validRows = bundleRows.filter(
        (row) => row.productId && Number(row.quantity) > 0,
      );
      if (isBundle && bundleId && validRows.length > 0) {
        try {
          await setBundleItems.mutateAsync({
            id: bundleId,
            items: validRows.map((row) => ({
              productId: row.productId,
              quantity: Number(row.quantity),
            })),
          });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Product saved, but the bundle recipe could not be saved — edit it from this page.",
          );
        }
      }

      invalidate();
      if (saveRedirectHref) router.push(saveRedirectHref as Route);
    }

    void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per successful save (finishedSaveIdRef); bundle rows read at submit time.
  }, [state.ok, state.id, saveRedirectHref, invalidate, router]);

  const priceValue = Number(price);
  const costValue = Number(costPrice);
  const bothSet =
    price !== "" &&
    costPrice !== "" &&
    Number.isFinite(priceValue) &&
    Number.isFinite(costValue);
  const belowCost = bothSet && priceValue < costValue;
  const selectedCategory = categories.find((entry) => entry.id === categoryId);

  function applyCategoryMarkup(nextCategoryId: string, nextCost: string) {
    const category = categories.find((entry) => entry.id === nextCategoryId);
    const cost = Number(nextCost);
    if (!category?.markupApplied || !Number.isFinite(cost) || nextCost === "")
      return;
    setPrice(String(shelfPriceFromMarkup(cost, category.markupPercent)));
  }

  return (
    <div className="space-y-6">
      {product ? (
        <div className="flex flex-wrap gap-1 border-b border-border">
          {PRODUCT_FORM_TABS.map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-body font-medium transition-colors ${
                  active
                    ? "border-primary text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                <Icon size={16} strokeWidth={2} />
                {entry.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <form
        id="product-form"
        action={action}
        className={`space-y-6 ${product && tab !== "details" ? "hidden" : ""}`}
      >
        {product ? <input type="hidden" name="id" value={product.id} /> : null}

        {!product ? (
          <p className="flex items-start gap-2 rounded-md border border-border bg-paper px-4 py-3 text-body text-ink-muted">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>
              Optional opening stock below records an adjustment in Inventory
              history. Terminals pick up catalogue changes on their next sync.
            </span>
          </p>
        ) : null}

        <FormSection
          title="What it is"
          description="How cashiers find and identify the product on a terminal."
        >
          <div className="sm:col-span-2">
            <Field label="Product name" required>
              <Input name="name" defaultValue={product?.name} required />
            </Field>
          </div>
          <div>
            <Field
              label="SKU"
              hint="Your shop code. CSV import and photo extract match on this."
              required={false}
            >
              <Input
                name="sku"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
              />
            </Field>
            <SkuFeedback checking={skuCheck.checking} conflict={skuCheck.conflict} />
          </div>
          <Field
            label="Barcode"
            hint="Optional. Scanned at the counter."
            required={false}
          >
            <Input name="barcode" defaultValue={product?.barcode ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Description"
              hint="Optional notes for staff — not printed on the receipt by default."
              required={false}
            >
              <Textarea
                name="description"
                rows={3}
                defaultValue={product?.description ?? ""}
                placeholder="Specs, supplier notes, shelf location…"
              />
            </Field>
          </div>
        </FormSection>

        <ProductPhotoSection
          product={product}
          pendingFile={pendingPhoto}
          onPendingFileChange={setPendingPhoto}
        />

        <FormSection
          title="Pricing"
          description="Supplier cost drives margin reports. Shelf price is what customers pay."
        >
          {!product ? (
            <Field label="Supplier price" required>
              <MoneyInput
                name="cost_price"
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(event) => {
                  const next = event.target.value;
                  setCostPrice(next);
                  applyCategoryMarkup(categoryId, next);
                }}
                required
              />
            </Field>
          ) : (
            <Field
              label="Cost price (calculated)"
              hint="Resolved from linked suppliers — edit in the Variants section below."
            >
              <div className="flex min-h-11 w-full items-center rounded-sm border border-border bg-canvas px-3">
                <Money value={product.costPrice} className="text-ink-muted" />
              </div>
            </Field>
          )}
          <Field label="Shelf price" required>
            <MoneyInput
              name="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
          </Field>
          <div className="sm:col-span-2">
            <div className="rounded-sm border border-border bg-paper px-3 py-3">
              <p className="text-caption font-medium text-ink-muted">
                Margin preview
              </p>
              {bothSet ? (
                <p
                  className={[
                    "num mt-1 text-body-lg font-semibold",
                    belowCost ? "text-danger" : "text-ink",
                  ].join(" ")}
                >
                  {formatMoney(priceValue - costValue)}{" "}
                  <span className="text-body font-medium text-ink-muted">
                    ({formatPercent(marginPercent(priceValue, costValue))} per
                    unit)
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-body text-ink-muted">
                  Fill both prices to see the margin.
                </p>
              )}
            </div>
          </div>
          <Field
            label="Bulk / contractor price"
            hint="Optional. Needs a minimum quantity."
            required={false}
          >
            <MoneyInput
              name="bulk_price"
              type="number"
              step="0.01"
              min="0"
              defaultValue={product?.bulkPrice ?? ""}
            />
          </Field>
          <Field
            label="Bulk minimum quantity"
            hint="Quantity that unlocks the bulk price."
            required={false}
          >
            <Input
              name="bulk_min_quantity"
              type="number"
              step="1"
              min="2"
              defaultValue={product?.bulkMinQuantity ?? ""}
            />
          </Field>
        </FormSection>

        <FormSection
          title="Category & unit"
          description="Where it sits in the catalogue and how quantities are counted."
        >
          <Field
            label="Category"
            hint={
              selectedCategory?.markupApplied
                ? `Markup ${selectedCategory.markupPercent}% can fill shelf price from cost.`
                : undefined
            }
            required={false}
          >
            <Combobox
              name="category_id"
              value={categoryId}
              onChange={(next) => {
                setCategoryId(next);
                applyCategoryMarkup(next, costPrice);
              }}
              placeholder="No category"
              options={[
                { value: "", label: "No category" },
                ...categories.map((category) => ({
                  value: category.id,
                  label: `${indentLabel(category)}${category.isActive ? "" : " (hidden)"}${
                    category.markupApplied
                      ? ` (+${category.markupPercent}%)`
                      : ""
                  }`,
                })),
              ]}
            />
          </Field>
          <Field label="Sold by" required>
            <Select
              name="unit"
              value={unit}
              onChange={(event) => onUnitChange(event.target.value)}
            >
              {PRODUCT_UNITS.map((option) => (
                <option key={option} value={option}>
                  {UNIT_LABELS[option] ?? option}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="Quantity mode"
              hint={
                allowDecimal
                  ? "Fractional quantities allowed (e.g. 2.5 kg)."
                  : "Whole numbers only."
              }
              required={false}
            >
              <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3">
                <input
                  type="checkbox"
                  name="allow_decimal"
                  checked={allowDecimal}
                  onChange={(event) => {
                    setAllowDecimal(event.target.checked);
                    setDecimalTouched(true);
                  }}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-body">Allow decimal quantities</span>
              </label>
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Bundle"
          description="A set of other products sold and stocked as one item, e.g. a starter kit."
        >
          <div className="sm:col-span-2">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-border bg-surface px-3">
              <input
                type="checkbox"
                name="is_bundle"
                checked={isBundle}
                onChange={(event) => setIsBundle(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-body">
                This is a bundle assembled from other products
              </span>
            </label>
          </div>
          {isBundle ? (
            <BundleItemsEditor
              rows={bundleRows}
              onChange={setBundleRows}
              excludeProductId={product?.id}
            />
          ) : (
            <p className="flex items-start gap-2 text-caption text-ink-muted sm:col-span-2">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                Its own price and stock, same as any product. Turn this on to
                define which products (and how many of each) it&apos;s made
                from.
              </span>
            </p>
          )}
        </FormSection>

        {!product ? (
          <FormSection
            title="Stock planning"
            description="These numbers flag restocking — they do not change stock on their own."
          >
            <Field
              label="Reorder point"
              hint="Flag for restocking at or below this count."
              required
            >
              <Input
                name="reorder_point"
                type="number"
                step="1"
                min="0"
                defaultValue={5}
                required
              />
            </Field>
            <Field
              label="Replenish quantity"
              hint="Suggested qty to order when restocking."
              required
            >
              <Input
                name="replenish_quantity"
                type="number"
                step="1"
                min="0"
                defaultValue={0}
                required
              />
            </Field>
            <p className="flex items-start gap-2 text-caption text-ink-muted sm:col-span-2">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                Reorder and replenish numbers flag restocking — they do not
                change stock on their own. Editable per variant afterward,
                from the Variants tab.
              </span>
            </p>
          </FormSection>
        ) : null}

        {!product ? (
          <FormSection
            title="Opening stock"
            description="Optional. Creates an adjustment movement so the first quantity shows in Inventory history."
          >
            <Field
              label="Quantity on hand"
              hint="Leave blank to start at zero. More stock can be added later in Inventory."
              required={false}
            >
              <Input
                name="opening_stock_quantity"
                type="number"
                step={allowDecimal ? "0.001" : "1"}
                min="0"
              />
            </Field>
            {singleBranch ? (
              <input
                type="hidden"
                name="stock_location_id"
                value={singleBranch.id}
              />
            ) : branches.length > 1 ? (
              <Field
                label="Branch"
                hint="Opening stock is recorded at this branch only."
                required={false}
              >
                <Select name="stock_location_id" defaultValue="">
                  <option value="">— Choose branch —</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : locationsQuery.isPending ? (
              <p className="text-caption text-ink-muted sm:col-span-2">
                Loading branches…
              </p>
            ) : (
              <div className="sm:col-span-2">
                <ErrorNote>
                  Add an active branch before recording opening stock.
                </ErrorNote>
              </div>
            )}
            <div className="sm:col-span-2">
              <Field
                label="Note"
                hint="Optional. Shown on the movement in Inventory history."
                required={false}
              >
                <Input name="opening_stock_note" placeholder="Opening stock" />
              </Field>
            </div>
          </FormSection>
        ) : null}

        {belowCost ? (
          <p className="flex items-start gap-2 rounded-sm border border-warning/50 bg-warning/12 px-3 py-2 text-body text-[#8a6516]">
            <TriangleAlert
              size={16}
              strokeWidth={2}
              className="mt-0.5 shrink-0"
            />
            <span>
              Shelf price is below supplier cost. You lose{" "}
              {formatMoney(costValue - priceValue)} per unit sold.
            </span>
          </p>
        ) : null}

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? (
          <SuccessNote>
            Saved. Terminals pick this up on their next sync.
            {saveRedirectHref ? " Returning to products…" : null}
          </SuccessNote>
        ) : null}
        {product?.isBundle && tab === "details" ? (
          <AssembleBundleSection product={product} />
        ) : null}
      </form>
      {product && tab === "variants" ? (
        <ProductAttributesAndVariantsSection product={product} />
      ) : null}
      {product && tab === "addons" ? (
        <ProductAddonGroupsSection product={product} />
      ) : null}
      {product && tab === "inventory" ? <ProductInventorySection product={product} /> : null}
      {product && tab === "activity" ? <ProductActivitySection productId={product.id} /> : null}

      {/* Outside the form, after every card — a submit button placed
          mid-page as `sticky bottom-0` stays pinned only for the height of
          its own parent, which used to be the form itself: scrolling past
          the form's fields but still inside the Variants/Add-ons cards left
          the bar floating (z-10) on top of them. `form="product-form"`
          keeps it wired to the actual <form> despite living outside it.
          Only meaningful for the Details tab's fields — Variants/Add-ons
          already save inline per action — so it hides on the other tabs. */}
      <div
        className={`sticky bottom-0 z-10 flex flex-col-reverse gap-2 rounded-md border border-border bg-surface px-4 pt-6 pb-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:flex-row sm:px-6 ${
          product && tab !== "details" ? "hidden" : ""
        }`}
      >
        <ButtonLink
          href={cancelHref}
          variant="secondary"
          className="w-full sm:flex-1"
        >
          Cancel
        </ButtonLink>
        <Button
          type="submit"
          form="product-form"
          loading={pending}
          icon={Check}
          className="w-full sm:flex-1"
        >
          {pending ? "Saving..." : product ? "Save changes" : "Add product"}
        </Button>
      </div>
    </div>
  );
}
