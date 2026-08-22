import type { PullResult, SyncPhase, SyncResult } from "@double-a/shared-types";
import { ensureFreshSession } from "@/lib/api/session";
import { pull } from "./pull";
import { push } from "./push";

export { pull } from "./pull";
export { push } from "./push";

/**
 * The one sync action, exactly two steps, always in this order:
 *
 *   1. push local sales
 *   2. pull master data — only if the push succeeded
 *
 * Nothing here runs on a timer, on reconnect, or in the background. It only ever
 * happens because someone pressed the button.
 */
export async function runSync(
  onPhase?: (phase: SyncPhase) => void,
  onProgress?: (percent: number) => void,
): Promise<SyncResult> {
  onPhase?.("pushing");
  await ensureFreshSession();

  const pushResult = await push();

  onPhase?.("pulling");
  const pullResult = await pull({ onProgress });

  onPhase?.("done");

  return {
    push: pushResult,
    pull: pullResult,
    finishedAt: new Date().toISOString(),
  };
}

/**
 * Pull without pushing first, for taking a price or product change mid-shift
 * without sending sales. Pending sales stay pending and still go out on the
 * next full sync, so this never loses a sale — it only skips sending one.
 * Incremental, same as runSync's pull — only what changed since last time.
 */
export async function runPullOnly(
  onPhase?: (phase: SyncPhase) => void,
  onProgress?: (percent: number) => void,
): Promise<PullResult> {
  onPhase?.("pulling");
  await ensureFreshSession();

  const result = await pull({ onProgress });

  onPhase?.("done");
  return result;
}

/**
 * Rebuilds the local catalogue from scratch: full fetch, wholesale replace
 * of products/users rather than an upsert. Never sends pending sales, same
 * as Refresh — this is a pull-only action. For troubleshooting a device
 * whose local data looks wrong, not a replacement for the regular Sync/
 * Refresh pair, which stay incremental and far cheaper on data/battery.
 */
export async function runReplaceAll(
  onPhase?: (phase: SyncPhase) => void,
  onProgress?: (percent: number) => void,
): Promise<PullResult> {
  onPhase?.("pulling");
  await ensureFreshSession();

  const result = await pull({ replace: true, onProgress });

  onPhase?.("done");
  return result;
}

/** First launch: everything comes down before the POS is usable. */
export async function runFirstPull(onProgress?: (percent: number) => void): Promise<void> {
  await ensureFreshSession();
  await pull({ full: true, onProgress });
}

let autoPushInFlight = false;

/**
 * Fired after each sale completes, if the device happens to be online —
 * best-effort and silent, never blocking the sale or its receipt (CLAUDE.md
 * §4). No pull runs here, so `lastSyncedAt` is untouched: this only shortens
 * how long a sale sits pending, it does not replace a real Sync. Offline, or
 * a dropped connection mid-push, just leaves the sale pending exactly as
 * before this existed — the manual Sync button is still the fallback and
 * still the only thing that also pulls.
 */
export async function runAutoPush(): Promise<void> {
  if (autoPushInFlight) return;
  autoPushInFlight = true;

  try {
    await ensureFreshSession();
    await push();
  } catch {
    // Best-effort — no connection, or it dropped mid-push. Stays pending.
  } finally {
    autoPushInFlight = false;
  }
}
