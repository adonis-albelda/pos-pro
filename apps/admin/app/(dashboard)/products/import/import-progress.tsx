"use client";

import { useEffect, useState } from "react";
import type { ProductImportStatus } from "@double-a/api-client/queries";
import { ErrorNote, SuccessNote } from "@/components/ui";

export function ImportProgress({
  importId,
  total,
  onComplete,
}: {
  importId: string;
  total: number;
  onComplete: (status: ProductImportStatus) => void;
}) {
  const [status, setStatus] = useState<ProductImportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/products/import/${importId}`);
        const body = (await response.json()) as ProductImportStatus & { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Could not read import progress.");
        }
        if (cancelled) return;

        setStatus(body);
        if (body.status === "completed" || body.status === "failed") {
          onComplete(body);
          return;
        }

        timer = setTimeout(poll, 1500);
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : "Could not read import progress.");
        }
      }
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [importId, onComplete]);

  const percent = status?.percent ?? 0;
  const processed = status?.processed ?? 0;
  const labelTotal = status?.total ?? total;

  return (
    <div className="space-y-3 rounded-md border border-border bg-paper px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body font-medium text-ink">
          Importing… {percent}% ({processed.toLocaleString()} of {labelTotal.toLocaleString()})
        </p>
        <p className="text-caption text-ink-muted capitalize">{status?.status ?? "queued"}</p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {status?.status === "failed" ? (
        <ErrorNote>{status.errorMessage ?? "Import failed."}</ErrorNote>
      ) : null}

      {status?.status === "completed" ? (
        <SuccessNote>
          Imported {status.created + status.updated} products
          {status.stockAdjusted > 0 ? `, adjusted stock on ${status.stockAdjusted}` : ""}.
        </SuccessNote>
      ) : null}
    </div>
  );
}
