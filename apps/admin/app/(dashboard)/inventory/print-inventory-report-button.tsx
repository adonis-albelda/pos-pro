"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button, ButtonLink, ErrorNote } from "@/components/ui";
import { Sheet } from "@/components/overlay";

const HREF = "/api/inventory-report/pdf";
const FILENAME = `inventory-report-${new Date().toISOString().slice(0, 10)}.pdf`;

/**
 * Same blob-preview-then-download pattern as
 * sales-dashboard/print-sales-report-button.tsx — a side drawer showing the
 * PDF before it leaves the browser, instead of an unreviewed file landing
 * straight in Downloads. Replaces the old plain "Export" CSV link on the
 * Stock on hand toolbar.
 */
export function PrintInventoryReportButton() {
  const [open, setOpen] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  function openPreview() {
    setOpen(true);
    setBlobUrl(null);
    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(HREF);
        if (!response.ok) {
          throw new Error((await response.text()) || "Could not build the report.");
        }
        const blob = await response.blob();
        setBlobUrl(URL.createObjectURL(blob));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not build the report.");
      } finally {
        setLoading(false);
      }
    })();
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={Printer}
        onClick={openPreview}
        title="Print a snapshot of stock on hand right now."
      >
        Export
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Inventory report"
        description="Check it over, then print or download."
        className="max-w-4xl"
        footer={
          blobUrl ? (
            <div className="flex justify-end gap-2">
              <ButtonLink href={blobUrl} download={FILENAME} icon={Download} variant="secondary">
                Download PDF
              </ButtonLink>
              <ButtonLink href={blobUrl} target="_blank" icon={Printer}>
                Print report now
              </ButtonLink>
            </div>
          ) : undefined
        }
      >
        <div className="flex h-full min-h-[70vh] flex-col gap-3">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-body text-ink-muted">
              Building the report…
            </div>
          ) : error ? (
            <ErrorNote>{error}</ErrorNote>
          ) : blobUrl ? (
            <iframe
              src={blobUrl}
              title="Inventory report preview"
              className="min-h-[70vh] flex-1 rounded-sm border border-border"
            />
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
