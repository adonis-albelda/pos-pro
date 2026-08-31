"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasBrowserSession } from "@/lib/api/browser-client";

/**
 * Mobile WebView lands here first. Native injects session cookies before
 * paint; this page confirms the jar and sends the user to the dashboard —
 * never through /login.
 */
export default function MobileEmbedPage() {
  const router = useRouter();

  useEffect(() => {
    if (hasBrowserSession()) {
      router.replace("/");
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <p className="text-body text-ink-muted">Opening admin dashboard…</p>
    </div>
  );
}
