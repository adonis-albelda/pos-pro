"use client";

import { readCookie } from "@/lib/api/browser-client";
import { LayoutGrid, PanelLeft } from "lucide-react";
import { setUiMode } from "@/app/(dashboard)/ui-mode-actions";
import { Button } from "@/components/ui";
import { ADMIN_EMBEDDED_COOKIE, type UiMode } from "@/lib/ui-mode-constants";

/**
 * Switches chrome only — same pages, same data. Kept as a plain form post so it
 * survives a page without JavaScript and needs no client state.
 */
export function UiModeToggle({
  mode,
  className,
}: {
  mode: UiMode;
  className?: string;
}) {
  if (readCookie(ADMIN_EMBEDDED_COOKIE) === "1") {
    return null;
  }

  const next: UiMode = mode === "classic" ? "modern" : "classic";

  return (
    <form action={setUiMode} className={className}>
      <input type="hidden" name="mode" value={next} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        icon={next === "classic" ? LayoutGrid : PanelLeft}
        className="w-full"
      >
        {next === "classic" ? "Classic desktop view" : "Modern sidebar view"}
      </Button>
    </form>
  );
}
