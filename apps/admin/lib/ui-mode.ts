import { cookies } from "next/headers";
import { ADMIN_EMBEDDED_COOKIE, UI_MODE_COOKIE, type UiMode } from "@/lib/ui-mode-constants";

/**
 * Two chromes over the same pages. "classic" is the desktop-launcher look most
 * owners know from older till software, so it is the default; it changes
 * navigation only, never data.
 */
export type { UiMode };
export { UI_MODE_COOKIE, ADMIN_EMBEDDED_COOKIE };

export async function isAdminEmbedded(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_EMBEDDED_COOKIE)?.value === "1";
}

export async function getUiMode(): Promise<UiMode> {
  const store = await cookies();
  if (store.get(ADMIN_EMBEDDED_COOKIE)?.value === "1") {
    return "classic";
  }
  return store.get(UI_MODE_COOKIE)?.value === "modern" ? "modern" : "classic";
}
