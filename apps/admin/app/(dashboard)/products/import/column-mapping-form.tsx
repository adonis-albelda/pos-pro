"use client";

import { useFormStatus } from "react-dom";
import { Columns3, type LucideIcon } from "lucide-react";
import { Button, Select, Table, Td, Th } from "@/components/ui";
import {
  IMPORT_FIELD_META,
  type ColumnMapping,
} from "@/lib/product-import-mapping";

function formatHeader(header: string): string {
  return header.replace(/_/g, " ");
}

function MappingSubmitButton({
  icon,
  label,
  busyLabel,
}: {
  icon: LucideIcon;
  label: string;
  busyLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" icon={icon} loading={pending}>
      {pending ? busyLabel : label}
    </Button>
  );
}

function MappingSelect({
  fieldKey,
  sourceHeaders,
  value,
}: {
  fieldKey: string;
  sourceHeaders: string[];
  value: string | null;
}) {
  return (
    <Select name={`map_${fieldKey}`} defaultValue={value ?? ""} className="w-full max-w-xs">
      <option value="">— Skip —</option>
      {sourceHeaders.map((header) => (
        <option key={header} value={header}>
          {formatHeader(header)}
        </option>
      ))}
    </Select>
  );
}

export function ColumnMappingForm({
  csv,
  sourceHeaders,
  mapping,
  sampleRow,
  stockMode,
  locationId,
  submit,
  submitIcon,
  submitLabel,
  busyLabel,
}: {
  csv: string;
  sourceHeaders: string[];
  mapping: ColumnMapping;
  sampleRow: Record<string, string>;
  stockMode?: string;
  locationId?: string | null;
  submit: (formData: FormData) => void;
  submitIcon: LucideIcon;
  submitLabel: string;
  busyLabel: string;
}) {
  return (
    <form action={submit} className="space-y-4">
      <input type="hidden" name="intent" value="map" />
      <input type="hidden" name="csv" value={csv} />
      {stockMode ? <input type="hidden" name="stock_mode" value={stockMode} /> : null}
      {locationId ? <input type="hidden" name="location_id" value={locationId} /> : null}

      <p className="flex items-start gap-2 text-body text-ink-muted">
        <Columns3 size={16} className="mt-0.5 shrink-0" />
        <span>
          Match each catalogue field to a column from your file. Column order does not
          matter. We guessed the obvious ones — adjust anything that looks wrong.
        </span>
      </p>

      <div className="overflow-hidden rounded-md border border-border">
        <Table>
          <thead>
            <tr>
              <Th>Catalogue field</Th>
              <Th>File column</Th>
              <Th>Sample value</Th>
            </tr>
          </thead>
          <tbody>
            {IMPORT_FIELD_META.map((field) => {
              const source = mapping[field.key];
              const sample = source ? (sampleRow[source] ?? "—") : "—";

              return (
                <tr key={field.key}>
                  <Td>
                    <span className="font-medium text-ink">{field.label}</span>
                    {field.required ? (
                      <span className="ml-1 text-caption text-danger">Required</span>
                    ) : null}
                    <p className="mt-0.5 text-caption text-ink-muted">{field.hint}</p>
                  </Td>
                  <Td>
                    <MappingSelect
                      fieldKey={field.key}
                      sourceHeaders={sourceHeaders}
                      value={mapping[field.key]}
                    />
                  </Td>
                  <Td className="max-w-xs truncate text-ink-muted" title={sample}>
                    {sample || "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>

      <MappingSubmitButton icon={submitIcon} label={submitLabel} busyLabel={busyLabel} />
    </form>
  );
}

export function ColumnMappingSummary({
  mapping,
}: {
  mapping: ColumnMapping;
}) {
  const mapped = IMPORT_FIELD_META.filter((field) => mapping[field.key]);

  if (mapped.length === 0) return null;

  return (
    <div className="rounded-sm border border-border bg-paper px-3 py-2 text-caption text-ink-muted">
      <p className="font-medium text-ink">Columns matched</p>
      <ul className="mt-1 space-y-0.5">
        {mapped.map((field) => (
          <li key={field.key}>
            {field.label} ← {formatHeader(mapping[field.key]!)}
          </li>
        ))}
      </ul>
    </div>
  );
}
