"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { confirmPin, getStoreSettings } from "@double-a/api-client/queries";
import { DEFAULT_STORE_SETTINGS, isValidPin, PIN_LENGTH_MAX } from "@double-a/shared-types";
import { Lock as LockIcon } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { getBrowserApiClient, hasBrowserSession } from "@/lib/api/browser-client";
import { useCurrentUser } from "@/lib/query/session";
import { queryKeys } from "@/lib/query/keys";

const CHECK_INTERVAL_MS = 15_000;

/**
 * Soft-locks the admin dashboard after idle or when the browser tab is
 * hidden. Sanctum session stays; UI clears only after the signed-in user's
 * own PIN confirms. Skipped when `enabled` is false (mobile WebView embed)
 * or idle timeout is 0.
 *
 * Pass `idleTimeoutMinutes` to skip the store_settings fetch (platform /
 * superadmin has no shop row). Shop dashboard omits it and reads the
 * hydrated store setting.
 */
export function SessionLockProvider({
  children,
  enabled = true,
  idleTimeoutMinutes: idleOverride,
}: {
  children: ReactNode;
  enabled?: boolean;
  idleTimeoutMinutes?: number;
}) {
  const { data: user } = useCurrentUser();
  const storeQuery = useQuery({
    queryKey: queryKeys.storeSettings.detail(),
    queryFn: () => getStoreSettings(getBrowserApiClient()),
    enabled: enabled && idleOverride === undefined && hasBrowserSession(),
    staleTime: 60_000,
  });

  const idleTimeoutMinutes =
    idleOverride ??
    storeQuery.data?.idleTimeoutMinutes ??
    DEFAULT_STORE_SETTINGS.idleTimeoutMinutes;

  const [locked, setLocked] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const lockedRef = useRef(false);

  const lock = useCallback(() => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setLocked(true);
  }, []);

  const unlock = useCallback(() => {
    lockedRef.current = false;
    lastActivityRef.current = Date.now();
    setLocked(false);
  }, []);

  const recordActivity = useCallback(() => {
    if (lockedRef.current) return;
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!enabled || idleTimeoutMinutes <= 0) return;

    recordActivity();
    const timeoutMs = idleTimeoutMinutes * 60_000;

    function checkIdle() {
      if (Date.now() - lastActivityRef.current >= timeoutMs) lock();
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") lock();
    }

    const interval = window.setInterval(checkIdle, CHECK_INTERVAL_MS);
    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("scroll", recordActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("scroll", recordActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, idleTimeoutMinutes, lock, recordActivity]);

  // Turning idle lock off mid-session must clear a stuck overlay.
  useEffect(() => {
    if (enabled && idleTimeoutMinutes > 0) return;
    unlock();
  }, [enabled, idleTimeoutMinutes, unlock]);

  return (
    <>
      {children}
      {locked && enabled && idleTimeoutMinutes > 0 ? (
        <SessionLockOverlay
          hasPin={user?.hasPin === true}
          userName={user?.name ?? null}
          onUnlocked={unlock}
        />
      ) : null}
    </>
  );
}

function SessionLockOverlay({
  hasPin,
  userName,
  onUnlocked,
}: {
  hasPin: boolean;
  userName: string | null;
  onUnlocked: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!hasPin) {
      setError("This account has no PIN yet. Sign out and set one under Users.");
      return;
    }

    if (!isValidPin(pin)) {
      setError("Enter your 4–6 digit PIN.");
      return;
    }

    setPending(true);
    try {
      const result = await confirmPin(getBrowserApiClient(), pin);
      if (!result.hasPin) {
        setError("This account has no PIN yet. Sign out and set one under Users.");
        return;
      }
      if (!result.verified) {
        setError("Incorrect PIN.");
        setPin("");
        return;
      }
      onUnlocked();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not verify PIN.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-paper/95 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-lock-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary-soft text-primary">
            <LockIcon size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 id="session-lock-title" className="text-heading-sm font-semibold text-ink">
              Enter PIN to continue
            </h2>
            <p className="text-caption text-ink-muted">
              {userName ? `${userName} — session locked` : "Session locked"}
            </p>
          </div>
        </div>

        {hasPin ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="PIN" required>
              <Input
                icon={LockIcon}
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={PIN_LENGTH_MAX}
                value={pin}
                onChange={(event) => {
                  const next = event.currentTarget.value.replace(/\D/g, "").slice(0, PIN_LENGTH_MAX);
                  setPin(next);
                }}
                autoFocus
                required
              />
            </Field>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button type="submit" loading={pending} className="w-full">
              Unlock
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-body-sm text-ink-muted">
              This account has no PIN. Sign out, set a PIN under Users (owner), then sign back in.
            </p>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
          </div>
        )}

        <form action={signOut} className="mt-3">
          <Button type="submit" variant="ghost" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
