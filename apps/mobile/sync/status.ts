import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CloudOff,
  CloudUpload,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react-native";
import { isSyncStale, timeAgo, type SyncState } from "@double-a/shared-types";
import { color } from "@/theme";

/**
 * How sync reads at a glance, in one place: the store header shows it on every
 * POS screen and the sync tab shows it in full, and the two must never disagree
 * about whether this terminal is behind.
 */
export interface SyncLook {
  /** Ink for the text and icon. */
  ink: string;
  /** Fill for the band or chip carrying it. */
  fill: string;
  icon: LucideIcon;
  /** One line: what is happening, or how long ago it last happened. */
  text: string;
  /** Just the "X ago" part, for a chip too narrow for the sentence. */
  shortText: string;
  busy: boolean;
  failed: boolean;
  stale: boolean;
}

/**
 * Re-renders the caller once a minute so "X ago" stays honest. Nothing is
 * polled — the clock is the only thing that changed.
 */
export function useMinuteTick(): void {
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
}

export function syncLook(state: SyncState): SyncLook {
  const { phase, message, lastSyncedAt, pendingSales, error } = state;

  const busy = phase === "pushing" || phase === "pulling";
  const failed = phase === "failed";
  const stale = isSyncStale(lastSyncedAt);

  const ink = failed
    ? color.dangerInk
    : stale && !busy
      ? color.warningInk
      : color.primary;

  const fill = failed
    ? color.dangerSoft
    : stale && !busy
      ? color.warningSoft
      : color.primaryTint;

  const icon = failed
    ? CloudOff
    : stale
      ? TriangleAlert
      : pendingSales > 0
        ? CloudUpload
        : CheckCircle2;

  const ago = timeAgo(lastSyncedAt);

  return {
    ink,
    fill,
    icon,
    text: busy ? message : failed ? (error ?? message) : `Synced: ${ago}`,
    /** Value line for the flat header stat — ago / busy message / failed. */
    shortText: busy ? message : failed ? "Failed" : ago,
    busy,
    failed,
    stale,
  };
}

/** "All sales sent", or how many are still on this device. */
export function pendingLabel(pendingSales: number): string {
  if (pendingSales === 0) return "All sales sent";
  return `${pendingSales} sale${pendingSales === 1 ? "" : "s"} waiting`;
}
