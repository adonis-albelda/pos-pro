"use client";

import { useState } from "react";
import type { AiPlanId, AiSubscriptionPlan } from "@double-a/shared-types";
import type { FeatureFlagAdmin } from "@double-a/api-client/queries";
import { Badge, Button, Card, CardBody, CardHeader, ErrorNote } from "@/components/ui";
import { useFeatureFlagsAdmin, useSetCompanyFeatureOverride } from "@/lib/query/features";

export function CompanyFeaturesTab({
  companyId,
  aiPlanId,
  plans,
}: {
  companyId: string;
  aiPlanId: AiPlanId;
  plans: AiSubscriptionPlan[];
}) {
  const flagsQuery = useFeatureFlagsAdmin();
  const appPlanName = plans.find((plan) => plan.id === aiPlanId)?.name ?? `Plan ${aiPlanId}`;

  return (
    <Card>
      <CardHeader
        title="Features"
        description="Turn a feature on or off for this company only — everything else keeps following the global default."
        action={
          <div className="text-right">
            <p className="text-caption text-ink-muted">App plan</p>
            <Badge tone="neutral">{appPlanName}</Badge>
          </div>
        }
      />
      <CardBody className="space-y-2">
        {flagsQuery.isPending ? (
          <p className="py-8 text-center text-body text-ink-muted">Loading…</p>
        ) : flagsQuery.isError ? (
          <p className="py-8 text-center text-body text-danger">
            {flagsQuery.error instanceof Error ? flagsQuery.error.message : "Could not load features."}
          </p>
        ) : (
          flagsQuery.data.map((flag) => (
            <FeatureRow key={flag.key} companyId={companyId} flag={flag} />
          ))
        )}
      </CardBody>
    </Card>
  );
}

function FeatureRow({ companyId, flag }: { companyId: string; flag: FeatureFlagAdmin }) {
  const setOverride = useSetCompanyFeatureOverride();
  const [error, setError] = useState<string | null>(null);

  const override = flag.overrides.find((row) => row.companyId === companyId);
  const effective = override ? override.enabled : flag.enabled;

  function set(enabled: boolean | null) {
    setError(null);
    setOverride.mutate(
      { companyId, key: flag.key, enabled },
      {
        onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not update feature."),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-body font-medium text-ink">{flag.label}</p>
          <Badge tone="neutral">{flag.plan}</Badge>
          <Badge tone={effective ? "success" : "danger"}>{effective ? "On" : "Off"}</Badge>
        </div>
        {flag.description ? (
          <p className="text-caption text-ink-muted">{flag.description}</p>
        ) : null}
        <p className="text-caption text-ink-muted">
          {override
            ? `Overridden for this company (default is ${flag.enabled ? "on" : "off"})`
            : "Following the global default"}
        </p>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          type="button"
          size="sm"
          variant={override?.enabled === true ? "primary" : "secondary"}
          loading={setOverride.isPending}
          onClick={() => set(true)}
        >
          On
        </Button>
        <Button
          type="button"
          size="sm"
          variant={override?.enabled === false ? "danger" : "secondary"}
          loading={setOverride.isPending}
          onClick={() => set(false)}
        >
          Off
        </Button>
        {override ? (
          <Button type="button" size="sm" variant="ghost" loading={setOverride.isPending} onClick={() => set(null)}>
            Use default
          </Button>
        ) : null}
      </div>
    </div>
  );
}
