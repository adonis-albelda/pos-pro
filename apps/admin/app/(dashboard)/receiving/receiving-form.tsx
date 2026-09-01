"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { toast } from "sonner";
import {
  Camera,
  Crop,
  Expand,
  Images,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { formatMoney, formatQuantity, roundMoney } from "@double-a/shared-types";
import type { Location, PurchaseOrder, PurchaseOrderItem, Supplier } from "@double-a/shared-types";
import { ApiError } from "@double-a/api-client";
import type { ExtractedReceiptLine, GoodsReceiptItemInput } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardHeader,
  Combobox,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Money,
  MoneyInput,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { AiProcessingOverlay, ConfirmDialog, Dialog, Sheet } from "@/components/overlay";
import { isImageFile, NOT_AN_IMAGE_MESSAGE } from "@/lib/is-image-file";
import { useGalleryPhotos } from "@/lib/query/gallery-photos";
import { useCreateGoodsReceipt, useExtractGoodsReceiptPhoto } from "@/lib/query/goods-receipts";
import { useInventoryProducts } from "@/lib/query/inventory";
import { CropPhoto } from "../products/from-photo/crop-photo";

interface LineRow {
  key: string;
  name: string;
  sku: string;
  quantityReceived: string;
  unitCost: string;
  productId: string | null;
  matchedBy: "internal" | "supplier" | null;
  existingPrice: number | null;
  existingCostPrice: number | null;
  purchaseOrderItemId: string | null;
  quantityOrdered: number | null;
  appliedPrice: string;
  note: string;
  // Snapshotted once, at extraction/creation — never touched afterward.
  // What the reset icon on each amount field restores.
  originalQuantityReceived: string;
  originalUnitCost: string;
  originalAppliedPrice: string;
  /** Soft-remove — stays visible (grayed out, restorable) but dropped from what actually submits. */
  excluded: boolean;
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

/** Shrink a phone photo so the server action stays under the body limit. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1.2 * 1024 * 1024) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((next) => resolve(next), "image/jpeg", 0.82),
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

/**
 * Asymmetric on purpose: a supplier cost increase passes straight through to
 * the shelf so the margin doesn't quietly erode, but a cost decrease is
 * never auto-applied — the owner keeps that margin gain until they choose
 * to pass it on themselves.
 */
function suggestPrice(newCost: number, existingPrice: number, existingCostPrice: number): number {
  const increase = newCost - existingCostPrice;
  return increase > 0 ? roundMoney(existingPrice + increase) : existingPrice;
}

const cleanableRow = (row: LineRow): boolean =>
  !row.excluded && row.name.trim() !== "" && Number(row.quantityReceived) > 0;

/**
 * The submit blocker used to just say "Add at least one item" whichever way
 * zero rows survived — including when rows plainly exist on screen but each
 * is missing a name or has a zero/blank quantity, which reads as a mystery
 * bug rather than a fixable data problem. Point at the actual reason.
 */
function describeNoSubmittableRows(rows: LineRow[]): string {
  if (rows.length === 0) {
    return "Add at least one item — upload a photo or add a line manually.";
  }
  if (rows.every((row) => row.excluded)) {
    return "Every line is marked removed — restore at least one, or add a new line.";
  }
  const reasons = new Set<string>();
  for (const row of rows) {
    if (row.excluded) continue;
    if (!row.name.trim()) reasons.add("missing a name");
    if (!(Number(row.quantityReceived) > 0)) reasons.add("zero or blank quantity");
  }
  return reasons.size > 0
    ? `Every line has a problem (${[...reasons].join(", ")}) — check the Item and Qty columns.`
    : "Add at least one item — upload a photo or add a line manually.";
}

/** Ported from the old Server Action verbatim — same ApiError shape either way, only the caller moved client-side. */
function describeExtractError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "OpenAI is busy. Wait about a minute, then try again.";
    }
    if (error.status === 402) {
      return "OpenAI has no credits left. Check billing or the API key on the server.";
    }
    if (error.status === 403) {
      return error.message;
    }
  }
  return error instanceof Error
    ? `Could not read the photo: ${error.message}`
    : "Could not read the photo. Try again.";
}

function describeSaveError(error: unknown): string {
  if (error instanceof ApiError && error.isValidation) {
    const first = Object.values(error.errors ?? {})[0]?.[0];
    if (first) return first;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return `Could not save this receipt: ${message}`;
}

function lineIsFlagged(row: LineRow): boolean {
  if (!row.productId) return true;
  if (row.quantityOrdered !== null) {
    const received = Number(row.quantityReceived) || 0;
    if (Math.abs(received - row.quantityOrdered) > 0.001) return true;
  }
  return false;
}

/**
 * "Hold receipt" parks the in-progress form so the attendant can start
 * another delivery and come back later — one slot, this browser only, never
 * sent anywhere. A raw uploaded photo (a `File`) can't be JSON-serialized,
 * so only a gallery-sourced photo (just an id) survives the hold; a direct
 * upload is dropped and `hadUnkeptPhoto` flags that for the resume toast.
 */
const HELD_RECEIPT_KEY = "receiving:held-receipt";

interface HeldReceipt {
  heldAt: string;
  locationId: string;
  supplierId: string;
  supplierName: string;
  purchaseOrderId: string;
  referenceNo: string;
  notes: string;
  rows: LineRow[];
  galleryPhotoId: string | null;
  hadUnkeptPhoto: boolean;
}

function loadHeldReceipt(): HeldReceipt | null {
  try {
    const raw = window.localStorage.getItem(HELD_RECEIPT_KEY);
    return raw ? (JSON.parse(raw) as HeldReceipt) : null;
  } catch {
    return null;
  }
}

function saveHeldReceipt(receipt: HeldReceipt): void {
  try {
    window.localStorage.setItem(HELD_RECEIPT_KEY, JSON.stringify(receipt));
  } catch {
    // Private browsing / storage full — the hold silently doesn't persist.
  }
}

function clearHeldReceipt(): void {
  try {
    window.localStorage.removeItem(HELD_RECEIPT_KEY);
  } catch {
    // Nothing to do if storage is unavailable.
  }
}

export function ReceivingForm({
  suppliers,
  locations,
  openPurchaseOrders,
  purchaseOrderId,
  onSelectPurchaseOrder,
  linkedOrder,
  defaultLocationId,
}: {
  suppliers: Supplier[];
  locations: Location[];
  /** Ordered-status POs — the only ones with anything left to receive against. */
  openPurchaseOrders: PurchaseOrder[];
  purchaseOrderId: string;
  onSelectPurchaseOrder: (id: string) => void;
  linkedOrder: (PurchaseOrder & { items: PurchaseOrderItem[] }) | null;
  defaultLocationId: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const extractPhotoMutation = useExtractGoodsReceiptPhoto();
  const createReceiptMutation = useCreateGoodsReceipt();
  const extracting = extractPhotoMutation.isPending;
  const saving = createReceiptMutation.isPending;
  const [error, setError] = useState<string | null>(null);
  // `photo` is always the untouched original — it's what gets saved as the
  // receipt's own photo_url, never mutated by cropping/rotating. `workingPhoto`
  // is null until the user explicitly crops/rotates; AI extraction reads
  // workingPhoto ?? photo, so by default (no edit) both are the same file.
  const [photo, setPhoto] = useState<File | null>(null);
  const [workingPhoto, setWorkingPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [workingPreviewUrl, setWorkingPreviewUrl] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [photoRead, setPhotoRead] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);
  // "Choose file" opens this modal to pick a source; "gallery" shows the
  // pending-photos grid inside the same modal rather than a second dialog.
  const [photoModalStep, setPhotoModalStep] = useState<"closed" | "choose" | "gallery">("closed");
  // Set only when `photo` was fetched from a gallery pick — on submit this
  // is sent instead of re-uploading, so the receipt reuses that stored
  // photo and the gallery entry flips to processed.
  const [galleryPhotoId, setGalleryPhotoId] = useState<string | null>(null);
  const [galleryFetchError, setGalleryFetchError] = useState<string | null>(null);
  const galleryQuery = useGalleryPhotos();

  // Preview only, revoked whenever the photo changes or the form unmounts —
  // the file itself isn't sent anywhere until the user chooses to.
  useEffect(() => {
    if (!photo) {
      setPhotoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!workingPhoto) {
      setWorkingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(workingPhoto);
    setWorkingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [workingPhoto]);

  const [supplierId, setSupplierId] = useState(linkedOrder?.supplierId ?? "");
  const [supplierName, setSupplierName] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId ?? locations[0]?.id ?? "");
  const [referenceNo, setReferenceNo] = useState(linkedOrder?.referenceNo ?? "");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineRow[]>([]);
  const [heldReceipt, setHeldReceipt] = useState<HeldReceipt | null>(null);

  // Client-only check — matches the null server render, so this never causes
  // a hydration mismatch. Only offered on a blank form: resuming would
  // otherwise silently clobber whatever the attendant is already mid-typing.
  useEffect(() => {
    if (rows.length > 0) return;
    setHeldReceipt(loadHeldReceipt());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Covers picking a PO from the dropdown mid-session, not just the
  // URL-preloaded case the initial useState above already handles.
  useEffect(() => {
    if (!linkedOrder) return;
    setSupplierId(linkedOrder.supplierId);
    setReferenceNo(linkedOrder.referenceNo ?? "");
  }, [linkedOrder]);

  /**
   * Blanks every field back to a fresh delivery. Navigating to `/receiving`
   * after a successful ad-hoc (no PO) submit lands on the same URL the form
   * was already on, so Next.js doesn't remount it — without this, the just
   * saved lines and header fields sit there untouched, which is exactly
   * what made a second "Save receipt" click file a duplicate receipt.
   */
  function resetForm() {
    setSupplierId("");
    setSupplierName("");
    setReferenceNo("");
    setNotes("");
    setRows([]);
    removePhoto();
    onSelectPurchaseOrder("");
  }

  function holdReceipt() {
    saveHeldReceipt({
      heldAt: new Date().toISOString(),
      locationId,
      supplierId,
      supplierName,
      purchaseOrderId,
      referenceNo,
      notes,
      rows,
      galleryPhotoId,
      hadUnkeptPhoto: Boolean(photo) && !galleryPhotoId,
    });
    toast.success(
      photo && !galleryPhotoId
        ? "Receipt held — its photo wasn't kept, you'll need to re-add it on resume."
        : "Receipt held — resume it anytime from this page.",
    );

    // Blank the form for the next delivery — the hold already has everything.
    resetForm();
    setHeldReceipt(loadHeldReceipt());
  }

  function resumeHeldReceipt() {
    if (!heldReceipt) return;
    setSupplierId(heldReceipt.supplierId);
    setSupplierName(heldReceipt.supplierName);
    setLocationId(heldReceipt.locationId);
    setReferenceNo(heldReceipt.referenceNo);
    setNotes(heldReceipt.notes);
    setRows(heldReceipt.rows);
    onSelectPurchaseOrder(heldReceipt.purchaseOrderId);

    const galleryRecord = heldReceipt.galleryPhotoId
      ? (galleryQuery.data ?? []).find((record) => record.id === heldReceipt.galleryPhotoId)
      : undefined;
    if (galleryRecord) {
      void pickGalleryPhoto(galleryRecord);
    } else if (heldReceipt.galleryPhotoId || heldReceipt.hadUnkeptPhoto) {
      toast.message("This receipt's photo wasn't kept — re-add it if you still need it.");
    }

    clearHeldReceipt();
    setHeldReceipt(null);
  }

  function discardHeldReceipt() {
    clearHeldReceipt();
    setHeldReceipt(null);
  }

  // Full-catalogue walk (listProducts pages through everything) — only worth
  // paying for once there is something to match against: a photo on the way,
  // a supplier/PO picked, or a manual line already added.
  const productsQuery = useInventoryProducts({
    enabled: Boolean(photo) || Boolean(supplierId) || Boolean(linkedOrder) || rows.length > 0,
  });
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function addManualLine() {
    setRows((previous) => [
      ...previous,
      {
        key: newKey(),
        name: "",
        sku: "",
        quantityReceived: "1",
        unitCost: "",
        productId: null,
        matchedBy: null,
        existingPrice: null,
        existingCostPrice: null,
        purchaseOrderItemId: null,
        quantityOrdered: null,
        appliedPrice: "",
        note: "",
        originalQuantityReceived: "1",
        originalUnitCost: "",
        originalAppliedPrice: "",
        excluded: false,
      },
    ]);
  }

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  /** Soft-remove — the row stays put, grayed out, and can be restored; only excluded from submit. */
  function toggleRowExcluded(key: string) {
    setRows((previous) =>
      previous.map((row) => (row.key === key ? { ...row, excluded: !row.excluded } : row)),
    );
  }

  /**
   * Links a catalogue product for pricing — doesn't overwrite an existing
   * `name`, which stays the receipt's own reference text (what the paper
   * actually said, editable independently of the match). Only fills it in
   * when a manually-added line hasn't been typed into yet.
   */
  function pickProductForRow(key: string, productId: string) {
    const product = productsById.get(productId);
    if (!product) return;
    const row = rows.find((r) => r.key === key);
    // First time this row has both a cost and a catalogue price to compare —
    // the unitCost input's own onChange only fires on a later edit, so the
    // very first match needs to compute the suggestion right here too.
    const unitCost = Number(row?.unitCost) || 0;
    updateRow(key, {
      productId: product.id,
      name: row?.name.trim() ? row.name : product.name,
      sku: product.sku ?? "",
      matchedBy: "internal",
      existingPrice: product.price,
      existingCostPrice: product.costPrice,
      appliedPrice: String(suggestPrice(unitCost, product.price, product.costPrice)),
    });
  }

  /** Products already matched on another row don't show up again — no picking the same product twice. */
  function availableProductsFor(currentRow: LineRow) {
    const usedElsewhere = new Set(
      rows
        .filter((row) => row.key !== currentRow.key && row.productId)
        .map((row) => row.productId),
    );
    return products.filter((product) => !usedElsewhere.has(product.id));
  }

  /** Only stages the file for preview — AI extraction is a separate, explicit step below. */
  function handlePhotoChange(file: File | null) {
    if (file && !isImageFile(file)) {
      toast.error(NOT_AN_IMAGE_MESSAGE);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setPhoto(file);
    setWorkingPhoto(null);
    setGalleryPhotoId(null);
    setCropOpen(false);
    setPhotoRead(false);
    setError(null);
    setPhotoModalStep("closed");
  }

  function removePhoto() {
    setPhoto(null);
    setWorkingPhoto(null);
    setGalleryPhotoId(null);
    setCropOpen(false);
    setPhotoRead(false);
    setGalleryFetchError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Fetched into a real File so the rest of this form (crop, compress,
   * extract, preview) needs zero special-casing for a gallery source —
   * only the submit step treats it differently (gallery_photo_id instead
   * of re-uploading the same bytes it just downloaded).
   */
  async function pickGalleryPhoto(record: { id: string; photoUrl: string }) {
    setGalleryFetchError(null);
    try {
      const response = await fetch(record.photoUrl);
      if (!response.ok) throw new Error("Could not load this photo.");
      const blob = await response.blob();
      const file = new File([blob], "gallery-photo.jpg", { type: blob.type || "image/jpeg" });
      setPhoto(file);
      setWorkingPhoto(null);
      setGalleryPhotoId(record.id);
      setCropOpen(false);
      setPhotoRead(false);
      setError(null);
      setPhotoModalStep("closed");
    } catch {
      setGalleryFetchError("Could not load this photo. Try uploading it directly instead.");
    }
  }

  function runExtraction() {
    const source = workingPhoto ?? photo;
    if (!source) return;

    setError(null);
    void (async () => {
      const compressed = await compressImage(source);
      let lines: ExtractedReceiptLine[];
      try {
        lines = await extractPhotoMutation.mutateAsync({
          photo: compressed,
          purchaseOrderId: linkedOrder ? linkedOrder.id : null,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 403) {
          setQuotaMessage(error.message);
        } else {
          setError(describeExtractError(error));
        }
        return;
      }

      if (lines.length === 0) {
        setError("No line items found. Use a clearer shot with one item per row.");
        return;
      }

      const extractedRows: LineRow[] = lines.map((line) => {
        const unitCost = line.unitCost ?? 0;
        const appliedPrice =
          line.existingPrice !== null && line.existingCostPrice !== null
            ? suggestPrice(unitCost, line.existingPrice, line.existingCostPrice)
            : null;
        const quantityReceived = line.quantityReceived !== null ? String(line.quantityReceived) : "1";
        const unitCostStr = line.unitCost !== null ? String(line.unitCost) : "";
        const appliedPriceStr = appliedPrice !== null ? String(appliedPrice) : "";

        return {
          key: newKey(),
          name: line.name,
          sku: line.sku ?? "",
          quantityReceived,
          unitCost: unitCostStr,
          productId: line.productId,
          matchedBy: line.matchedBy,
          existingPrice: line.existingPrice,
          existingCostPrice: line.existingCostPrice,
          purchaseOrderItemId: line.purchaseOrderItemId,
          quantityOrdered: line.quantityOrdered,
          appliedPrice: appliedPriceStr,
          note: "",
          originalQuantityReceived: quantityReceived,
          originalUnitCost: unitCostStr,
          originalAppliedPrice: appliedPriceStr,
          excluded: false,
        };
      });

      setPhotoRead(true);
      setRows((previous) => [...previous, ...extractedRows]);
    })();
  }

  function requestSubmit() {
    setError(null);

    if (!locationId) {
      setError("Pick which branch this delivery landed at.");
      return;
    }
    if (!linkedOrder && !supplierId && !supplierName.trim()) {
      setError("Pick a supplier, or type one in for an ad-hoc delivery.");
      return;
    }
    if (rows.filter(cleanableRow).length === 0) {
      setError(describeNoSubmittableRows(rows));
      return;
    }

    setConfirmOpen(true);
  }

  function submit() {
    // Synchronous re-entry guard — mutation.isPending only flips after a
    // render, so two clicks landing before that repaint both slip past a
    // `disabled={saving}` check and fire two receipts (double stock, double
    // record). A ref is set the instant this runs, no render in between.
    if (submittingRef.current) return;
    submittingRef.current = true;

    const cleanRows = rows.filter(cleanableRow);
    if (cleanRows.length === 0) {
      submittingRef.current = false;
      setConfirmOpen(false);
      setError(describeNoSubmittableRows(rows));
      return;
    }

    // Stays camelCase, matching GoodsReceiptItemInput — createGoodsReceiptAction
    // JSON.parses this straight into that type, then hands it to
    // createGoodsReceipt()'s toItemsJson() (packages/api-client), which is
    // the one place that actually converts to snake_case for the wire.
    // Building snake_case here instead breaks that conversion silently:
    // toItemsJson() reads camelCase keys, gets `undefined` for everything
    // but name/sku/note, and JSON.stringify drops undefined keys outright —
    // Laravel's parseItems() then sees no quantity_received/unit_cost and
    // skips every row, which is exactly the "Add at least one item." bug.
    const items: GoodsReceiptItemInput[] = cleanRows.map((row) => ({
      name: row.name.trim(),
      sku: row.sku.trim() || null,
      quantityReceived: Number(row.quantityReceived) || 0,
      unitCost: Number(row.unitCost) || 0,
      productId: row.productId,
      matchedBy: row.matchedBy,
      purchaseOrderItemId: row.purchaseOrderItemId,
      quantityOrdered: row.quantityOrdered,
      appliedPrice: row.appliedPrice.trim() ? Number(row.appliedPrice) : null,
      isFlagged: lineIsFlagged(row),
      note: row.note.trim() || null,
    }));

    void (async () => {
      try {
        await createReceiptMutation.mutateAsync({
          locationId,
          supplierId: linkedOrder ? linkedOrder.supplierId : supplierId || null,
          supplierName: linkedOrder || supplierId ? null : supplierName.trim(),
          purchaseOrderId: linkedOrder ? linkedOrder.id : null,
          referenceNo: referenceNo.trim() || null,
          notes: notes.trim() || null,
          // Gallery-sourced: reuse that stored photo server-side (and mark it
          // processed) instead of re-uploading the bytes this form just fetched.
          galleryPhotoId: galleryPhotoId || null,
          photo: galleryPhotoId ? null : photo,
          items,
        });
      } catch (error) {
        submittingRef.current = false;
        setConfirmOpen(false);
        setError(describeSaveError(error));
        return;
      }

      setConfirmOpen(false);
      toast.success("Receipt saved — stock and prices updated.");
      // Clear before navigating: an ad-hoc receipt (no PO) lands back on this
      // same URL, which Next won't remount, so the reset has to happen here
      // rather than relying on the navigation to blank the form for us.
      resetForm();
      submittingRef.current = false;
      router.push(
        (linkedOrder ? `/purchase-orders/${linkedOrder.id}` : "/receiving") as Route,
      );
    })();
  }

  return (
    <div className="space-y-6">
      <AiProcessingOverlay open={extracting} message="Reading the delivery receipt" />

      {heldReceipt ? (
        <Card className="flex flex-col gap-3 border-primary/30 bg-primary/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-2.5">
            <PauseCircle size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-body font-medium text-ink">
                Held receipt from{" "}
                {new Date(heldReceipt.heldAt).toLocaleString("en-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-0.5 text-caption text-ink-muted">
                {heldReceipt.rows.length} item{heldReceipt.rows.length === 1 ? "" : "s"}
                {heldReceipt.hadUnkeptPhoto ? " — photo wasn't kept" : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={discardHeldReceipt}>
              Discard
            </Button>
            <Button type="button" size="sm" icon={PlayCircle} onClick={resumeHeldReceipt}>
              Resume
            </Button>
          </div>
        </Card>
      ) : null}

      <Dialog
        open={quotaMessage !== null}
        onClose={() => setQuotaMessage(null)}
        title="Weekly AI reads used up"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-3">
            <Sparkles size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-warning-ink" />
            <p className="text-body text-ink">{quotaMessage}</p>
          </div>
          <div className="flex items-start gap-3 text-caption text-ink-muted">
            <Settings size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            <p>
              Go to <span className="font-medium text-ink">Settings → AI</span> and turn it on to
              keep reading receipt photos at the per-request rate. You can still add lines
              manually below without it.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setQuotaMessage(null)}>
              Add lines manually
            </Button>
            <Link href={"/settings" as Route} className={buttonClass("primary", "md")}>
              <Settings size={16} strokeWidth={2} />
              Open Settings
            </Link>
          </div>
        </div>
      </Dialog>

      <Sheet
        open={photoSheetOpen}
        onClose={() => setPhotoSheetOpen(false)}
        title="Delivery receipt photo"
        description="Uploaded, not yet saved — check it's legible before reading it with AI."
        wide
      >
        {photoPreviewUrl ? (
          <img
            src={workingPreviewUrl ?? photoPreviewUrl}
            alt="Delivery receipt, full size"
            className="w-full rounded-md border border-border object-contain"
          />
        ) : null}
      </Sheet>

      <div className="rounded-md border border-border bg-surface p-4 sm:p-6">
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-heading-sm font-semibold">Delivery details</h3>
              <p className="mt-1 text-caption text-ink-muted">
                Who it&rsquo;s from, where it landed, and any reference.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {linkedOrder ? (
                <Field label="Supplier">
                  <Input
                    value={suppliers.find((s) => s.id === linkedOrder.supplierId)?.name ?? "—"}
                    disabled
                  />
                </Field>
              ) : (
                <Field label="Supplier" hint="Pick one, or type a name for an ad-hoc delivery.">
                  <Combobox
                    value={supplierId}
                    onChange={(value) => {
                      setSupplierId(value);
                      if (value) setSupplierName("");
                    }}
                    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                    placeholder="Search suppliers…"
                  />
                </Field>
              )}
              {!linkedOrder ? (
                <Field label="Or supplier name" required={false} hint="Only if not in the list above.">
                  <Input
                    value={supplierName}
                    onChange={(event) => {
                      setSupplierName(event.target.value);
                      if (event.target.value) setSupplierId("");
                    }}
                    placeholder="Walk-in supplier"
                  />
                </Field>
              ) : null}
              <Field label="Received at" required>
                <Combobox
                  value={locationId}
                  onChange={setLocationId}
                  options={locations.map((l) => ({ value: l.id, label: l.name }))}
                  placeholder="Search branches…"
                />
              </Field>
              <Field
                label="Link to purchase order"
                required={false}
                hint="Only orders still marked “ordered” show up here."
              >
                <div className="flex gap-2 w-full">
                  <Combobox
                    className="w-full"
                    value={purchaseOrderId}
                    onChange={onSelectPurchaseOrder}
                    options={openPurchaseOrders.map((po) => ({
                      value: po.id,
                      label: po.referenceNo || `PO ${po.id.slice(0, 8)}`,
                      sublabel: po.orderDate,
                    }))}
                    placeholder="Search open purchase orders…"
                    emptyLabel="No purchase orders are in “ordered” status."
                  />
                  {purchaseOrderId ? (
                    <IconButton
                      icon={X}
                      label="Unlink purchase order"
                      onClick={() => {
                        onSelectPurchaseOrder("");
                        setSupplierId("");
                        setReferenceNo("");
                      }}
                    />
                  ) : null}
                </div>
              </Field>
              <Field
                label="Reference no."
                hint="Delivery/invoice number, optional — separate from a linked PO's own reference."
                required={false}
              >
                <Input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} />
              </Field>
            </div>
            <Field label="Notes" hint="Discrepancies, damage, anything worth flagging." required={false}>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
              />
            </Field>
          </div>

          <div className="h-px w-full bg-border" />

          <div className="space-y-4">
            <div>
              <h3 className="text-heading-sm font-semibold">Receipt photo</h3>
              <p className="mt-1 text-caption text-ink-muted">
                Optional — upload, review, then let AI read the line items.
              </p>
            </div>
            {/* Stays mounted (hidden) even while nothing's picked, so the
                "Upload a photo" modal option can trigger it programmatically. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => handlePhotoChange(event.target.files?.[0] ?? null)}
            />

            {!photoPreviewUrl ? (
              <Button
                type="button"
                variant="secondary"
                icon={Upload}
                onClick={() => setPhotoModalStep("choose")}
              >
                Choose file
              </Button>
            ) : null}

            <Dialog
              open={photoModalStep !== "closed"}
              onClose={() => setPhotoModalStep("closed")}
              title={photoModalStep === "gallery" ? "Pick from gallery" : "Add a photo"}
              description={
                photoModalStep === "gallery"
                  ? `Photos saved for later from the mobile app${
                      (galleryQuery.data ?? []).length > 0
                        ? ` — ${galleryQuery.data!.length} waiting`
                        : ""
                    }.`
                  : "Upload a new photo, or pick one already waiting in the gallery."
              }
              className="max-w-3xl"
            >
              {photoModalStep === "gallery" ? (
                <div className="space-y-3">
                  {galleryFetchError ? <ErrorNote>{galleryFetchError}</ErrorNote> : null}
                  {galleryQuery.isPending ? (
                    <p className="text-caption text-ink-muted">Loading…</p>
                  ) : (galleryQuery.data ?? []).length === 0 ? (
                    <p className="rounded-md border border-dashed border-border bg-canvas px-3 py-6 text-center text-caption text-ink-muted">
                      Nothing waiting to be processed. A photo saved for later from the mobile app
                      shows up here.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {(galleryQuery.data ?? []).map((record) => (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => void pickGalleryPhoto(record)}
                          className="overflow-hidden rounded-md border border-border bg-paper text-left transition-colors hover:border-primary/40"
                        >
                          {/* Arbitrary MinIO/S3 host, same reasoning as the product photo grid. */}
                          <div className="aspect-square overflow-hidden">
                            <img
                              src={record.photoUrl}
                              alt={record.label}
                              className="size-full object-cover"
                            />
                          </div>
                          <div className="space-y-0.5 border-t border-border px-2 py-1.5">
                            <p className="truncate text-caption font-medium text-ink">
                              {record.label}
                            </p>
                            <p className="truncate text-caption text-ink-muted">
                              {record.uploadedBy ?? "Unknown uploader"}
                              {record.locationName ? ` · ${record.locationName}` : ""}
                            </p>
                            <p className="text-caption text-ink-muted">
                              {record.createdAt
                                ? new Date(record.createdAt).toLocaleString("en-PH", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })
                                : "—"}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <Button type="button" variant="secondary" onClick={() => setPhotoModalStep("choose")}>
                    Back
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 rounded-md border border-border bg-canvas px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Camera size={22} strokeWidth={1.75} className="text-primary" />
                    <span className="text-body font-medium text-ink">Upload a photo</span>
                    <span className="text-caption text-ink-muted">From your camera or files</span>
                    <span className="text-caption text-ink-muted">JPG or PNG, up to 5MB</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoModalStep("gallery")}
                    className="flex flex-col items-center gap-2 rounded-md border border-border bg-canvas px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Images size={22} strokeWidth={1.75} className="text-primary" />
                    <span className="text-body font-medium text-ink">From gallery</span>
                    <span className="text-caption text-ink-muted">Saved for later on mobile</span>
                    {(galleryQuery.data ?? []).length > 0 ? (
                      <span className="text-caption text-ink-muted">
                        {galleryQuery.data!.length} photo
                        {galleryQuery.data!.length === 1 ? "" : "s"} waiting
                      </span>
                    ) : null}
                  </button>
                </div>
              )}
            </Dialog>

            {photoPreviewUrl && cropOpen ? (
              <div className="space-y-2 rounded-md border border-border bg-canvas p-3">
                <CropPhoto
                  src={workingPreviewUrl ?? photoPreviewUrl}
                  onCropped={(file) => {
                    setWorkingPhoto(file);
                    setCropOpen(false);
                    setPhotoRead(false);
                  }}
                  onCancel={() => setCropOpen(false)}
                />
              </div>
            ) : photoPreviewUrl ? (
              <div className="space-y-3 rounded-md border border-border bg-canvas p-3">
                <button
                  type="button"
                  onClick={() => setPhotoSheetOpen(true)}
                  className="group relative block w-full cursor-pointer"
                >
                  <img
                    src={workingPreviewUrl ?? photoPreviewUrl}
                    alt="Delivery receipt preview"
                    className="h-40 w-full rounded-sm border border-border object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center rounded-sm bg-ink/0 text-transparent transition-colors group-hover:bg-ink/40 group-hover:text-white">
                    <Expand size={18} strokeWidth={2} />
                  </span>
                </button>
                <p className="text-caption text-ink-muted">
                  {photoRead
                    ? "Read — lines added below. Adjust anything before saving."
                    : workingPhoto
                      ? "Cropped/rotated version shown — this is what AI reads. The original photo is still saved as your receipt record."
                      : "Check this is the right photo, in focus and right-side up, before sending it to AI."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    icon={Sparkles}
                    loading={extracting}
                    onClick={runExtraction}
                  >
                    {extracting ? "Reading…" : photoRead ? "Read again" : "Read with AI"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Crop}
                    onClick={() => setCropOpen(true)}
                    disabled={extracting}
                  >
                    Crop & rotate
                  </Button>
                  {workingPhoto ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={X}
                      onClick={() => {
                        setWorkingPhoto(null);
                        setPhotoRead(false);
                      }}
                      disabled={extracting}
                    >
                      Reset to original
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Expand}
                    onClick={() => setPhotoSheetOpen(true)}
                  >
                    View full size
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={X}
                    onClick={removePhoto}
                    disabled={extracting}
                  >
                    Remove photo
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-caption text-ink-muted">
                <Camera size={13} />
                Upload a photo, review it, then send it to AI to read the line items.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={linkedOrder ? "grid gap-6 lg:grid-cols-2" : ""}>
        {linkedOrder ? (
          <Card>
            <CardHeader title="Purchase order" description="What was ordered." />
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th numeric>Ordered</Th>
                  <Th numeric>Received so far</Th>
                </tr>
              </thead>
              <tbody>
                {linkedOrder.items.map((item) => (
                  <tr key={item.id}>
                    <Td className="font-medium">{item.productName}</Td>
                    <Td numeric>{formatQuantity(item.quantityOrdered)}</Td>
                    <Td numeric>{formatQuantity(item.quantityReceived)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Items received"
            description="From the photo, or added manually."
            action={
              <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addManualLine}>
                Add line
              </Button>
            }
          />
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-body text-ink-muted sm:px-6">
              Upload a photo above, or add a line manually.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="min-w-[18rem]">Item</Th>
                  <Th numeric className="min-w-[2rem]">Qty</Th>
                  <Th numeric className="min-w-[7rem]">Cost price</Th>
                  <Th numeric className="min-w-[8rem]">New cost price</Th>
                  <Th numeric className="min-w-[8rem]">Shelf Price</Th>
                  <Th className="min-w-[9rem]">Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const flagged = lineIsFlagged(row);
                  return (
                    <tr key={row.key} className={row.excluded ? "bg-canvas opacity-50" : undefined}>
                      <Td className="min-w-[18rem] align-top">
                        {row.excluded ? (
                          <p className="mb-1 text-caption font-medium text-danger">
                            This item will not be included
                          </p>
                        ) : null}
                        <Input
                          value={row.name}
                          onChange={(event) => updateRow(row.key, { name: event.target.value })}
                          placeholder="Item name"
                          className="mb-1"
                        />
                        {row.productId ? (
                          <Combobox
                            className="w-full"
                            menuMinWidth={360}
                            value={row.productId}
                            onChange={(productId) => pickProductForRow(row.key, productId)}
                            options={availableProductsFor(row).map((p) => ({
                              value: p.id,
                              label: p.name,
                              sublabel: p.sku ?? undefined,
                            }))}
                          />
                        ) : (
                          <Combobox
                            className="w-full"
                            menuMinWidth={360}
                            value=""
                            onChange={(productId) => pickProductForRow(row.key, productId)}
                            options={availableProductsFor(row).map((p) => ({
                              value: p.id,
                              label: p.name,
                              sublabel: p.sku ?? undefined,
                            }))}
                            placeholder="Match a catalogue product…"
                          />
                        )}
                      </Td>
                      <Td numeric>
                        <div className="flex w-20 items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="0.001"
                            className="num min-w-0 flex-1 text-right"
                            value={row.quantityReceived}
                            onChange={(event) =>
                              updateRow(row.key, { quantityReceived: event.target.value })
                            }
                          />
                          {row.quantityReceived !== row.originalQuantityReceived ? (
                            <IconButton
                              icon={RotateCcw}
                              label="Reset to original quantity"
                              onClick={() =>
                                updateRow(row.key, { quantityReceived: row.originalQuantityReceived })
                              }
                            />
                          ) : null}
                        </div>
                        {row.quantityOrdered !== null ? (
                          <p className="mt-1 text-caption text-ink-muted">
                            Ordered {formatQuantity(row.quantityOrdered)}
                          </p>
                        ) : null}
                      </Td>
                      <Td numeric>
                        {/* Current catalogue cost — read-only. No match yet: fall back to
                            whatever's on the receipt, since there's no catalogue figure to show. */}
                        <Money
                          value={row.existingCostPrice ?? (Number(row.unitCost) || 0)}
                          className="text-ink-muted"
                        />
                      </Td>
                      <Td numeric>
                        <div className="flex items-center gap-1">
                          <MoneyInput
                            type="number"
                            min="0"
                            step="0.01"
                            className="text-right"
                            value={row.unitCost}
                            onChange={(event) => {
                              const unitCost = Number(event.target.value) || 0;
                              const nextAppliedPrice =
                                row.existingPrice !== null && row.existingCostPrice !== null
                                  ? String(suggestPrice(unitCost, row.existingPrice, row.existingCostPrice))
                                  : row.appliedPrice;
                              updateRow(row.key, {
                                unitCost: event.target.value,
                                appliedPrice: nextAppliedPrice,
                              });
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
                                updateRow(row.key, {
                                  unitCost: row.originalUnitCost,
                                  appliedPrice: nextAppliedPrice,
                                });
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
                              <p
                                className={`mt-1 text-caption ${delta > 0 ? "text-danger" : "text-success"}`}
                              >
                                {delta > 0 ? "+" : "−"}
                                {formatMoney(Math.abs(delta))} vs current
                              </p>
                            );
                          })()
                        ) : (
                          <p className="mt-1 text-caption text-ink-muted">New product</p>
                        )}
                      </Td>
                      <Td numeric>
                        <div className="flex items-center gap-1">
                          <MoneyInput
                            type="number"
                            min="0"
                            step="0.01"
                            className={`text-right ${
                              !row.productId && !(Number(row.appliedPrice) > 0)
                                ? "border-danger focus:ring-danger/30"
                                : ""
                            }`}
                            value={row.appliedPrice}
                            onChange={(event) =>
                              updateRow(row.key, { appliedPrice: event.target.value })
                            }
                          />
                          {row.appliedPrice !== row.originalAppliedPrice ? (
                            <IconButton
                              icon={RotateCcw}
                              label="Reset to original selling price"
                              onClick={() =>
                                updateRow(row.key, { appliedPrice: row.originalAppliedPrice })
                              }
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
                              <p
                                className={`mt-1 text-caption ${delta > 0 ? "text-success" : "text-danger"}`}
                              >
                                {delta > 0 ? "+" : "−"}
                                {formatMoney(Math.abs(delta))} vs current
                              </p>
                            );
                          })()
                        ) : null}
                      </Td>
                      <Td>
                        {!row.productId ? (
                          <Badge tone="neutral">Not yet in catalogue</Badge>
                        ) : flagged ? (
                          <Badge tone="warning">Review</Badge>
                        ) : (
                          <Badge tone="success">In catalogue</Badge>
                        )}
                        {flagged ? (
                          <Input
                            value={row.note}
                            onChange={(event) => updateRow(row.key, { note: event.target.value })}
                            placeholder="Note (e.g. short by 2)"
                            className="mt-1"
                          />
                        ) : null}
                      </Td>
                      <Td>
                        <div className="flex justify-end">
                          {row.excluded ? (
                            <IconButton
                              icon={RotateCcw}
                              label="Restore line"
                              onClick={() => toggleRowExcluded(row.key)}
                            />
                          ) : (
                            <IconButton
                              icon={Trash2}
                              label="Remove line"
                              tone="danger"
                              onClick={() => toggleRowExcluded(row.key)}
                            />
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      {rows.some((row) => lineIsFlagged(row)) ? (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-caption text-warning-ink">
          <TriangleAlert size={16} />
          Some lines need review — they still save, but are flagged on the receipt.
        </div>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="sticky bottom-0 z-10 rounded-md border border-border bg-surface px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-6">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() =>
              router.push((linkedOrder ? `/purchase-orders/${linkedOrder.id}` : "/purchase-orders") as Route)
            }
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            icon={PauseCircle}
            className="w-full sm:w-auto"
            disabled={rows.length === 0 && !supplierId && !supplierName.trim() && !notes.trim()}
            onClick={holdReceipt}
          >
            Hold receipt
          </Button>
          <Button icon={Save} loading={saving} onClick={requestSubmit} className="w-full sm:w-auto">
            {saving ? "Saving..." : "Save receipt"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        pending={saving}
        title="Save this receipt?"
        description={
          rows.some((row) => lineIsFlagged(row))
            ? "This restocks matched items and can adjust their prices. Some lines are flagged for review — they still save. You can't undo it from here."
            : "This restocks matched items and can adjust their prices. You can't undo it from here."
        }
        confirmLabel="Save receipt"
        confirmIcon={Save}
      />
    </div>
  );
}
