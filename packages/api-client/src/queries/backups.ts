import type { ApiClient, JsonApiResource } from "../http";

export type DatabaseBackupStatus = "pending" | "running" | "completed" | "failed";
export type DatabaseBackupTrigger = "manual" | "scheduled";

export interface DatabaseBackup {
  id: string;
  filename: string;
  sizeBytes: number;
  status: DatabaseBackupStatus;
  trigger: DatabaseBackupTrigger;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

interface DatabaseBackupAttrs {
  filename: string;
  size_bytes: number;
  status: DatabaseBackupStatus;
  trigger: DatabaseBackupTrigger;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

function toDatabaseBackup(resource: JsonApiResource<DatabaseBackupAttrs>): DatabaseBackup {
  return {
    id: resource.id,
    filename: resource.attributes.filename,
    sizeBytes: resource.attributes.size_bytes,
    status: resource.attributes.status,
    trigger: resource.attributes.trigger,
    startedAt: resource.attributes.started_at,
    completedAt: resource.attributes.completed_at,
    errorMessage: resource.attributes.error_message,
  };
}

/** Superadmin-only — mysqldump runs on the Tally API server, not in admin. */
export async function listDatabaseBackups(client: ApiClient): Promise<DatabaseBackup[]> {
  const { data } = await client.get<{ data: JsonApiResource<DatabaseBackupAttrs>[] }>(
    "/superadmin/backups",
  );
  return data.map(toDatabaseBackup);
}

/** Queue a manual dump. Returns as soon as the job is accepted. */
export async function createDatabaseBackup(client: ApiClient): Promise<DatabaseBackup> {
  const { data } = await client.post<{ data: JsonApiResource<DatabaseBackupAttrs> }>(
    "/superadmin/backups",
  );
  return toDatabaseBackup(data);
}

/** Stream one completed dump — binary gzip SQL. */
export async function downloadDatabaseBackup(
  client: ApiClient,
  id: string,
): Promise<{ blob: Blob; filename: string | null }> {
  return client.download(`/superadmin/backups/${id}/download`);
}
