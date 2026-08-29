"use client";

import { useEffect, useState } from "react";
import { Download, FileDown } from "lucide-react";
import { Button, ButtonLink, ErrorNote } from "@/components/ui";
import { Sheet } from "@/components/overlay";

/**
 * Fetches the same `/api/purchase-orders/{id}/pdf` route the old plain
 * `<a download>` hit, but as a blob so it can be shown in an iframe first —
 * the owner can check it looks right before it leaves the browser, instead
 * of only finding a mistake after it's already in the supplier's inbox.
 */
export function PdfPreviewButton({
  purchaseOrderId,
  filenameSlug,
}: {
  purchaseOrderId: string;
  filenameSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const href = `/api/purchase-orders/${purchaseOrderId}/pdf`;
  const filename = `purchase-order-${filenameSlug}.pdf`;

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  function openPreview() {
    setOpen(true);
    if (blobUrl || loading) return;

    setError(null);
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(href);
        if (!response.ok) {
          throw new Error((await response.text()) || "Could not build the PDF.");
        }
        const blob = await response.blob();
        setBlobUrl(URL.createObjectURL(blob));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not build the PDF.");
      } finally {
        setLoading(false);
      }
    })();
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" icon={FileDown} onClick={openPreview}>
        Generate PDF
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Purchase order PDF"
        description="Check it over, then download or send it to the supplier."
        className="max-w-4xl"
      >
        <div className="flex h-full flex-col gap-3">
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-body text-ink-muted">
              Building the PDF…
            </div>
          ) : error ? (
            <ErrorNote>{error}</ErrorNote>
          ) : blobUrl ? (
            <>
              <iframe
                src={blobUrl}
                title="Purchase order PDF preview"
                className="min-h-0 flex-1 rounded-sm border border-border"
              />
              <div className="flex justify-end">
                <ButtonLink href={blobUrl} download={filename} icon={Download} size="sm">
                  Download PDF
                </ButtonLink>
              </div>
            </>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
