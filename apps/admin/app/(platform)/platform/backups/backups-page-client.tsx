"use client";

import { useState, useTransition } from "react";
import { Database, Download, RefreshCw } from "lucide-react";
import { downloadDatabaseBackup, type DatabaseBackup } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { useDatabaseBackups, useInvalidateDatabaseBackups } from "@/lib/query/backups";
import { triggerDatabaseBackupAction } from "./actions";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function statusTone(status: DatabaseBackup["status"]) {
  switch (status) {
    case "completed":
      return "success" as const;
    case "running":
    case "pending":
      return "warning" as const;
    case "failed":
      return "danger" as const;
  }
}

function statusLabel(status: DatabaseBackup["status"]) {
  switch (status) {
    case "completed":
      return "Ready";
    case "running":
      return "Running";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
  }
}

export function BackupsPageClient() {
  const backupsQuery = useDatabaseBackups();
  const invalidate = useInvalidateDatabaseBackups();
  const [pending, startTransition] = useTransition();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backups = backupsQuery.data ?? [];
  const running = backups.some((row) => row.status === "running" || row.status === "pending");

  function createBackup() {
    setError(null);
    startTransition(async () => {
      const result = await triggerDatabaseBackupAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      invalidate();
    });
  }

  async function downloadBackup(backup: DatabaseBackup) {
    setError(null);
    setDownloadingId(backup.id);
    try {
      const { blob, filename } = await downloadDatabaseBackup(getBrowserApiClient(), backup.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename ?? backup.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      const message =
        downloadError instanceof Error ? downloadError.message : "Could not download backup.";
      setError(message);
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={Database}
          title="Database backups"
          description="Full MySQL dumps run on the Tally API server. Admin only lists them and downloads the file — no database credentials here."
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                icon={RefreshCw}
                variant="secondary"
                onClick={() => invalidate()}
                loading={backupsQuery.isFetching && !backupsQuery.isPending}
              >
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                icon={Database}
                onClick={createBackup}
                loading={pending || running}
              >
                Backup now
              </Button>
            </div>
          }
        />

        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          {error ? (
            <div className="mb-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}

          {backupsQuery.isPending ? (
            <p className="text-body text-ink-muted">Loading…</p>
          ) : backupsQuery.isError ? (
            <p className="text-body text-danger">
              {backupsQuery.error instanceof Error
                ? backupsQuery.error.message
                : "Could not load backups."}
            </p>
          ) : backups.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No backups yet"
              instruction="Run Backup now, or wait for the API scheduler (every 5 hours)."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Created</Th>
                  <Th>Trigger</Th>
                  <Th>Status</Th>
                  <Th numeric>Size</Th>
                  <Th>File</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.id}>
                    <Td className="num text-ink-muted">
                      {new Date(backup.startedAt).toLocaleString("en-PH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </Td>
                    <Td className="capitalize">{backup.trigger}</Td>
                    <Td>
                      <Badge tone={statusTone(backup.status)}>{statusLabel(backup.status)}</Badge>
                    </Td>
                    <Td numeric>{formatBytes(backup.sizeBytes)}</Td>
                    <Td className="num text-caption text-ink-muted">{backup.filename}</Td>
                    <Td>
                      {backup.status === "completed" ? (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            icon={Download}
                            loading={downloadingId === backup.id}
                            onClick={() => downloadBackup(backup)}
                          >
                            Download
                          </Button>
                        </div>
                      ) : backup.errorMessage ? (
                        <span className="text-caption text-danger">{backup.errorMessage}</span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      <Card className="px-4 py-4 text-body text-ink-muted sm:px-6">
        <p className="font-medium text-ink">Scheduler</p>
        <p className="mt-2">
          Automatic backups every 5 hours run on the Tally API server via Laravel scheduler (
          <code className="num">php artisan schedule:run</code>). Nothing to install on admin.
        </p>
      </Card>
    </div>
  );
}
