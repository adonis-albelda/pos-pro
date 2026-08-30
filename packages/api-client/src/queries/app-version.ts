import type { ApiClient } from "../http";

export interface AppVersion {
  platform: string;
  /** Below this, the client is expected to block with a force-update dialog. */
  minVersion: string;
  /** The newest build available — current < latest but >= min is an optional update. */
  latestVersion: string;
  downloadUrl: string | null;
  releaseNotes: string | null;
}

interface AppVersionAttrs {
  platform: string;
  min_version: string;
  latest_version: string;
  download_url: string | null;
  release_notes: string | null;
}

/**
 * Public — no token required, checked on every app boot before (or without)
 * any login. Sourced server-side from env (config/app_version.php, Laravel),
 * not a table — it only changes on a release.
 */
export async function getAppVersion(client: ApiClient, platform = "android"): Promise<AppVersion> {
  const { data } = await client.get<{ data: AppVersionAttrs }>("/app-version", { platform });
  return {
    platform: data.platform,
    minVersion: data.min_version,
    latestVersion: data.latest_version,
    downloadUrl: data.download_url,
    releaseNotes: data.release_notes,
  };
}
