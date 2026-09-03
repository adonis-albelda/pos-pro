/**
 * Sync is one manual action with two ordered steps: push local sales, then
 * pull master data. These types describe that flow for both the mobile UI and
 * anything in admin that reports on it.
 */

export type SyncPhase =
  | "idle"
  | "pushing"
  | "pulling"
  | "done"
  | "failed";

export interface PushResult {
  salesPushed: number;
  itemsPushed: number;
  /** Sale id -> server-assigned invoice number, for sales this push created. */
  invoiceNumbers: Record<string, string>;
}

export interface PullResult {
  products: number;
  variants: number;
  users: number;
  /** Server-side high water mark, used instead of device time. */
  serverTimestamp: string;
}

export interface SyncResult {
  push: PushResult;
  pull: PullResult;
  finishedAt: string;
}

export interface SyncState {
  phase: SyncPhase;
  /** Copy shown to the cashier for the current phase. */
  message: string;
  lastSyncedAt: string | null;
  pendingSales: number;
  error: string | null;
}

export const SYNC_MESSAGES: Record<SyncPhase, string> = {
  idle: "",
  pushing: "Syncing sales...",
  pulling: "Fetching latest data...",
  done: "Synced",
  failed: "Sync failed - check your connection and try again",
};

/** Past this, the sync indicator turns to the warning colour. */
export const STALE_SYNC_THRESHOLD_MS = 4 * 60 * 60 * 1000;

export function isSyncStale(
  lastSyncedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!lastSyncedAt) return true;
  return now - new Date(lastSyncedAt).getTime() > STALE_SYNC_THRESHOLD_MS;
}

/** "just now", "12m ago", "3h ago", "2d ago". */
export function timeAgo(
  timestamp: string | null,
  now: number = Date.now(),
): string {
  if (!timestamp) return "never";

  const elapsed = now - new Date(timestamp).getTime();
  if (elapsed < 60_000) return "just now";

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}
