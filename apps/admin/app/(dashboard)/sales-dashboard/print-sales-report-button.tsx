"use client";

import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button, ButtonLink, ErrorNote } from "@/components/ui";
import { Sheet } from "@/components/overlay";

/**
 * Same blob-preview-then-download pattern as
 * app/(dashboard)/purchase-orders/[id]/pdf-preview-button.tsx — a side
 * drawer showing the PDF before it leaves the browser, instead of an
 * unreviewed file landing straight in Downloads.
 */
export function PrintSalesReportButton({
  from,
  to,
  fromDay,
  toDay,
}: {
  from: string;
  to: string;
  fromDay: string;
  toDay: string;
}) {
  const [open, setOpen] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const href = `/api/sales-report/pdf?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&fromDay=${fromDay}&toDay=${toDay}`;
  const filename = `sales-report-${fromDay}-to-${toDay}.pdf`;

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
        const response = await fetch(href);
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
        icon={Printer}
        onClick={openPreview}
        title="Print a sales report using the current filters."
      >
        Print Sales Report
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Sales report"
        description="Check it over, then print or download."
        className="max-w-4xl"
        footer={
          blobUrl ? (
            <div className="flex justify-end gap-2">
              <ButtonLink href={blobUrl} download={filename} icon={Download} variant="secondary">
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
              title="Sales report preview"
              className="min-h-[70vh] flex-1 rounded-sm border border-border"
            />
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
