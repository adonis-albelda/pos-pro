"use client";

import { useRef, useState, useTransition } from "react";
import {
  Camera,
  Check,
  Crop,
  ImagePlus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  PRODUCT_UNITS,
  UNIT_LABELS,
  shelfPriceFromMarkup,
} from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorNote,
  Field,
  FileInput,
  Input,
  MoneyInput,
  Select,
  SuccessNote,
} from "@/components/ui";
import { indentLabel, type CategoryOption } from "@/lib/category-options";
import {
  extractProductsFromImage,
  saveAllScannedProducts,
  saveScannedProduct,
} from "./actions";
import { CropPhoto } from "./crop-photo";
import { AiProcessingOverlay } from "@/components/overlay";
import type { ScannedProductDraft } from "./types";

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

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

function patchDraft(
  drafts: ScannedProductDraft[],
  clientId: string,
  patch: Partial<ScannedProductDraft>,
): ScannedProductDraft[] {
  return drafts.map((draft) =>
    draft.clientId === clientId ? { ...draft, ...patch } : draft,
  );
}

function DraftRow({
  draft,
  categories,
  rowError,
  saving,
  onChange,
  onSave,
  onRemove,
}: {
  draft: ScannedProductDraft;
  categories: CategoryOption[];
  rowError?: string;
  saving: boolean;
  onChange: (patch: Partial<ScannedProductDraft>) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const selected = categories.find((entry) => entry.id === draft.categoryId);

  function applyMarkup(nextCategoryId: string, nextCost: string) {
    const category = categories.find((entry) => entry.id === nextCategoryId);
    const cost = Number(nextCost);
    if (!category?.markupApplied || !Number.isFinite(cost) || nextCost === "") {
      onChange({ categoryId: nextCategoryId, costPrice: nextCost });
      return;
    }
    onChange({
      categoryId: nextCategoryId,
      costPrice: nextCost,
      price: String(shelfPriceFromMarkup(cost, category.markupPercent)),
    });
  }

  return (
    <div className="space-y-3 border-t border-border px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-medium text-ink">
            {draft.name.trim() || "Untitled product"}
          </p>
          {draft.stockApplied ? (
            <span className="mt-1 inline-block">
              <Badge tone="success">
                Stock recorded
                {draft.quantity.trim() ? ` (+${draft.quantity})` : ""}
              </Badge>
            </span>
          ) : null}
          {draft.matchedBy === "supplier" ? (
            <span className="mt-1 inline-block">
              <Badge tone="warning">Matched supplier SKU</Badge>
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            icon={Check}
            loading={saving}
            onClick={onSave}
            disabled={draft.stockApplied}
          >
            {draft.stockApplied ? "Done" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            icon={Trash2}
            onClick={onRemove}
            disabled={saving}
            aria-label="Remove row"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Name">
          <Input
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
            required
            disabled={draft.stockApplied}
          />
        </Field>
        <Field label="Description">
          <Input
            value={draft.description}
            onChange={(event) => onChange({ description: event.target.value })}
            disabled={draft.stockApplied}
          />
        </Field>
        <Field label="SKU">
          <Input
            value={draft.sku}
            onChange={(event) => onChange({ sku: event.target.value })}
            disabled={draft.stockApplied}
          />
        </Field>
        <Field label="Barcode">
          <Input
            value={draft.barcode}
            onChange={(event) => onChange({ barcode: event.target.value })}
            disabled={draft.stockApplied}
          />
        </Field>
        {draft.quantity.trim() ? (
          <Field label="Qty from photo">
            <Input value={draft.quantity} readOnly disabled />
          </Field>
        ) : null}

        <Field label="Supplier price">
          <MoneyInput
            type="number"
            step="0.01"
            min="0"
            value={draft.costPrice}
            onChange={(event) => applyMarkup(draft.categoryId, event.target.value)}
          />
        </Field>
        <Field label="Shelf price">
          <MoneyInput
            type="number"
            step="0.01"
            min="0"
            value={draft.price}
            onChange={(event) => onChange({ price: event.target.value })}
          />
        </Field>
        <Field
          label="Category"
          hint={
            selected?.markupApplied
              ? `Markup ${selected.markupPercent}% fills shelf from cost.`
              : undefined
          }
        >
          <Select
            value={draft.categoryId}
            onChange={(event) => applyMarkup(event.target.value, draft.costPrice)}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {indentLabel(category)}
                {category.isActive ? "" : " (hidden)"}
                {category.markupApplied ? ` (+${category.markupPercent}%)` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Sold by">
          <Select
            value={draft.unit}
            onChange={(event) => onChange({ unit: event.target.value })}
          >
            {PRODUCT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_LABELS[unit] ?? unit}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reorder point">
          <Input
            type="number"
            step="1"
            min="0"
            value={draft.reorderPoint}
            onChange={(event) => onChange({ reorderPoint: event.target.value })}
          />
        </Field>
        <Field label="Bulk price">
          <MoneyInput
            type="number"
            step="0.01"
            min="0"
            value={draft.bulkPrice}
            onChange={(event) => onChange({ bulkPrice: event.target.value })}
          />
        </Field>
        <Field label="Bulk starts at">
          <Input
            type="number"
            step="1"
            min="2"
            value={draft.bulkMinQuantity}
            onChange={(event) =>
              onChange({ bulkMinQuantity: event.target.value })
            }
          />
        </Field>
      </div>

      {rowError ? <ErrorNote>{rowError}</ErrorNote> : null}
    </div>
  );
}

export function FromPhotoPanel({ categories }: { categories: CategoryOption[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // What actually gets read — the original pick, or the cropped result.
  // Kept separate from the file input's own value so cropping doesn't need
  // to fight the browser over what a <input type="file"> is allowed to hold.
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [drafts, setDrafts] = useState<ScannedProductDraft[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, startSavingAll] = useTransition();

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  function onFilePicked(file: File | null) {
    clearPreview();
    setError(null);
    setSuccess(null);
    setRowErrors({});
    setDrafts([]);
    setActiveFile(file);
    setShowCropper(file !== null);
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
  }

  function onCropped(cropped: File) {
    clearPreview();
    setActiveFile(cropped);
    setPreviewUrl(URL.createObjectURL(cropped));
    setShowCropper(false);
  }

  function runExtract() {
    const file = activeFile;
    if (!file) {
      setError("Choose a photo, or take one with the camera.");
      return;
    }

    setError(null);
    setSuccess(null);
    setRowErrors({});
    setReading(true);

    void (async () => {
      try {
        let compressed: File;
        try {
          compressed = await compressImage(file);
        } catch {
          // createImageBitmap/canvas can fail on odd formats — send the original.
          compressed = file;
        }

        const formData = new FormData();
        formData.set("image", compressed);
        const result = await extractProductsFromImage(formData);
        if (result.error) {
          setError(result.error);
          setDrafts([]);
          return;
        }
        setDrafts(result.drafts);
        const stocked = result.drafts.filter((draft) => draft.stockApplied).length;
        const toAdd = result.drafts.length - stocked;
        setSuccess(
          stocked > 0
            ? `Found ${result.drafts.length} line${result.drafts.length === 1 ? "" : "s"} — ${stocked} restocked, ${toAdd} to add as new products.`
            : `Found ${result.drafts.length} product${result.drafts.length === 1 ? "" : "s"}. Check each row, then save.`,
        );
      } catch (err) {
        setDrafts([]);
        setError(
          err instanceof Error
            ? `Could not read the photo: ${err.message}`
            : "Could not read the photo. Try again.",
        );
      } finally {
        setReading(false);
      }
    })();
  }

  function saveOne(draft: ScannedProductDraft) {
    setError(null);
    setSuccess(null);
    setSavingId(draft.clientId);
    void (async () => {
      const result = await saveScannedProduct(draft);
      setSavingId(null);
      if (!result.ok) {
        setRowErrors((prev) => ({
          ...prev,
          [draft.clientId]: result.error ?? "Could not save.",
        }));
        return;
      }
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[draft.clientId];
        return next;
      });
      setDrafts((prev) => prev.filter((row) => row.clientId !== draft.clientId));
      setSuccess("Saved. Terminals pick this up on their next sync.");
    })();
  }

  function saveAll() {
    setError(null);
    setSuccess(null);
    startSavingAll(async () => {
      const result = await saveAllScannedProducts(drafts);
      const failedIds = new Set(result.failures.map((f) => f.clientId));
      setRowErrors(
        Object.fromEntries(result.failures.map((f) => [f.clientId, f.error])),
      );
      setDrafts((prev) => prev.filter((row) => failedIds.has(row.clientId)));
      if (result.error) setError(result.error);
      if (result.saved > 0) {
        setSuccess(
          `Saved ${result.saved} product${result.saved === 1 ? "" : "s"}. Terminals pick these up on their next sync.`,
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <AiProcessingOverlay open={reading} message="AI is reading your photo" />
      <Card>
        <CardHeader
          icon={Camera}
          title="Photo of the list"
          description="One product per line. Clear print works best — handwriting needs a sharp photo."
        />
        <div className="space-y-4 px-4 py-5 sm:px-6">
          <Field
            label="Notebook photo"
            hint="Phone camera or an existing picture. Uses Tesseract OCR on the server. Stock is never read from the photo."
          >
            <FileInput
              ref={inputRef}
              accept="image/*"
              capture="environment"
              onChange={(event) => onFilePicked(event.target.files?.[0] ?? null)}
            />
          </Field>

          {previewUrl && showCropper ? (
            <CropPhoto
              src={previewUrl}
              onCropped={onCropped}
              onCancel={() => setShowCropper(false)}
            />
          ) : previewUrl ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-sm border border-border bg-paper">
                <img
                  src={previewUrl}
                  alt="Selected notebook photo"
                  className="max-h-72 w-full object-contain"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Crop}
                disabled={reading}
                onClick={() => setShowCropper(true)}
              >
                Crop this photo
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              icon={ImagePlus}
              loading={reading}
              disabled={showCropper}
              onClick={runExtract}
            >
              {reading ? "Reading…" : "Read products from photo"}
            </Button>
            {previewUrl || drafts.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                icon={X}
                disabled={reading || savingAll}
                onClick={() => {
                  clearPreview();
                  setActiveFile(null);
                  setShowCropper(false);
                  setDrafts([]);
                  setRowErrors({});
                  setError(null);
                  setSuccess(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>

          <p className="flex items-start gap-2 text-caption text-ink-muted">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            <span>
              Check every field before saving — OCR can misread a digit. Stock still
              only moves through Inventory.
            </span>
          </p>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {success ? <SuccessNote>{success}</SuccessNote> : null}
        </div>
      </Card>

      {drafts.length > 0 ? (
        <Card>
          <CardHeader
            icon={Save}
            title={`${drafts.length} product${drafts.length === 1 ? "" : "s"} to review`}
            description="Edit anything that looks wrong, then save one row or the whole list."
            action={
              <Button
                type="button"
                icon={Save}
                loading={savingAll}
                disabled={reading || savingId !== null}
                onClick={saveAll}
              >
                Save all
              </Button>
            }
          />
          <div>
            {drafts.map((draft) => (
              <DraftRow
                key={draft.clientId}
                draft={draft}
                categories={categories}
                rowError={rowErrors[draft.clientId]}
                saving={savingId === draft.clientId || savingAll}
                onChange={(patch) =>
                  setDrafts((prev) => patchDraft(prev, draft.clientId, patch))
                }
                onSave={() => saveOne(draft)}
                onRemove={() => {
                  setDrafts((prev) =>
                    prev.filter((row) => row.clientId !== draft.clientId),
                  );
                  setRowErrors((prev) => {
                    const next = { ...prev };
                    delete next[draft.clientId];
                    return next;
                  });
                }}
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
