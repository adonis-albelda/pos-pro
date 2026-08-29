"use client";

import { useEffect, useState } from "react";
import type { ProductImportStatus } from "@double-a/api-client/queries";
import { ErrorNote, SuccessNote } from "@/components/ui";

/** Same 1.5s-poll-until-terminal-state technique as ImportProgress, watching rollbackStatus instead of status. */
export function RollbackProgress({
  importId,
  onComplete,
}: {
  importId: string;
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
          throw new Error(body.error ?? "Could not read rollback progress.");
        }
        if (cancelled) return;

        setStatus(body);
        if (body.rollbackStatus === "completed" || body.rollbackStatus === "failed") {
          onComplete(body);
          return;
        }

        timer = setTimeout(poll, 1500);
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : "Could not read rollback progress.");
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [importId, onComplete]);

  return (
    <div className="space-y-3 rounded-md border border-border bg-paper px-4 py-4">
      <p className="text-body font-medium text-ink">Rolling back…</p>

      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {status?.rollbackStatus === "failed" ? (
        <ErrorNote>{status.errorMessage ?? "Rollback failed."}</ErrorNote>
      ) : null}

      {status?.rollbackStatus === "completed" ? (
        <SuccessNote>
          Restored {status.productsRestored}, removed {status.productsRemoved}
          {status.stockReversed > 0 ? `, reversed stock on ${status.stockReversed}` : ""}.
          {status.rollbackSkips.length > 0
            ? ` ${status.rollbackSkips.length} skipped (changed again since the import).`
            : ""}
        </SuccessNote>
      ) : null}
    </div>
  );
}
