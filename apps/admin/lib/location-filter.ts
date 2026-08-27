/**
 * Admin chrome location scope — "all" (null) or one location id.
 * Cookie so the choice survives reload; client-written like session cookies
 * (lib/api/browser-client.ts). Not authorization — API still enforces company.
 */
export const LOCATION_FILTER_COOKIE = "admin_location_id";

export const LOCATION_FILTER_ALL = "all";

export function parseLocationFilterCookie(raw: string | null | undefined): string | null {
  if (!raw || raw === LOCATION_FILTER_ALL) return null;
  return raw;
}
