"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, TriangleAlert } from "lucide-react";
import { DemoAccount } from "@double-a/shared-types";
import { endBrowserSession, readCookie } from "@/lib/api/browser-client";
import { SESSION_EXPIRES_AT_COOKIE } from "@/lib/api/cookie-names";
import { useCurrentUser } from "@/lib/query/session";
import { onRateLimited } from "@/lib/rate-limit-notice";

/** How long the escalated "you're being throttled" state stays up after the last 429/5xx before reverting to the normal countdown look. */
const RATE_LIMIT_NOTICE_MS = 8_000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Shown only for a user flagged `isDemo` — a live countdown to when its
 * Sanctum token actually expires server-side (LoginController forces a
 * DemoAccount::SESSION_DAYS-day token for such an account regardless of the
 * app's normal session length). This banner is the UX half of that limit:
 * the real enforcement is the token itself going invalid, which any
 * subsequent API call would already 401 on — this just makes the countdown
 * visible and ends things cleanly at zero instead of waiting for a stray
 * failed request mid-click.
 */
export function DemoSessionBanner() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  const isDemo = user?.isDemo ?? false;
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
    if (!isDemo) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onRateLimited(() => {
      setRateLimited(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setRateLimited(false), RATE_LIMIT_NOTICE_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [isDemo]);

  useEffect(() => {
    if (!isDemo) return;

    function tick() {
      const expiresAt = readCookie(SESSION_EXPIRES_AT_COOKIE);
      if (!expiresAt) return;
      setRemainingMs(new Date(expiresAt).getTime() - Date.now());
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isDemo]);

  useEffect(() => {
    if (remainingMs !== null && remainingMs <= 0) {
      endBrowserSession();
      router.push("/login");
    }
  }, [remainingMs, router]);

  if (!isDemo || remainingMs === null) return null;

  if (rateLimited) {
    return (
      <div className="flex items-center justify-center gap-2 border-b border-danger/50 bg-danger/15 px-4 py-2 text-center text-caption font-medium text-danger">
        <TriangleAlert size={14} strokeWidth={2} className="shrink-0" />
        <span>
          Please slow down — this is a shared demo account, so we intentionally limit how fast it
          can be used to keep the server available for every other demo running at the same time.
          Wait a few seconds and try again.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/50 bg-warning/18 px-4 py-2 text-center text-caption font-medium text-[#8a6516]">
      <Clock size={14} strokeWidth={2} className="shrink-0" />
      <span>
        Demo account — you can use this for {DemoAccount.SESSION_DAYS} days. When time is up,
        login stops. All demo data is permanently deleted {DemoAccount.PURGE_GRACE_DAYS} days
        after that ({DemoAccount.PURGE_AFTER_DAYS} days total). Please use at a normal pace — we
        limit speed on shared demos so the server stays available for everyone. Time remaining:{" "}
        <span className="num font-semibold">{formatRemaining(remainingMs)}</span>
      </span>
    </div>
  );
}
