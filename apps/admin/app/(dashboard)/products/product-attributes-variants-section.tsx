"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Boxes,
  Camera,
  Check,
  ChevronDown,
  ExternalLink,
  ImageOff,
  Images,
  Layers,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  ScanBarcode,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import { shelfPriceFromMarkup } from "@double-a/shared-types";
import type { Product } from "@double-a/shared-types";
import type { CompanyAttribute, MarginType, ProductVariant, VariantSupplierLink } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Combobox,
  Field,
  FileInput,
  IconButton,
  Input,
  MoneyInput,
  Money,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ConfirmDialog, Dialog, Sheet } from "@/components/overlay";
import { BarcodeScanCamera, canUseBarcodeScanner } from "@/components/barcode-scan-camera";
import { VariantPhotoGallery } from "./variant-photo-gallery";
import {
  useAddProductVariantSupplier,
  useAttachProductAttribute,
  useCompanyAttributes,
  useCreateCompanyAttribute,
  useCreateCompanyAttributeValue,
  useDeleteCompanyAttributeValue,
  useDeleteProductVariant,
  useDeleteProductVariantPhoto,
  useDetachProductAttribute,
  useGenerateProductVariants,
  useProductAttributes,
  useProductVariants,
  useQuickCreateAttributeAndGenerateVariants,
  useRemoveProductVariantSupplier,
  useUpdateProductVariant,
  useUpdateProductVariantSupplier,
  useUploadProductVariantPhoto,
} from "@/lib/query/attributes";
import { useAdjustProductStock } from "@/lib/query/products";
import { useLocations } from "@/lib/query/locations";
import { useSuppliers } from "@/lib/query/suppliers";
import { useCreateUnit, useUnits } from "@/lib/query/units";
import { useSkuAvailability } from "@/lib/use-sku-check";
import { isImageFile, NOT_AN_IMAGE_MESSAGE } from "@/lib/is-image-file";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.isValidation) {
    const first = Object.values(error.errors ?? {})[0]?.[0];
    if (first) return first;
  }
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
  const [confirmDetach, setConfirmDetach] = useState(false);
  const [confirmRemoveValue, setConfirmRemoveValue] = useState<{ id: string; value: string } | null>(null);
  const createValue = useCreateCompanyAttributeValue();
  const deleteValue = useDeleteCompanyAttributeValue();
  const detach = useDetachProductAttribute(productId);

  function addValue() {
    const value = newValue.trim();
    if (!value) return;
    createValue.mutate(
      { attributeId: attribute.id, value },
      {
        onSuccess: () => {
          setNewValue("");
          toast.success(`"${value}" added.`);
        },
        onError: (error) => toast.error(errorMessage(error, "Could not add that value.")),
      },
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body-lg font-bold text-ink capitalize">{attribute.name}</p>
        <IconButton
          icon={Trash2}
          label={`Remove ${attribute.name} from this product`}
          tone="danger"
          onClick={() => setConfirmDetach(true)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {attribute.values.map((value) => (
          <AttributeValueBadge
            key={value.id}
            value={value}
            onRemove={() => setConfirmRemoveValue(value)}
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
            className="h-7 w-28 text-caption sm:h-7"
          />
          <IconButton
            icon={Plus}
            label="Add value"
            onClick={addValue}
            disabled={!newValue.trim()}
            className="size-7 sm:size-7"
          />
        </span>
      </div>

      <ConfirmDialog
        open={confirmDetach}
        onClose={() => setConfirmDetach(false)}
        onConfirm={() => {
          detach.mutate(attribute.id, {
            onSuccess: () => setConfirmDetach(false),
            onError: (error) => toast.error(errorMessage(error, "Could not remove this choice.")),
          });
        }}
        pending={detach.isPending}
        title={`Remove "${attribute.name}" from this product?`}
        description="Only possible while no variant uses one of its values yet — delete those variants first otherwise."
        confirmLabel="Remove"
      />
      <ConfirmDialog
        open={confirmRemoveValue !== null}
        onClose={() => setConfirmRemoveValue(null)}
        onConfirm={() => {
          if (!confirmRemoveValue) return;
          deleteValue.mutate(confirmRemoveValue.id, {
            onSuccess: () => setConfirmRemoveValue(null),
            onError: (error) => toast.error(errorMessage(error, "Could not remove this value.")),
          });
        }}
        pending={deleteValue.isPending}
        title={`Remove "${confirmRemoveValue?.value ?? ""}"?`}
        description="Any variant using this value keeps it as-is; this only stops it from being offered again."
        confirmLabel="Remove"
      />
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
  const [confirmDefault, setConfirmDefault] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

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
      {
        onSuccess: () => {
          setConfirmDefault(false);
          toast.success(`${link.supplierName ?? "This supplier"} is now the default.`);
        },
        onError: (error) => toast.error(errorMessage(error, "Could not set this as the default supplier.")),
      },
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
            onClick={() => setConfirmDefault(true)}
            disabled={update.isPending}
            className="inline-flex items-center gap-1 text-caption text-ink-muted underline-offset-2 hover:text-primary hover:underline disabled:opacity-50"
          >
            <Check size={12} strokeWidth={2} />
            Make default
          </button>
        )}
      </div>
      <div className="min-w-[9rem] flex-1">
        <Input
          value={sku}
          onChange={(event) => setSku(event.target.value)}
          onBlur={saveSku}
          placeholder="Supplier SKU"
          className="h-9 w-full"
        />
        {skuCheck.conflict ? (
          <p className="mt-1 text-[11px] text-danger">Already used by {skuCheck.conflict.name}.</p>
        ) : skuCheck.checking ? (
          <p className="mt-1 text-[11px] text-ink-muted">Checking…</p>
        ) : null}
      </div>
      <div className="min-w-[7rem] flex-1">
        <MoneyInput
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          onBlur={savePrice}
          className="h-9 w-full"
        />
      </div>
      <IconButton
        icon={X}
        label={`Remove ${link.supplierName ?? "supplier"}`}
        tone="danger"
        disabled={remove.isPending}
        onClick={() => setConfirmRemove(true)}
      />

      <ConfirmDialog
        open={confirmDefault}
        onClose={() => setConfirmDefault(false)}
        onConfirm={makeDefault}
        pending={update.isPending}
        title="Make this the default supplier?"
        description={`${link.supplierName ?? "This supplier"} becomes the preselected supplier for this variant.`}
        confirmLabel="Make default"
        confirmIcon={Check}
      />
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          remove.mutate(link.id, {
            onSuccess: () => {
              setConfirmRemove(false);
              toast.success(`${link.supplierName ?? "Supplier"} removed from this variant.`);
            },
            onError: (error) => toast.error(errorMessage(error, "Could not remove this supplier.")),
          });
        }}
        pending={remove.isPending}
        title={`Remove ${link.supplierName ?? "this supplier"}?`}
        description="This variant will no longer be sourced from this supplier."
        confirmLabel="Remove"
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
export function VariantSupplierLinksEditor({
  productId,
  variant,
}: {
  productId: string;
  variant: ProductVariant;
}) {
  const suppliersQuery = useSuppliers();
  const add = useAddProductVariantSupplier(productId);
  const [picking, setPicking] = useState("");
  const [pendingSku, setPendingSku] = useState("");
  const [pendingPrice, setPendingPrice] = useState("");

  const linkedSupplierIds = new Set(variant.suppliers.map((link) => link.supplierId));
  const available = (suppliersQuery.data ?? []).filter((supplier) => !linkedSupplierIds.has(supplier.id));

  function addSupplier() {
    if (!picking) return;
    const supplierName = available.find((supplier) => supplier.id === picking)?.name ?? "Supplier";
    const trimmedPrice = pendingPrice.trim();
    add.mutate(
      {
        variantId: variant.id,
        supplierId: picking,
        supplierSku: pendingSku.trim() || null,
        supplierPrice: trimmedPrice === "" ? null : Number(trimmedPrice),
      },
      {
        // Fields stay populated on failure — nothing to retype, just retry.
        onSuccess: () => {
          setPicking("");
          setPendingSku("");
          setPendingPrice("");
          toast.success(`${supplierName} added.`);
        },
        onError: (error) => toast.error(errorMessage(error, "Could not add this supplier.")),
      },
    );
  }

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex shrink-0 items-center gap-1.5 text-body font-medium text-ink">
          <Truck size={16} strokeWidth={2} />
          Suppliers
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
        <div className="min-w-[14rem] flex-[3]">
          <Field label="Add a supplier">
            <Combobox
              value={picking}
              onChange={setPicking}
              placeholder="Choose supplier…"
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
            />
          </Field>
        </div>
        <div className="min-w-[9rem] flex-1">
          <Field label="Supplier SKU" required={false}>
            <Input
              value={pendingSku}
              onChange={(event) => setPendingSku(event.target.value)}
              placeholder="Optional"
              disabled={add.isPending}
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
              disabled={add.isPending}
              className="w-full"
            />
          </Field>
        </div>
        <Button
          type="button"
          icon={Plus}
          loading={add.isPending}
          disabled={!picking}
          onClick={addSupplier}
          className="shrink-0"
        >
          Add
        </Button>
      </div>
      <div className="space-y-2">
        <p className="text-body font-medium text-ink">Current suppliers</p>
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
 * Same adjust-stock action the /inventory page's own restock/adjust flow
 * calls — reachable right from the variant it targets via the "View stock"
 * drawer, so a merchant never has to leave the product page to correct a
 * count. "Set counted total" mode stays /inventory-only: that flow already
 * has this location's current quantity loaded to compute the delta from,
 * which this compact form doesn't fetch. Rendered only as a Sheet's
 * children — the Sheet's own open/close is the reveal mechanism, no
 * collapse state of its own.
 */
function VariantStockAdjustForm({
  productId,
  variantId,
  variantLabel,
  suppliers,
  onDone,
}: {
  productId: string;
  variantId: string;
  variantLabel: string;
  suppliers: VariantSupplierLink[];
  onDone: () => void;
}) {
  const locationsQuery = useLocations({ type: "branch" });
  const adjustStock = useAdjustProductStock(productId);
  const [mode, setMode] = useState<(typeof STOCK_ADJUST_MODES)[number]["key"]>("in");
  const [locationId, setLocationId] = useState(locationsQuery.data?.[0]?.id ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [branchError, setBranchError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  useEffect(() => {
    if (!locationId && locationsQuery.data?.[0]) {
      setLocationId(locationsQuery.data[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever needs to fill in the initial default once branches load.
  }, [locationsQuery.data]);

  function reviewSubmit() {
    const magnitude = Number(quantity);
    const invalidQuantity = quantity.trim() === "" || !Number.isFinite(magnitude) || magnitude <= 0;
    setQuantityError(invalidQuantity ? "Enter a quantity greater than zero." : null);
    setBranchError(locationId ? null : "Choose a branch.");
    const missingSupplier = "in" === mode && !supplierId;
    setSupplierError(missingSupplier ? "Choose which supplier this stock came from." : null);
    if (invalidQuantity || !locationId || missingSupplier) return;
    setConfirmSubmit(true);
  }

  function submit() {
    const magnitude = Number(quantity);
    const preset = STOCK_ADJUST_MODES.find((option) => option.key === mode);
    adjustStock.mutate(
      {
        changeQuantity: mode === "out" ? -magnitude : magnitude,
        reason: preset?.reason ?? "adjustment",
        locationId,
        variantId,
        supplierId: "in" === mode ? supplierId || null : null,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Stock updated.");
          setConfirmSubmit(false);
          onDone();
        },
        onError: (error) => toast.error(errorMessage(error, "Could not adjust stock.")),
      },
    );
  }

  const activeModeLabel = STOCK_ADJUST_MODES.find((option) => option.key === mode)?.label ?? "Adjust";
  const branchName = (locationsQuery.data ?? []).find((branch) => branch.id === locationId)?.name ?? "—";

  return (
    <div className="space-y-4">
      <Field label="Action" required>
        <Select
          value={mode}
          onChange={(event) => setMode(event.target.value as (typeof STOCK_ADJUST_MODES)[number]["key"])}
        >
          {STOCK_ADJUST_MODES.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className={HALF_ROW}>
        <div className={HALF_CELL}>
          <Field label="Branch" required>
            <Select
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                setBranchError(null);
              }}
            >
              <option value="">Choose branch</option>
              {(locationsQuery.data ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
            {branchError ? <p className="mt-1 text-caption text-danger">{branchError}</p> : null}
          </Field>
        </div>
        <div className={HALF_CELL}>
          <Field label="Quantity" required>
            <Input
              type="number"
              min="0.001"
              step="any"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setQuantityError(null);
              }}
            />
            {quantityError ? <p className="mt-1 text-caption text-danger">{quantityError}</p> : null}
          </Field>
        </div>
      </div>
      {"in" === mode ? (
        <Field label="Supplier" required hint="Which supplier this delivery came from.">
          <Select
            value={supplierId}
            onChange={(event) => {
              setSupplierId(event.target.value);
              setSupplierError(null);
            }}
          >
            <option value="">Choose supplier</option>
            {suppliers.map((link) => (
              <option key={link.supplierId} value={link.supplierId}>
                {link.supplierName ?? "Unknown supplier"}
              </option>
            ))}
          </Select>
          {supplierError ? <p className="mt-1 text-caption text-danger">{supplierError}</p> : null}
        </Field>
      ) : null}
      <Field label="Note" required={false}>
        <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
      </Field>
      <div className="sticky bottom-0 -mx-5 -mb-5 flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <Button type="button" variant="secondary" icon={X} onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" icon={Check} onClick={reviewSubmit}>
          Save
        </Button>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={submit}
        pending={adjustStock.isPending}
        title={`${activeModeLabel}?`}
        description={`${quantity || "0"} unit(s) at ${branchName} for ${variantLabel} — records a movement, same as Inventory.`}
        confirmLabel={activeModeLabel}
        confirmIcon={Check}
      />
    </div>
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

const VARIANT_ROW_ACTIONS = [
  { panel: "suppliers" as const, label: "Modify suppliers", icon: Truck },
  { panel: "variant" as const, label: "Edit variant", icon: Pencil },
  { panel: "stock" as const, label: "Modify stock", icon: Boxes },
  { panel: "photos" as const, label: "Manage photos", icon: Images },
];

/**
 * One "···" trigger per row — opens a small menu instead of three separate
 * icon-button columns. Rendered via portal into document.body and positioned
 * with fixed coordinates from the trigger's own rect: the table it lives in
 * scrolls with `overflow-x-auto` (which clips vertical overflow too), so an
 * absolutely-positioned menu nested inside it gets cut off or painted under
 * whatever row comes next. Escaping the table's DOM subtree is what makes it
 * "always on top" instead of fighting stacking/clipping context by context.
 */
function VariantRowActionsMenu({
  label,
  onSelect,
}: {
  label: string;
  onSelect: (panel: "suppliers" | "variant" | "stock" | "photos") => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function reposition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    reposition();

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  return (
    <div className="inline-block">
      <IconButton
        ref={triggerRef}
        icon={MoreVertical}
        label={`Actions for ${label}`}
        onClick={() => setOpen((current) => !current)}
      />
      {open
        ? createPortal(
            <div
              ref={menuRef}
              style={{ top: coords.top, right: coords.right }}
              className="fixed z-[100] w-48 rounded-md border border-border bg-surface py-1 shadow-lg"
            >
              {VARIANT_ROW_ACTIONS.map((action) => (
                <button
                  key={action.panel}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelect(action.panel);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-body text-ink transition-colors hover:bg-paper"
                >
                  <action.icon size={15} strokeWidth={2} className="text-ink-muted" />
                  {action.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

const HALF_ROW = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 max-sm:grid-cols-1";
const HALF_CELL = "min-w-0 w-full";

/**
 * A variant is always already persisted by the time this renders (unlike
 * product-form.tsx's ProductPhotoSection, which also handles a
 * not-yet-created product) — no pending-file branch needed, every pick
 * uploads immediately. `variant.photoUrl` already carries the
 * parent-product fallback from the backend when the variant has none of
 * its own (see ProductVariantResource).
 */
function VariantPhotoField({ productId, variant }: { productId: string; variant: ProductVariant }) {
  const uploadPhoto = useUploadProductVariantPhoto(productId);
  const deletePhoto = useDeleteProductVariantPhoto(productId);
  const [preview, setPreview] = useState<string | null>(null);
  const busy = uploadPhoto.isPending || deletePhoto.isPending;
  const shown = preview ?? variant.photoUrl;

  function onPick(file: File | undefined) {
    if (!file) return;
    if (!isImageFile(file)) {
      toast.error(NOT_AN_IMAGE_MESSAGE);
      return;
    }

    setPreview(URL.createObjectURL(file));
    uploadPhoto.mutate(
      { variantId: variant.id, photo: file },
      {
        onSuccess: () => toast.success("Photo updated."),
        onError: (error) => toast.error(errorMessage(error, "Could not upload this photo.")),
        onSettled: () => setPreview(null),
      },
    );
  }

  function onRemove() {
    deletePhoto.mutate(variant.id, {
      onSuccess: () => toast.success("Photo removed."),
      onError: (error) => toast.error(errorMessage(error, "Could not remove this photo.")),
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-paper">
        {shown ? (
          // Plain img: the URL is an arbitrary MinIO/S3 host, same reasoning as the product photo.
          <img src={shown} alt="" className="size-full object-cover" />
        ) : (
          <Camera size={22} strokeWidth={2} className="text-ink-muted" />
        )}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        <Field label="Variant photo" hint="JPEG, PNG or WebP, under 8 MB." required={false}>
          <FileInput
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => onPick(event.currentTarget.files?.[0])}
          />
        </Field>
        {variant.hasOwnPhoto && !preview ? (
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
  );
}

const MARGIN_TYPES = [
  { key: "percent" as const, label: "Percent" },
  { key: "fixed" as const, label: "Fixed amount" },
];

/** cost + a fixed peso amount on top — the "fixed" counterpart to shelfPriceFromMarkup's percentage formula. */
function shelfPriceFromFixedMargin(costPrice: number, amount: number): number {
  return Math.round((costPrice + amount) * 100) / 100;
}

/**
 * Reorder point / replenish quantity (per-variant restocking thresholds,
 * moved here from the product form) plus a margin-based selling-price
 * suggestion: pick percent (cost price × (1 + margin/100), same formula as
 * category markup) or fixed (cost price + a flat peso amount), then apply
 * the result to the shelf price with one click. Always a suggestion the
 * merchant can still override, never an auto-fill.
 */
/**
 * Controlled/presentational — the caller owns the draft state and the
 * update mutation (batch-Update pattern: nothing here saves on its own).
 * "Use this price" fills the caller's price draft via onUsePrice, same as
 * any other edit — submitted only when the caller's own Update is clicked.
 */
function VariantStockPlanningFields({
  costPrice,
  reorderPoint,
  onReorderPointChange,
  replenishQuantity,
  onReplenishQuantityChange,
  marginType,
  onMarginTypeChange,
  marginValue,
  onMarginValueChange,
  onUsePrice,
}: {
  costPrice: number;
  reorderPoint: string;
  onReorderPointChange: (value: string) => void;
  replenishQuantity: string;
  onReplenishQuantityChange: (value: string) => void;
  marginType: MarginType;
  onMarginTypeChange: (value: MarginType) => void;
  marginValue: string;
  onMarginValueChange: (value: string) => void;
  onUsePrice: (price: number) => void;
}) {
  const parsedMargin = marginValue.trim() === "" ? null : Number(marginValue);
  const hasValidMargin = null !== parsedMargin && Number.isFinite(parsedMargin) && parsedMargin >= 0;
  const suggestedPrice = !hasValidMargin
    ? null
    : "percent" === marginType
      ? shelfPriceFromMarkup(costPrice, parsedMargin)
      : shelfPriceFromFixedMargin(costPrice, parsedMargin);

  return (
    <div className="space-y-4">
      <div className={HALF_ROW}>
        <div className={HALF_CELL}>
          <Field label="Reorder point" hint="Flag for restocking at or below this count.">
            <Input
              type="number"
              step="1"
              min="0"
              value={reorderPoint}
              onChange={(event) => onReorderPointChange(event.target.value)}
            />
          </Field>
        </div>
        <div className={HALF_CELL}>
          <Field label="Replenish quantity" hint="Suggested qty to order when restocking.">
            <Input
              type="number"
              step="1"
              min="0"
              value={replenishQuantity}
              onChange={(event) => onReplenishQuantityChange(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-body font-medium text-ink">Margin</p>
        <div className="grid grid-cols-2 gap-2">
          {MARGIN_TYPES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onMarginTypeChange(option.key)}
              className={`rounded-sm border px-3 py-2 text-body font-medium transition-colors ${
                marginType === option.key
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-ink hover:bg-canvas"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="py-4">
          <div className={HALF_ROW}>
            <div className={HALF_CELL}>
              <Field
                label={"percent" === marginType ? "Margin %" : "Margin amount"}
                hint="Suggests a selling price from this variant's cost."
                required={false}
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={marginValue}
                  onChange={(event) => onMarginValueChange(event.target.value)}
                  placeholder={"percent" === marginType ? "e.g. 10" : "e.g. 25"}
                />
              </Field>
            </div>
            <div className={HALF_CELL}>
              <Field label="Suggested selling price" required={false}>
                <div className="flex min-h-11 w-full items-center justify-between gap-2 rounded-sm border border-border bg-canvas px-3">
                  {null !== suggestedPrice ? (
                    <Money value={suggestedPrice} className="text-ink" />
                  ) : (
                    <span className="text-caption text-ink-muted">Enter a margin</span>
                  )}
                  <button
                    type="button"
                    disabled={null === suggestedPrice}
                    onClick={() => null !== suggestedPrice && onUsePrice(suggestedPrice)}
                    className="shrink-0 text-caption font-medium text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-ink-muted disabled:no-underline"
                  >
                    Use this price
                  </button>
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Full field panel for one variant — shown below its tab in the Combinations
 * tab strip (see ProductAttributesAndVariantsSection). Always fully
 * rendered while its tab is active, no collapse/expand of its own.
 */
function VariantDetailPanel({
  productId,
  productName,
  variant,
  onDeleted,
}: {
  productId: string;
  productName: string;
  variant: ProductVariant;
  onDeleted?: () => void;
}) {
  const update = useUpdateProductVariant(productId);
  const remove = useDeleteProductVariant(productId);
  const unitsQuery = useUnits();
  const [addingUnit, setAddingUnit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scanning, setScanning] = useState(false);

  const [sku, setSku] = useState(variant.sku ?? "");
  const [barcode, setBarcode] = useState(variant.barcode ?? "");
  const [price, setPrice] = useState(String(variant.price));
  const [pricingStrategy, setPricingStrategy] = useState(variant.pricingStrategy);
  const [unitId, setUnitId] = useState(variant.unitId ?? "");
  const [reorderPoint, setReorderPoint] = useState(String(variant.reorderPoint));
  const [replenishQuantity, setReplenishQuantity] = useState(String(variant.replenishQuantity));
  const [marginType, setMarginType] = useState<MarginType>(variant.marginType);
  const [marginValue, setMarginValue] = useState(
    variant.marginValue !== null ? String(variant.marginValue) : "",
  );

  const parsedPrice = Number(price);
  const parsedReorderPoint = Number(reorderPoint);
  const parsedReplenishQuantity = Number(replenishQuantity);
  const parsedMarginValue = marginValue.trim() === "" ? null : Number(marginValue);

  const isDirty =
    sku.trim() !== (variant.sku ?? "") ||
    barcode.trim() !== (variant.barcode ?? "") ||
    parsedPrice !== variant.price ||
    pricingStrategy !== variant.pricingStrategy ||
    (unitId || null) !== variant.unitId ||
    parsedReorderPoint !== variant.reorderPoint ||
    parsedReplenishQuantity !== variant.replenishQuantity ||
    marginType !== variant.marginType ||
    parsedMarginValue !== variant.marginValue;

  function onUpdate() {
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("Shelf price must be zero or more.");
      return;
    }
    if (!Number.isInteger(parsedReorderPoint) || parsedReorderPoint < 0) {
      toast.error("Reorder point must be a whole number, zero or more.");
      return;
    }
    if (!Number.isInteger(parsedReplenishQuantity) || parsedReplenishQuantity < 0) {
      toast.error("Replenish quantity must be a whole number, zero or more.");
      return;
    }
    if (null !== parsedMarginValue && (!Number.isFinite(parsedMarginValue) || parsedMarginValue < 0)) {
      toast.error("Margin must be zero or more.");
      return;
    }

    update.mutate(
      {
        variantId: variant.id,
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        price: parsedPrice,
        pricingStrategy,
        unitId: unitId || null,
        reorderPoint: parsedReorderPoint,
        replenishQuantity: parsedReplenishQuantity,
        marginType,
        marginValue: parsedMarginValue,
      },
      {
        onSuccess: () => toast.success("Variant updated."),
        onError: (error) => toast.error(errorMessage(error, "Could not save this variant.")),
      },
    );
  }

  function onBarcodeDetected(value: string) {
    setScanning(false);
    setBarcode(value);
    toast.success("Barcode scanned — click Update to save.");
  }

  const skuCheck = useSkuAvailability({
    kind: "sku",
    value: sku,
    excludeVariantId: variant.id,
    // The default variant's sku mirrors onto its own product row
    // (ProductObserver) — without excluding the product too, checking a
    // default variant's own unchanged sku would find that mirrored row and
    // falsely report a conflict with itself.
    excludeProductId: productId,
  });

  const combo = variant.attributeValues.map((v) => v.value).filter(Boolean).join(" / ") || "—";
  const label = variant.isDefault ? productName : `${productName} — ${combo}`;

  return (
    <div className={variant.isActive ? undefined : "opacity-70"}>
      <div className="flex w-full min-w-0 items-center gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">{label}</p>
          <p className="mt-0.5 truncate text-caption text-ink-muted">
            {[sku || "No SKU", `Cost ${variant.costPrice}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Money value={variant.price} className="shrink-0 text-body font-semibold" />
        {variant.isDefault ? <Badge tone="success">Default</Badge> : null}
        {!variant.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
      </div>

      <div className="space-y-4 border-t border-border pt-4">
        <VariantPhotoField productId={productId} variant={variant} />

          <div className={HALF_ROW}>
            <div className={HALF_CELL}>
              <Field label="SKU">
                <Input
                  value={sku}
                  onChange={(event) => setSku(event.target.value)}
                />
              </Field>
              <RowSkuFeedback checking={skuCheck.checking} conflict={skuCheck.conflict} />
            </div>
            <div className={HALF_CELL}>
              <Field label="Barcode">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={barcode}
                    onChange={(event) => setBarcode(event.target.value)}
                    className="min-w-0 flex-1"
                  />
                  {canUseBarcodeScanner() ? (
                    <IconButton
                      icon={ScanBarcode}
                      label="Scan barcode with camera"
                      onClick={() => setScanning(true)}
                    />
                  ) : null}
                </div>
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
                />
              </Field>
            </div>
            <div className={HALF_CELL}>
              <Field label="Cost price (calculated)" hint="Resolved from linked suppliers below.">
                <div className="flex min-h-11 w-full items-center rounded-sm border border-border bg-canvas px-3">
                  <Money value={variant.costPrice} className="text-ink-muted" />
                </div>
              </Field>
            </div>
          </div>

          <div className={HALF_ROW}>
            <div className={HALF_CELL}>
              <Field
                label="Pricing strategy"
                hint="Which linked supplier's price counts as this variant's cost."
              >
                <Select
                  value={pricingStrategy}
                  onChange={(event) =>
                    setPricingStrategy(event.target.value as ProductVariant["pricingStrategy"])
                  }
                >
                  <option value="highest">Highest</option>
                  <option value="lowest">Lowest</option>
                  <option value="weighted_average">Weighted average</option>
                </Select>
              </Field>
            </div>
            <div className={HALF_CELL}>
              <Field label="Unit">
                <div className="flex w-full items-center gap-1">
                  <Select
                    value={unitId}
                    onChange={(event) => setUnitId(event.target.value)}
                    className="min-w-0 flex-1"
                  >
                    {!variant.unitId ? <option value="">No unit</option> : null}
                    {(unitsQuery.data ?? []).map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                        {unit.abbreviation ? ` (${unit.abbreviation})` : ""}
                      </option>
                    ))}
                  </Select>
                  <IconButton icon={Plus} label="Add unit" onClick={() => setAddingUnit(true)} />
                </div>
              </Field>
            </div>
          </div>
          <AddUnitDialog open={addingUnit} onClose={() => setAddingUnit(false)} />

          <div className="border-t border-border pt-4">
            <VariantStockPlanningFields
              costPrice={variant.costPrice}
              reorderPoint={reorderPoint}
              onReorderPointChange={setReorderPoint}
              replenishQuantity={replenishQuantity}
              onReplenishQuantityChange={setReplenishQuantity}
              marginType={marginType}
              onMarginTypeChange={setMarginType}
              marginValue={marginValue}
              onMarginValueChange={setMarginValue}
              onUsePrice={(suggested) => setPrice(String(suggested))}
            />
          </div>

          <div className="sticky bottom-0 -mx-5 -mb-5 flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
            <Button
              type="button"
              variant="danger"
              icon={Trash2}
              onClick={() => setConfirmDelete(true)}
            >
              Delete variant
            </Button>
            <Button
              type="button"
              icon={Check}
              loading={update.isPending}
              disabled={!isDirty}
              onClick={onUpdate}
            >
              Update
            </Button>
          </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          remove.mutate(variant.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              toast.success(`${label} deleted.`);
              onDeleted?.();
            },
            onError: (error) => toast.error(errorMessage(error, "Could not delete this variant.")),
          });
        }}
        pending={remove.isPending}
        title={`Delete "${label}"?`}
        description="Its stock, SKU, and supplier links are removed. This cannot be undone."
        confirmLabel="Delete variant"
      />

      <BarcodeScanCamera
        open={scanning}
        onDetected={onBarcodeDetected}
        onCancel={() => setScanning(false)}
      />
    </div>
  );
}

/**
 * Same batch-Update pattern as VariantDetailPanel, scoped to just stock
 * planning — used for a simple product's implicit default variant, which
 * has no accordion/delete around it. Owns its own draft state and mutation
 * since VariantStockPlanningFields is purely presentational now.
 */
function AddUnitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUnit();
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");

  function submit() {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), abbreviation: abbreviation.trim() || null },
      {
        onSuccess: (created) => {
          setName("");
          setAbbreviation("");
          onClose();
          toast.success(`Unit "${created.name}" added.`);
        },
        onError: (error) => toast.error(errorMessage(error, "Could not add this unit.")),
      },
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add a unit">
      <div className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Sack" />
        </Field>
        <Field label="Abbreviation" hint="Optional." required={false}>
          <Input
            value={abbreviation}
            onChange={(event) => setAbbreviation(event.target.value)}
            placeholder="sk"
          />
        </Field>
        <Button type="button" loading={create.isPending} onClick={submit} className="w-full">
          Add unit
        </Button>
      </div>
    </Dialog>
  );
}

/** Blocking progress indicator while a generate-variants request is in flight — not dismissible, closes itself once the mutation settles. */
function GeneratingVariantsDialog({ open }: { open: boolean }) {
  return (
    <Dialog open={open} onClose={() => {}} title="Generating variants">
      <div className="flex flex-col items-center gap-3 py-6">
        <Loader2 size={28} strokeWidth={2} className="animate-spin text-primary" />
        <p className="text-body text-ink-muted">Generating variants…</p>
      </div>
    </Dialog>
  );
}

function GenerateVariantsForm({ productId, attributes }: { productId: string; attributes: CompanyAttribute[] }) {
  const generate = useGenerateProductVariants(productId);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState(false);

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
    <div className="w-full rounded-md border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-body font-medium text-ink">Generate combinations</p>
          <p className="mt-0.5 text-caption text-ink-muted">
            Pick at least one value per choice, then generate every combination as its own variant.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={ChevronDown}
          onClick={() => setExpanded((current) => !current)}
          className={expanded ? "[&_svg]:rotate-180" : undefined}
        >
          {expanded ? "Hide combinations" : "Show combinations"}
        </Button>
      </div>
      {expanded ? (
        <div className="space-y-4 px-4 py-4">
          {attributes.map((attribute) => (
            <div key={attribute.id}>
              <p className="mb-1.5 text-caption font-medium text-ink-muted">{attribute.name}</p>
              <div className="flex flex-wrap gap-2">
                {attribute.values.map((value) => {
                  const active = (selected[attribute.id] ?? []).includes(value.id);
                  return (
                    <label
                      key={value.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-1.5 text-body font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary/5 text-ink"
                          : "border-border bg-surface text-ink hover:bg-canvas"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleValue(attribute.id, value.id)}
                        className="size-4 accent-primary"
                      />
                      {value.value}
                    </label>
                  );
                })}
                {attribute.values.length === 0 ? (
                  <span className="text-caption text-ink-muted">No values yet — add some above first.</span>
                ) : null}
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button type="button" icon={Sparkles} loading={generate.isPending} onClick={onGenerate}>
              Generate variants
            </Button>
          </div>
        </div>
      ) : null}
      <GeneratingVariantsDialog open={generate.isPending} />
    </div>
  );
}

/**
 * "Yes, set up as attribute" on the variant-signal popup lands here —
 * unlike the rest of this page, nothing here autosaves. Attribute name and
 * values are edited purely in local state; the attribute, its values, the
 * attach, and the generated variants are all only written once "Generate
 * Variants" is clicked (see QuickCreateAttributeAndGenerateVariantsAction
 * — the first value reuses the existing default variant's SKU/price/stock
 * instead of starting blank).
 */
function NewAttributeFromSignalWizard({
  productId,
  suggestion,
  onDone,
}: {
  productId: string;
  suggestion: { attributeName: string; matchedText: string };
  onDone: () => void;
}) {
  const [attributeName, setAttributeName] = useState(suggestion.attributeName);
  const [values, setValues] = useState<string[]>(suggestion.matchedText ? [suggestion.matchedText] : []);
  const [newValue, setNewValue] = useState("");
  const generate = useQuickCreateAttributeAndGenerateVariants(productId);

  function addValue() {
    const trimmed = newValue.trim();
    if (!trimmed || values.includes(trimmed)) return;
    setValues((current) => [...current, trimmed]);
    setNewValue("");
  }

  function removeValue(value: string) {
    setValues((current) => current.filter((entry) => entry !== value));
  }

  function onGenerate() {
    const trimmedName = attributeName.trim();
    if (!trimmedName || values.length === 0) return;
    generate.mutate(
      { attributeName: trimmedName, values },
      {
        onSuccess: (created) => {
          toast.success(`Created ${created.length} variant${created.length === 1 ? "" : "s"}.`);
          onDone();
        },
        onError: (error) => toast.error(errorMessage(error, "Could not generate variants.")),
      },
    );
  }

  return (
    <div className="space-y-4 rounded-md border border-dashed border-primary/40 bg-primary-tint p-4">
      <div className="flex items-center gap-1.5 text-body font-medium text-ink">
        <Sparkles size={16} className="text-primary" />
        Set up as an attribute
      </div>

      <Field label="Attribute name">
        <Input
          value={attributeName}
          onChange={(event) => setAttributeName(event.target.value)}
          placeholder="e.g. Size"
        />
      </Field>

      <Field label="Values" hint="Press Enter or the plus button to add another.">
        <div className="flex flex-wrap items-center gap-1.5">
          {values.map((value) => (
            <AttributeValueBadge key={value} value={{ id: value, value }} onRemove={() => removeValue(value)} />
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
              className="h-7 w-28 text-caption sm:h-7"
            />
            <IconButton
              icon={Plus}
              label="Add value"
              onClick={addValue}
              disabled={!newValue.trim()}
              className="size-7 sm:size-7"
            />
          </span>
        </div>
      </Field>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone} disabled={generate.isPending}>
          Cancel
        </Button>
        <Button
          type="button"
          icon={Layers}
          loading={generate.isPending}
          disabled={!attributeName.trim() || values.length === 0}
          onClick={onGenerate}
        >
          Generate Variants
        </Button>
      </div>
      <GeneratingVariantsDialog open={generate.isPending} />
    </div>
  );
}

export function ProductAttributesAndVariantsSection({
  product,
  pendingSignalSuggestion,
  onSignalSuggestionHandled,
  initialAttributesExpanded,
  bare = false,
}: {
  product: Product;
  /** Set when the merchant clicked "Yes" on the variant-signal popup — create+attach this attribute once, then clear it. */
  pendingSignalSuggestion?: { attributeName: string; matchedText: string } | null;
  onSignalSuggestionHandled?: () => void;
  /** Landed here via "Product With Variants" on create (?expand_attributes=1) — open straight to the picker. */
  initialAttributesExpanded?: boolean;
  /** true = no Card/CardHeader wrapper (already inside a bordered tab panel). */
  bare?: boolean;
}) {
  const allAttributesQuery = useCompanyAttributes();
  const attachedQuery = useProductAttributes(product.id);
  const variantsQuery = useProductVariants(product.id);
  const attach = useAttachProductAttribute(product.id);
  const createAttribute = useCreateCompanyAttribute();
  const [pickerValue, setPickerValue] = useState("");
  const [attributesExpanded, setAttributesExpanded] = useState(initialAttributesExpanded ?? false);
  // Undecided = the banner below asking whether this is heading toward
  // variants at all. Landing here already expanded (Product With Variants
  // create flow, or the name-signal "yes") means that's already decided.
  const [variantIntent, setVariantIntent] = useState<"undecided" | "no" | "yes">(
    initialAttributesExpanded ? "yes" : "undecided",
  );
  const [viewing, setViewing] = useState<{
    variantId: string;
    panel: "variant" | "suppliers" | "stock" | "photos";
  } | null>(null);

  const attached = attachedQuery.data ?? [];
  const attachedIds = new Set(attached.map((a) => a.id));
  // Every variant gets its own row with stock planning/photo/barcode/supplier
  // fields reachable via a drawer — including the default one. Once
  // attributes are attached it has no other UI surface, so leaving it out
  // here would make it permanently unreachable.
  const allVariants = variantsQuery.data ?? [];
  const defaultVariant = allVariants.find((v) => v.isDefault);
  const viewingVariant = viewing ? allVariants.find((v) => v.id === viewing.variantId) : undefined;

  function variantLabel(variant: ProductVariant): string {
    const combo = variant.attributeValues.map((v) => v.value).filter(Boolean).join(" / ") || "—";
    return variant.isDefault ? product.name : `${product.name} — ${combo}`;
  }

  function onAttachExisting(id: string) {
    if (!id) return;
    const name = (allAttributesQuery.data ?? []).find((a) => a.id === id)?.name ?? "Choice";
    attach.mutate(id, {
      onSuccess: () => {
        setPickerValue("");
        toast.success(`${name} added.`);
      },
      onError: (error) => toast.error(errorMessage(error, "Could not attach this choice.")),
    });
  }

  function onCreateAndAttach(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    // The picker's own options list only shows choices not yet attached to
    // THIS product, so its exact-match check can't see one that already
    // exists company-wide but happens to already be attached here — typing
    // its name then wrongly looks like it "doesn't exist yet". Check the
    // full company list before ever creating a duplicate.
    const existing = (allAttributesQuery.data ?? []).find(
      (a) => a.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      if (attachedIds.has(existing.id)) {
        toast.error(`"${existing.name}" is already added to this product.`);
      } else {
        onAttachExisting(existing.id);
      }
      return;
    }

    createAttribute.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => {
          attach.mutate(created.id, {
            onSuccess: () => toast.success(`"${created.name}" created and added.`),
            onError: (error) => toast.error(errorMessage(error, "Could not attach this choice.")),
          });
        },
        onError: (error) => toast.error(errorMessage(error, "Could not create that choice.")),
      },
    );
  }

  // "Yes, set up as attribute" on the variant-signal popup lands here —
  // just keep the section open. NewAttributeFromSignalWizard (rendered
  // below, in place of the simple-product branch) owns everything from
  // here — nothing is written until its own "Generate Variants" click.
  useEffect(() => {
    if (pendingSignalSuggestion) {
      setAttributesExpanded(true);
      setVariantIntent("yes");
    }
  }, [pendingSignalSuggestion]);

  const body = (
    <>
      <CardBody className="space-y-4">
        {attached.length > 0 || "yes" === variantIntent ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-body font-medium text-ink">
                <Tag size={16} strokeWidth={2} />
                Attributes
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={ChevronDown}
                onClick={() => setAttributesExpanded((current) => !current)}
                className={attributesExpanded ? "[&_svg]:rotate-180" : undefined}
              >
                {attributesExpanded ? "Hide attributes" : "Show attributes"}
              </Button>
            </div>

            {attributesExpanded ? (
              <div className="w-full max-w-md rounded-md border border-border p-4">
                <Field
                  label="Add a choice"
                  hint={
                    allAttributesQuery.isError
                      ? errorMessage(allAttributesQuery.error, "Could not load existing choices.")
                      : "Pick an existing one, or type a new name to create it."
                  }
                >
                  <Combobox
                    value={pickerValue}
                    onChange={(value) => {
                      setPickerValue(value);
                      onAttachExisting(value);
                    }}
                    placeholder={allAttributesQuery.isPending ? "Loading…" : "Choose or type to create"}
                    emptyLabel={
                      allAttributesQuery.isError
                        ? "Could not load existing choices — see above."
                        : allAttributesQuery.isPending
                          ? "Loading…"
                          : undefined
                    }
                    options={(allAttributesQuery.data ?? []).map((a) => ({
                      value: a.id,
                      label: attachedIds.has(a.id) ? `${a.name} (already added)` : a.name,
                      disabled: attachedIds.has(a.id),
                    }))}
                    creatable
                    createOptionLabel={(typed) => `“${typed}” doesn't exist — create it`}
                    onCreate={onCreateAndAttach}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}

        {attached.length > 0 ? (
          attributesExpanded ? (
            <div className="space-y-3">
              {attached.map((attribute) => (
                <AttachedAttributeCard key={attribute.id} productId={product.id} attribute={attribute} />
              ))}
            </div>
          ) : null
        ) : pendingSignalSuggestion ? (
          <div className="border-t border-border pt-4">
            <NewAttributeFromSignalWizard
              productId={product.id}
              suggestion={pendingSignalSuggestion}
              onDone={() => onSignalSuggestionHandled?.()}
            />
          </div>
        ) : "undecided" === variantIntent ? (
          <div className="border-t border-border pt-4">
            <div className="flex flex-col items-center gap-3 rounded-md border border-primary/30 bg-primary-tint px-6 py-8 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Layers size={20} strokeWidth={2} />
              </span>
              <div className="max-w-md space-y-1">
                <p className="text-body-lg font-semibold text-ink">
                  Are you planning to add variants for this product?
                </p>
                <p className="text-body text-ink-muted">
                  A variant is a different version of the same product — like Small/Medium/Large, or Red/Blue —
                  each with its own SKU, price, and stock. If this product is only ever sold one way, you don't
                  need this — its details already live in the Product Details tab.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setVariantIntent("no")}>
                  No, this is a single product
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setVariantIntent("yes");
                    setAttributesExpanded(true);
                  }}
                >
                  Yes, set up variants
                </Button>
              </div>
            </div>
          </div>
        ) : "no" === variantIntent && defaultVariant ? (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-body font-medium text-ink">Product details</p>
              <button
                type="button"
                onClick={() => setVariantIntent("undecided")}
                className="text-caption text-ink-muted underline-offset-2 transition-colors hover:text-ink hover:underline"
              >
                Add variants instead?
              </button>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <thead>
                  <tr>
                    <Th>Product</Th>
                    <Th>SKU</Th>
                    <Th numeric>Cost price</Th>
                    <Th numeric>Selling price</Th>
                    <Th align="center">Suppliers</Th>
                    <Th align="center">Stock</Th>
                    <Th align="center">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <Td>{variantLabel(defaultVariant)}</Td>
                    <Td className="whitespace-nowrap text-ink-muted">{defaultVariant.sku ?? "—"}</Td>
                    <Td numeric>
                      <Money value={defaultVariant.costPrice} />
                    </Td>
                    <Td numeric>
                      <Money value={defaultVariant.price} />
                    </Td>
                    <Td numeric align="center">{defaultVariant.suppliers.length}</Td>
                    <Td numeric align="center">{defaultVariant.stockQuantity ?? 0}</Td>
                    <Td align="center">
                      <div className="flex justify-center">
                        <VariantRowActionsMenu
                          label={variantLabel(defaultVariant)}
                          onSelect={(panel) => setViewing({ variantId: defaultVariant.id, panel })}
                        />
                      </div>
                    </Td>
                  </tr>
                </tbody>
              </Table>
            </div>
          </div>
        ) : !defaultVariant ? (
          <p className="border-t border-border pt-4 text-body text-ink-muted">
            Add at least one attribute above to define this product&apos;s variants.
          </p>
        ) : null}

        {attached.length > 0 ? (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-ink-muted" />
              <p className="text-body font-medium text-ink">Combinations</p>
            </div>

            <GenerateVariantsForm productId={product.id} attributes={attached} />

            {allVariants.length > 0 ? (
              <div className="space-y-2">
                <p className="text-body font-medium text-ink">Variants ({allVariants.length})</p>
                <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <thead>
                    <tr>
                      <Th>Variant</Th>
                      <Th>SKU</Th>
                      <Th numeric>Cost price</Th>
                      <Th numeric>Selling price</Th>
                      <Th align="center">Suppliers</Th>
                      <Th align="center">Stock</Th>
                      <Th align="center">Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {allVariants.map((variant) => (
                      <tr key={variant.id} className={variant.isActive ? undefined : "opacity-70"}>
                        <Td>
                          <span className="flex items-center gap-1.5">
                            {variantLabel(variant)}
                            {variant.isDefault ? <Badge tone="success">Default</Badge> : null}
                            {!variant.isActive ? <Badge tone="neutral">Inactive</Badge> : null}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap text-ink-muted">{variant.sku ?? "—"}</Td>
                        <Td numeric>
                          <Money value={variant.costPrice} />
                        </Td>
                        <Td numeric>
                          <Money value={variant.price} />
                        </Td>
                        <Td numeric align="center">{variant.suppliers.length}</Td>
                        <Td numeric align="center">{variant.stockQuantity ?? 0}</Td>
                        <Td align="center">
                          <div className="flex justify-center">
                            <VariantRowActionsMenu
                              label={variantLabel(variant)}
                              onSelect={(panel) => setViewing({ variantId: variant.id, panel })}
                            />
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardBody>

      <Sheet
        open={Boolean(viewingVariant) && viewing?.panel === "variant"}
        onClose={() => setViewing(null)}
        title={viewingVariant ? variantLabel(viewingVariant) : ""}
        className="max-w-4xl"
      >
        {viewingVariant ? (
          <VariantDetailPanel
            key={viewingVariant.id}
            productId={product.id}
            productName={product.name}
            variant={viewingVariant}
            onDeleted={() => setViewing(null)}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={Boolean(viewingVariant) && viewing?.panel === "suppliers"}
        onClose={() => setViewing(null)}
        title={viewingVariant ? `Suppliers — ${variantLabel(viewingVariant)}` : ""}
        className="max-w-4xl"
      >
        {viewingVariant ? (
          <VariantSupplierLinksEditor key={viewingVariant.id} productId={product.id} variant={viewingVariant} />
        ) : null}
      </Sheet>

      <Sheet
        open={Boolean(viewingVariant) && viewing?.panel === "stock"}
        onClose={() => setViewing(null)}
        title={viewingVariant ? `Stock — ${variantLabel(viewingVariant)}` : ""}
        className="max-w-4xl"
      >
        {viewingVariant ? (
          <VariantStockAdjustForm
            key={viewingVariant.id}
            productId={product.id}
            variantId={viewingVariant.id}
            variantLabel={variantLabel(viewingVariant)}
            suppliers={viewingVariant.suppliers}
            onDone={() => setViewing(null)}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={Boolean(viewingVariant) && viewing?.panel === "photos"}
        onClose={() => setViewing(null)}
        title={viewingVariant ? `Photos — ${variantLabel(viewingVariant)}` : ""}
        className="max-w-4xl"
      >
        {viewingVariant ? <VariantPhotoGallery key={viewingVariant.id} variantId={viewingVariant.id} /> : null}
      </Sheet>
    </>
  );

  if (bare) return body;

  return (
    <Card>
      <CardHeader
        icon={Tag}
        title="Variants"
        description="Size, color, or anything else this product varies by. Leave empty for a simple product — price and cost above still apply directly."
      />
      {body}
    </Card>
  );
}

