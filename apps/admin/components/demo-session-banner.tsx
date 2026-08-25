"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { DemoAccount } from "@double-a/shared-types";
import { endBrowserSession, readCookie } from "@/lib/api/browser-client";
import { SESSION_EXPIRES_AT_COOKIE } from "@/lib/api/cookie-names";
import { useCurrentUser } from "@/lib/query/session";

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

  return (
    <div className="flex items-center justify-center gap-2 border-b border-warning/50 bg-warning/18 px-4 py-2 text-center text-caption font-medium text-[#8a6516]">
      <Clock size={14} strokeWidth={2} className="shrink-0" />
      <span>
        Demo account — this app is available for {DemoAccount.SESSION_DAYS} days for demo
        purposes only. Time remaining: <span className="num font-semibold">{formatRemaining(remainingMs)}</span>
      </span>
    </div>
  );
}
