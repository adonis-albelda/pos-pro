"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import type { ProductImportSummary } from "@double-a/api-client/queries";
import { Badge, Button, Card, EmptyState, Table, Td, Th } from "@/components/ui";
import { ConfirmDialog } from "@/components/overlay";
import { Pagination } from "@/components/record-list";
import { useProductImportHistory, useRollbackProductImport } from "@/lib/query/product-imports";
import { RollbackProgress } from "../rollback-progress";

const PAGE_SIZE = 25;

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if ("completed" === status) return "success";
  if ("failed" === status) return "danger";
  return "warning";
}

export function ImportHistoryPanel() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const historyQuery = useProductImportHistory({ page, pageSize: PAGE_SIZE });
  const rollback = useRollbackProductImport();
  const [confirming, setConfirming] = useState<ProductImportSummary | null>(null);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  function confirmRollback() {
    if (!confirming) return;
    const importId = confirming.id;
    rollback.mutate(importId, {
      onSuccess: () => setRollingBackId(importId),
      onError: (error) => {
        toast.error(error instanceof ApiError ? error.message : "Could not start the rollback.");
      },
    });
    setConfirming(null);
  }

  if (historyQuery.isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (historyQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {historyQuery.error instanceof Error
          ? historyQuery.error.message
          : "Could not load import history."}
      </Card>
    );
  }

  const imports = historyQuery.data?.imports ?? [];
  const total = historyQuery.data?.total ?? 0;
  const lastPage = historyQuery.data?.lastPage ?? 1;

  return (
    <>
      <Card>
        {imports.length === 0 ? (
          <EmptyState
            icon={RotateCcw}
            title="No imports yet"
            instruction="Run a CSV import and it will show up here, with a way to undo it if something looks wrong."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>By</Th>
                <Th>Result</Th>
                <Th>Status</Th>
                <Th>Rollback</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {imports.map((row) => {
                const eligible =
                  "completed" === row.status && null === row.rollbackStatus && null === row.rolledBackAt;

                return (
                  <tr key={row.id}>
                    <Td className="whitespace-nowrap text-ink-muted">
                      {row.createdAt
                        ? new Date(row.createdAt).toLocaleString("en-PH", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                    </Td>
                    <Td className="text-ink-muted">{row.createdBy ?? "—"}</Td>
                    <Td className="text-ink-muted">
                      {row.createdCount} new, {row.updatedCount} updated
                      {row.stockAdjustedCount > 0 ? `, ${row.stockAdjustedCount} stock` : ""}
                    </Td>
                    <Td>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </Td>
                    <Td>
                      {rollingBackId === row.id ? null : row.rolledBackAt ? (
                        <Badge tone="neutral">
                          Rolled back — {row.productsRestored} restored, {row.productsRemoved} removed
                        </Badge>
                      ) : "processing" === row.rollbackStatus ? (
                        <Badge tone="warning">Rolling back…</Badge>
                      ) : "failed" === row.rollbackStatus ? (
                        <Badge tone="danger">Rollback failed</Badge>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      {rollingBackId === row.id ? (
                        <div className="w-64">
                          <RollbackProgress
                            importId={row.id}
                            onComplete={() => {
                              setRollingBackId(null);
                              void historyQuery.refetch();
                            }}
                          />
                        </div>
                      ) : eligible ? (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={RotateCcw}
                            onClick={() => setConfirming(row)}
                          >
                            Rollback
                          </Button>
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          pageCount={lastPage}
          total={total}
          pageSize={PAGE_SIZE}
          basePath="/products/import/history"
        />
      </Card>

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={confirmRollback}
        pending={rollback.isPending}
        title="Roll back this import?"
        description={
          confirming
            ? `Restores the ${confirming.updatedCount} product${confirming.updatedCount === 1 ? "" : "s"} it updated, removes the ${confirming.createdCount} it created, and reverses any stock it wrote. A product changed again since this import is left alone, not clobbered.`
            : ""
        }
        confirmLabel="Roll back"
      />
    </>
  );
}
