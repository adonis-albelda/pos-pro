"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardHeader, ErrorNote } from "@/components/ui";
import { usePlatformSecuritySettings, useUpdatePlatformSecuritySettings } from "@/lib/query/platform-security-settings";

function Toggle({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={[
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        enabled ? "bg-primary" : "bg-border",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

export function PlatformSecuritySettingsPageClient() {
  const settingsQuery = usePlatformSecuritySettings();
  const updateSettings = useUpdatePlatformSecuritySettings();
  const [error, setError] = useState<string | null>(null);

  if (settingsQuery.isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (settingsQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {settingsQuery.error instanceof Error
          ? settingsQuery.error.message
          : "Could not load security settings."}
      </Card>
    );
  }

  function toggle(next: boolean) {
    setError(null);
    updateSettings.mutate(next, {
      onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save."),
    });
  }

  return (
    <Card>
      <CardHeader
        icon={ShieldCheck}
        title="Superadmin two-factor authentication"
        description="Require an authenticator app code at login for every superadmin account on this platform."
      />
      <div className="space-y-3 px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-body font-medium text-ink">Require 2FA for superadmin accounts</p>
            <p className="mt-0.5 text-caption text-ink-muted">
              On by default. Turning this off lets any superadmin disable their own 2FA and skip the
              code at login — only meant for a temporary recovery situation.
            </p>
          </div>
          {settingsQuery.data ? (
            <Toggle
              enabled={settingsQuery.data.superadminMfaRequired}
              disabled={updateSettings.isPending}
              onChange={toggle}
            />
          ) : null}
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Card>
  );
}
