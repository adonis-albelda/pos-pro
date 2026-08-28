"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { CompanyAiSettings } from "@double-a/api-client/queries";
import { formatMoney, PESO_SIGN } from "@double-a/shared-types";
import { Badge, Button, Card, CardHeader, ErrorNote } from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { useUpdateCompanyAiSettings } from "@/lib/query/ai-settings";

function UsageMeter({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = used >= limit ? "bg-danger" : used >= limit * 0.8 ? "bg-accent" : "bg-primary";

  return (
    <div className="space-y-2 rounded-sm border border-border bg-paper/40 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-body font-medium text-ink">{label}</p>
          {hint ? <p className="mt-0.5 text-caption text-ink-muted">{hint}</p> : null}
        </div>
        <p className="shrink-0 text-body tabular-nums text-ink">
          <span className="font-semibold">{used}</span>
          <span className="text-ink-muted"> / {limit}</span>
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border/70">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-caption text-ink-muted">
        {Math.max(0, limit - used)} free remaining this week
      </p>
    </div>
  );
}

function AiToggle({
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

export function AiSettingsCard({ settings }: { settings: CompanyAiSettings }) {
  const mutation = useUpdateCompanyAiSettings();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!settings.platformAvailable) {
    return null;
  }

  const photo = settings.photoExtract;
  const vector = settings.vectorSearch;
  const resetLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(settings.weekResetsAt));

  function applyEnabled(next: boolean) {
    setError(null);
    mutation.mutate(next, {
      onSuccess: () => setConfirmOpen(false),
      onError: (saveError) => {
        setError(saveError instanceof Error ? saveError.message : "Could not save AI settings.");
      },
    });
  }

  function onToggle(next: boolean) {
    if (next) {
      setConfirmOpen(true);
      return;
    }
    applyEnabled(false);
  }

  return (
    <>
      <Card>
        <CardHeader
          icon={Sparkles}
          title="AI features"
          description={`${settings.aiPlan.name} app plan. Weekly AI limits reset every Monday.`}
          action={
            <div className="flex items-center gap-3">
              {settings.bypassesLimits ? (
                <Badge tone="warning">Unlimited (platform admin)</Badge>
              ) : (
                <Badge tone={settings.enabled ? "success" : "warning"}>
                  {settings.enabled ? "Paid overage on" : "Free tier only"}
                </Badge>
              )}
              <AiToggle
                enabled={settings.enabled}
                disabled={mutation.isPending || settings.bypassesLimits}
                onChange={onToggle}
              />
            </div>
          }
        />

        <div className="space-y-4 px-4 py-5 sm:px-6">
          <p className="text-body text-ink-muted">
            Free photo and vector searches included with your {settings.aiPlan.name} app plan work as
            soon as AI is enabled for your company. Turn on paid overage here only when you want
            photo reads beyond the weekly free allowance at {PESO_SIGN}
            {photo.unitOverageChargePeso ?? 3} per request.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <UsageMeter
              label="Photo to text"
              used={photo.used}
              limit={photo.weeklyLimit}
              hint={`${photo.weeklyLimit} free per week, then ${PESO_SIGN}${photo.unitOverageChargePeso ?? 3} each`}
            />
            <UsageMeter
              label="Vector search"
              used={vector.used}
              limit={vector.weeklyLimit}
              hint={`${vector.weeklyLimit} free per week`}
            />
          </div>

          <div className="grid gap-3 rounded-sm border border-border bg-surface px-4 py-3 sm:grid-cols-3">
            <div>
              <p className="text-caption text-ink-muted">Photo remaining (free)</p>
              <p className="mt-0.5 text-heading-sm font-semibold tabular-nums">{photo.remaining}</p>
            </div>
            <div>
              <p className="text-caption text-ink-muted">Vector remaining</p>
              <p className="mt-0.5 text-heading-sm font-semibold tabular-nums">
                {vector.remaining}
              </p>
            </div>
            <div>
              <p className="text-caption text-ink-muted">Overage this week</p>
              <p className="mt-0.5 text-heading-sm font-semibold tabular-nums text-ink">
                {formatMoney(photo.overageChargePeso ?? 0)}
              </p>
              {(photo.overageCount ?? 0) > 0 ? (
                <p className="text-caption text-ink-muted">
                  {photo.overageCount} paid request{(photo.overageCount ?? 0) === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
          </div>

          <p className="text-caption text-ink-muted">Weekly reset: {resetLabel}</p>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </div>
      </Card>

      <Dialog
        open={confirmOpen}
        onClose={() => !mutation.isPending && setConfirmOpen(false)}
        title="Turn on paid photo reads?"
        description="Your free weekly allowance is already available. This only enables paid overage requests."
      >
        <div className="space-y-4">
          <div className="space-y-2 rounded-sm border border-border bg-paper/50 px-4 py-3 text-body">
            <p>
              <span className="font-medium text-ink">Photo to text:</span>{" "}
              {photo.weeklyLimit} free requests per week. After that, each request costs{" "}
              {formatMoney(photo.unitOverageChargePeso ?? 3)}.
            </p>
            <p>
              <span className="font-medium text-ink">Vector search:</span>{" "}
              {vector.weeklyLimit} free requests per week. Extra searches are blocked until the next
              reset.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-sm border border-border px-3 py-2">
              <p className="text-caption text-ink-muted">Free photo reads left</p>
              <p className="text-heading-sm font-semibold tabular-nums">{photo.remaining}</p>
            </div>
            <div className="rounded-sm border border-border px-3 py-2">
              <p className="text-caption text-ink-muted">Estimated overage now</p>
              <p className="text-heading-sm font-semibold tabular-nums">
                {formatMoney(photo.overageChargePeso ?? 0)}
              </p>
            </div>
          </div>

          <p className="text-caption text-ink-muted">
            By turning AI on, you agree that photo requests above the free weekly limit will be
            charged at {formatMoney(photo.unitOverageChargePeso ?? 3)} per request.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" loading={mutation.isPending} onClick={() => applyEnabled(true)}>
              Enable paid overage
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
