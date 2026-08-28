"use client";

import Link from "next/link";
import { useActionState, useCallback, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ProductImportStatus } from "@double-a/api-client/queries";
import {
  ArrowRight,
  Ban,
  Check,
  Download,
  FolderPlus,
  Info,
  Search,
  Sparkles,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  ErrorNote,
  Field,
  FileInput,
  Select,
  SuccessNote,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import { useLocationFilter } from "@/components/location-filter-provider";
import { useLocations } from "@/lib/query/locations";
import type { ProductStockMode } from "@/lib/product-import";
import {
  downloadImportIssuesCsv,
  importIssuesFilename,
  rejectedRowsFromPlan,
} from "@/lib/product-import-export";
import { ColumnMappingForm, ColumnMappingSummary } from "./column-mapping-form";
import { FileColumnsTable } from "./file-columns-table";
import { ImportInfoCards } from "./import-info-cards";
import { ImportProgress } from "./import-progress";
import { EMPTY_IMPORT_STATE } from "./import-state";
import { importProducts } from "./actions";

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
    <Button type="submit" variant="secondary" size="sm" icon={Sparkles} loading={pending} disabled={disabled}>
      {pending ? "Fixing with AI..." : "Fix with AI"}
    </Button>
  );
}

function StepBar({ step }: { step: number }) {
  const labels = ["Upload", "Connect columns", "Options", "Review", "Importing"];
  return (
    <ol className="flex flex-wrap gap-2 text-caption">
      {labels.map((label, index) => (
        <li
          key={label}
          className={
            index === step
              ? "rounded-sm bg-primary/12 px-2 py-1 font-medium text-primary"
              : index < step
                ? "rounded-sm px-2 py-1 text-ink-muted"
                : "rounded-sm px-2 py-1 text-ink-muted/70"
          }
        >
          {index + 1}. {label}
        </li>
      ))}
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
  const [state, submit] = useActionState(importProducts, EMPTY_IMPORT_STATE);
  const { locationId } = useLocationFilter();
  const locationsQuery = useLocations({ type: "branch" });
  const [finished, setFinished] = useState<ProductImportStatus | null>(null);

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

  const currentStep = state.importing
    ? 4
    : plan
      ? 3
      : state.sourceHeaders.length > 0
        ? 1
        : 0;

  const onImportComplete = useCallback((status: ProductImportStatus) => {
    setFinished(status);
  }, []);

  const rowCount = plan?.rows.length ?? 0;
  const acceptedCount = plan ? plan.createCount + plan.updateCount : 0;
  const rejectedIssues = plan ? rejectedRowsFromPlan(plan) : [];

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

  return (
    <div className="space-y-6">
      <ImportInfoCards />

      <p className="text-caption text-ink-muted">
        Nothing is written until you review the preview and press Import.
      </p>

      {state.notice ? <SuccessNote>{state.notice}</SuccessNote> : null}

      <StepBar step={currentStep} />

      <form action={submit} className="space-y-4">
        <input type="hidden" name="intent" value="check" />

        <Field
          label="CSV file"
          hint="Any layout works — connect columns on the next step. Download our template if you prefer."
        >
          <FileInput name="file" accept=".csv,text/csv" />
        </Field>

        <Field label="Or paste the rows" hint="Header row first, commas between columns.">
          <Textarea
            name="pasted"
            rows={4}
            placeholder="ItemCode,ItemName,Price,Cost,Category&#10;WEP-101,1G PLATE WEP-101,35,20.8,ELECT"
          />
        </Field>

        {state.error && !state.csv ? <ErrorNote>{state.error}</ErrorNote> : null}

        <SubmitButton icon={Search} label="Read the file" busyLabel="Reading..." />
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

              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success" icon={FolderPlus}>
                  {plan.createCount} new
                </Badge>
                <Badge tone="neutral" icon={Upload}>
                  {plan.updateCount} updated
                </Badge>
                <Badge tone={plan.rejectCount > 0 ? "danger" : "neutral"} icon={Ban}>
                  {plan.rejectCount} turned away
                </Badge>
                {plan.rejectCount > 0 ? (
                  <>
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
                  </>
                ) : null}
                {rowCount > 0 ? (
                  <Badge tone="neutral">{rowCount.toLocaleString()} rows in file</Badge>
                ) : null}
              </div>

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

              {plan.rejectCount > 0 ? (
                <p className="text-caption text-ink-muted">
                  Turned-away rows can be downloaded as a separate CSV with an{" "}
                  <span className="font-medium text-ink">import_errors</span> column, or use{" "}
                  <span className="font-medium text-ink">Fix with AI</span> when SKU and name look
                  merged or columns shifted. Fix offline and re-upload if AI cannot recover them.
                </p>
              ) : null}

              <div className="overflow-hidden rounded-md border border-border">
                <Table>
                  <thead>
                    <tr>
                      <Th numeric>Line</Th>
                      <Th>Product</Th>
                      <Th>SKU</Th>
                      <Th>What happens</Th>
                      <Th>Detail</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.slice(0, 100).map((row) => (
                      <tr key={row.line}>
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
                            <Badge tone="neutral" icon={Upload}>
                              Update
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
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              {plan.rows.length > 100 ? (
                <p className="text-caption text-ink-muted">
                  Showing first 100 rows of {plan.rows.length.toLocaleString()}.
                </p>
              ) : null}

              {!state.importing ? (
                <form action={submit} className="space-y-4">
                  <input type="hidden" name="intent" value="import" />
                  <input type="hidden" name="csv" value={state.csv} />
                  <input type="hidden" name="mapping_json" value={mappingJson} />
                  <StockOptionsForm
                    stockMode={state.stockMode}
                    stockLocationId={stockLocationId}
                    branches={branches}
                    hasStockColumn={hasStockColumn}
                  />

                  <div className="flex flex-wrap items-center gap-3">
                    <SubmitButton
                      icon={Check}
                      label={`Import ${acceptedCount.toLocaleString()} products`}
                      busyLabel="Starting import..."
                      disabled={
                        acceptedCount === 0 ||
                        (hasStockColumn &&
                          state.stockMode !== "skip" &&
                          branches.length > 0 &&
                          !stockLocationId)
                      }
                    />
                    <span className="text-caption text-ink-muted">
                      Import runs in the background — you will see progress below.
                    </span>
                  </div>

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
    </div>
  );
}
