"use client";

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  FileText,
  History,
  Info,
  Layers,
  Package,
  Plus,
  RotateCcw,
  ScanBarcode,
  Tag,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { CreateFullProductInput } from "@double-a/api-client/queries";
import type { Product } from "@double-a/shared-types";
import {
  defaultAllowDecimal,
  formatMoney,
  formatPercent,
  isProductUnit,
  isValidQuantity,
  marginPercent,
  PRODUCT_UNITS,
  shelfPriceFromMarkup,
  UNIT_LABELS,
} from "@double-a/shared-types";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Combobox,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Money,
  MoneyInput,
  Select,
  Textarea,
} from "@/components/ui";
import { ConfirmDialog, CreateProductProcessingOverlay, Dialog } from "@/components/overlay";
import { BarcodeScanCamera, canUseBarcodeScanner } from "@/components/barcode-scan-camera";
import { RichTextEditor } from "@/components/rich-text-editor";
import { indentLabel, type CategoryOption } from "@/lib/category-options";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useLocations } from "@/lib/query/locations";
import {
  useCompanyAttributes,
  useCreateCompanyAttribute,
  useCreateCompanyAttributeValue,
  useProductVariants,
  useVariantStockByLocation,
} from "@/lib/query/attributes";
import { useBrands, useCreateBrand } from "@/lib/query/brands";
import { useSuppliers } from "@/lib/query/suppliers";
import { useAttachProductTag, useCreateTag, useDetachProductTag, useTags } from "@/lib/query/tags";
import {
  useAdjustProductStock,
  useClaimNextSku,
  useCreateFullProduct,
  useInvalidateProducts,
  useSetBundleItems,
} from "@/lib/query/products";
import { useSkuAvailability } from "@/lib/use-sku-check";
import { saveProduct } from "./actions";
import {
  collectProductFormChanges,
  type ProductFieldChange,
} from "./product-form-change-summary";
import { ProductActivitySection } from "./product-activity-section";
import { ProductAddonGroupsSection } from "./product-addon-groups-section";
import { ProductAttributesAndVariantsSection, VariantSupplierLinksEditor } from "./product-attributes-variants-section";
import { ProductInventorySection } from "./product-inventory-section";
import { PendingPhotoGallery, VariantPhotoGallery } from "./variant-photo-gallery";
import {
  AssembleBundleSection,
  BundleFields,
  emptyBundleRow,
  persistBundleRows,
  type BundleRow,
} from "./product-bundle-section";
import { ProductBlockSkeleton } from "./product-form-skeletons";

const PRODUCT_FORM_TABS = [
  { id: "details", label: "Details", icon: FileText },
  { id: "variants", label: "Variants", icon: Layers },
  { id: "addons", label: "Add-ons", icon: Tag },
  { id: "inventory", label: "Inventory", icon: History },
  { id: "activity", label: "Activity", icon: Clock },
] as const;

type ProductFormTab = (typeof PRODUCT_FORM_TABS)[number]["id"];

function newRowKey(): string {
  return Math.random().toString(36).slice(2);
}

const PRODUCT_KIND_OPTIONS = [
  {
    key: "single" as const,
    icon: Package,
    title: "Single Product",
    description: "One product with one selling option.",
    infoBody: (
      <>
        <p className="text-body text-ink-muted">
          One selling option — always the same item, at one price, one SKU, one stock count.
        </p>
        <p className="mt-3 text-caption font-medium text-ink">Examples</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-body text-ink-muted">
          <li>A 25kg bag of rice</li>
          <li>A bottle of shampoo</li>
          <li>A delivery fee</li>
          <li>An installation service</li>
          <li>A hammer</li>
        </ul>
      </>
    ),
  },
  {
    key: "with_variants" as const,
    icon: Layers,
    title: "Product With Variants",
    description: "Multiple versions of the same product, like different sizes or colors.",
    infoBody: (
      <>
        <p className="text-body text-ink-muted">
          The same base product sold in more than one version — each version gets its own SKU, price, and
          stock count, but they all share one name, photo, and category. Use this when a customer has to pick
          between options before buying.
        </p>
        <p className="mt-3 text-caption font-medium text-ink">Examples</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-body text-ink-muted">
          <li>A T-shirt in Small / Medium / Large and Red / Blue / Black</li>
          <li>Running shoes sold by size</li>
          <li>Paint sold by color and can size</li>
          <li>A phone case sold by phone model</li>
        </ul>
      </>
    ),
  },
];

/** Create-mode kind cards — whole card selects; Info icon opens the explainer dialog. */
function ProductKindPicker({
  productKind,
  onSelect,
  infoOpen,
  onInfoOpenChange,
}: {
  productKind: "single" | "with_variants";
  onSelect: (kind: "single" | "with_variants") => void;
  infoOpen: "single" | "with_variants" | null;
  onInfoOpenChange: (key: "single" | "with_variants" | null) => void;
}) {
  return (
    <>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-body font-medium text-ink">
          What type of product are you creating?
        </legend>
        {PRODUCT_KIND_OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = productKind === option.key;
          return (
            <div
              key={option.key}
              role="radio"
              aria-checked={active}
              tabIndex={0}
              onClick={() => onSelect(option.key)}
              onKeyDown={(event) => {
                if ("Enter" === event.key || " " === event.key) {
                  event.preventDefault();
                  onSelect(option.key);
                }
              }}
              className={`relative flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors ${
                active ? "border-primary bg-primary-tint" : "border-border bg-surface hover:bg-paper"
              }`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onInfoOpenChange(option.key);
                }}
                aria-label={`What is ${option.title}?`}
                className="absolute top-3 right-3 text-ink-muted transition-colors hover:text-primary"
              >
                <Info size={16} strokeWidth={2} />
              </button>
              <span className="min-w-0 pr-6">
                <span className="flex items-center gap-1.5 text-body font-medium text-ink">
                  <Icon size={16} strokeWidth={2} />
                  {option.title}
                </span>
                <span className="mt-0.5 block text-caption text-ink-muted/70">{option.description}</span>
              </span>
              <input
                type="radio"
                name="product_kind"
                value={option.key}
                checked={active}
                onChange={() => onSelect(option.key)}
                className="sr-only"
                tabIndex={-1}
              />
            </div>
          );
        })}
      </fieldset>
      {PRODUCT_KIND_OPTIONS.map((option) => (
        <Dialog
          key={option.key}
          open={option.key === infoOpen}
          onClose={() => onInfoOpenChange(null)}
          title={option.title}
        >
          {option.infoBody}
        </Dialog>
      ))}
    </>
  );
}

const DRAFT_STORAGE_PREFIX = "product-form-draft:";
/** Create-mode only — survives refresh so the kind cards stay on the last pick. */
const PRODUCT_KIND_STORAGE_KEY = "product-form-product-kind:new";
/** Regenerated at submit time — never part of what a draft restores. */
const DRAFT_SKIP_FIELDS = new Set(["id", "skip_default_variant"]);
/** File blobs can't live in localStorage — IndexedDB holds gallery drafts. */
const DRAFT_PHOTOS_DB = "product-form-draft-photos";
const DRAFT_PHOTOS_STORE = "photos";

function draftStorageKey(productId: string | undefined): string {
  return `${DRAFT_STORAGE_PREFIX}${productId ?? "new"}`;
}

type DraftPhotoBlob = {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
};

type DraftPhotosRecord = {
  key: string;
  productPhotos: DraftPhotoBlob[];
  variantPhotos: Record<string, DraftPhotoBlob[]>;
};

type DraftPhotosState = {
  productPhotos: File[];
  variantPhotos: Record<string, File[]>;
};

function openDraftPhotosDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DRAFT_PHOTOS_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFT_PHOTOS_STORE)) {
        db.createObjectStore(DRAFT_PHOTOS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function fileToDraftBlob(file: File): DraftPhotoBlob {
  return {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    blob: file,
  };
}

function draftBlobToFile(entry: DraftPhotoBlob): File {
  return new File([entry.blob], entry.name, {
    type: entry.type || entry.blob.type || "application/octet-stream",
    lastModified: entry.lastModified,
  });
}

function draftPhotosHaveContent(photos: DraftPhotosState | null | undefined): boolean {
  if (!photos) return false;
  if (photos.productPhotos.length > 0) return true;
  return Object.values(photos.variantPhotos).some((files) => files.length > 0);
}

async function readDraftPhotos(key: string): Promise<DraftPhotosState | null> {
  try {
    const db = await openDraftPhotosDb();
    const record = await new Promise<DraftPhotosRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(DRAFT_PHOTOS_STORE, "readonly");
      const request = tx.objectStore(DRAFT_PHOTOS_STORE).get(key);
      request.onsuccess = () => resolve(request.result as DraftPhotosRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
    db.close();
    if (!record) return null;
    return {
      productPhotos: (record.productPhotos ?? []).map(draftBlobToFile),
      variantPhotos: Object.fromEntries(
        Object.entries(record.variantPhotos ?? {}).map(([comboKey, files]) => [
          comboKey,
          files.map(draftBlobToFile),
        ]),
      ),
    };
  } catch {
    return null;
  }
}

async function writeDraftPhotos(
  key: string,
  productPhotos: File[],
  variantPhotos: Record<string, File[]>,
): Promise<void> {
  try {
    const trimmedVariants = Object.fromEntries(
      Object.entries(variantPhotos)
        .filter(([, files]) => files.length > 0)
        .map(([comboKey, files]) => [comboKey, files.map(fileToDraftBlob)]),
    );
    if (0 === productPhotos.length && 0 === Object.keys(trimmedVariants).length) {
      await clearDraftPhotos(key);
      return;
    }

    const db = await openDraftPhotosDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_PHOTOS_STORE, "readwrite");
      tx.objectStore(DRAFT_PHOTOS_STORE).put({
        key,
        productPhotos: productPhotos.map(fileToDraftBlob),
        variantPhotos: trimmedVariants,
      } satisfies DraftPhotosRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
    db.close();
  } catch {
    // Quota / private mode — photo draft just won't survive a refresh.
  }
}

async function clearDraftPhotos(key: string): Promise<void> {
  try {
    const db = await openDraftPhotosDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DRAFT_PHOTOS_STORE, "readwrite");
      tx.objectStore(DRAFT_PHOTOS_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    });
    db.close();
  } catch {
    // Nothing to clean up if storage isn't available.
  }
}

function readCachedProductKind(): "single" | "with_variants" | null {
  try {
    const raw = window.localStorage.getItem(PRODUCT_KIND_STORAGE_KEY);
    if ("single" === raw || "with_variants" === raw) return raw;
  } catch {
    // Storage unavailable — fall through to default.
  }
  return null;
}

function writeCachedProductKind(kind: "single" | "with_variants"): void {
  try {
    window.localStorage.setItem(PRODUCT_KIND_STORAGE_KEY, kind);
  } catch {
    // Storage full/unavailable — kind just won't survive a refresh.
  }
}

/**
 * Create-form draft — named form fields plus the with-variants wizard
 * (step / attributes / per-variant config / suppliers). Legacy drafts were
 * a flat field map; parseStoredDraft upgrades those on read.
 */
interface ProductFormDraft {
  version: 2;
  fields: Record<string, string | boolean>;
  productKind?: "single" | "with_variants";
  step?: 1 | 2 | 3;
  wizardProduct?: WizardProductDetails | null;
  wizardAttributes?: WizardAttribute[];
  wizardVariantConfig?: Record<string, WizardVariantConfig>;
  wizardVariantSuppliers?: Record<string, PendingSupplierLink[]>;
  wizardExcludedVariantKeys?: string[];
  wizardStockNote?: string;
}

function isDraftV2(value: unknown): value is ProductFormDraft {
  return (
    !!value &&
    "object" === typeof value &&
    "fields" in value &&
    "object" === typeof (value as ProductFormDraft).fields
  );
}

function parseStoredDraft(raw: string): ProductFormDraft {
  const parsed = JSON.parse(raw) as unknown;
  if (isDraftV2(parsed)) return { ...parsed, version: 2 };
  return { version: 2, fields: parsed as Record<string, string | boolean> };
}

function readStoredDraft(key: string): ProductFormDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return parseStoredDraft(raw);
  } catch {
    return null;
  }
}

function writeStoredDraft(key: string, patch: Partial<ProductFormDraft>): void {
  try {
    const current = readStoredDraft(key) ?? { version: 2 as const, fields: {} };
    const next: ProductFormDraft = {
      version: 2,
      fields: patch.fields ?? current.fields,
      productKind: undefined !== patch.productKind ? patch.productKind : current.productKind,
      step: undefined !== patch.step ? patch.step : current.step,
      wizardProduct: undefined !== patch.wizardProduct ? patch.wizardProduct : current.wizardProduct,
      wizardAttributes: undefined !== patch.wizardAttributes ? patch.wizardAttributes : current.wizardAttributes,
      wizardVariantConfig:
        undefined !== patch.wizardVariantConfig ? patch.wizardVariantConfig : current.wizardVariantConfig,
      wizardVariantSuppliers:
        undefined !== patch.wizardVariantSuppliers ? patch.wizardVariantSuppliers : current.wizardVariantSuppliers,
      wizardExcludedVariantKeys:
        undefined !== patch.wizardExcludedVariantKeys
          ? patch.wizardExcludedVariantKeys
          : current.wizardExcludedVariantKeys,
      wizardStockNote: undefined !== patch.wizardStockNote ? patch.wizardStockNote : current.wizardStockNote,
    };
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage full/unavailable — autosave just silently stops.
  }
}

/**
 * Every plain-value named field currently in the form. Checkboxes captured
 * as real booleans, not left to FormData — an unchecked box never appears
 * in FormData at all, which would silently lose "explicitly turned off"
 * on restore. File inputs (photos) are persisted separately in IndexedDB
 * (see writeDraftPhotos) — JSON localStorage cannot hold File blobs.
 * Pending suppliers and per-location stock rows ride the wizard draft slice.
 */
function readFormDraft(form: HTMLFormElement): Record<string, string | boolean> {
  const draft: Record<string, string | boolean> = {};
  for (const element of Array.from(form.elements)) {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLSelectElement)
    ) {
      continue;
    }
    const name = element.name;
    if (!name || DRAFT_SKIP_FIELDS.has(name) || name.startsWith("stock_qty__")) continue;
    draft[name] =
      element instanceof HTMLInputElement && "checkbox" === element.type ? element.checked : element.value;
  }
  return draft;
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
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} action={action} />
      <CardBody>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </CardBody>
    </Card>
  );
}

/** Pill switch — a real toggle look, not a plain checkbox, for a section-header-level on/off. */
function ToggleSwitch({
  name,
  checked,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <span className="text-caption font-medium text-ink-muted">{label}</span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`absolute inset-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-border"}`}
        />
        <span
          className={`relative size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[22px]" : ""
          }`}
        />
      </span>
    </label>
  );
}

/**
 * Barcode text field + optional camera scan (Chrome/Edge BarcodeDetector).
 * Same chrome as the edit Variants panel — scan fills the input; field stays
 * editable afterward.
 */
function BarcodeFieldWithScan({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  const [scanning, setScanning] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Input
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1"
          autoComplete="off"
        />
        {canUseBarcodeScanner() ? (
          <IconButton
            icon={ScanBarcode}
            label="Scan barcode with camera"
            onClick={() => setScanning(true)}
          />
        ) : null}
      </div>
      <BarcodeScanCamera
        open={scanning}
        onDetected={(next) => {
          onChange(next);
          setScanning(false);
        }}
        onCancel={() => setScanning(false)}
      />
    </>
  );
}

/**
 * Controlled, no `name` prop — the same "type to search, or create it"
 * Combobox every company-vocabulary picker in this app already uses
 * (attributes, addon-group items), just for brands. The caller renders its
 * own hidden `<input name="brand_id">` alongside this to get it into a
 * native form submit, same trick Combobox uses internally for its own
 * `name` prop — no changes needed to the shared component itself.
 */
function BrandPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const brandsQuery = useBrands();
  const createBrand = useCreateBrand();
  const brands = brandsQuery.data ?? [];

  function onCreate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = brands.find((brand) => brand.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      onChange(existing.id);
      return;
    }
    createBrand.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => onChange(created.id),
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create that brand."),
      },
    );
  }

  return (
    <Combobox
      value={value}
      onChange={onChange}
      placeholder={brandsQuery.isPending ? "Loading…" : "No brand"}
      emptyLabel={brandsQuery.isPending ? "Loading…" : undefined}
      options={[{ value: "", label: "No brand" }, ...brands.map((brand) => ({ value: brand.id, label: brand.name }))]}
      creatable
      createOptionLabel={(typed) => `"${typed}" doesn't exist — create it`}
      onCreate={onCreate}
    />
  );
}

function TagChip({ tag, onRemove, disabled }: { tag: { id: string; name: string }; onRemove: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-paper px-2 text-caption">
      {tag.name}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${tag.name}`}
        className="text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  );
}

/**
 * Chip list + creatable Combobox picker. Pure/dumb about attach/detach — the
 * caller's onAdd/onRemove decide whether that's a real attachProductTag/
 * detachProductTag call (product already exists) or just a local list
 * update (create flow, deferred until the one-shot submit). Creating a
 * brand-new tag name is always live, though — see the scope note on
 * `createFullProduct`'s caller.
 */
function ProductTagsField({
  tags,
  onAdd,
  onRemove,
  pending,
}: {
  tags: { id: string; name: string }[];
  onAdd: (tag: { id: string; name: string }) => void;
  onRemove: (tagId: string) => void;
  pending?: boolean;
}) {
  const tagsQuery = useTags();
  const createTag = useCreateTag();
  const [picking, setPicking] = useState("");
  const attachedIds = new Set(tags.map((tag) => tag.id));
  const available = (tagsQuery.data ?? []).filter((tag) => !attachedIds.has(tag.id));

  function selectExisting(id: string) {
    const tag = available.find((entry) => entry.id === id);
    if (tag) onAdd(tag);
    setPicking("");
  }

  function createAndAdd(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = (tagsQuery.data ?? []).find((tag) => tag.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (!attachedIds.has(existing.id)) onAdd(existing);
      return;
    }
    createTag.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => onAdd(created),
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create that tag."),
      },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <TagChip key={tag.id} tag={tag} onRemove={() => onRemove(tag.id)} disabled={pending} />
        ))}
      </div>
      <Combobox
        value={picking}
        onChange={selectExisting}
        placeholder="Add a tag…"
        emptyLabel={tagsQuery.isPending ? "Loading…" : "No matches."}
        options={available.map((tag) => ({ value: tag.id, label: tag.name }))}
        creatable
        createOptionLabel={(typed) => `"${typed}" doesn't exist — create it`}
        onCreate={createAndAdd}
      />
    </div>
  );
}

interface PendingSupplierLink {
  key: string;
  supplierId: string;
  supplierName: string;
  supplierSku: string;
  supplierPrice: string;
}

/** Step 1's captured fields for the with-variants wizard — pure local state, nothing created yet. */
interface WizardProductDetails {
  name: string;
  description: string | null;
  notes: string | null;
  categoryId: string | null;
  brandId: string | null;
  productType: string;
  tags: { id: string; name: string }[];
}

/** One attribute chosen for the with-variants wizard's step 2 — the attribute and its values are real, already-created vocabulary rows (picked or typed-and-created live, same as the Variants tab); only the product/variant/attach rows stay local until Finish. */
interface WizardAttribute {
  key: string;
  attributeId: string;
  attributeName: string;
  values: { id: string; name: string }[];
}

/**
 * Full per-variant config, entered once variants are generated — keyed by
 * comboKey(), same convention as wizardVariantSuppliers. Mirrors the fields
 * CreateFullProduct's variants[] accepts (barcode, price, cost, bulk, reorder,
 * replenish), plus opening stock per branch the same way the single-product
 * create form's Manage Stock section collects it. SKU stays server-assigned
 * (AssignVariantSku). Cost may be typed here or left blank for supplier
 * resolution on step 3.
 */
interface WizardVariantConfig {
  price: string;
  costPrice: string;
  barcode: string;
  reorderPoint: string;
  replenishQuantity: string;
  bulkPrice: string;
  bulkMinQuantity: string;
  trackInventory: boolean;
  /** Show on terminals — false hides this SKU after sync (same idea as product isActive). */
  isActive: boolean;
  /** Kit flag — written to product_variants.is_bundle on create. */
  isBundle: boolean;
  stockByLocation: Record<string, string>;
}

function emptyVariantConfig(): WizardVariantConfig {
  return {
    price: "",
    costPrice: "",
    barcode: "",
    reorderPoint: "5",
    replenishQuantity: "0",
    bulkPrice: "",
    bulkMinQuantity: "",
    trackInventory: true,
    isActive: true,
    isBundle: false,
    stockByLocation: {},
  };
}

/** Plain nested-loop cartesian product — same order Laravel's CreateFullProductAction reproduces server-side, so combo N here always lines up with generated variant N. */
function cartesianProduct<T>(lists: T[][]): T[][] {
  let result: T[][] = [[]];
  for (const list of lists) {
    const next: T[][] = [];
    for (const combo of result) {
      for (const value of list) {
        next.push([...combo, value]);
      }
    }
    result = next;
  }
  return result;
}

function comboKey(combo: { name: string }[]): string {
  return combo.map((value) => value.name).join(" / ");
}

/**
 * Suppliers picked before the product (and its default variant) exist —
 * held locally, attached for real once ProductForm's finish() effect
 * resolves the new default variant's id. Same "local until saved" split as
 * tags/photo elsewhere on this create flow.
 */
function PendingSupplierLinksEditor({
  links,
  onChange,
}: {
  links: PendingSupplierLink[];
  onChange: (links: PendingSupplierLink[]) => void;
}) {
  const suppliersQuery = useSuppliers();
  const [picking, setPicking] = useState("");
  const [pendingSku, setPendingSku] = useState("");
  const [pendingPrice, setPendingPrice] = useState("");

  const linkedIds = new Set(links.map((link) => link.supplierId));
  const available = (suppliersQuery.data ?? []).filter((supplier) => !linkedIds.has(supplier.id));

  function add() {
    if (!picking) return;
    const supplier = available.find((entry) => entry.id === picking);
    if (!supplier) return;
    onChange([
      ...links,
      {
        key: newRowKey(),
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierSku: pendingSku.trim(),
        supplierPrice: pendingPrice.trim(),
      },
    ]);
    setPicking("");
    setPendingSku("");
    setPendingPrice("");
  }

  function remove(key: string) {
    onChange(links.filter((link) => link.key !== key));
  }

  return (
    <div className="sm:col-span-2 space-y-2">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
        <div className="min-w-[14rem] flex-[3]">
          <Field label="Add a supplier">
            <Combobox
              value={picking}
              onChange={setPicking}
              placeholder="Choose supplier…"
              emptyLabel={
                suppliersQuery.data?.length === 0
                  ? "No suppliers on file yet."
                  : available.length === 0
                    ? "Every supplier is already added."
                    : "No matches."
              }
              options={available.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
            />
          </Field>
        </div>
        <div className="min-w-[9rem] flex-1">
          <Field label="Supplier SKU" required={false}>
            <Input
              value={pendingSku}
              onChange={(event) => setPendingSku(event.target.value)}
              placeholder="Optional"
              className="w-full"
            />
          </Field>
        </div>
        <div className="min-w-[7rem] flex-1">
          <Field label="Price" required={false}>
            <MoneyInput
              type="number"
              step="0.01"
              min="0"
              value={pendingPrice}
              onChange={(event) => setPendingPrice(event.target.value)}
              className="w-full"
            />
          </Field>
        </div>
        <Button type="button" icon={Plus} disabled={!picking} onClick={add} className="shrink-0">
          Add
        </Button>
      </div>
      {links.length > 0 ? (
        <div className="space-y-1.5">
          {links.map((link) => (
            <div
              key={link.key}
              className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface px-3 py-2"
            >
              <span className="text-body">
                {link.supplierName}
                {link.supplierSku ? <span className="text-caption text-ink-muted"> · {link.supplierSku}</span> : null}
                {link.supplierPrice ? (
                  <span className="text-caption text-ink-muted"> · {formatMoney(Number(link.supplierPrice))}</span>
                ) : null}
              </span>
              <IconButton icon={Trash2} label="Remove supplier" tone="danger" onClick={() => remove(link.key)} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-body text-ink-muted">No suppliers added yet.</p>
      )}
    </div>
  );
}

/**
 * Create-time opening stock, one row per active branch. Quantities are
 * purely local state, read directly by handleCreateSubmit/handleWizardFinish
 * and folded into the one-shot createFullProduct payload — no hidden inputs
 * needed since create no longer submits via a native form action.
 */
function StockByLocationCreateTable({
  branches,
  loading,
  allowDecimal,
  quantities,
  onChange,
  note,
  onNoteChange,
  showNote = true,
}: {
  branches: { id: string; name: string }[];
  loading: boolean;
  allowDecimal: boolean;
  quantities: Record<string, string>;
  onChange: (locationId: string, value: string) => void;
  note?: string;
  onNoteChange?: (value: string) => void;
  /** Shared note lives above all variants in the wizard — hide the per-table field there. */
  showNote?: boolean;
}) {
  if (loading) {
    return <ProductBlockSkeleton className="sm:col-span-2" />;
  }
  if (branches.length === 0) {
    return (
      <div className="sm:col-span-2">
        <ErrorNote>Add an active branch before recording opening stock.</ErrorNote>
      </div>
    );
  }
  return (
    <>
      <div className="sm:col-span-2 space-y-2">
        <div className="flex items-center gap-3 px-3">
          <span className="w-[120px] text-caption font-medium text-ink-muted">Branch</span>
          <span className="w-full text-left text-caption font-medium text-ink-muted">Current Stock Quantity</span>
        </div>
        {branches.map((branch) => (
          <div
            key={branch.id}
            className="flex items-center gap-3 rounded-sm border border-border bg-surface px-3 py-2"
          >
            <span className="font-medium text-body text-ink w-[120px]">{branch.name}</span>
            <Input
              type="number"
              step={allowDecimal ? "0.001" : "1"}
              min="0"
              placeholder="0"
              value={quantities[branch.id] ?? ""}
              onChange={(event) => onChange(branch.id, event.target.value)}
            />
          </div>
        ))}
      </div>
      {showNote && note !== undefined && onNoteChange ? (
        <div className="sm:col-span-2">
          <Field label="Note" hint="Optional. Shown on each movement in Inventory history." required={false}>
            <Input value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Opening stock" />
          </Field>
        </div>
      ) : null}
    </>
  );
}

interface StockAdjustDraft {
  quantity: string;
  mode: "add" | "remove";
}

/**
 * Edit-time per-location stock, one row per active branch — current
 * quantity, a "new stock" quantity input, and an Add/Remove choice, each
 * branch applies its own adjustStock call independently. Read via the
 * stock-by-location endpoint, written via the existing adjustStock
 * mutation (same InventoryMovementObserver path RestockSheet already
 * uses), surfaced inline instead of sending the merchant to /inventory.
 */
function StockByLocationEditTable({ productId, variantId }: { productId: string; variantId: string }) {
  const stockQuery = useVariantStockByLocation(variantId);
  const adjustStock = useAdjustProductStock(productId);
  const [drafts, setDrafts] = useState<Record<string, StockAdjustDraft>>({});
  const [note, setNote] = useState("");

  const rows = stockQuery.data ?? [];

  function draftFor(locationId: string): StockAdjustDraft {
    return drafts[locationId] ?? { quantity: "", mode: "add" };
  }

  function setDraft(locationId: string, patch: Partial<StockAdjustDraft>) {
    setDrafts((current) => ({ ...current, [locationId]: { ...draftFor(locationId), ...patch } }));
  }

  function applyStock(locationId: string) {
    const draft = draftFor(locationId);
    const qty = Number(draft.quantity);
    if (draft.quantity.trim() === "" || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }
    adjustStock.mutate(
      {
        changeQuantity: "remove" === draft.mode ? -qty : qty,
        reason: "adjustment",
        locationId,
        variantId,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Stock updated.");
          setDrafts((current) => ({ ...current, [locationId]: { quantity: "", mode: draft.mode } }));
          void stockQuery.refetch();
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update stock."),
      },
    );
  }

  if (stockQuery.isPending) {
    return <ProductBlockSkeleton className="sm:col-span-2" />;
  }
  if (rows.length === 0) {
    return (
      <div className="sm:col-span-2">
        <ErrorNote>Add an active branch to record stock.</ErrorNote>
      </div>
    );
  }

  return (
    <>
      <div className="sm:col-span-2 space-y-2">
        {rows.map((row) => {
          const draft = draftFor(row.locationId);
          return (
            <div
              key={row.locationId}
              className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-surface px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-body text-ink">{row.locationName}</p>
                <p className="text-caption text-ink-muted">
                  Current stock: <span className="num">{row.quantity}</span>
                </p>
              </div>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="New stock"
                value={draft.quantity}
                onChange={(event) => setDraft(row.locationId, { quantity: event.target.value })}
                className="w-28"
              />
              <div className="flex overflow-hidden rounded-sm border border-border">
                <button
                  type="button"
                  onClick={() => setDraft(row.locationId, { mode: "add" })}
                  className={`px-3 py-2 text-body font-medium transition-colors ${
                    "add" === draft.mode ? "bg-primary text-white" : "bg-surface text-ink-muted hover:bg-paper"
                  }`}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(row.locationId, { mode: "remove" })}
                  className={`border-l border-border px-3 py-2 text-body font-medium transition-colors ${
                    "remove" === draft.mode ? "bg-danger text-white" : "bg-surface text-ink-muted hover:bg-paper"
                  }`}
                >
                  Remove
                </button>
              </div>
              <Button type="button" size="sm" disabled={adjustStock.isPending} onClick={() => applyStock(row.locationId)}>
                Apply
              </Button>
            </div>
          );
        })}
      </div>
      <div className="sm:col-span-2">
        <Field label="Note" hint="Optional. Shown on each movement in Inventory history." required={false}>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Restock" />
        </Field>
      </div>
    </>
  );
}

/** Product-with-variants create flow only — step 1 is always revisitable once reached; step 2 never is (nothing past it yet). */
const WITH_VARIANTS_STEPS = [
  { key: 1 as const, label: "Product details" },
  { key: 2 as const, label: "Variants" },
  { key: 3 as const, label: "Variant suppliers" },
];

/** Product-with-variants create flow only — a completed step is always revisitable; nothing is ever forward-clickable. */
function WithVariantsStepper({
  step,
  onNavigate,
}: {
  step: 1 | 2 | 3;
  onNavigate: (step: 1 | 2) => void;
}) {
  return (
    <div className="flex items-start justify-center gap-3">
      {WITH_VARIANTS_STEPS.map((entry, index) => {
        const isCurrent = step === entry.key;
        const isDone = step > entry.key;
        return (
          <div key={entry.key} className="flex items-center gap-3">
            {index > 0 ? <span className="mt-[18px] h-px w-10 bg-border" /> : null}
            <button
              type="button"
              onClick={() => isDone && onNavigate(entry.key as 1 | 2)}
              disabled={!isDone}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`flex size-9 items-center justify-center rounded-full text-body font-semibold transition-colors ${
                  isCurrent
                    ? "bg-primary text-white"
                    : isDone
                      ? "cursor-pointer bg-primary/10 text-primary hover:bg-primary/20"
                      : "bg-border text-ink-muted"
                }`}
              >
                {isDone ? <Check size={16} strokeWidth={2.5} /> : entry.key}
              </span>
              <span
                className={`text-caption font-medium ${
                  isCurrent ? "text-ink" : isDone ? "text-primary" : "text-ink-muted"
                }`}
              >
                {entry.label}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Step 2 of the with-variants create flow — pick or create attributes and
 * their values (real vocabulary rows, same picker the Variants tab
 * already uses), previewed client-side as a cartesian product. The
 * product/variants/attach rows themselves stay local until step 3's
 * Finish — only the vocabulary (CompanyAttribute/CompanyAttributeValue)
 * is created live when typed, same trade-off Brand/Tag already accept.
 */
/**
 * One option's title + add-value dropdown + remove-option control + its
 * chosen-value chips — shared between the committed list (Variant Options
 * card) and the in-progress batch inside the "Add variant options" dialog,
 * so both stay visually and behaviorally identical.
 */
function VariantOptionGroup({
  index,
  attribute,
  fullValues,
  createValue,
  onAddValue,
  onRemoveValue,
  onRemoveOption,
}: {
  index: number;
  attribute: WizardAttribute;
  fullValues: { id: string; value: string }[];
  createValue: ReturnType<typeof useCreateCompanyAttributeValue>;
  onAddValue: (value: { id: string; name: string }) => void;
  onRemoveValue: (id: string) => void;
  onRemoveOption: () => void;
}) {
  const [picking, setPicking] = useState("");
  const chosenValueIds = new Set(attribute.values.map((value) => value.id));
  const availableValues = fullValues.filter((value) => !chosenValueIds.has(value.id));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body font-medium capitalize text-ink">Option {index}: {attribute.attributeName}</p>
        <div className="flex items-center gap-2 mt-2">
          <div className="w-48">
            <Combobox
              value={picking}
              onChange={(id) => {
                const found = availableValues.find((value) => value.id === id);
                if (found) onAddValue({ id: found.id, name: found.value });
                setPicking("");
              }}
              placeholder="Add a value…"
              options={availableValues.map((value) => ({ value: value.id, label: value.value }))}
              creatable
              createOptionLabel={(typed) => `"${typed}" doesn't exist — create it`}
              onCreate={(name) => {
                const trimmed = name.trim();
                if (!trimmed) return;
                const existing = fullValues.find((value) => value.value.trim().toLowerCase() === trimmed.toLowerCase());
                if (existing) {
                  if (!chosenValueIds.has(existing.id)) onAddValue({ id: existing.id, name: existing.value });
                  return;
                }
                createValue.mutate(
                  { attributeId: attribute.attributeId, value: trimmed },
                  {
                    onSuccess: (created) => onAddValue({ id: created.id, name: created.value }),
                    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create that value."),
                  },
                );
              }}
            />
          </div>
          <IconButton
            icon={Trash2}
            label={`Remove ${attribute.attributeName}`}
            tone="danger"
            onClick={onRemoveOption}
          />
        </div>
      </div>

      {availableValues.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption capitalize text-ink-muted">Available {attribute.attributeName} Values:</span>
          {availableValues.map((value) => (
            <button
              key={value.id}
              type="button"
              onClick={() => onAddValue({ id: value.id, name: value.value })}
              className="rounded-sm border border-border bg-paper px-2 py-1 text-caption text-ink transition-colors hover:border-primary/40 hover:text-primary"
            >
              {value.value}
            </button>
          ))}
        </div>
      ) : null}
      <hr className="my-2 border-border" />
      <div className="flex flex-wrap items-center gap-1.5 pb-2">
        Selected {attribute.attributeName} Values:
        {attribute.values.map((value) => (
          <TagChip key={value.id} tag={value} onRemove={() => onRemoveValue(value.id)} />
        ))}
      </div>
    </div>
  );
}

function WizardAttributesStep({
  productName,
  attributes,
  onChange,
  variantConfig,
  onVariantConfigChange,
  variantPhotos,
  onVariantPhotosChange,
  excludedVariantKeys,
  onExcludeVariant,
  branches,
  branchesLoading,
  stockNote,
  onStockNoteChange,
}: {
  productName: string;
  attributes: WizardAttribute[];
  onChange: (attributes: WizardAttribute[]) => void;
  variantConfig: Record<string, WizardVariantConfig>;
  onVariantConfigChange: (key: string, config: WizardVariantConfig) => void;
  variantPhotos: Record<string, File[]>;
  onVariantPhotosChange: (key: string, files: File[]) => void;
  excludedVariantKeys: string[];
  onExcludeVariant: (key: string) => void;
  branches: { id: string; name: string }[];
  branchesLoading: boolean;
  stockNote: string;
  onStockNoteChange: (value: string) => void;
}) {
  const allAttributesQuery = useCompanyAttributes();
  const createAttribute = useCreateCompanyAttribute();
  const createValue = useCreateCompanyAttributeValue();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPicking, setDialogPicking] = useState("");
  const [pendingAttributes, setPendingAttributes] = useState<WizardAttribute[]>([]);
  /** Accordion open keys — first generated combo open by default. */
  const [openVariantKeys, setOpenVariantKeys] = useState<Set<string>>(new Set());

  const pendingChosenIds = new Set(pendingAttributes.map((entry) => entry.attributeId));
  // Already-committed options stay pickable — merchant re-adds Size to attach
  // Small/Medium after Large already generated. Only the in-dialog pending
  // list blocks duplicates.
  const dialogAvailable = (allAttributesQuery.data ?? []).filter(
    (entry) => !pendingChosenIds.has(entry.id),
  );

  function removeAttribute(key: string) {
    onChange(attributes.filter((entry) => entry.key !== key));
  }

  function updateValues(key: string, values: { id: string; name: string }[]) {
    onChange(attributes.map((entry) => (entry.key === key ? { ...entry, values } : entry)));
  }

  function openDialog() {
    setPendingAttributes([]);
    setDialogPicking("");
    setDialogOpen(true);
  }

  function addPendingOption(id: string) {
    const found = (allAttributesQuery.data ?? []).find((entry) => entry.id === id);
    if (!found) return;
    if (pendingChosenIds.has(id)) return;
    const committed = attributes.find((entry) => entry.attributeId === id);
    setPendingAttributes((current) => [
      ...current,
      {
        key: newRowKey(),
        attributeId: found.id,
        attributeName: found.name,
        // Re-picking an option already on the product seeds its current
        // values so Available chips show only the ones not yet used.
        values: committed ? committed.values.map((value) => ({ ...value })) : [],
      },
    ]);
    setDialogPicking("");
  }

  function createAndAddPendingOption(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = (allAttributesQuery.data ?? []).find(
      (entry) => entry.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      if (pendingChosenIds.has(existing.id)) {
        toast.error(`"${existing.name}" is already added.`);
        return;
      }
      addPendingOption(existing.id);
      return;
    }
    createAttribute.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => {
          setPendingAttributes((current) => [
            ...current,
            { key: newRowKey(), attributeId: created.id, attributeName: created.name, values: [] },
          ]);
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create that attribute."),
      },
    );
  }

  function updatePendingValues(key: string, values: { id: string; name: string }[]) {
    setPendingAttributes((current) => current.map((entry) => (entry.key === key ? { ...entry, values } : entry)));
  }

  function removePendingOption(key: string) {
    setPendingAttributes((current) => current.filter((entry) => entry.key !== key));
  }

  const canGenerate = pendingAttributes.length > 0 && pendingAttributes.every((entry) => entry.values.length > 0);

  function generateVariants() {
    if (!canGenerate) return;
    // Same attributeId again = more values on that option, not a second Size row.
    let next = [...attributes];
    for (const pending of pendingAttributes) {
      const existingIndex = next.findIndex((entry) => entry.attributeId === pending.attributeId);
      if (existingIndex >= 0) {
        const existing = next[existingIndex]!;
        const seen = new Set(existing.values.map((value) => value.id));
        next[existingIndex] = {
          ...existing,
          values: [
            ...existing.values,
            ...pending.values.filter((value) => !seen.has(value.id)),
          ],
        };
      } else {
        next = [...next, pending];
      }
    }
    onChange(next);
    setDialogOpen(false);
  }

  const combos = cartesianProduct(attributes.map((entry) => entry.values));
  const excludedSet = new Set(excludedVariantKeys);
  const visibleCombos = combos.filter((combo) => !excludedSet.has(comboKey(combo)));
  const comboKeysSignature = visibleCombos.map((combo) => comboKey(combo)).join("\0");

  useEffect(() => {
    if (0 === visibleCombos.length) {
      setOpenVariantKeys(new Set());
      return;
    }
    setOpenVariantKeys(new Set([comboKey(visibleCombos[0]!)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reopen first when the visible combo set changes.
  }, [comboKeysSignature]);

  function toggleVariantAccordion(key: string) {
    setOpenVariantKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function deleteVariant(key: string) {
    onExcludeVariant(key);
    setOpenVariantKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader
        icon={Tag}
        title="Variant Options"
        description="Choose the options that make this product different, such as size, color, flavor, or other variations."
        action={
          attributes.length > 0 ? (
            <Button type="button" size="sm" icon={Plus} onClick={openDialog}>
              Add Option
            </Button>
          ) : undefined
        }
      />
      <CardBody className="space-y-4">
        {0 === attributes.length ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <p className="text-body text-ink-muted">No options added yet.</p>
            <Button type="button" icon={Plus} onClick={openDialog}>
              Add Option
            </Button>
          </div>
        ) : 0 === combos.length ? (
          // Some option still has zero values — nothing to configure yet,
          // so option/value editing stays visible until every option has
          // at least one value.
          <div className="divide-y divide-border">
            {attributes.map((attribute, index) => {
              const full = (allAttributesQuery.data ?? []).find((entry) => entry.id === attribute.attributeId);
              return (
                <div key={attribute.key} className="py-4 first:pt-0 last:pb-0">
                  <VariantOptionGroup
                    attribute={attribute}
                    index={index}
                    fullValues={full?.values ?? []}
                    createValue={createValue}
                    onAddValue={(value) => updateValues(attribute.key, [...attribute.values, value])}
                    onRemoveValue={(id) =>
                      updateValues(attribute.key, attribute.values.filter((entry) => entry.id !== id))
                    }
                    onRemoveOption={() => removeAttribute(attribute.key)}
                  />
                </div>
              );
            })}
            <p className="pt-4 text-body text-ink-muted">Add at least one value per option to preview variants.</p>
          </div>
        ) : (
          // Variants are generated — this is where they get configured, so
          // the raw option/value editing UI steps aside in favor of the
          // full per-variant form below. Add Option (above) still reopens
          // the dialog to add more options.
          <div className="space-y-6">
            <div>
              <p className="text-body font-medium text-ink">Expected variants</p>
              <p className="text-caption text-ink-muted">
                SKU and cost price (from the suppliers step) are assigned once you finish.
              </p>
            </div>

            <Field
              label="Opening stock note"
              hint="Optional. Shared across every variant's opening stock movements."
              required={false}
            >
              <Input
                value={stockNote}
                onChange={(event) => onStockNoteChange(event.target.value)}
                placeholder="Opening stock"
              />
            </Field>

            {visibleCombos.map((combo, index) => {
              const key = comboKey(combo);
              const config = { ...emptyVariantConfig(), ...variantConfig[key] };
              const setConfig = (patch: Partial<WizardVariantConfig>) =>
                onVariantConfigChange(key, { ...config, ...patch });
              const variantLabel = `${productName} ${combo.map((value) => value.name).join(" ")}`;
              const expanded = openVariantKeys.has(key);

              return (
                <div key={key} className={`overflow-hidden rounded-md border border-border bg-surface ${config.isActive ? "" : "opacity-70"}`}>
                  <div className="flex items-center gap-1 pr-2">
                    <button
                      type="button"
                      onClick={() => toggleVariantAccordion(key)}
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-paper"
                    >
                      <span className="min-w-0 flex-1 text-body font-medium text-ink">
                        {index + 1}. {variantLabel}
                      </span>
                      {!config.isActive ? <Badge tone="neutral">Hidden</Badge> : null}
                      <ChevronDown
                        size={16}
                        strokeWidth={2}
                        className={`shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    <IconButton
                      icon={Trash2}
                      label={`Remove ${variantLabel}`}
                      tone="danger"
                      onClick={() => deleteVariant(key)}
                    />
                  </div>

                  {expanded ? (
                    <div className="grid items-start gap-4 border-t border-border p-4 lg:grid-cols-2">
                      <div className="space-y-4 lg:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-paper px-3 py-2.5">
                          <div>
                            <p className="text-body font-medium text-ink">Show on terminals</p>
                            <p className="text-caption text-ink-muted">
                              Hidden variants stay in admin but stop appearing on POS after the next sync.
                            </p>
                          </div>
                          <ToggleSwitch
                            name={`is_active__${key}`}
                            checked={config.isActive}
                            onChange={(checked) => setConfig({ isActive: checked })}
                            label={config.isActive ? "Shown" : "Hidden"}
                          />
                        </div>
                        <div className="rounded-sm border border-border bg-paper px-3 py-2.5">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={config.isBundle}
                              onChange={(event) => setConfig({ isBundle: event.target.checked })}
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="text-body">This variant is a bundle (kit)</span>
                          </label>
                          <p className="mt-1 text-caption text-ink-muted">
                            Recipe components are set after create on the Variants tab.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <FormSection
                          title="Pricing"
                          description="Shelf price is what customers pay. Cost can be set here or left for suppliers on the next step."
                        >
                          <Field label="Shelf price" required={false}>
                            <MoneyInput
                              type="number"
                              step="0.01"
                              min="0"
                              value={config.price}
                              onChange={(event) => setConfig({ price: event.target.value })}
                            />
                          </Field>
                          <Field
                            label="Cost price"
                            hint="Supplier cost for this variant. Leave blank to resolve from suppliers on the next step."
                            required={false}
                          >
                            <MoneyInput
                              type="number"
                              step="0.01"
                              min="0"
                              value={config.costPrice}
                              onChange={(event) => setConfig({ costPrice: event.target.value })}
                            />
                          </Field>
                          <Field
                            label="Bulk / contractor price"
                            hint="Optional. Needs a minimum quantity."
                            required={false}
                          >
                            <MoneyInput
                              type="number"
                              step="0.01"
                              min="0"
                              value={config.bulkPrice}
                              onChange={(event) => setConfig({ bulkPrice: event.target.value })}
                            />
                          </Field>
                          <Field
                            label="Bulk minimum quantity"
                            hint="Quantity that unlocks the bulk price."
                            required={false}
                          >
                            <Input
                              type="number"
                              step="1"
                              min="2"
                              value={config.bulkMinQuantity}
                              onChange={(event) => setConfig({ bulkMinQuantity: event.target.value })}
                            />
                          </Field>
                        </FormSection>

                        <FormSection
                          title="Photos"
                          description="Shown on mobile terminals for this variant. Add several — the first becomes the cover."
                        >
                          <div className="sm:col-span-2">
                            <PendingPhotoGallery
                              files={variantPhotos[key] ?? []}
                              onChange={(files) => onVariantPhotosChange(key, files)}
                            />
                          </div>
                        </FormSection>
                      </div>

                      <FormSection
                        title="Manage Stock"
                        description="Identifiers, how quantities are counted, and stock on hand."
                        action={
                          <ToggleSwitch
                            name={`is_track_inventory__${key}`}
                            checked={config.trackInventory}
                            onChange={(checked) => setConfig({ trackInventory: checked })}
                            label="Track inventory"
                          />
                        }
                      >
                        {!config.trackInventory ? (
                          <p className="flex items-start gap-2 text-caption text-ink-muted sm:col-span-2">
                            <Info size={14} className="mt-0.5 shrink-0" />
                            <span>
                              Disabled for services, fees, or other non-inventory items. No SKU, quantity mode, or
                              stock fields are needed.
                            </span>
                          </p>
                        ) : null}
                        <div className={config.trackInventory ? "contents" : "hidden"}>
                          <Field label="Barcode" hint="Optional. Scanned at the counter." required={false}>
                            <BarcodeFieldWithScan
                              value={config.barcode}
                              onChange={(barcode) => setConfig({ barcode })}
                            />
                          </Field>
                          <div />
                          <div className="sm:col-span-2 border-t border-border pt-4">
                            <p className="text-body font-medium text-ink">Minimum Stock (Replenish)</p>
                            <p className="text-caption text-ink-muted">
                              Flags restocking — does not change stock on its own.
                            </p>
                          </div>
                          <Field
                            label="Reorder at"
                            hint="Flag for restocking at or below this count."
                            required={false}
                          >
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              value={config.reorderPoint}
                              onChange={(event) => setConfig({ reorderPoint: event.target.value })}
                            />
                          </Field>
                          <Field
                            label="Replenish quantity"
                            hint="Suggested qty to order when restocking."
                            required={false}
                          >
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              value={config.replenishQuantity}
                              onChange={(event) => setConfig({ replenishQuantity: event.target.value })}
                            />
                          </Field>
                          <div className="sm:col-span-2 border-t border-border pt-4">
                            <p className="text-body font-medium text-ink">Product Stock</p>
                            <p className="text-caption text-ink-muted">
                              Optional. Creates an adjustment movement so the first quantity shows in Inventory
                              history.
                            </p>
                          </div>
                          <StockByLocationCreateTable
                            branches={branches}
                            loading={branchesLoading}
                            allowDecimal={false}
                            quantities={config.stockByLocation}
                            onChange={(locationId, value) =>
                              setConfig({
                                stockByLocation: { ...config.stockByLocation, [locationId]: value },
                              })
                            }
                            showNote={false}
                          />
                        </div>
                      </FormSection>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardBody>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Add variant options"
        description="Add one or more options and their values, then generate the resulting variant combinations."
        className="max-w-3xl sm:min-w-[640px]"
      >
        <div className="space-y-4">
          <Field
            label="Option"
            hint="Pick an existing one (even if already used — add more values), or type a new name to create it."
          >
            <Combobox
              value={dialogPicking}
              onChange={addPendingOption}
              placeholder={allAttributesQuery.isPending ? "Loading…" : "Eg. Size, Color, etc."}
              options={dialogAvailable.map((entry) => ({ value: entry.id, label: entry.name }))}
              creatable
              createOptionLabel={(typed) => `"${typed}" doesn't exist — create it`}
              onCreate={createAndAddPendingOption}
            />
          </Field>

          {pendingAttributes.length > 0 ? (
            <div className="divide-y divide-border rounded-md border border-border px-4">
              {pendingAttributes.map((attribute, index) => {
                const full = (allAttributesQuery.data ?? []).find((entry) => entry.id === attribute.attributeId);
                return (
                  <div key={attribute.key} className="py-4 first:pt-0 last:pb-0">
                    <VariantOptionGroup
                      index={index + 1}
                      attribute={attribute}
                      fullValues={full?.values ?? []}
                      createValue={createValue}
                      onAddValue={(value) => updatePendingValues(attribute.key, [...attribute.values, value])}
                      onRemoveValue={(id) =>
                        updatePendingValues(attribute.key, attribute.values.filter((entry) => entry.id !== id))
                      }
                      onRemoveOption={() => removePendingOption(attribute.key)}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" icon={Check} disabled={!canGenerate} onClick={generateVariants}>
              Generate Variants
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

/**
 * Step 3 of the with-variants create flow — one PendingSupplierLinksEditor
 * per previewed combo (nothing exists to attach to yet), keyed by the
 * combo's own label so going back to step 2 and changing attributes never
 * scrambles suppliers already entered for a combo that still exists.
 * Same FormSection chrome as the single-product Suppliers block.
 */
function WizardVariantSuppliersStep({
  productName,
  combos,
  links,
  onChange,
}: {
  productName: string;
  combos: { id: string; name: string }[][];
  links: Record<string, PendingSupplierLink[]>;
  onChange: (key: string, links: PendingSupplierLink[]) => void;
}) {
  if (combos.length === 0) {
    return (
      <Card className="px-4 py-8 text-center text-body text-ink-muted">
        No variants were configured — go back to add at least one attribute value.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {combos.map((combo, index) => {
        const key = comboKey(combo);
        const variantLabel = `${productName} ${combo.map((value) => value.name).join(" ")}`;
        return (
          <div key={key} className="space-y-3">
            <p className="text-body-lg font-medium text-ink">
              {index + 1}. {variantLabel}
            </p>
            <FormSection title="Suppliers" description="Who this product is sourced from, and at what cost.">
              <PendingSupplierLinksEditor links={links[key] ?? []} onChange={(next) => onChange(key, next)} />
            </FormSection>
          </div>
        );
      })}
    </div>
  );
}

function plainPreviewText(value: string | null | undefined): string {
  if (!value) return "—";
  const stripped = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped || "—";
}

function previewMoney(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "—";
  const amount = Number(trimmed);
  return Number.isFinite(amount) ? formatMoney(amount) : "—";
}

const EMPTY_PENDING_FILES: File[] = [];

function PreviewPhotoThumbs({ files }: { files: File[] }) {
  if (0 === files.length) {
    return <span className="text-ink-muted">None</span>;
  }
  // Match PendingPhotoGallery: blob URL in render, never revoke here.
  // useState/useEffect + revoke breaks under Strict Mode (remount restores
  // state whose object URL the cleanup already revoked).
  return (
    <span className="mt-1 flex flex-wrap gap-2">
      {files.map((file, index) => (
        <span
          key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
          className="relative inline-block size-20 overflow-hidden rounded-sm border border-border bg-paper"
        >
          <img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" />
          {0 === index ? (
            <span className="absolute left-0.5 top-0.5 rounded-sm bg-primary px-1 text-[9px] font-medium text-white">
              Cover
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** Big scrollable create-confirm — free-text inventory of product + every variant before the API call. */
function WizardCreatePreviewDialog({
  open,
  onClose,
  onConfirm,
  pending,
  productDetails,
  categoryLabel,
  brandLabel,
  productPhotos,
  attributes,
  combos,
  variantConfig,
  variantPhotos,
  variantSuppliers,
  branches,
  stockNote,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  productDetails: WizardProductDetails;
  categoryLabel: string;
  brandLabel: string;
  productPhotos: File[];
  attributes: WizardAttribute[];
  combos: { id: string; name: string }[][];
  variantConfig: Record<string, WizardVariantConfig>;
  variantPhotos: Record<string, File[]>;
  variantSuppliers: Record<string, PendingSupplierLink[]>;
  branches: { id: string; name: string }[];
  stockNote: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Review product before creating"
      description="Check every detail below. Creating cannot be undone from this screen."
      className="!max-h-[min(92vh,900px)] !max-w-6xl sm:!min-w-[min(94vw,64rem)]"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Back to edit
          </Button>
          <Button type="button" icon={Check} loading={pending} onClick={onConfirm}>
            Create product
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-body leading-relaxed text-ink">
        <section className="grid gap-5 border-b border-border pb-5 lg:grid-cols-3">
          <div className="space-y-1 lg:col-span-2">
            <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">Product</p>
            <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <p>
                <span className="text-ink-muted">Name: </span>
                {productDetails.name || "—"}
              </p>
              <p>
                <span className="text-ink-muted">Type: </span>
                {productDetails.productType || "—"}
              </p>
              <p>
                <span className="text-ink-muted">Category: </span>
                {categoryLabel}
              </p>
              <p>
                <span className="text-ink-muted">Brand: </span>
                {brandLabel}
              </p>
              <p className="sm:col-span-2">
                <span className="text-ink-muted">Tags: </span>
                {productDetails.tags.length > 0
                  ? productDetails.tags.map((tag) => tag.name).join(", ")
                  : "—"}
              </p>
              <p className="sm:col-span-2">
                <span className="text-ink-muted">Description: </span>
                {plainPreviewText(productDetails.description)}
              </p>
              <p>
                <span className="text-ink-muted">Notes: </span>
                {plainPreviewText(productDetails.notes)}
              </p>
              <p>
                <span className="text-ink-muted">Opening stock note: </span>
                {plainPreviewText(stockNote)}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">Photos</p>
              <PreviewPhotoThumbs files={productPhotos} />
            </div>
            <div>
              <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">Options</p>
              {0 === attributes.length ? (
                <p className="mt-1">—</p>
              ) : (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {attributes.map((attribute) => (
                    <li key={attribute.key}>
                      {attribute.attributeName}:{" "}
                      {attribute.values.map((value) => value.name).join(", ") || "—"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
            Variants ({combos.length})
          </p>
          {0 === combos.length ? (
            <p className="text-ink-muted">No variants to create.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {combos.map((combo, index) => {
                const key = comboKey(combo);
                const config = { ...emptyVariantConfig(), ...variantConfig[key] };
                const suppliers = variantSuppliers[key] ?? [];
                const photos = variantPhotos[key] ?? EMPTY_PENDING_FILES;
                const stockLines = branches
                  .map((branch) => {
                    const qty = config.stockByLocation[branch.id]?.trim() ?? "";
                    if (!qty) return null;
                    return `${branch.name}: ${qty}`;
                  })
                  .filter(Boolean);

                return (
                  <div
                    key={key}
                    className="space-y-1 rounded-md border border-border bg-paper/40 p-3"
                  >
                    <p className="font-semibold text-ink">
                      {index + 1}. {productDetails.name}{" "}
                      {combo.map((value) => value.name).join(" ")}
                    </p>
                    <p>
                      <span className="text-ink-muted">Shelf: </span>
                      {previewMoney(config.price)}
                      <span className="text-ink-muted"> · Cost: </span>
                      {previewMoney(config.costPrice)}
                    </p>
                    <p>
                      <span className="text-ink-muted">Bulk: </span>
                      {previewMoney(config.bulkPrice)}
                      {config.bulkMinQuantity.trim()
                        ? ` (min ${config.bulkMinQuantity.trim()})`
                        : ""}
                    </p>
                    <p>
                      <span className="text-ink-muted">Barcode: </span>
                      {config.barcode.trim() || "—"}
                    </p>
                    <p>
                      <span className="text-ink-muted">Track inventory: </span>
                      {config.trackInventory ? "Yes" : "No"}
                    </p>
                    {config.trackInventory ? (
                      <>
                        <p>
                          <span className="text-ink-muted">Reorder / replenish: </span>
                          {config.reorderPoint.trim() || "—"}
                          {" / "}
                          {config.replenishQuantity.trim() || "—"}
                        </p>
                        <p>
                          <span className="text-ink-muted">Opening stock: </span>
                          {stockLines.length > 0 ? stockLines.join(" · ") : "—"}
                        </p>
                      </>
                    ) : null}
                    <div>
                      <p className="text-ink-muted">Suppliers:</p>
                      {0 === suppliers.length ? (
                        <p>—</p>
                      ) : (
                        <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                          {suppliers.map((link) => (
                            <li key={link.key}>
                              {link.supplierName}
                              {link.supplierSku.trim()
                                ? ` · SKU ${link.supplierSku.trim()}`
                                : ""}
                              {link.supplierPrice.trim()
                                ? ` · ${previewMoney(link.supplierPrice)}`
                                : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-ink-muted">Photos:</p>
                      <PreviewPhotoThumbs files={photos} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Dialog>
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
  const searchParams = useSearchParams();
  const [state, action, pending] = useActionState(
    saveProduct,
    EMPTY_FORM_STATE,
  );
  const invalidate = useInvalidateProducts();
  const setBundleItems = useSetBundleItems();
  const [pendingGalleryFiles, setPendingGalleryFiles] = useState<File[]>([]);
  const [pendingSupplierLinks, setPendingSupplierLinks] = useState<PendingSupplierLink[]>([]);
  const [stockQuantities, setStockQuantities] = useState<Record<string, string>>({});
  const [stockNote, setStockNote] = useState("");
  const [description, setDescription] = useState(product?.descriptionHtml ?? product?.description ?? "");
  const locationsQuery = useLocations({ type: "branch" });
  const branches = locationsQuery.data ?? [];

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
  const [trackInventory, setTrackInventory] = useState(product?.isTrackInventory ?? true);
  const [productIsActive, setProductIsActive] = useState(product?.isActive ?? true);

  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
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
  const formRef = useRef<HTMLFormElement>(null);
  const saveConfirmedRef = useRef(false);
  const draftKey = draftStorageKey(product?.id);
  const pendingDraftRef = useRef<ProductFormDraft | null>(null);
  const pendingPhotosRef = useRef<DraftPhotosState | null>(null);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [draftConfirmAction, setDraftConfirmAction] = useState<"reload" | "clear" | null>(null);

  // A leftover draft only ever means something at the moment this page first
  // opens — captured once, into a ref, so autosave below (which starts
  // overwriting the same storage key right away) can't erase what "Restore"
  // is supposed to bring back. Photos live in IndexedDB beside the JSON.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = readStoredDraft(draftKey);
      const photos = await readDraftPhotos(draftKey);
      if (cancelled) return;
      if (!draft && !draftPhotosHaveContent(photos)) return;
      pendingDraftRef.current = draft ?? { version: 2, fields: {} };
      pendingPhotosRef.current = photos;
      setDraftAvailable(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once, on mount, for this instance's own draft slot.
  }, []);

  const [tab, setTab] = useState<ProductFormTab>(() => {
    const raw = searchParams.get("tab");
    return PRODUCT_FORM_TABS.some((entry) => entry.id === raw) ? (raw as ProductFormTab) : "details";
  });
  // Create-mode only — meaningless once a product already exists. Purely a
  // client-side UI choice: it decides which fields the create form shows,
  // whether the backend skips creating a default variant (nothing to
  // represent yet — see skip_default_variant below), and what the rest of
  // this page looks like once step 1 is saved. Cached so a refresh keeps
  // the last pick without waiting on the draft banner.
  const [productKind, setProductKind] = useState<"single" | "with_variants">("single");
  // Create: productKind. Edit: one SKU (default only) → Details hosts show/hide;
  // multi-variant products use per-variant toggles instead.
  const isSingleProductUi = !product
    ? "single" === productKind
    : !variantsQuery.isPending && (variantsQuery.data?.length ?? 0) <= 1;
  const [productKindInfoOpen, setProductKindInfoOpen] = useState<"single" | "with_variants" | null>(null);
  const [kindSwitchConfirmOpen, setKindSwitchConfirmOpen] = useState(false);

  useEffect(() => {
    if (product) return;
    const cached = readCachedProductKind();
    if (cached) setProductKind(cached);
  }, [product]);

  // Step 1 = product details, step 2 = variants — only meaningful for the
  // with_variants create flow. Set once the reduced create form saves;
  // swaps this whole page into the stepper below instead of navigating
  // anywhere, so it reads as one flow, not a redirect.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Captured once step 1's "Continue" validates — nothing is created until
  // the final "Finish" on step 3, so this is pure local state, not a real
  // product.
  const [wizardProduct, setWizardProduct] = useState<WizardProductDetails | null>(null);
  const [wizardAttributes, setWizardAttributes] = useState<WizardAttribute[]>([]);
  // Keyed by the combo's own label (e.g. "Red / Small"), not array index —
  // going back to step 2 and changing the attribute selection shouldn't
  // scramble suppliers already entered for a combo that still exists.
  const [wizardVariantSuppliers, setWizardVariantSuppliers] = useState<Record<string, PendingSupplierLink[]>>({});
  const [wizardVariantConfig, setWizardVariantConfig] = useState<Record<string, WizardVariantConfig>>({});
  const [wizardVariantPhotos, setWizardVariantPhotos] = useState<Record<string, File[]>>({});
  const [wizardExcludedVariantKeys, setWizardExcludedVariantKeys] = useState<string[]>([]);
  const [wizardStockNote, setWizardStockNote] = useState("");

  // Debounced autosave of every plain form field. Re-binds when the create
  // wizard returns to step 1 (form remounts after steps 2/3 unmount it).
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let timeout: ReturnType<typeof setTimeout>;
    function save() {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        writeStoredDraft(draftKey, { fields: readFormDraft(form!) });
      }, 600);
    }
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    return () => {
      clearTimeout(timeout);
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
    };
  }, [draftKey, step, productKind]);

  // Wizard / product-kind slice — steps 2–3 have no form, so this is the
  // only way options, per-variant pricing/stock, and suppliers survive a refresh.
  useEffect(() => {
    if (product) return;
    const timeout = setTimeout(() => {
      writeStoredDraft(draftKey, {
        productKind,
        step,
        wizardProduct,
        wizardAttributes,
        wizardVariantConfig,
        wizardVariantSuppliers,
        wizardExcludedVariantKeys,
        wizardStockNote,
      });
    }, 600);
    return () => clearTimeout(timeout);
  }, [
    product,
    draftKey,
    productKind,
    step,
    wizardProduct,
    wizardAttributes,
    wizardVariantConfig,
    wizardVariantSuppliers,
    wizardExcludedVariantKeys,
    wizardStockNote,
  ]);

  // Product + per-variant gallery Files — IndexedDB, not localStorage JSON.
  useEffect(() => {
    if (product) return;
    const timeout = setTimeout(() => {
      void writeDraftPhotos(draftKey, pendingGalleryFiles, wizardVariantPhotos);
    }, 600);
    return () => clearTimeout(timeout);
  }, [product, draftKey, pendingGalleryFiles, wizardVariantPhotos]);

  function restoreDraft() {
    const draft = pendingDraftRef.current;
    if (!draft && !draftPhotosHaveContent(pendingPhotosRef.current)) return;

    const fields = draft?.fields ?? {};
    const form = formRef.current;

    function setValue(name: string, value: string) {
      if (!form) return;
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        el.value = value;
      }
    }
    function setChecked(name: string, checked: boolean) {
      if (!form) return;
      const el = form.elements.namedItem(name);
      if (el instanceof HTMLInputElement) el.checked = checked;
    }

    // Uncontrolled fields restore straight onto the DOM node. Controlled
    // fields (their value lives in React state, not the input) go through
    // the matching setter instead — writing .value directly would just be
    // overwritten on the next render.
    if ("string" === typeof fields.name) setValue("name", fields.name);
    if ("string" === typeof fields.sku) setSku(fields.sku);
    if ("string" === typeof fields.barcode) setBarcode(fields.barcode);
    if ("string" === typeof fields.description) setDescription(fields.description);
    if ("string" === typeof fields.notes) setValue("notes", fields.notes);
    if ("string" === typeof fields.brand_id) setBrandId(fields.brand_id);
    if ("string" === typeof fields.product_type) setValue("product_type", fields.product_type);
    if ("string" === typeof fields.category_id) setCategoryId(fields.category_id);
    if ("string" === typeof fields.unit && isProductUnit(fields.unit)) setUnit(fields.unit);
    if ("boolean" === typeof fields.allow_decimal) setAllowDecimal(fields.allow_decimal);
    if ("string" === typeof fields.cost_price) setCostPrice(fields.cost_price);
    if ("string" === typeof fields.price) setPrice(fields.price);
    if ("string" === typeof fields.bulk_price) setValue("bulk_price", fields.bulk_price);
    if ("string" === typeof fields.bulk_min_quantity) setValue("bulk_min_quantity", fields.bulk_min_quantity);
    if ("boolean" === typeof fields.is_bundle) setIsBundle(fields.is_bundle);
    if ("boolean" === typeof fields.is_sellable) setChecked("is_sellable", fields.is_sellable);
    if ("boolean" === typeof fields.is_purchasable) setChecked("is_purchasable", fields.is_purchasable);
    if ("boolean" === typeof fields.is_track_inventory) setChecked("is_track_inventory", fields.is_track_inventory);
    if ("string" === typeof fields.reorder_point) setValue("reorder_point", fields.reorder_point);
    if ("string" === typeof fields.replenish_quantity) setValue("replenish_quantity", fields.replenish_quantity);

    const kind =
      draft?.productKind ??
      ("single" === fields.product_kind || "with_variants" === fields.product_kind ? fields.product_kind : null);
    if (kind) {
      setProductKind(kind);
      writeCachedProductKind(kind);
    }

    if (undefined !== draft?.wizardProduct) {
      setWizardProduct(draft.wizardProduct);
      if (draft.wizardProduct?.tags) setTags(draft.wizardProduct.tags);
      if (draft.wizardProduct?.brandId) setBrandId(draft.wizardProduct.brandId);
      if (draft.wizardProduct?.description) setDescription(draft.wizardProduct.description);
    }
    if (draft?.wizardAttributes) setWizardAttributes(draft.wizardAttributes);
    if (draft?.wizardVariantConfig) setWizardVariantConfig(draft.wizardVariantConfig);
    if (draft?.wizardVariantSuppliers) setWizardVariantSuppliers(draft.wizardVariantSuppliers);
    if (draft?.wizardExcludedVariantKeys) setWizardExcludedVariantKeys(draft.wizardExcludedVariantKeys);
    if ("string" === typeof draft?.wizardStockNote) setWizardStockNote(draft.wizardStockNote);
    if (1 === draft?.step || 2 === draft?.step || 3 === draft?.step) setStep(draft.step);

    const photos = pendingPhotosRef.current;
    if (photos) {
      setPendingGalleryFiles(photos.productPhotos);
      setWizardVariantPhotos(photos.variantPhotos);
    }

    setDraftAvailable(false);
    toast.success("Draft restored.");
  }

  function discardDraft() {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Nothing to clean up if storage isn't available.
    }
    void clearDraftPhotos(draftKey);
    pendingDraftRef.current = null;
    pendingPhotosRef.current = null;
    setPendingGalleryFiles([]);
    setWizardVariantPhotos({});
    setDraftAvailable(false);
  }

  function confirmDraftAction() {
    if ("reload" === draftConfirmAction) restoreDraft();
    else if ("clear" === draftConfirmAction) discardDraft();
    setDraftConfirmAction(null);
  }

  function hasWizardVariantWork(): boolean {
    return (
      step > 1 ||
      null !== wizardProduct ||
      wizardAttributes.length > 0 ||
      Object.keys(wizardVariantConfig).length > 0 ||
      Object.keys(wizardVariantSuppliers).length > 0 ||
      "" !== wizardStockNote.trim()
    );
  }

  function clearWizardVariantWork() {
    setStep(1);
    setWizardProduct(null);
    setWizardAttributes([]);
    setWizardVariantSuppliers({});
    setWizardVariantConfig({});
    setWizardVariantPhotos({});
    setWizardExcludedVariantKeys([]);
    setWizardStockNote("");
  }

  function applyProductKind(kind: "single" | "with_variants") {
    setProductKind(kind);
    writeCachedProductKind(kind);
    if ("single" === kind) {
      clearWizardVariantWork();
    }
  }

  function selectProductKind(kind: "single" | "with_variants") {
    if (kind === productKind) return;
    // Switching back to single after options/variants work — confirm wipe first.
    if ("single" === kind && "with_variants" === productKind && hasWizardVariantWork()) {
      setKindSwitchConfirmOpen(true);
      return;
    }
    applyProductKind(kind);
  }

  function confirmSwitchToSingle() {
    applyProductKind("single");
    setKindSwitchConfirmOpen(false);
  }
  const createFullProductMutation = useCreateFullProduct();
  const brandsQuery = useBrands();
  const [createPreviewOpen, setCreatePreviewOpen] = useState(false);
  const [createProgressComplete, setCreateProgressComplete] = useState(false);
  const [brandId, setBrandId] = useState(product?.brandId ?? "");
  // Edit mode: onAdd/onRemove below hit real attach/detach mutations and
  // this just mirrors the result. Create mode: purely local — the tag ids
  // ride in the one-shot createFullProduct payload, attached server-side
  // in the same transaction as everything else.
  const [tags, setTags] = useState(product?.tags ?? []);
  const attachTag = useAttachProductTag(product?.id ?? "");
  const detachTag = useDetachProductTag(product?.id ?? "");
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [pendingSaveChanges, setPendingSaveChanges] = useState<ProductFieldChange[]>([]);

  // Toast, not an inline banner — a save success shouldn't sit at the
  // bottom of a long form waiting to be scrolled to. Only edit-mode's
  // `<form action>` still flows through `state` — create (both single and
  // with-variants) toasts from its own mutation's onSuccess instead.
  useEffect(() => {
    if (!state.ok || !product) return;
    toast.success("Product updated.");
    if (!isSingleProductUi) return;
    void persistBundleRows(setBundleItems, product.id, isBundle, bundleRows).catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Product saved, but the bundle recipe could not be saved.",
      );
    });
  }, [state]);

  function openSaveConfirm() {
    const form = formRef.current;
    if (!product || !form) return;
    const brands = brandsQuery.data ?? [];
    const changes = collectProductFormChanges(
      product,
      form,
      {
        categoryLabel: (id) => {
          if (!id) return "—";
          const match = categories.find((category) => category.id === id);
          if (match) return `${indentLabel(match)}${match.isActive ? "" : " (hidden)"}`.trim();
          if (id === product.categoryId) return product.category?.trim() || "—";
          return "—";
        },
        brandLabel: (id) => {
          if (!id) return "—";
          const match = brands.find((brand) => brand.id === id)?.name;
          if (match) return match;
          if (id === product.brandId) return product.brandName?.trim() || "—";
          return "—";
        },
      },
      {
        description,
        reorderPoint: defaultVariant?.reorderPoint ?? product.reorderPoint,
        replenishQuantity: defaultVariant?.replenishQuantity ?? product.replenishQuantity,
      },
    );
    if (changes.length === 0) {
      toast.message("No changes to save.");
      return;
    }
    setPendingSaveChanges(changes);
    setSaveConfirmOpen(true);
  }

  function confirmSaveChanges() {
    const form = formRef.current;
    if (!form) return;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    setSaveConfirmOpen(false);
    saveConfirmedRef.current = true;
    form.requestSubmit();
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (saveConfirmedRef.current) {
      saveConfirmedRef.current = false;
      return;
    }
    event.preventDefault();
    openSaveConfirm();
  }

  function onUnitChange(next: string) {
    if (!isProductUnit(next)) return;
    setUnit(next);
    if (!decimalTouched) setAllowDecimal(defaultAllowDecimal(next));
  }

  /**
   * Single-product create only — everything the form (and its deferred
   * gallery/supplier/opening-stock state) has collected, sent as one
   * createFullProduct call. Edit mode never reaches here (its `<form>`
   * still submits via the `action` server action, unchanged); the
   * with-variants wizard's step 1 branches into capturing local state
   * instead, below.
   */
  async function handleCreateSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      toast.error("Product name is required.");
      return;
    }

    if ("with_variants" === productKind) {
      setWizardProduct({
        name,
        description: description.trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
        categoryId: categoryId || null,
        brandId: brandId || null,
        productType: String(formData.get("product_type") ?? "physical"),
        tags,
      });
      setStep(2);
      return;
    }

    const openingStock: { locationId: string; quantity: number }[] = [];
    for (const [locationId, raw] of Object.entries(stockQuantities)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const quantity = Number(trimmed);
      const floor = allowDecimal ? 0.001 : 1;
      if (!Number.isFinite(quantity) || quantity <= 0 || !isValidQuantity(quantity, allowDecimal, floor)) {
        toast.error(
          allowDecimal
            ? "Opening stock must be greater than zero."
            : "Opening stock must be a whole number greater than zero.",
        );
        return;
      }
      openingStock.push({ locationId, quantity });
    }

    const input: CreateFullProductInput = {
      productKind: "single",
      product: {
        name,
        description: description.trim() || null,
        sku: sku.trim() || null,
        price: Number(price || 0),
        costPrice: Number(costPrice || 0),
        categoryId: categoryId || null,
        unit,
        barcode: String(formData.get("barcode") ?? "").trim() || null,
        reorderPoint: formData.has("reorder_point") ? Number(formData.get("reorder_point")) : undefined,
        replenishQuantity: formData.has("replenish_quantity") ? Number(formData.get("replenish_quantity")) : undefined,
        bulkPrice: formData.get("bulk_price") ? Number(formData.get("bulk_price")) : null,
        bulkMinQuantity: formData.get("bulk_min_quantity") ? Number(formData.get("bulk_min_quantity")) : null,
        allowDecimal,
        isBundle,
        productType: String(formData.get("product_type") ?? "physical"),
        notes: String(formData.get("notes") ?? "").trim() || null,
        isSellable: formData.get("is_sellable") !== null,
        isPurchasable: formData.get("is_purchasable") !== null,
        isTrackInventory: trackInventory,
        isActive: productIsActive,
      },
      brand: brandId ? { id: brandId } : null,
      tags: tags.map((tag) => ({ id: tag.id })),
      openingStock,
      openingStockNote: stockNote.trim() || null,
      suppliers: pendingSupplierLinks.map((link) => ({
        supplierId: link.supplierId,
        supplierSku: link.supplierSku.trim() || null,
        supplierPrice: link.supplierPrice.trim() ? Number(link.supplierPrice) : null,
      })),
    };

    createFullProductMutation.mutate(
      { input, photos: pendingGalleryFiles },
      {
        onSuccess: async ({ product: created }) => {
          try {
            window.localStorage.removeItem(draftKey);
            window.localStorage.removeItem(PRODUCT_KIND_STORAGE_KEY);
          } catch {
            // Nothing to clean up if storage isn't available.
          }
          void clearDraftPhotos(draftKey);
          toast.success("Product added.");

          // The one deliberate follow-up call — a bundle recipe references
          // other existing products by id, not vocabulary this endpoint
          // needs to find-or-create, so it stays its own small call.
          const validRows = bundleRows.filter((row) => row.productId && Number(row.quantity) > 0);
          if (isBundle && validRows.length > 0) {
            try {
              await setBundleItems.mutateAsync({
                id: created.id,
                items: validRows.map((row) => ({ productId: row.productId, quantity: Number(row.quantity) })),
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
          if (saveRedirectHref) {
            router.push(saveRedirectHref as Route);
          }
        },
        onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the product."),
      },
    );
  }

  /** With-variants wizard's step 3 "Finish" — the one and only API call for this whole flow. */
  function handleWizardFinish() {
    if (!wizardProduct) return;
    const excluded = new Set(wizardExcludedVariantKeys);
    const combos = cartesianProduct(wizardAttributes.map((attribute) => attribute.values)).filter(
      (combo) => !excluded.has(comboKey(combo)),
    );

    const input: CreateFullProductInput = {
      productKind: "with_variants",
      product: {
        name: wizardProduct.name,
        description: wizardProduct.description,
        notes: wizardProduct.notes,
        categoryId: wizardProduct.categoryId,
        productType: wizardProduct.productType,
      },
      brand: wizardProduct.brandId ? { id: wizardProduct.brandId } : null,
      tags: wizardProduct.tags.map((tag) => ({ id: tag.id })),
      attributes: wizardAttributes.map((attribute) => ({
        id: attribute.attributeId,
        values: attribute.values.map((value) => ({ id: value.id })),
      })),
      variantSuppliers: combos.map((combo) =>
        (wizardVariantSuppliers[comboKey(combo)] ?? []).map((link) => ({
          supplierId: link.supplierId,
          supplierSku: link.supplierSku.trim() || null,
          supplierPrice: link.supplierPrice.trim() ? Number(link.supplierPrice) : null,
        })),
      ),
      variants: combos.map((combo) => {
        const config = wizardVariantConfig[comboKey(combo)] ?? emptyVariantConfig();
        const trackInventory = false !== config.trackInventory;
        return {
          price: config.price.trim() ? Number(config.price) : null,
          costPrice: config.costPrice.trim() ? Number(config.costPrice) : null,
          barcode: config.barcode.trim() || null,
          reorderPoint: config.reorderPoint.trim() ? Number(config.reorderPoint) : undefined,
          replenishQuantity: config.replenishQuantity.trim() ? Number(config.replenishQuantity) : undefined,
          bulkPrice: config.bulkPrice.trim() ? Number(config.bulkPrice) : null,
          bulkMinQuantity: config.bulkMinQuantity.trim() ? Number(config.bulkMinQuantity) : null,
          isActive: false !== config.isActive,
          isBundle: true === config.isBundle,
          openingStock: trackInventory
            ? Object.entries(config.stockByLocation)
                .filter(([, quantity]) => "" !== quantity.trim() && Number(quantity) > 0)
                .map(([locationId, quantity]) => ({ locationId, quantity: Number(quantity) }))
            : [],
        };
      }),
      openingStockNote: wizardStockNote.trim() || null,
    };

    const variantPhotos = combos.map((combo) => wizardVariantPhotos[comboKey(combo)] ?? []);

    setCreateProgressComplete(false);
    createFullProductMutation.mutate(
      { input, photos: pendingGalleryFiles, variantPhotos },
      {
        onSuccess: () => {
          setCreateProgressComplete(true);
          try {
            window.localStorage.removeItem(draftKey);
            window.localStorage.removeItem(PRODUCT_KIND_STORAGE_KEY);
          } catch {
            // Nothing to clean up if storage isn't available.
          }
          void clearDraftPhotos(draftKey);
          toast.success("Product added.");
          invalidate();
          router.push((saveRedirectHref ?? "/products") as Route);
        },
        onError: (error) => {
          setCreateProgressComplete(false);
          toast.error(error instanceof Error ? error.message : "Could not save the product.");
        },
      },
    );
  }

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

  // Step 1 has no early-return block of its own — it's just the main form
  // below (already ungated for with_variants), captured into wizardProduct
  // by handleCreateSubmit instead of creating anything.

  if (!product && "with_variants" === productKind && 2 === step) {
    const excluded = new Set(wizardExcludedVariantKeys);
    const previewCombos = cartesianProduct(wizardAttributes.map((attribute) => attribute.values)).filter(
      (combo) => !excluded.has(comboKey(combo)),
    );
    return (
      <div className="space-y-6">
        <ProductKindPicker
          productKind={productKind}
          onSelect={selectProductKind}
          infoOpen={productKindInfoOpen}
          onInfoOpenChange={setProductKindInfoOpen}
        />
        <ConfirmDialog
          open={kindSwitchConfirmOpen}
          onClose={() => setKindSwitchConfirmOpen(false)}
          onConfirm={confirmSwitchToSingle}
          title="Switch to Single Product?"
          description="You have already started setting up options or variants. Moving back to Single Product will remove that work. Continue?"
          confirmLabel="Continue"
          confirmIcon={Trash2}
        />
        <WithVariantsStepper step={2} onNavigate={setStep} />
        <WizardAttributesStep
          productName={wizardProduct?.name ?? "Product"}
          attributes={wizardAttributes}
          onChange={setWizardAttributes}
          variantConfig={wizardVariantConfig}
          onVariantConfigChange={(key, config) =>
            setWizardVariantConfig((current) => ({ ...current, [key]: config }))
          }
          variantPhotos={wizardVariantPhotos}
          onVariantPhotosChange={(key, files) =>
            setWizardVariantPhotos((current) => ({ ...current, [key]: files }))
          }
          excludedVariantKeys={wizardExcludedVariantKeys}
          onExcludeVariant={(key) => {
            setWizardExcludedVariantKeys((current) => (current.includes(key) ? current : [...current, key]));
            setWizardVariantConfig((current) => {
              const next = { ...current };
              delete next[key];
              return next;
            });
            setWizardVariantPhotos((current) => {
              const next = { ...current };
              delete next[key];
              return next;
            });
            setWizardVariantSuppliers((current) => {
              const next = { ...current };
              delete next[key];
              return next;
            });
          }}
          branches={branches}
          branchesLoading={locationsQuery.isPending}
          stockNote={wizardStockNote}
          onStockNoteChange={setWizardStockNote}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" icon={ArrowLeft} onClick={() => setStep(1)}>
            Back
          </Button>
          <Button type="button" icon={ArrowRight} disabled={0 === previewCombos.length} onClick={() => setStep(3)}>
            Next
          </Button>
        </div>
      </div>
    );
  }

  if (!product && "with_variants" === productKind && 3 === step) {
    const excluded = new Set(wizardExcludedVariantKeys);
    const combos = cartesianProduct(wizardAttributes.map((attribute) => attribute.values)).filter(
      (combo) => !excluded.has(comboKey(combo)),
    );
    const category = categories.find((entry) => entry.id === wizardProduct?.categoryId);
    const categoryLabel = category ? indentLabel(category).trim() || category.name : "—";
    const brandLabel =
      brandsQuery.data?.find((brand) => brand.id === wizardProduct?.brandId)?.name ??
      (wizardProduct?.brandId ? "—" : "—");

    return (
      <div className="space-y-6">
        <ProductKindPicker
          productKind={productKind}
          onSelect={selectProductKind}
          infoOpen={productKindInfoOpen}
          onInfoOpenChange={setProductKindInfoOpen}
        />
        <ConfirmDialog
          open={kindSwitchConfirmOpen}
          onClose={() => setKindSwitchConfirmOpen(false)}
          onConfirm={confirmSwitchToSingle}
          title="Switch to Single Product?"
          description="You have already started setting up options or variants. Moving back to Single Product will remove that work. Continue?"
          confirmLabel="Continue"
          confirmIcon={Trash2}
        />
        <WithVariantsStepper step={3} onNavigate={setStep} />
        <WizardVariantSuppliersStep
          productName={wizardProduct?.name ?? "Product"}
          combos={combos}
          links={wizardVariantSuppliers}
          onChange={(key, links) => setWizardVariantSuppliers((current) => ({ ...current, [key]: links }))}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" icon={ArrowLeft} onClick={() => setStep(2)}>
            Back
          </Button>
          <Button type="button" icon={Check} onClick={() => setCreatePreviewOpen(true)}>
            Create Product
          </Button>
        </div>
        {wizardProduct ? (
          <WizardCreatePreviewDialog
            open={createPreviewOpen}
            onClose={() => {
              if (createFullProductMutation.isPending || createProgressComplete) return;
              setCreatePreviewOpen(false);
            }}
            onConfirm={handleWizardFinish}
            pending={createFullProductMutation.isPending || createProgressComplete}
            productDetails={wizardProduct}
            categoryLabel={categoryLabel}
            brandLabel={brandLabel}
            productPhotos={pendingGalleryFiles}
            attributes={wizardAttributes}
            combos={combos}
            variantConfig={wizardVariantConfig}
            variantPhotos={wizardVariantPhotos}
            variantSuppliers={wizardVariantSuppliers}
            branches={branches}
            stockNote={wizardStockNote}
          />
        ) : null}
        <CreateProductProcessingOverlay
          open={createFullProductMutation.isPending || createProgressComplete}
          complete={createProgressComplete}
          variantCount={combos.length}
          productName={wizardProduct?.name}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {draftAvailable && (!product || "details" === tab) ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary-tint px-4 py-3">
          <span className="flex items-center gap-2 text-body text-ink">
            <RotateCcw size={16} strokeWidth={2} className="shrink-0 text-primary" />
            Unsaved changes were found from a previous visit to this page.
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setDraftConfirmAction("clear")}>
              Clear cache
            </Button>
            <Button type="button" size="sm" onClick={() => setDraftConfirmAction("reload")}>
              Reload cached data
            </Button>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={null !== draftConfirmAction}
        onClose={() => setDraftConfirmAction(null)}
        onConfirm={confirmDraftAction}
        title={"reload" === draftConfirmAction ? "Reload cached data?" : "Clear cached data?"}
        description="This will clear all the info you have now on the form. Continue?"
        confirmLabel={"reload" === draftConfirmAction ? "Reload cached data" : "Clear cache"}
        confirmIcon={"reload" === draftConfirmAction ? RotateCcw : Trash2}
      />
      <ConfirmDialog
        open={kindSwitchConfirmOpen}
        onClose={() => setKindSwitchConfirmOpen(false)}
        onConfirm={confirmSwitchToSingle}
        title="Switch to Single Product?"
        description="You have already started setting up options or variants. Moving back to Single Product will remove that work. Continue?"
        confirmLabel="Continue"
        confirmIcon={Trash2}
      />

      {/* One bordered box for tabs + the active tab's content — edit mode
          only. Create mode has no tabs (just the plain form, each of its
          FormSection cards keeping its own border), so the wrapper styling
          below is a no-op there. */}
      <div className={product ? "rounded-md border border-border bg-surface" : undefined}>
        {product ? (
          <div className="flex flex-wrap gap-1 border-b border-border px-2 pt-1">
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
        ref={formRef}
        action={product ? action : undefined}
        onSubmit={product ? handleEditSubmit : handleCreateSubmit}
        className={`space-y-6 ${product ? "p-4 sm:p-6" : ""} ${product && tab !== "details" ? "hidden" : ""}`}
      >
        {product ? <input type="hidden" name="id" value={product.id} /> : null}

        {!product ? (
          <ProductKindPicker
            productKind={productKind}
            onSelect={selectProductKind}
            infoOpen={productKindInfoOpen}
            onInfoOpenChange={setProductKindInfoOpen}
          />
        ) : null}
        {!product && "with_variants" === productKind ? (
          <div className="rounded-md border border-border bg-surface px-4 py-3">
            <WithVariantsStepper step={1} onNavigate={() => {}} />
          </div>
        ) : null}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <FormSection
              title="Name & Description"
              description="How cashiers find and identify the product on a terminal."
            >
              <div className="sm:col-span-2">
                <Field label="Product name" required>
                  <Input name="name" defaultValue={product?.name ?? wizardProduct?.name} required />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Description"
                  hint="Optional notes for staff — not printed on the receipt by default."
                  required={false}
                >
                  <RichTextEditor
                    value={description}
                    onChange={setDescription}
                    placeholder="Specs, supplier notes, shelf location…"
                  />
                  <input type="hidden" name="description" value={description} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Notes" hint="Internal only — merchant/admin information, never shown to a customer." required={false}>
                  <Textarea
                    name="notes"
                    rows={2}
                    defaultValue={product?.notes ?? wizardProduct?.notes ?? ""}
                    placeholder="Internal notes"
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Category" description="Where it sits in the catalogue.">
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
            </FormSection>

            <FormSection
              title="Product Image"
              description={
                !product && "with_variants" === productKind
                  ? "Product-level photos. Each variant can also have its own gallery on the Variants step."
                  : "Shown on mobile terminals and the product list. Add several — the first becomes the cover."
              }
            >
              <div className="sm:col-span-2">
                {!product ? (
                  <PendingPhotoGallery files={pendingGalleryFiles} onChange={setPendingGalleryFiles} />
                ) : defaultVariant ? (
                  <VariantPhotoGallery variantId={defaultVariant.id} />
                ) : (
                  <ProductBlockSkeleton />
                )}
              </div>
            </FormSection>

            {!product && "with_variants" === productKind ? (
              // Manage Stock (and its is_track_inventory toggle) doesn't
              // apply pre-variant — default to tracked, same as every other
              // field this section would otherwise submit.
              <input type="hidden" name="is_track_inventory" value="1" />
            ) : null}
            {product || "single" === productKind ? (
              <FormSection
                title="Manage Stock"
                description="Identifiers, how quantities are counted, and stock on hand."
                action={
                  <ToggleSwitch
                    name="is_track_inventory"
                    checked={trackInventory}
                    onChange={setTrackInventory}
                    label="Track inventory"
                  />
                }
              >
                {!trackInventory ? (
                  <p className="flex items-start gap-2 text-caption text-ink-muted sm:col-span-2">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <span>
                      Disabled for services, fees, or other non-inventory items. No SKU, quantity mode, or stock
                      fields are needed.
                    </span>
                  </p>
                ) : null}
                <div className={trackInventory ? "contents" : "hidden"}>
                <div>
                  <Field
                    label="Stock Keeping Unit"
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
                  <BarcodeFieldWithScan
                    name="barcode"
                    value={barcode}
                    onChange={setBarcode}
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

                <div className="sm:col-span-2 border-t border-border pt-4">
                  <p className="text-body font-medium text-ink">Minimum Stock (Replenish)</p>
                  <p className="text-caption text-ink-muted">
                    Flags restocking — does not change stock on its own.
                  </p>
                </div>
                {!product ? (
                  <>
                    <Field label="Reorder at" hint="Flag for restocking at or below this count." required>
                      <Input name="reorder_point" type="number" step="1" min="0" defaultValue={5} required />
                    </Field>
                    <Field label="Replenish quantity" hint="Suggested qty to order when restocking." required>
                      <Input name="replenish_quantity" type="number" step="1" min="0" defaultValue={0} required />
                    </Field>
                  </>
                ) : defaultVariant ? (
                  <>
                    <Field label="Reorder at" hint="Flag for restocking at or below this count." required>
                      <Input
                        name="reorder_point"
                        type="number"
                        step="1"
                        min="0"
                        defaultValue={defaultVariant.reorderPoint}
                        required
                      />
                    </Field>
                    <Field label="Replenish quantity" hint="Suggested qty to order when restocking." required>
                      <Input
                        name="replenish_quantity"
                        type="number"
                        step="1"
                        min="0"
                        defaultValue={defaultVariant.replenishQuantity}
                        required
                      />
                    </Field>
                  </>
                ) : (
                  <ProductBlockSkeleton className="sm:col-span-2" />
                )}

                <div className="sm:col-span-2 border-t border-border pt-4">
                  <p className="text-body font-medium text-ink">Product Stock</p>
                  <p className="text-caption text-ink-muted">
                    {product
                      ? "Adds stock at a branch — creates a movement in Inventory history."
                      : "Optional. Creates an adjustment movement so the first quantity shows in Inventory history."}
                  </p>
                </div>
                {!product ? (
                  <StockByLocationCreateTable
                    branches={branches}
                    loading={locationsQuery.isPending}
                    allowDecimal={allowDecimal}
                    quantities={stockQuantities}
                    onChange={(locationId, value) =>
                      setStockQuantities((current) => ({ ...current, [locationId]: value }))
                    }
                    note={stockNote}
                    onNoteChange={setStockNote}
                  />
                ) : defaultVariant ? (
                  <StockByLocationEditTable productId={product.id} variantId={defaultVariant.id} />
                ) : (
                  <ProductBlockSkeleton className="sm:col-span-2" />
                )}
                </div>
              </FormSection>
            ) : null}
          </div>

          <div className="space-y-6">
            <FormSection
              title="Product Details"
              description="Brand, type, tags, and independent switches."
            >
              <Field label="Brand" hint="Usually shared by every variant of this product." required={false}>
                <BrandPicker value={brandId} onChange={setBrandId} />
              </Field>
              <input type="hidden" name="brand_id" value={brandId} />
              <Field label="Product type" required={false}>
                <Select name="product_type" defaultValue={product?.productType ?? wizardProduct?.productType ?? "physical"}>
                  <option value="physical">Physical</option>
                  <option value="service">Service</option>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Tags" hint="For searching/filtering — a product can have several." required={false}>
                  <ProductTagsField
                    tags={tags}
                    pending={attachTag.isPending || detachTag.isPending}
                    onAdd={(tag) => {
                      if (product) {
                        attachTag.mutate(tag.id, {
                          onSuccess: () => setTags((current) => [...current, tag]),
                          onError: (error) =>
                            toast.error(error instanceof Error ? error.message : "Could not add this tag."),
                        });
                      } else {
                        setTags((current) => [...current, tag]);
                      }
                    }}
                    onRemove={(tagId) => {
                      if (product) {
                        detachTag.mutate(tagId, {
                          onSuccess: () => setTags((current) => current.filter((tag) => tag.id !== tagId)),
                          onError: (error) =>
                            toast.error(error instanceof Error ? error.message : "Could not remove this tag."),
                        });
                      } else {
                        setTags((current) => current.filter((tag) => tag.id !== tagId));
                      }
                    }}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2 space-y-2 border-t border-border pt-4">
                {product && variantsQuery.isPending ? (
                  <ProductBlockSkeleton />
                ) : isSingleProductUi ? (
                  <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-sm border border-border bg-surface px-3 py-2.5">
                    <input type="hidden" name="is_active_field" value="1" />
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={productIsActive}
                      onChange={(event) => setProductIsActive(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>
                      <span className="block text-body">Show on terminals</span>
                      <span className="block text-caption text-ink-muted">
                        Hidden products stay in admin but stop appearing on POS after the next sync.
                      </span>
                    </span>
                  </label>
                ) : null}
                <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-sm border border-border bg-surface px-3 py-2.5">
                  <input
                    type="checkbox"
                    name="is_sellable"
                    defaultChecked={product?.isSellable ?? true}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block text-body">Sellable</span>
                    <span className="block text-caption text-ink-muted">
                      Enable if this item can be sold to customers. Disable for items used only internally or as
                      materials.
                    </span>
                  </span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-sm border border-border bg-surface px-3 py-2.5">
                  <input
                    type="checkbox"
                    name="is_purchasable"
                    defaultChecked={product?.isPurchasable ?? true}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span>
                    <span className="block text-body">Purchasable</span>
                    <span className="block text-caption text-ink-muted">
                      Enable if this item can be purchased from a supplier or replenished through purchasing.
                    </span>
                  </span>
                </label>
              </div>
            </FormSection>

            {product || "single" === productKind ? (
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
            ) : (
              // Price still required server-side — set for real per variant next.
              <input type="hidden" name="price" value="0" />
            )}

            {product || "single" === productKind ? (
              <FormSection title="Suppliers" description="Who this product is sourced from, and at what cost.">
                {!product ? (
                  <PendingSupplierLinksEditor links={pendingSupplierLinks} onChange={setPendingSupplierLinks} />
                ) : defaultVariant ? (
                  <div className="sm:col-span-2">
                    <VariantSupplierLinksEditor productId={product.id} variant={defaultVariant} />
                  </div>
                ) : (
                  <ProductBlockSkeleton className="sm:col-span-2" />
                )}
              </FormSection>
            ) : null}

            {isSingleProductUi ? (
              <FormSection
                title="Bundle"
                description="A set of other products sold and stocked as one item, e.g. a starter kit."
              >
                <BundleFields
                  isBundle={isBundle}
                  onIsBundleChange={setIsBundle}
                  rows={bundleRows}
                  onRowsChange={setBundleRows}
                  excludeProductId={product?.id}
                />
              </FormSection>
            ) : null}
          </div>
        </div>

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
        {product?.isBundle && isSingleProductUi && tab === "details" ? (
          <AssembleBundleSection product={product} />
        ) : null}
        </form>
        {product && tab === "variants" ? (
          <ProductAttributesAndVariantsSection
            product={product}
            showActiveToggle={!isSingleProductUi}
            showBundleSection={!isSingleProductUi}
            initialAttributesExpanded={"1" === searchParams.get("expand_attributes")}
            bare
          />
        ) : null}
        {product && tab === "addons" ? <ProductAddonGroupsSection product={product} bare /> : null}
        {product && tab === "inventory" ? <ProductInventorySection product={product} bare /> : null}
        {product && tab === "activity" ? <ProductActivitySection productId={product.id} bare /> : null}
      </div>

      {/* Outside the form, after every card — a submit button placed
          mid-page as `sticky bottom-0` stays pinned only for the height of
          its own parent, which used to be the form itself: scrolling past
          the form's fields but still inside the Variants/Add-ons cards left
          the bar floating (z-10) on top of them. `form="product-form"`
          keeps it wired to the actual <form> despite living outside it.
          Only meaningful for the Details tab's fields — Variants/Add-ons
          already save inline per action — so it hides on the other tabs. */}
      <div
        className={`sticky bottom-0 z-10 flex justify-end gap-2 rounded-md border border-border bg-surface px-4 pt-6 pb-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-6 ${
          product && tab !== "details" ? "hidden" : ""
        }`}
      >
        <ButtonLink href={cancelHref} variant="secondary" icon={X}>
          Cancel
        </ButtonLink>
        <Button
          type="submit"
          form="product-form"
          loading={product ? pending : createFullProductMutation.isPending}
          icon={!product && "with_variants" === productKind ? ArrowRight : Check}
        >
          {(product ? pending : createFullProductMutation.isPending)
            ? "Saving..."
            : product
              ? "Save changes"
              : "with_variants" === productKind
                ? "Next"
                : "Add product"}
        </Button>
      </div>

      <Dialog
        open={saveConfirmOpen}
        onClose={() => setSaveConfirmOpen(false)}
        title="Save these changes?"
        description="Review what will update on this product before confirming."
      >
        <ul className="max-h-72 space-y-2 overflow-y-auto rounded-sm border border-border bg-paper px-3 py-2">
          {pendingSaveChanges.map((change) => (
            <li key={change.label} className="border-b border-border py-2 last:border-b-0">
              <p className="text-caption font-medium text-ink-muted">{change.label}</p>
              <p className="mt-0.5 text-body text-ink">
                <span className="text-ink-muted line-through">{change.before}</span>
                <span className="mx-1.5 text-ink-muted">→</span>
                <span className="font-medium">{change.after}</span>
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" icon={X} onClick={() => setSaveConfirmOpen(false)}>
            Cancel
          </Button>
          <Button type="button" icon={Check} onClick={confirmSaveChanges}>
            Save changes
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
