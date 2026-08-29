"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Camera, Check, ImageOff, Info, TriangleAlert } from "lucide-react";
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
  Input,
  MoneyInput,
  Select,
  SuccessNote,
  Textarea,
} from "@/components/ui";
import { indentLabel, type CategoryOption } from "@/lib/category-options";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useLocations } from "@/lib/query/locations";
import {
  useDeleteProductPhoto,
  useInvalidateProducts,
  useUploadProductPhoto,
} from "@/lib/query/products";
import { saveProduct } from "./actions";

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
          toast.error(error instanceof Error ? error.message : "Could not upload this photo."),
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
        toast.error(error instanceof Error ? error.message : "Could not remove this photo."),
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
  const [state, action, pending] = useActionState(saveProduct, EMPTY_FORM_STATE);
  const invalidate = useInvalidateProducts();
  const uploadPhoto = useUploadProductPhoto();
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);
  const locationsQuery = useLocations({ type: "branch" });
  const branches = locationsQuery.data ?? [];
  const singleBranch = branches.length === 1 ? branches[0] : null;

  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [costPrice, setCostPrice] = useState(product ? String(product.costPrice) : "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [unit, setUnit] = useState(product?.unit ?? "pc");
  const [allowDecimal, setAllowDecimal] = useState(
    product?.allowDecimal ?? defaultAllowDecimal("pc"),
  );
  const [decimalTouched, setDecimalTouched] = useState(false);

  function onUnitChange(next: string) {
    if (!isProductUnit(next)) return;
    setUnit(next);
    if (!decimalTouched) setAllowDecimal(defaultAllowDecimal(next));
  }

  useEffect(() => {
    if (!state.ok) return;

    async function finish() {
      if (pendingPhoto && state.id) {
        try {
          await uploadPhoto.mutateAsync({ id: state.id, photo: pendingPhoto });
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Product saved, but the photo could not be uploaded — add it from the product's edit page.",
          );
        }
      }
      invalidate();
      if (saveRedirectHref) router.push(saveRedirectHref as Route);
    }

    void finish();
    // pendingPhoto/uploadPhoto/state.id are read once per successful submit, not re-run on their own changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, saveRedirectHref, invalidate, router]);

  const priceValue = Number(price);
  const costValue = Number(costPrice);
  const bothSet =
    price !== "" && costPrice !== "" && Number.isFinite(priceValue) && Number.isFinite(costValue);
  const belowCost = bothSet && priceValue < costValue;
  const selectedCategory = categories.find((entry) => entry.id === categoryId);

  function applyCategoryMarkup(nextCategoryId: string, nextCost: string) {
    const category = categories.find((entry) => entry.id === nextCategoryId);
    const cost = Number(nextCost);
    if (!category?.markupApplied || !Number.isFinite(cost) || nextCost === "") return;
    setPrice(String(shelfPriceFromMarkup(cost, category.markupPercent)));
  }

  return (
    <form action={action} className="space-y-6">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      {!product ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-paper px-4 py-3 text-body text-ink-muted">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>
            Optional opening stock below records an adjustment in Inventory history. Terminals pick
            up catalogue changes on their next sync.
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
        <Field
          label="SKU"
          hint="Your shop code. CSV import and photo extract match on this."
          required={false}
        >
          <Input name="sku" defaultValue={product?.sku ?? ""} />
        </Field>
        <Field
          label="Supplier SKU"
          hint="Supplier item code on price lists — also used for matching."
          required={false}
        >
          <Input name="supplier_sku" defaultValue={product?.supplierSku ?? ""} />
        </Field>
        <Field label="Barcode" hint="Optional. Scanned at the counter." required={false}>
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
            <p className="text-caption font-medium text-ink-muted">Margin preview</p>
            {bothSet ? (
              <p
                className={[
                  "num mt-1 text-body-lg font-semibold",
                  belowCost ? "text-danger" : "text-ink",
                ].join(" ")}
              >
                {formatMoney(priceValue - costValue)}{" "}
                <span className="text-body font-medium text-ink-muted">
                  ({formatPercent(marginPercent(priceValue, costValue))} per unit)
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
                  category.markupApplied ? ` (+${category.markupPercent}%)` : ""
                }`,
              })),
            ]}
          />
        </Field>
        <Field label="Sold by" required>
          <Select name="unit" value={unit} onChange={(event) => onUnitChange(event.target.value)}>
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
        title="Stock planning"
        description="These numbers flag restocking — they do not change stock on their own."
      >
        <Field label="Reorder point" hint="Flag for restocking at or below this count." required>
          <Input
            name="reorder_point"
            type="number"
            step="1"
            min="0"
            defaultValue={product?.reorderPoint ?? 5}
            required
          />
        </Field>
        <Field label="Replenish quantity" hint="Suggested qty to order when restocking." required>
          <Input
            name="replenish_quantity"
            type="number"
            step="1"
            min="0"
            defaultValue={product?.replenishQuantity ?? 0}
            required
          />
        </Field>
        <p className="flex items-start gap-2 text-caption text-ink-muted sm:col-span-2">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            {product ? (
              <>
                Stock balances are adjusted in{" "}
                <Link href="/inventory" className="font-medium text-primary hover:underline">
                  Inventory
                </Link>{" "}
                so every change is recorded as a movement.
              </>
            ) : (
              "Reorder and replenish numbers flag restocking — they do not change stock on their own."
            )}
          </span>
        </p>
      </FormSection>

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
            <input type="hidden" name="stock_location_id" value={singleBranch.id} />
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
            <p className="text-caption text-ink-muted sm:col-span-2">Loading branches…</p>
          ) : (
            <div className="sm:col-span-2">
              <ErrorNote>Add an active branch before recording opening stock.</ErrorNote>
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
          <TriangleAlert size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
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

      <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 rounded-md border border-border bg-surface px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:flex-row sm:justify-end sm:px-6">
        <ButtonLink href={cancelHref} variant="secondary" className="w-full sm:w-auto">
          Cancel
        </ButtonLink>
        <Button type="submit" loading={pending} icon={Check} className="w-full sm:w-auto">
          {pending ? "Saving..." : product ? "Save changes" : "Add product"}
        </Button>
      </div>
    </form>
  );
}
