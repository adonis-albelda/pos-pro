"use client";

import Link from "next/link";
import { Fragment, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ProductImportStatus } from "@double-a/api-client/queries";
import {
  ArrowRight,
  Ban,
  Check,
  Columns3,
  Crop,
  Download,
  Eye,
  FolderPlus,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
  Search,
  SearchCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
  Camera,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  ErrorNote,
  Field,
  FileInput,
  Input,
  Select,
  SuccessNote,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { useLocationFilter } from "@/components/location-filter-provider";
import { useLocations } from "@/lib/query/locations";
import { useFeatureFlags } from "@/lib/query/features";
import { compressImage } from "@/lib/compress-image";
import type { ProductStockMode } from "@/lib/product-import";
import { IMPORT_FIELD_META, type ColumnMapping } from "@/lib/product-import-mapping";
import { mappedCellsFromSource, sourceCellsForLine } from "@/lib/product-import-fix";
import {
  downloadImportIssuesCsv,
  importIssuesFilename,
  rejectedRowsFromPlan,
} from "@/lib/product-import-export";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import { useRollbackProductImport } from "@/lib/query/product-imports";
import { ColumnMappingForm, ColumnMappingSummary } from "./column-mapping-form";
import { AiProcessingOverlay, ConfirmDialog, Dialog } from "@/components/overlay";
import {
  canUseDocumentScanCamera,
  DocumentScanCamera,
} from "@/components/document-scan-camera";
import { visionProcessingHint } from "@/lib/ai-processing-hint";
import { useCurrentUser } from "@/lib/query/session";
import { FileColumnsTable } from "./file-columns-table";
import { ImportInfoCards } from "./import-info-cards";
import { ImportProgress } from "./import-progress";
import { RollbackProgress } from "./rollback-progress";
import { EMPTY_IMPORT_STATE } from "./import-state";
import { importProducts } from "./actions";
import { CropPhoto } from "../from-photo/crop-photo";

function ReadPhotoButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const { data: user } = useCurrentUser();

  return (
    <>
      <AiProcessingOverlay
        open={pending}
        message="AI is reading your photo"
        hint={visionProcessingHint(user?.isDemo ?? false)}
      />
      <Button
        type="submit"
        name="intent"
        value="extract_photo"
        icon={Sparkles}
        loading={pending}
        disabled={disabled}
      >
        {pending ? "Reading photo..." : "Read with AI"}
      </Button>
    </>
  );
}

function SubmitButton({
  icon,
  label,
  busyLabel,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  busyLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" icon={icon} loading={pending} disabled={disabled}>
      {pending ? busyLabel : label}
    </Button>
  );
}

function AiFixButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <>
      <AiProcessingOverlay open={pending} message="AI is fixing your file" />
      <Button type="submit" variant="secondary" size="sm" icon={Sparkles} loading={pending} disabled={disabled}>
        {pending ? "Fixing with AI..." : "Fix with AI"}
      </Button>
    </>
  );
}

function SaveEditButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" icon={Check} loading={pending} className="w-full sm:w-auto">
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}

/**
 * One row, manually corrected — the fields prefill from whatever's actually
 * in the file's mapped columns for this line (works the same whether the
 * row currently passes or is turned away), submits as a single-row "fix"
 * through the same intent="edit_row" path AI fixes use (applyImportRowFixes
 * + re-plan), so a manual correction and an AI one land the same way.
 */
function EditRowDialog({
  line,
  csv,
  mapping,
  mappingJson,
  stockMode,
  stockLocationId,
  submit,
  onClose,
}: {
  line: number | null;
  csv: string;
  mapping: ColumnMapping;
  mappingJson: string;
  stockMode: ProductStockMode;
  stockLocationId: string | null;
  submit: (formData: FormData) => void;
  onClose: () => void;
}) {
  const prefill = line !== null ? mappedCellsFromSource(sourceCellsForLine(csv, line), mapping) : {};

  return (
    <Dialog
      open={line !== null}
      onClose={onClose}
      title={line !== null ? `Edit row ${line}` : ""}
      description="Correct any value below, then save. This writes back into the file the same way an AI fix does."
    >
      <form action={submit} onSubmit={onClose} className="space-y-4">
        <input type="hidden" name="intent" value="edit_row" />
        <input type="hidden" name="csv" value={csv} />
        <input type="hidden" name="mapping_json" value={mappingJson} />
        <input type="hidden" name="stock_mode" value={stockMode} />
        {stockLocationId ? <input type="hidden" name="location_id" value={stockLocationId} /> : null}
        <input type="hidden" name="edit_line" value={line ?? ""} />

        <div className="grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2">
          {IMPORT_FIELD_META.map((field) => (
            <Field key={field.key} label={field.label}>
              <Input name={`edit_${field.key}`} defaultValue={prefill[field.key] ?? ""} />
            </Field>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <SaveEditButton />
        </div>
      </form>
    </Dialog>
  );
}

const IMPORT_STEPS: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Upload", icon: Upload },
  { label: "Connect columns", icon: Columns3 },
  { label: "Options", icon: SlidersHorizontal },
  { label: "Review", icon: Eye },
  { label: "Importing", icon: Loader2 },
];

/** Big centered nodes + connecting line, done/current/upcoming — every state change transitions instead of snapping. */
function StepBar({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-start justify-center gap-y-4">
      {IMPORT_STEPS.map(({ label, icon: Icon }, index) => {
        const done = index < step;
        const current = index === step;
        const spinning = current && label === "Importing";
        return (
          <li key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-2 px-1">
              <span
                className={
                  "flex size-12 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out sm:size-14 " +
                  (done
                    ? "scale-100 bg-primary text-white"
                    : current
                      ? "scale-110 border-2 border-primary text-primary shadow-[0_0_0_4px] shadow-primary/15"
                      : "scale-100 border border-border text-ink-muted")
                }
              >
                {done ? (
                  <Check size={22} strokeWidth={3} />
                ) : (
                  <Icon size={22} strokeWidth={2} className={spinning ? "animate-spin" : ""} />
                )}
              </span>
              <span
                className={
                  "text-center text-caption transition-colors duration-300 " +
                  (current ? "font-semibold text-ink" : done ? "text-ink-muted" : "text-ink-muted/60")
                }
              >
                {label}
              </span>
            </div>
            {index < IMPORT_STEPS.length - 1 ? (
              <span
                className={
                  "mx-2 mb-6 h-0.5 w-8 shrink-0 rounded-full transition-colors duration-500 sm:w-14 " +
                  (done ? "bg-primary" : "bg-border")
                }
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function StockOptionsForm({
  stockMode,
  stockLocationId,
  branches,
  hasStockColumn,
}: {
  stockMode: ProductStockMode;
  stockLocationId: string | null;
  branches: Array<{ id: string; name: string }>;
  hasStockColumn: boolean;
}) {
  if (!hasStockColumn) return null;

  const singleBranch = branches.length === 1 ? branches[0] : null;
  const branchName =
    singleBranch?.name ??
    branches.find((branch) => branch.id === stockLocationId)?.name ??
    "the chosen branch";

  return (
    <div className="space-y-4 rounded-md border border-border bg-paper px-4 py-4">
      <div>
        <p className="text-body font-medium text-ink">Stock options</p>
        <p className="mt-1 text-caption text-ink-muted">
          Quantity column is connected. Choose how stock at{" "}
          <span className="font-medium text-ink">{branchName}</span> should change.
        </p>
      </div>

      {singleBranch ? (
        <input type="hidden" name="location_id" value={singleBranch.id} />
      ) : branches.length > 1 ? (
        <Field
          label="Branch for stock"
          hint="File quantities update inventory at this branch only."
          required
        >
          <Select name="location_id" defaultValue={stockLocationId ?? ""} required>
            <option value="">— Choose branch —</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <ErrorNote>Add an active branch before importing stock quantities.</ErrorNote>
      )}

      <div className="space-y-2 text-body text-ink-muted">
        <label className="flex items-start gap-2">
          <input type="radio" name="stock_mode" value="skip" defaultChecked={stockMode === "skip"} />
          <span>
            <span className="font-medium text-ink">Skip stock</span> — update catalogue only. File
            quantities are ignored.
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="stock_mode" value="set" defaultChecked={stockMode === "set"} />
          <span>
            <span className="font-medium text-ink">Set to file quantity</span> — branch stock becomes
            the file value (overwrites current count).
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="stock_mode" value="add" defaultChecked={stockMode === "add"} />
          <span>
            <span className="font-medium text-ink">Add file quantity</span> — adds the file amount to
            current stock (positive or negative).
          </span>
        </label>
      </div>
    </div>
  );
}

export function ImportForm() {
  const [state, submitAction] = useActionState(importProducts, EMPTY_IMPORT_STATE);
  const { isEnabled } = useFeatureFlags();
  const photoAiEnabled = isEnabled("product_photo_ai");
  const { locationId } = useLocationFilter();
  const locationsQuery = useLocations({ type: "branch" });
  const [finished, setFinished] = useState<ProductImportStatus | null>(null);
  const rollback = useRollbackProductImport();
  const [confirmingRollback, setConfirmingRollback] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [activeRowTab, setActiveRowTab] = useState<"valid" | "broken">("valid");
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [skipExistingUpdates, setSkipExistingUpdates] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanScan(canUseDocumentScanCamera());
  }, []);

  const isImageUpload = Boolean(activeFile?.type.startsWith("image/"));

  const clearPhotoPreview = useCallback(() => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setActiveFile(null);
    setShowCropper(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onFilePicked(file: File | null) {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setShowCropper(false);

    if (!file) {
      setActiveFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setActiveFile(file);
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
      setShowCropper(true);
    }
  }

  function onPhotoCropped(cropped: File) {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(cropped);
    });
    setActiveFile(cropped);
    setShowCropper(false);
  }

  const submit = useCallback(
    async (formData: FormData) => {
      const intent = String(formData.get("intent") ?? "");
      if (intent === "extract_photo") {
        const file = activeFile;
        if (file instanceof File && file.type.startsWith("image/")) {
          try {
            const compressed = await compressImage(file);
            formData.set("file", compressed);
          } catch {
            formData.set("file", file);
          }
        }
      }
      submitAction(formData);
    },
    [activeFile, submitAction],
  );

  const plan = state.plan;
  const branches = locationsQuery.data ?? [];
  const stockLocationId = useMemo(() => {
    if (branches.length === 1) return branches[0]!.id;
    const fromState = state.locationId;
    if (fromState && branches.some((branch) => branch.id === fromState)) return fromState;
    if (locationId && branches.some((branch) => branch.id === locationId)) return locationId;
    return null;
  }, [branches, state.locationId, locationId]);

  const hasStockColumn = Boolean(state.mapping?.stock_quantity);
  const mappingJson = state.mapping ? JSON.stringify(state.mapping) : "";

  const mappedHeaders = useMemo(() => {
    const headers = new Set(
      Object.values(state.mapping ?? {}).filter((header): header is string => Boolean(header)),
    );
    for (const header of state.sourceHeaders) {
      if (header.startsWith("price_level_")) headers.add(header);
    }
    return headers;
  }, [state.mapping, state.sourceHeaders]);

  const currentStep = finished
    ? IMPORT_STEPS.length
    : state.importing
      ? 4
      : plan
        ? 3
        : state.mapping && hasStockColumn
          ? 2
          : state.sourceHeaders.length > 0
            ? 1
            : 0;

  const onImportComplete = useCallback((status: ProductImportStatus) => {
    setFinished(status);
  }, []);

  const rowCount = plan?.rows.length ?? 0;
  const effectiveAcceptedCount = plan
    ? plan.createCount + (skipExistingUpdates ? 0 : plan.updateCount)
    : 0;
  const acceptedCount = plan ? plan.createCount + plan.updateCount : 0;
  const rejectedIssues = plan ? rejectedRowsFromPlan(plan) : [];
  const visibleRows = useMemo(() => {
    if (!plan) return [];
    return activeRowTab === "broken"
      ? plan.rows.filter((row) => row.action === "reject")
      : plan.rows.filter((row) => row.action !== "reject");
  }, [plan, activeRowTab]);
  const fixByLine = useMemo(
    () => new Map((state.lastFixes ?? []).map((fix) => [fix.line, fix])),
    [state.lastFixes],
  );

  const downloadRejected = () => {
    if (!state.csv || rejectedIssues.length === 0) return;
    downloadImportIssuesCsv(
      state.csv,
      rejectedIssues,
      importIssuesFilename("turned-away"),
    );
  };

  const downloadFailedSaves = () => {
    if (!state.csv || !finished?.failures.length) return;
    downloadImportIssuesCsv(
      state.csv,
      finished.failures.map((failure) => ({
        line: failure.line,
        errors: [failure.error],
      })),
      importIssuesFilename("failed-save"),
    );
  };

  function confirmRollback() {
    if (!finished) return;
    rollback.mutate(finished.importId, {
      onSuccess: () => setRollingBack(true),
      onError: (error) => {
        toast.error(error instanceof ApiError ? error.message : "Could not start the rollback.");
      },
    });
    setConfirmingRollback(false);
  }

  return (
    <div className="space-y-6">
      <ImportInfoCards />

      <p className="text-caption text-ink-muted">
        Nothing is written until you review the preview and press Import.
      </p>

      {state.notice ? <SuccessNote>{state.notice}</SuccessNote> : null}

      <StepBar step={currentStep} />

      <form action={submit} className="space-y-4">
        {photoAiEnabled && canScan && !state.csv ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" icon={Camera} onClick={() => setCameraOpen(true)}>
              Scan with camera
            </Button>
            <span className="text-caption text-ink-muted">
              Live hints for light, angle, and blur — like phone text-scan mode.
            </span>
          </div>
        ) : null}

        <Field
          label="CSV or photo"
          hint={
            photoAiEnabled
              ? "Upload a supplier CSV, or a photo of a notebook list — AI reads images on the next step."
              : "Any layout works — connect columns on the next step. Download our template if you prefer."
          }
          required={false}
        >
          <FileInput
            ref={fileInputRef}
            name="file"
            accept=".csv,text/csv,image/*"
            capture={photoAiEnabled ? "environment" : undefined}
            onChange={(event) => onFilePicked(event.target.files?.[0] ?? null)}
          />
        </Field>

        {previewUrl && isImageUpload && photoAiEnabled && !state.csv ? (
          showCropper ? (
            <CropPhoto
              src={previewUrl}
              onCropped={onPhotoCropped}
              onCancel={() => setShowCropper(false)}
            />
          ) : (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-sm border border-border bg-paper">
                <img
                  src={previewUrl}
                  alt="Selected import photo"
                  className="max-h-72 w-full object-contain"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={Crop}
                  onClick={() => setShowCropper(true)}
                >
                  Crop or rotate
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={X}
                  onClick={clearPhotoPreview}
                >
                  Clear photo
                </Button>
              </div>
            </div>
          )
        ) : null}

        <Field
          label="Or paste the rows"
          hint="Header row first, commas between columns."
          required={false}
        >
          <Textarea
            name="pasted"
            rows={4}
            placeholder="ItemCode,ItemName,Price,Cost,Category&#10;WEP-101,1G PLATE WEP-101,35,20.8,ELECT"
          />
        </Field>

        {state.error && !state.csv ? <ErrorNote>{state.error}</ErrorNote> : null}

        <div className="flex flex-wrap items-center gap-3">
          {isImageUpload && photoAiEnabled ? (
            <ReadPhotoButton disabled={showCropper || !activeFile} />
          ) : (
            <>
              <input type="hidden" name="intent" value="check" />
              <SubmitButton icon={Search} label="Read the file" busyLabel="Reading..." />
            </>
          )}
          {isImageUpload && !photoAiEnabled ? (
            <p className="text-caption text-ink-muted">
              Photo import is not enabled for this shop.
            </p>
          ) : null}
        </div>
      </form>

      {state.csv && state.sourceHeaders.length > 0 ? (
        <div className="space-y-6">
          <div className="ledger-line" />

          <FileColumnsTable
            headers={state.sourceHeaders}
            sampleRow={state.sampleRow ?? {}}
            mappedHeaders={mappedHeaders}
          />

          {state.error && !plan ? <ErrorNote>{state.error}</ErrorNote> : null}

          {state.mapping ? (
            <ColumnMappingForm
              key={JSON.stringify(state.mapping)}
              csv={state.csv}
              sourceHeaders={state.sourceHeaders}
              mapping={state.mapping}
              sampleRow={state.sampleRow ?? {}}
              stockMode={state.stockMode}
              locationId={stockLocationId}
              submit={submit}
              submitIcon={Search}
              submitLabel={plan ? "Update preview" : "Check the mapping"}
              busyLabel="Checking..."
            />
          ) : null}

          {hasStockColumn ? (
            <form action={submit} className="space-y-4">
              <input type="hidden" name="intent" value="map" />
              <input type="hidden" name="csv" value={state.csv} />
              <input type="hidden" name="mapping_json" value={mappingJson} />
              <StockOptionsForm
                stockMode={state.stockMode}
                stockLocationId={stockLocationId}
                branches={branches}
                hasStockColumn={hasStockColumn}
              />
              <SubmitButton
                icon={Search}
                label="Update preview"
                busyLabel="Checking..."
                disabled={hasStockColumn && branches.length === 0}
              />
            </form>
          ) : null}

          {plan ? (
            <div className="space-y-4">
              <div className="ledger-line" />

              <p className="flex items-start gap-2 text-body text-ink-muted">
                <Info size={16} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium text-ink">Price fallback:</span> if the main price
                  cell is empty or zero, we try Price Level 1, then 2, then 3 when those columns exist
                  in your file.
                </span>
              </p>

              <ColumnMappingSummary mapping={state.mapping!} />

              {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}

              {plan.newCategoryPaths.length > 0 ? (
                <p className="flex items-start gap-2 rounded-sm border border-border bg-paper px-3 py-2 text-body text-ink-muted">
                  <FolderPlus size={16} className="mt-0.5 shrink-0" />
                  <span>
                    These categories do not exist yet and will be created:{" "}
                    <span className="font-medium text-ink">
                      {plan.newCategoryPaths.join(", ")}
                    </span>
                  </span>
                </p>
              ) : null}

              {plan.newSupplierNames.length > 0 ? (
                <p className="flex items-start gap-2 rounded-sm border border-border bg-paper px-3 py-2 text-body text-ink-muted">
                  <FolderPlus size={16} className="mt-0.5 shrink-0" />
                  <span>
                    These suppliers do not exist yet and will be created:{" "}
                    <span className="font-medium text-ink">
                      {plan.newSupplierNames.join(", ")}
                    </span>
                  </span>
                </p>
              ) : null}

              {state.ignoredSourceColumns.length > 0 ? (
                <p className="flex items-start gap-2 rounded-sm border border-warning/50 bg-warning/12 px-3 py-2 text-body text-[#8a6516]">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  <span>
                    File columns not connected (ignored):{" "}
                    {state.ignoredSourceColumns.map((h) => h.replace(/_/g, " ")).join(", ")}.
                  </span>
                </p>
              ) : null}

              {/* Everything below stays put — only the row table (inside
                  its own bounded, scrollable box) moves when you scroll
                  through a large file. */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success" icon={FolderPlus}>
                  {plan.createCount} new
                </Badge>
                <Badge tone="warning" icon={SearchCheck}>
                  {plan.updateCount} in catalogue
                </Badge>
                <Badge tone={plan.rejectCount > 0 ? "danger" : "neutral"} icon={Ban}>
                  {plan.rejectCount} turned away
                </Badge>
                {rowCount > 0 ? (
                  <Badge tone="neutral">{rowCount.toLocaleString()} rows in file</Badge>
                ) : null}
              </div>

              <div className="flex gap-1 border-b border-border">
                <button
                  type="button"
                  onClick={() => setActiveRowTab("valid")}
                  aria-current={activeRowTab === "valid" ? "page" : undefined}
                  className={
                    "flex items-center gap-1.5 border-b-2 px-3 py-2 text-body font-medium transition-colors " +
                    (activeRowTab === "valid"
                      ? "border-primary text-ink"
                      : "border-transparent text-ink-muted hover:text-ink")
                  }
                >
                  Valid rows
                  <span
                    className={
                      "num rounded-sm px-1.5 py-0.5 text-caption " +
                      (activeRowTab === "valid" ? "bg-primary/10 text-primary" : "bg-border/60 text-ink-muted")
                    }
                  >
                    {acceptedCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRowTab("broken")}
                  aria-current={activeRowTab === "broken" ? "page" : undefined}
                  className={
                    "flex items-center gap-1.5 border-b-2 px-3 py-2 text-body font-medium transition-colors " +
                    (activeRowTab === "broken"
                      ? "border-primary text-ink"
                      : "border-transparent text-ink-muted hover:text-ink")
                  }
                >
                  Broken products
                  <span
                    className={
                      "num rounded-sm px-1.5 py-0.5 text-caption " +
                      (activeRowTab === "broken" ? "bg-primary/10 text-primary" : "bg-border/60 text-ink-muted")
                    }
                  >
                    {plan.rejectCount}
                  </span>
                </button>
              </div>

              {activeRowTab === "broken" && plan.rejectCount > 0 ? (
                <div className="space-y-3">
                  <p className="text-caption text-ink-muted">
                    Turned-away rows can be downloaded as a separate CSV with an{" "}
                    <span className="font-medium text-ink">import_errors</span> column, or use{" "}
                    <span className="font-medium text-ink">Fix with AI</span> when SKU and name
                    look merged or columns shifted. Fix offline and re-upload if AI cannot recover
                    them.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" size="sm" icon={Download} onClick={downloadRejected}>
                      Download turned-away rows
                    </Button>
                    <form action={submit} className="inline">
                      <input type="hidden" name="intent" value="ai_fix" />
                      <input type="hidden" name="csv" value={state.csv} />
                      <input type="hidden" name="mapping_json" value={mappingJson} />
                      <input type="hidden" name="stock_mode" value={state.stockMode} />
                      {stockLocationId ? (
                        <input type="hidden" name="location_id" value={stockLocationId} />
                      ) : null}
                      <AiFixButton />
                    </form>
                  </div>
                </div>
              ) : null}

              <div className="max-h-[32rem] overflow-y-auto rounded-md border border-border">
                <Table>
                  <thead>
                    <tr>
                      <Th numeric>Line</Th>
                      <Th>Product</Th>
                      <Th>SKU</Th>
                      <Th>What happens</Th>
                      <Th>Detail</Th>
                      <Th>&nbsp;</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.slice(0, 100).map((row) => {
                      const fix = fixByLine.get(row.line);
                      return (
                        <Fragment key={row.line}>
                          <tr>
                            <Td numeric className="text-ink-muted">
                              {row.line}
                            </Td>
                            <Td className="font-medium">{row.name || "—"}</Td>
                            <Td className="num text-ink-muted">{row.sku || "—"}</Td>
                            <Td>
                              {row.action === "create" ? (
                                <Badge tone="success" icon={FolderPlus}>
                                  New product
                                </Badge>
                              ) : row.action === "update" ? (
                                <Badge tone="warning" icon={SearchCheck}>
                                  In catalogue
                                </Badge>
                              ) : (
                                <Badge tone="danger" icon={Ban}>
                                  Turned away
                                </Badge>
                              )}
                            </Td>
                            <Td
                              className={
                                row.action === "reject" ? "text-danger" : "text-ink-muted"
                              }
                            >
                              {row.notes.join(" ")}
                            </Td>
                            <Td>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                icon={Pencil}
                                onClick={() => setEditingLine(row.line)}
                              >
                                Edit
                              </Button>
                            </Td>
                          </tr>
                          {fix ? (
                            <tr className="bg-primary-tint/40">
                              <Td />
                              <Td colSpan={5}>
                                <div className="flex items-start gap-2 py-1 text-caption text-ink-muted">
                                  <Sparkles size={13} className="mt-0.5 shrink-0 text-primary" />
                                  <span>
                                    <span className="font-medium text-ink">Updated: </span>
                                    {Object.entries(fix.fields)
                                      .map(([key, value]) => {
                                        const label =
                                          IMPORT_FIELD_META.find((meta) => meta.key === key)?.label ??
                                          key;
                                        return `${label}: ${value}`;
                                      })
                                      .join(" · ")}
                                    {fix.reason ? ` (${fix.reason})` : ""}
                                  </span>
                                </div>
                              </Td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              {visibleRows.length > 100 ? (
                <p className="text-caption text-ink-muted">
                  Showing first 100 rows of {visibleRows.length.toLocaleString()}.
                </p>
              ) : null}

              {!state.importing ? (
                <form action={submit} className="space-y-4">
                  <input type="hidden" name="intent" value="import" />
                  <input type="hidden" name="csv" value={state.csv} />
                  <input type="hidden" name="mapping_json" value={mappingJson} />

                  {plan.updateCount > 0 ? (
                    <div className="rounded-md border border-border bg-paper px-4 py-4">
                      <label className="flex items-start gap-2 text-body text-ink-muted">
                        <input
                          type="checkbox"
                          name="skip_existing_updates"
                          value="1"
                          checked={skipExistingUpdates}
                          onChange={(event) => setSkipExistingUpdates(event.target.checked)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium text-ink">Skip updates for existing products</span>{" "}
                          — only add new products from this file. Rows already in the catalogue are
                          left unchanged.
                        </span>
                      </label>
                    </div>
                  ) : null}

                  {hasStockColumn && plan.updateCount > 0 && !skipExistingUpdates ? (
                    <StockOptionsForm
                      stockMode={state.stockMode}
                      stockLocationId={stockLocationId}
                      branches={branches}
                      hasStockColumn={hasStockColumn}
                    />
                  ) : (
                    <>
                      <input type="hidden" name="stock_mode" value={state.stockMode} />
                      {stockLocationId ? (
                        <input type="hidden" name="location_id" value={stockLocationId} />
                      ) : null}
                    </>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <SubmitButton
                      icon={Check}
                      label={`Import ${effectiveAcceptedCount.toLocaleString()} products`}
                      busyLabel="Starting import..."
                      disabled={
                        effectiveAcceptedCount === 0 ||
                        (hasStockColumn &&
                          !skipExistingUpdates &&
                          plan.updateCount > 0 &&
                          state.stockMode !== "skip" &&
                          branches.length > 0 &&
                          !stockLocationId)
                      }
                    />
                    {plan.rejectCount > 0 ? (
                      <Button
                        type="button"
                        variant="secondary"
                        icon={Ban}
                        onClick={() => setActiveRowTab("broken")}
                      >
                        Fix broken rows first ({plan.rejectCount})
                      </Button>
                    ) : null}
                    <span className="text-caption text-ink-muted">
                      Import runs in the background — you will see progress below.
                    </span>
                  </div>

                  {plan.rejectCount > 0 ? (
                    <p className="text-caption text-ink-muted">
                      {plan.rejectCount} row{plan.rejectCount === 1 ? "" : "s"} still turned
                      away. Import now brings in only the {effectiveAcceptedCount.toLocaleString()}{" "}
                      valid rows and skips those — or fix them first (Fix with AI, or edit one by one)
                      and import everything together.
                    </p>
                  ) : skipExistingUpdates && plan.updateCount > 0 ? (
                    <p className="text-caption text-ink-muted">
                      Skipping {plan.updateCount} existing product
                      {plan.updateCount === 1 ? "" : "s"}. Importing{" "}
                      {plan.createCount.toLocaleString()} new only.
                    </p>
                  ) : null}

                  {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {state.importing && state.importId ? (
        <ImportProgress
          importId={state.importId}
          total={state.importTotal ?? acceptedCount}
          onComplete={onImportComplete}
        />
      ) : null}

      {finished ? (
        <div className="space-y-3">
          <SuccessNote>
            Imported {finished.created + finished.updated} products
            {finished.stockAdjusted > 0 ? `, adjusted stock on ${finished.stockAdjusted}` : ""}.
            {finished.failures.length > 0
              ? ` ${finished.failures.length} row${finished.failures.length === 1 ? "" : "s"} could not be saved.`
              : ""}
          </SuccessNote>

          {rollingBack ? (
            <RollbackProgress
              importId={finished.importId}
              onComplete={(status) => setFinished(status)}
            />
          ) : finished.rolledBackAt ? (
            <p className="text-body text-ink-muted">
              Rolled back — {finished.productsRestored} restored, {finished.productsRemoved} removed
              {finished.stockReversed > 0 ? `, ${finished.stockReversed} stock movements reversed` : ""}.
            </p>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              onClick={() => setConfirmingRollback(true)}
            >
              Rollback this import
            </Button>
          )}

          {finished.failures.length > 0 ? (
            <div className="space-y-2 rounded-sm border border-danger/50 bg-danger/8 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-start gap-2 text-body font-medium text-danger">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                  Rows that failed to save:
                </p>
                {state.csv ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    onClick={downloadFailedSaves}
                  >
                    Download failed rows
                  </Button>
                ) : null}
              </div>
              <ul className="space-y-1 text-caption text-ink-muted">
                {finished.failures.map((failure) => (
                  <li key={failure.line}>
                    Line {failure.line} ({failure.sku || "—"}): {failure.error}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link
            href="/products"
            className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
          >
            Back to products
            <ArrowRight size={14} />
          </Link>
        </div>
      ) : null}

      {state.mapping ? (
        <EditRowDialog
          line={editingLine}
          csv={state.csv}
          mapping={state.mapping}
          mappingJson={mappingJson}
          stockMode={state.stockMode}
          stockLocationId={stockLocationId}
          submit={submit}
          onClose={() => setEditingLine(null)}
        />
      ) : null}

      <ConfirmDialog
        open={confirmingRollback}
        onClose={() => setConfirmingRollback(false)}
        onConfirm={confirmRollback}
        pending={rollback.isPending}
        title="Roll back this import?"
        description={
          finished
            ? `Restores the ${finished.updated} product${finished.updated === 1 ? "" : "s"} it updated, removes the ${finished.created} it created, and reverses any stock it wrote. A product changed again since this import is left alone, not clobbered.`
            : ""
        }
        confirmLabel="Roll back"
      />

      <DocumentScanCamera
        open={cameraOpen}
        onCancel={() => setCameraOpen(false)}
        onCaptured={(file) => {
          setCameraOpen(false);
          onFilePicked(file);
        }}
      />
    </div>
  );
}
