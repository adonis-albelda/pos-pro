/**
 * Cookie names and the UiMode type only — no `next/headers` import, so
 * client components can pull these in without dragging server-only code
 * into the client bundle. `lib/ui-mode.ts` re-exports these for server use.
 */
export type UiMode = "modern" | "classic";

export const UI_MODE_COOKIE = "admin_ui_mode";
/** Set by the mobile admin WebView — forces classic chrome and hides view switcher. */
export const ADMIN_EMBEDDED_COOKIE = "admin_embedded";
