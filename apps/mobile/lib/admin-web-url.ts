/**
 * Hosted admin dashboard URL — baked into the binary via EXPO_PUBLIC_, same
 * tradeoff as EXPO_PUBLIC_API_URL. Defaults to production POSPro admin.
 */
export function adminWebUrl(): string {
  const raw = process.env.EXPO_PUBLIC_ADMIN_URL?.trim();
  const base = raw && raw.length > 0 ? raw : "https://tally.doubleadigitalsolutions.store";
  return base.replace(/\/+$/, "");
}

/** Dashboard entry — session travels in the first request Cookie header. */
export function adminWebDashboardUrl(): string {
  return `${adminWebUrl()}/`;
}

export function isAllowedAdminWebUrl(url: string, adminOrigin: string): boolean {
  if (url === "about:blank") return true;
  try {
    return new URL(url).origin === new URL(adminOrigin).origin;
  } catch {
    return false;
  }
}
