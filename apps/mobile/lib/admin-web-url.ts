const PROD_ADMIN_URL = "https://pospro.doubleadigitalsolutions.store";
const DEMO_ADMIN_URL = "https://pospro-demo.doubleadigitalsolutions.store";

/**
 * Hosted admin dashboard URL. EXPO_PUBLIC_ADMIN_URL (baked into the binary,
 * same tradeoff as EXPO_PUBLIC_API_URL) stays an explicit override for local
 * dev/staging — set it and it wins regardless of `isDemo`. Unset, a demo
 * account's WebView opens the demo site, a real account the production one.
 */
export function adminWebUrl(isDemo: boolean): string {
  const raw = process.env.EXPO_PUBLIC_ADMIN_URL?.trim();
  const base = raw && raw.length > 0 ? raw : isDemo ? DEMO_ADMIN_URL : PROD_ADMIN_URL;
  return base.replace(/\/+$/, "");
}

/** Dashboard entry — session travels in the first request Cookie header. */
export function adminWebDashboardUrl(isDemo: boolean): string {
  return `${adminWebUrl(isDemo)}/`;
}

export function isAllowedAdminWebUrl(url: string, adminOrigin: string): boolean {
  if (url === "about:blank") return true;
  try {
    return new URL(url).origin === new URL(adminOrigin).origin;
  } catch {
    return false;
  }
}
