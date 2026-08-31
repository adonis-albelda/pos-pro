"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ADMIN_EMBEDDED_COOKIE, UI_MODE_COOKIE, type UiMode } from "@/lib/ui-mode";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setUiMode(formData: FormData): Promise<void> {
  const store = await cookies();
  if (store.get(ADMIN_EMBEDDED_COOKIE)?.value === "1") {
    return;
  }

  const mode: UiMode =
    String(formData.get("mode") ?? "") === "classic" ? "classic" : "modern";
  store.set(UI_MODE_COOKIE, mode, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
