"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@double-a/shared-types";
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
  Save,
  Settings,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { formatQuantity, roundMoney } from "@double-a/shared-types";
import type { Location, PurchaseOrder, PurchaseOrderItem, Supplier } from "@double-a/shared-types";
import { ApiError } from "@double-a/api-client";
import type { GoodsReceiptItemInput } from "@double-a/api-client/queries";
import {
  Button,
  buttonClass,
  Card,
  CardHeader,
  Combobox,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Select,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { AiProcessingOverlay, ConfirmDialog, Dialog, Sheet } from "@/components/overlay";
import { visionProcessingHint } from "@/lib/ai-processing-hint";
import { isImageFile, NOT_AN_IMAGE_MESSAGE } from "@/lib/is-image-file";
import { useGalleryPhotos } from "@/lib/query/gallery-photos";
import { useCurrentUser } from "@/lib/query/session";
import { useCreateGoodsReceipt, useExtractGoodsReceiptPhoto } from "@/lib/query/goods-receipts";
import { useCategories, useCreateCategory } from "@/lib/query/categories";
import { toCategoryOptions } from "@/lib/category-options";
import { listProductsByIds, listProductsPage } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { CropPhoto } from "../products/from-photo/crop-photo";
import {
  ReceivingPreviewDialog,
  type ReceiptPreviewLine,
} from "./receiving-preview-dialog";
import { saveReceivingFollowUp, type ReceivingFollowUp } from "./receiving-follow-up";
import {
  clearReceivingDraft,
  draftHasContent,
  loadReceivingDraft,
  saveReceivingDraft,
  type ReceivingDraft,
} from "./receiving-draft";
import { ReceivingLineAccordion } from "./receiving-line-accordion";
import {
  allRowsResolved,
  applyExtractedSupplierName,
  availableProductsFor,
  cleanableRow,
  describeNoSubmittableRows,
  emptyManualLineRow,
  hasSupplierSelected,
  lineIsFlagged,
  lineIsResolved,
  lineRowFromExtraction,
  normalizeHeldRow,
  receiptSupplierSkuAfterMatch,
  resolveRowPatch,
  showInternalSkuField,
  showProductMatchPicker,
  suggestPrice,
  unresolvedCount,
  supplierSkuForSubmit,
  type LineRow,
} from "./receiving-line-utils";

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
  deliveryDate: string;
  salesmanName: string;
  paymentTerms: "cod" | "installment";
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
  onReceiptSaved,
}: {
  suppliers: Supplier[];
  locations: Location[];
  /** Ordered-status POs — the only ones with anything left to receive against. */
  openPurchaseOrders: PurchaseOrder[];
  purchaseOrderId: string;
  onSelectPurchaseOrder: (id: string) => void;
  linkedOrder: (PurchaseOrder & { items: PurchaseOrderItem[] }) | null;
  defaultLocationId: string | null;
  onReceiptSaved?: (followUp: ReceivingFollowUp) => void;
}) {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const pendingGalleryRestoreId = useRef<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const extractPhotoMutation = useExtractGoodsReceiptPhoto();
  const createReceiptMutation = useCreateGoodsReceipt();
  const categoriesQuery = useCategories({ includeInactive: true });
  const createCategoryMutation = useCreateCategory();
  const categoryOptions = useMemo(
    () => toCategoryOptions(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  );
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
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [discardHeldConfirmOpen, setDiscardHeldConfirmOpen] = useState(false);
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
  const [deliveryDate, setDeliveryDate] = useState("");
  const [salesmanName, setSalesmanName] = useState("");
  const [paymentTerms, setPaymentTerms] = useState<"cod" | "installment">("cod");
  // Extraction-only — never a form field of their own. Carried through to
  // submit so ReceiveGoodsAction can fill them onto the supplier record,
  // and only where that record is currently blank (never overwrites a
  // curated value) — correcting a wrong auto-fill happens on the
  // supplier's own detail page, same as any other supplier field.
  const [supplierAddress, setSupplierAddress] = useState<string | null>(null);
  const [supplierPhone, setSupplierPhone] = useState<string | null>(null);
  const [supplierTin, setSupplierTin] = useState<string | null>(null);
  const [rows, setRows] = useState<LineRow[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [heldReceipt, setHeldReceipt] = useState<HeldReceipt | null>(null);
  const [draftPendingRestore, setDraftPendingRestore] = useState<ReceivingDraft | null>(null);

  // Client-only — detect held receipt or saved draft; neither loads into the form until the user chooses.
  useEffect(() => {
    const held = loadHeldReceipt();
    if (held) {
      setHeldReceipt(held);
      setDraftHydrated(true);
      return;
    }

    const draft = loadReceivingDraft();
    if (draft && draftHasContent(draft)) {
      setDraftPendingRestore(draft);
    }

    setDraftHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setDeliveryDate("");
    setSalesmanName("");
    setPaymentTerms("cod");
    setSupplierAddress(null);
    setSupplierPhone(null);
    setSupplierTin(null);
    setRows([]);
    setExpandedKey(null);
    setError(null);
    removePhoto();
    onSelectPurchaseOrder("");
    clearReceivingDraft();
    setDraftPendingRestore(null);
  }

  function clearAllData() {
    resetForm();
    clearHeldReceipt();
    setHeldReceipt(null);
    setDraftPendingRestore(null);
    setConfirmOpen(false);
    setClearConfirmOpen(false);
    toast.success("Receipt cleared.");
  }

  const hasClearableData =
    rows.length > 0 ||
    Boolean(supplierId) ||
    Boolean(supplierName.trim()) ||
    Boolean(referenceNo.trim()) ||
    Boolean(notes.trim()) ||
    Boolean(deliveryDate) ||
    Boolean(salesmanName.trim()) ||
    Boolean(photo) ||
    Boolean(galleryPhotoId);

  function holdReceipt() {
    saveHeldReceipt({
      heldAt: new Date().toISOString(),
      locationId,
      supplierId,
      supplierName,
      purchaseOrderId,
      referenceNo,
      notes,
      deliveryDate,
      salesmanName,
      paymentTerms,
      rows,
      galleryPhotoId,
      hadUnkeptPhoto: Boolean(photo) && !galleryPhotoId,
    });
    clearReceivingDraft();
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
    setDeliveryDate(heldReceipt.deliveryDate ?? "");
    setSalesmanName(heldReceipt.salesmanName ?? "");
    setPaymentTerms(heldReceipt.paymentTerms ?? "cod");
    const normalizedRows = heldReceipt.rows.map(normalizeHeldRow);
    setRows(normalizedRows);
    const firstUnresolved = normalizedRows.find((row) => !row.excluded && !lineIsResolved(row));
    setExpandedKey(firstUnresolved?.key ?? normalizedRows[0]?.key ?? null);
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
    clearReceivingDraft();
    setHeldReceipt(null);
  }

  function discardHeldReceipt() {
    clearHeldReceipt();
    clearReceivingDraft();
    setHeldReceipt(null);
    setDiscardHeldConfirmOpen(false);
    toast.success("Held receipt discarded.");
  }

  function restoreSavedDraft() {
    if (!draftPendingRestore) return;
    const draft = draftPendingRestore;

    setLocationId(draft.locationId || (defaultLocationId ?? locations[0]?.id ?? ""));
    setSupplierId(draft.supplierId);
    setSupplierName(draft.supplierName);
    setReferenceNo(draft.referenceNo);
    setNotes(draft.notes);
    setDeliveryDate(draft.deliveryDate ?? "");
    setSalesmanName(draft.salesmanName ?? "");
    setPaymentTerms(draft.paymentTerms ?? "cod");
    setRows(draft.rows);
    setExpandedKey(draft.expandedKey);
    setPhotoRead(draft.photoRead);
    setGalleryPhotoId(draft.galleryPhotoId);
    pendingGalleryRestoreId.current = draft.galleryPhotoId;
    onSelectPurchaseOrder(draft.purchaseOrderId);
    setDraftPendingRestore(null);

    if (draft.hadUnkeptPhoto && !draft.galleryPhotoId) {
      toast.message("Your draft's photo wasn't kept — re-add it if you still need it.");
    }

    toast.success("Draft restored.");
  }

  function discardSavedDraft() {
    clearReceivingDraft();
    setDraftPendingRestore(null);
    toast.success("Draft discarded.");
  }

  // Match picker loads pages on demand (infinite scroll). Keep matched/picked
  // rows in a local map for stock, price, and preview lookups.
  const [pickedProducts, setPickedProducts] = useState<Map<string, Product>>(() => new Map());

  const matchedProductIds = useMemo(
    () => [...new Set(rows.map((row) => row.productId).filter((id): id is string => Boolean(id)))],
    [rows],
  );

  const missingMatchedIds = useMemo(
    () => matchedProductIds.filter((id) => !pickedProducts.has(id)),
    [matchedProductIds, pickedProducts],
  );

  const matchedProductsQuery = useQuery({
    queryKey: ["products", "receiving", "matched", missingMatchedIds, locationId] as const,
    queryFn: () => listProductsByIds(getBrowserApiClient(), missingMatchedIds),
    enabled: missingMatchedIds.length > 0,
  });

  useEffect(() => {
    if (!matchedProductsQuery.data?.length) return;
    setPickedProducts((previous) => {
      const next = new Map(previous);
      for (const product of matchedProductsQuery.data) {
        next.set(product.id, product);
      }
      return next;
    });
  }, [matchedProductsQuery.data]);

  // Extract may land before categories finish loading — bind exact name/path matches after.
  useEffect(() => {
    if (categoryOptions.length === 0) return;
    setRows((previous) => {
      let changed = false;
      const next = previous.map((row) => {
        if (row.categoryId || !row.categoryHint.trim()) return row;
        const hint = row.categoryHint.trim().toLowerCase();
        const match =
          categoryOptions.find((entry) => entry.name.trim().toLowerCase() === hint) ??
          categoryOptions.find((entry) => entry.path.trim().toLowerCase() === hint);
        if (!match) return row;
        changed = true;
        return { ...row, categoryId: match.id };
      });
      return changed ? next : previous;
    });
  }, [categoryOptions]);

  const productsById = pickedProducts;

  const hasLinkedOrder = Boolean(linkedOrder);
  const showMatchPicker = showProductMatchPicker(supplierId, supplierName, hasLinkedOrder);
  const hasSupplier = hasSupplierSelected(supplierId, supplierName, hasLinkedOrder);
  const pendingCount = unresolvedCount(rows);
  const canSave = allRowsResolved(rows);

  const supplierLabel = useMemo(() => {
    if (linkedOrder) {
      return suppliers.find((supplier) => supplier.id === linkedOrder.supplierId)?.name ?? "—";
    }
    if (supplierId) {
      return suppliers.find((supplier) => supplier.id === supplierId)?.name ?? "—";
    }
    return supplierName.trim() || "—";
  }, [linkedOrder, supplierId, supplierName, suppliers]);

  const branchLabel = useMemo(
    () => locations.find((location) => location.id === locationId)?.name ?? "—",
    [locationId, locations],
  );

  const previewLines = useMemo((): ReceiptPreviewLine[] => {
    return rows.filter(cleanableRow).map((row) => {
      const product = row.productId ? productsById.get(row.productId) : undefined;
      return {
        key: row.key,
        name: row.name.trim(),
        sku: row.sku.trim(),
        quantityReceived: Number(row.quantityReceived) || 0,
        unitCost: Number(row.unitCost) || 0,
        appliedPrice: row.appliedPrice.trim() ? Number(row.appliedPrice) : null,
        productId: row.productId,
        matchedProductName: product?.name ?? null,
        matchedProductSku: product?.sku ?? null,
        existingPrice: row.existingPrice,
        existingCostPrice: row.existingCostPrice,
        prevStock: product ? product.stockQuantity : null,
        isFlagged: lineIsFlagged(row),
        note: row.note,
      };
    });
  }, [rows, productsById]);

  function addManualLine() {
    const key = newKey();
    setRows((previous) => [...previous, { key, ...emptyManualLineRow() }]);
    setExpandedKey(key);
  }

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function createCategoryForRow(key: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    const existing = categoryOptions.find(
      (option) => option.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      updateRow(key, { categoryId: existing.id, categoryHint: existing.name });
      return;
    }

    try {
      const created = await createCategoryMutation.mutateAsync({ name: trimmed });
      updateRow(key, { categoryId: created.id, categoryHint: created.name });
      toast.success(`Category “${created.name}” created.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create category.");
    }
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
  function pickProductForRow(key: string, product: Product) {
    setPickedProducts((previous) => new Map(previous).set(product.id, product));
    const row = rows.find((r) => r.key === key);
    const unitCost = Number(row?.unitCost) || 0;
    const priorReceipt =
      row?.receiptSupplierSku.trim() || (!row?.productId ? row?.sku.trim() : "") || "";
    updateRow(key, {
      productId: product.id,
      name: row?.name.trim() ? row.name : product.name,
      sku: product.sku ?? "",
      receiptSupplierSku: receiptSupplierSkuAfterMatch(priorReceipt, product, "internal", priorReceipt || undefined),
      matchedBy: "internal",
      existingPrice: product.price,
      existingCostPrice: product.costPrice,
      appliedPrice: String(suggestPrice(unitCost, product.price, product.costPrice)),
      categoryId: product.categoryId ?? row?.categoryId ?? null,
      categoryHint: product.category ?? row?.categoryHint ?? "",
    });
  }

  function clearProductForRow(key: string) {
    const row = rows.find((r) => r.key === key);
    updateRow(key, {
      productId: null,
      matchedBy: null,
      existingPrice: null,
      existingCostPrice: null,
      receiptSupplierSku: row?.receiptSupplierSku.trim() || "",
      sku: "",
    });
  }

  function excludeMatchProductIds(currentKey: string): string[] {
    return rows
      .filter((row) => row.key !== currentKey && row.productId)
      .map((row) => row.productId as string);
  }

  async function fetchMatchProductPool(): Promise<Product[]> {
    const client = getBrowserApiClient();
    const products: Product[] = [];
    let page = 1;
    for (;;) {
      const result = await listProductsPage(client, {
        page,
        pageSize: 200,
        includeInactive: true,
        locationId: locationId || undefined,
      });
      products.push(...result.products);
      if (page >= result.lastPage) return products;
      page += 1;
    }
  }

  function resolveOneRow(key: string) {
    void (async () => {
      const pool = await fetchMatchProductPool();
      setRows((previous) => {
        const row = previous.find((r) => r.key === key);
        if (!row) return previous;
        const available = availableProductsFor(row, previous, pool);
        const patch = resolveRowPatch(row, available);
        if (!patch) return previous;
        const productId = patch.productId;
        if (productId) {
          const product = pool.find((candidate) => candidate.id === productId);
          if (product) {
            setPickedProducts((prev) => new Map(prev).set(product.id, product));
          }
        }
        return previous.map((r) => (r.key === key ? { ...r, ...patch } : r));
      });
    })();
  }

  function resolveAllRows() {
    void (async () => {
      const pool = await fetchMatchProductPool();
      setRows((previous) => {
        let resolvedNow = 0;
        const next = previous.map((row) => {
          const available = availableProductsFor(row, previous, pool);
          const patch = resolveRowPatch(row, available);
          if (patch) {
            resolvedNow++;
            const productId = patch.productId;
            if (productId) {
              const product = pool.find((candidate) => candidate.id === productId);
              if (product) {
                setPickedProducts((prev) => new Map(prev).set(product.id, product));
              }
            }
            return { ...row, ...patch };
          }
          return row;
        });
        const still = unresolvedCount(next);
        toast.success(
          resolvedNow > 0
            ? `Resolved ${resolvedNow} item${resolvedNow === 1 ? "" : "s"}${still > 0 ? ` — ${still} still need details` : ""}.`
            : still > 0
              ? `${still} item${still === 1 ? "" : "s"} still need details.`
              : "All items are ready.",
        );
        return next;
      });
    })();
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
    pendingGalleryRestoreId.current = null;
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

  // Gallery list may load after draft restore — fetch the photo once it appears.
  useEffect(() => {
    const pendingId = pendingGalleryRestoreId.current;
    if (!pendingId || photo) return;
    const record = (galleryQuery.data ?? []).find((item) => item.id === pendingId);
    if (!record) return;
    void pickGalleryPhoto(record);
  }, [galleryQuery.data, photo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-save — survives refresh/accidental tab close. Direct photo
  // uploads can't be serialized; gallery picks persist via galleryPhotoId.
  useEffect(() => {
    if (!draftHydrated) return;
    if (draftPendingRestore) return;

    const draft: ReceivingDraft = {
      savedAt: new Date().toISOString(),
      locationId,
      supplierId,
      supplierName,
      purchaseOrderId,
      referenceNo,
      notes,
      deliveryDate,
      salesmanName,
      paymentTerms,
      rows,
      galleryPhotoId,
      hadUnkeptPhoto: Boolean(photo) && !galleryPhotoId,
      photoRead,
      expandedKey,
    };

    if (!draftHasContent(draft)) {
      clearReceivingDraft();
      return;
    }

    const timeout = window.setTimeout(() => saveReceivingDraft(draft), 500);
    return () => window.clearTimeout(timeout);
  }, [
    draftHydrated,
    locationId,
    supplierId,
    supplierName,
    purchaseOrderId,
    referenceNo,
    notes,
    deliveryDate,
    salesmanName,
    paymentTerms,
    rows,
    galleryPhotoId,
    photo,
    photoRead,
    expandedKey,
    draftPendingRestore,
  ]);

  function runExtraction() {
    const source = workingPhoto ?? photo;
    if (!source) return;

    setError(null);
    void (async () => {
      const compressed = await compressImage(source);
      let extractResult;
      try {
        extractResult = await extractPhotoMutation.mutateAsync({
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

      if (extractResult.lines.length === 0) {
        setError("No line items found. Use a clearer shot with one item per row.");
        return;
      }

      const supplierPatch = applyExtractedSupplierName(
        extractResult.supplierName,
        suppliers,
        supplierId,
        supplierName,
        hasLinkedOrder,
      );
      if (supplierPatch) {
        setSupplierId(supplierPatch.supplierId);
        setSupplierName(supplierPatch.supplierName);
      }

      // Never overwrites something already typed — same "don't clobber a
      // deliberate entry" rule as the supplier name above.
      if (!referenceNo.trim() && extractResult.invoiceNumber) {
        setReferenceNo(extractResult.invoiceNumber);
      }
      if (!deliveryDate && extractResult.deliveryDate) {
        const parsed = new Date(extractResult.deliveryDate);
        if (!Number.isNaN(parsed.getTime())) {
          setDeliveryDate(parsed.toISOString().slice(0, 10));
        }
      }
      if (!salesmanName.trim() && extractResult.salesmanName) {
        setSalesmanName(extractResult.salesmanName);
      }
      if (extractResult.paymentTerms) {
        setPaymentTerms(extractResult.paymentTerms);
      }
      if (extractResult.supplierAddress) setSupplierAddress(extractResult.supplierAddress);
      if (extractResult.supplierPhone) setSupplierPhone(extractResult.supplierPhone);
      if (extractResult.supplierTin) setSupplierTin(extractResult.supplierTin);

      const extractedRows: LineRow[] = extractResult.lines.map((line) => {
        const base = lineRowFromExtraction(line);
        const hint = (line.category ?? "").trim();
        const matchedCategoryId =
          categoryOptions.find(
            (entry) => entry.name.trim().toLowerCase() === hint.toLowerCase(),
          )?.id ||
          categoryOptions.find(
            (entry) => entry.path.trim().toLowerCase() === hint.toLowerCase(),
          )?.id ||
          null;
        const withCategory: Omit<LineRow, "key"> = {
          ...base,
          categoryId: matchedCategoryId,
          categoryHint: hint,
        };
        if (matchedCategoryId) {
          const option = categoryOptions.find((entry) => entry.id === matchedCategoryId);
          if (option?.markupApplied && withCategory.unitCost.trim() && !withCategory.productId) {
            const cost = Number(withCategory.unitCost);
            if (Number.isFinite(cost)) {
              withCategory.appliedPrice = String(
                roundMoney(cost * (1 + option.markupPercent / 100)),
              );
            }
          }
        }
        if (line.productId) {
          const product = productsById.get(line.productId);
          const productCategoryId = product?.categoryId ?? null;
          const productCategoryHint = product?.category ?? "";
          return {
            key: newKey(),
            ...withCategory,
            sku: product?.sku ?? "",
            receiptSupplierSku: product
              ? receiptSupplierSkuAfterMatch(
                  line.sku ?? "",
                  product,
                  line.matchedBy ?? "internal",
                  line.sku ?? undefined,
                )
              : (line.sku ?? ""),
            // Prefer receipt/AI category when present; else catalogue category.
            categoryId: withCategory.categoryId ?? productCategoryId,
            categoryHint: withCategory.categoryHint || productCategoryHint,
          };
        }
        return { key: newKey(), ...withCategory };
      });

      setPhotoRead(true);
      setRows((previous) => [...previous, ...extractedRows]);
      const firstUnresolved = extractedRows.find((row) => !lineIsResolved(row));
      setExpandedKey(firstUnresolved?.key ?? extractedRows[0]?.key ?? null);
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
    if (rows.filter((row) => !row.excluded).length === 0) {
      setError(describeNoSubmittableRows(rows));
      return;
    }
    if (!allRowsResolved(rows)) {
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
    const items: GoodsReceiptItemInput[] = cleanRows.map((row) => {
      const product = row.productId ? productsById.get(row.productId) : undefined;
      return {
      name: row.name.trim(),
      sku: row.sku.trim() || null,
      supplierSku: supplierSkuForSubmit(row, product),
      quantityReceived: Number(row.quantityReceived) || 0,
      unitCost: Number(row.unitCost) || 0,
      productId: row.productId || null,
      matchedBy: row.matchedBy,
      purchaseOrderItemId: row.purchaseOrderItemId,
      quantityOrdered: row.quantityOrdered,
      appliedPrice: row.appliedPrice.trim() ? Number(row.appliedPrice) : null,
      isFlagged: lineIsFlagged(row),
      note: row.note.trim() || null,
      createHidden: !row.productId ? row.createHidden : undefined,
      categoryId: row.categoryId,
      discountPercent: row.discountPercent,
    };
    });

    void (async () => {
      try {
        // Pending AI/typed labels → create categories before the receipt save.
        const pendingNames = new Map<string, string>();
        for (const row of cleanRows) {
          if (row.categoryId || !row.categoryHint.trim()) continue;
          const name = row.categoryHint.trim();
          pendingNames.set(name.toLowerCase(), name);
        }
        if (pendingNames.size > 0) {
          const createdByLower = new Map<string, string>();
          for (const name of pendingNames.values()) {
            const existing = categoryOptions.find(
              (option) => option.name.trim().toLowerCase() === name.toLowerCase(),
            );
            if (existing) {
              createdByLower.set(name.toLowerCase(), existing.id);
              continue;
            }
            const created = await createCategoryMutation.mutateAsync({ name });
            createdByLower.set(name.toLowerCase(), created.id);
          }
          for (const item of items) {
            if (item.categoryId) continue;
            const row = cleanRows.find(
              (entry) =>
                entry.name.trim() === item.name &&
                !entry.categoryId &&
                entry.categoryHint.trim(),
            );
            if (!row) continue;
            const id = createdByLower.get(row.categoryHint.trim().toLowerCase());
            if (id) item.categoryId = id;
          }
        }
      } catch (err) {
        submittingRef.current = false;
        setConfirmOpen(false);
        setError(err instanceof Error ? err.message : "Could not create category.");
        return;
      }

      const saveSupplierId = linkedOrder ? linkedOrder.supplierId : supplierId || null;
      const saveSupplierName = saveSupplierId
        ? (suppliers.find((supplier) => supplier.id === saveSupplierId)?.name ?? null)
        : supplierName.trim() || null;

      let receipt;
      try {
        receipt = await createReceiptMutation.mutateAsync({
          locationId,
          supplierId: saveSupplierId,
          supplierName: saveSupplierName,
          purchaseOrderId: linkedOrder ? linkedOrder.id : null,
          referenceNo: referenceNo.trim() || null,
          notes: notes.trim() || null,
          // Gallery-sourced: reuse that stored photo server-side (and mark it
          // processed) instead of re-uploading the bytes this form just fetched.
          galleryPhotoId: galleryPhotoId || null,
          photo: galleryPhotoId ? null : photo,
          deliveryDate: deliveryDate || null,
          salesmanName: salesmanName.trim() || null,
          paymentTerms,
          supplierAddress,
          supplierPhone,
          supplierTin,
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

      if (!linkedOrder) {
        const followUp: ReceivingFollowUp = {
          savedAt: new Date().toISOString(),
          catalogProducts: receipt.items
            .filter((item) => item.productId)
            .map((item) => ({ id: item.productId!, name: item.name })),
          uncataloguedItems: receipt.items
            .filter((item) => !item.productId)
            .map((item) => ({ name: item.name, sku: item.sku })),
        };
        saveReceivingFollowUp(followUp);
        onReceiptSaved?.(followUp);
      }

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
      <AiProcessingOverlay
        open={extracting}
        message="Reading the delivery receipt"
        hint={visionProcessingHint(currentUser?.isDemo ?? false)}
      />

      {draftPendingRestore && !heldReceipt ? (
        <Card className="flex flex-col gap-3 border-primary/30 bg-primary/5 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-2.5">
            <Save size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="text-body font-medium text-ink">
                Unsaved draft from{" "}
                {new Date(draftPendingRestore.savedAt).toLocaleString("en-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-0.5 text-caption text-ink-muted">
                {draftPendingRestore.rows.length} item
                {draftPendingRestore.rows.length === 1 ? "" : "s"}
                {draftPendingRestore.hadUnkeptPhoto && !draftPendingRestore.galleryPhotoId
                  ? " — photo wasn't kept"
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={discardSavedDraft}>
              Discard
            </Button>
            <Button type="button" size="sm" icon={PlayCircle} onClick={restoreSavedDraft}>
              Restore draft
            </Button>
          </div>
        </Card>
      ) : null}

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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDiscardHeldConfirmOpen(true)}
            >
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
              <Field label="Delivery date" required={false} hint="As printed on the receipt.">
                <Input
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                />
              </Field>
              <Field label="Salesman" required={false}>
                <Input
                  value={salesmanName}
                  onChange={(event) => setSalesmanName(event.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Terms" required={false}>
                <Select
                  value={paymentTerms}
                  onChange={(event) => setPaymentTerms(event.target.value as "cod" | "installment")}
                >
                  <option value="cod">Cash on Delivery</option>
                  <option value="installment">Installment</option>
                </Select>
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
            description="From the photo, or added manually. Each item must be complete before saving."
            action={
              <div className="flex flex-wrap gap-2">
                {rows.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={WandSparkles}
                    onClick={resolveAllRows}
                    disabled={!hasSupplier}
                  >
                    Resolve all
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Plus}
                  onClick={addManualLine}
                  disabled={!hasSupplier}
                >
                  Add line
                </Button>
              </div>
            }
          />
          {!hasSupplier ? (
            <div
              role="status"
              className="mx-4  mt-2 flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2.5 sm:mx-6"
            >
              <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-700" strokeWidth={2} />
              <p className="text-caption leading-relaxed text-ink">
                Pick a supplier first to continue editing the items — choose one from the list
                above, or type a walk-in supplier name.
              </p>
            </div>
          ) : null}
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-body text-ink-muted sm:px-6">
              Upload a photo above, or add a line manually.
            </p>
          ) : (
            <div className="space-y-3 px-4 pb-4 sm:px-6">
              {rows.map((row, index) => {
                const product = row.productId ? productsById.get(row.productId) : undefined;
                return (
                  <ReceivingLineAccordion
                    key={row.key}
                    row={row}
                    index={index}
                    expanded={expandedKey === row.key}
                    onToggle={() => setExpandedKey(expandedKey === row.key ? null : row.key)}
                    hasSupplier={hasSupplier}
                    showMatchPicker={showMatchPicker}
                    showInternalSku={showInternalSkuField(row)}
                    matchedProduct={product}
                    currentStock={product?.stockQuantity ?? null}
                    matchLocationId={locationId || undefined}
                    excludeMatchProductIds={excludeMatchProductIds(row.key)}
                    categoryOptions={categoryOptions}
                    creatingCategory={createCategoryMutation.isPending}
                    onCreateCategory={(name) => void createCategoryForRow(row.key, name)}
                    onUpdate={(patch) => updateRow(row.key, patch)}
                    onPickProduct={(picked) => pickProductForRow(row.key, picked)}
                    onClearProduct={() => clearProductForRow(row.key)}
                    onResolve={() => resolveOneRow(row.key)}
                    onToggleExcluded={() => toggleRowExcluded(row.key)}
                  />
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {rows.some((row) => lineIsFlagged(row)) ? (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-caption text-warning-ink">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          Some items are new and not in your product list yet. You can still save this receipt.
          Use &ldquo;Hide from shop&rdquo; on each new line if you want them off the floor until
          their full details are finished.
        </div>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="sticky bottom-0 z-10 rounded-md border border-border bg-surface px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-6">
        {pendingCount > 0 ? (
          <p className="mb-3 text-center text-caption text-ink-muted">
            {pendingCount} item{pendingCount === 1 ? "" : "s"} still need details before you can save.
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() =>
              router.push((linkedOrder ? `/purchase-orders/${linkedOrder.id}` : "/receiving") as Route)
            }
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            icon={Trash2}
            className="w-full sm:w-auto"
            disabled={!hasClearableData || saving}
            onClick={() => setClearConfirmOpen(true)}
          >
            Clear data
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
          <Button
            icon={Save}
            loading={saving}
            disabled={!canSave || saving}
            onClick={requestSubmit}
            className="w-full sm:w-auto"
          >
            {saving ? "Saving..." : "Save receipt"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={discardHeldConfirmOpen}
        onClose={() => setDiscardHeldConfirmOpen(false)}
        onConfirm={discardHeldReceipt}
        title="Discard held receipt?"
        description="This permanently deletes the held receipt saved in this browser, including its line items. This cannot be undone."
        confirmLabel="Discard"
        confirmIcon={Trash2}
      />

      <ConfirmDialog
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={clearAllData}
        title="Clear this receipt?"
        description="This removes all delivery details and line items on this page, including the auto-saved draft. This cannot be undone."
        confirmLabel="Clear data"
        confirmIcon={Trash2}
      />

      <ReceivingPreviewDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        pending={saving}
        supplierLabel={supplierLabel}
        branchLabel={branchLabel}
        notes={notes}
        referenceNo={referenceNo.trim()}
        lines={previewLines}
        hasFlaggedLines={previewLines.some((line) => line.isFlagged)}
      />
    </div>
  );
}
