/**
 * Dot-version compare — "1.2.0" vs "1.10.0" etc. No semver prerelease/build
 * metadata support; this app's versions are always plain x.y.z (app.json,
 * and AppVersion's min_version/latest_version server-side both enforce it).
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const partsB = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

export type UpdateStatus = "none" | "optional" | "force";

/** current < min is a force update (no continuing); current < latest but >= min is optional. */
export function getUpdateStatus(current: string, minVersion: string, latestVersion: string): UpdateStatus {
  if (compareVersions(current, minVersion) < 0) return "force";
  if (compareVersions(current, latestVersion) < 0) return "optional";
  return "none";
}
