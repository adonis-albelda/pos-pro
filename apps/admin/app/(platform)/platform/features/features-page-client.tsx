"use client";

import { useState } from "react";
import type { FeatureFlagAdmin } from "@double-a/api-client/queries";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Select } from "@/components/ui";
import {
  useFeatureFlagsAdmin,
  useSetCompanyFeatureOverride,
  useUpdateFeatureFlag,
} from "@/lib/query/features";
import { useCompanyStats } from "@/lib/query/companies";

export function FeaturesPageClient() {
  const flagsQuery = useFeatureFlagsAdmin();
  const companiesQuery = useCompanyStats();

  if (flagsQuery.isPending || companiesQuery.isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (flagsQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {flagsQuery.error instanceof Error ? flagsQuery.error.message : "Could not load features."}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {flagsQuery.data.map((flag) => (
        <FeatureFlagCard key={flag.key} flag={flag} companies={companiesQuery.data ?? []} />
      ))}
    </div>
  );
}

function FeatureFlagCard({
  flag,
  companies,
}: {
  flag: FeatureFlagAdmin;
  companies: { id: string; name: string }[];
}) {
  const updateFlag = useUpdateFeatureFlag();
  const setOverride = useSetCompanyFeatureOverride();
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [companyEnabled, setCompanyEnabled] = useState<"true" | "false">("false");

  const pending = updateFlag.isPending || setOverride.isPending;
  const overriddenIds = new Set(flag.overrides.map((o) => o.companyId));
  const pickable = companies.filter((c) => !overriddenIds.has(c.id));

  function toggleGlobal() {
    setError(null);
    updateFlag.mutate(
      { key: flag.key, enabled: !flag.enabled },
      {
        onError: (saveError) => {
          setError(saveError instanceof Error ? saveError.message : "Could not update feature.");
        },
      },
    );
  }

  function clearOverride(overrideCompanyId: string) {
    setError(null);
    setOverride.mutate(
      { companyId: overrideCompanyId, key: flag.key, enabled: null },
      {
        onError: (saveError) => {
          setError(saveError instanceof Error ? saveError.message : "Could not clear override.");
        },
      },
    );
  }

  function addOverride() {
    if (!companyId) {
      setError("Pick a company first.");
      return;
    }
    setError(null);
    setOverride.mutate(
      { companyId, key: flag.key, enabled: companyEnabled === "true" },
      {
        onSuccess: () => setCompanyId(""),
        onError: (saveError) => {
          setError(saveError instanceof Error ? saveError.message : "Could not add override.");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader
        title={flag.label}
        description={flag.description ?? undefined}
        action={
          <div className="flex items-center gap-3">
            <Badge tone={flag.enabled ? "success" : "danger"}>
              {flag.enabled ? "On for everyone" : "Off for everyone"}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={pending}
              onClick={toggleGlobal}
            >
              {flag.enabled ? "Turn off for all" : "Turn on for all"}
            </Button>
          </div>
        }
      />

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {flag.overrides.length > 0 ? (
          <div className="space-y-2">
            <p className="text-caption font-medium tracking-wide text-ink-muted uppercase">
              Per-company overrides
            </p>
            {flag.overrides.map((override) => (
              <div
                key={override.companyId}
                className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2"
              >
                <span className="min-w-0 truncate text-body">{override.companyName}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={override.enabled ? "success" : "danger"}>
                    {override.enabled ? "On" : "Off"}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => clearOverride(override.companyId)}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-caption text-ink-muted">
            No per-company overrides — every shop follows the default above.
          </p>
        )}

        {pickable.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="Override for one shop" required>
                <Select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                  <option value="">Pick a company…</option>
                  {pickable.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="State" required={false}>
              <Select
                value={companyEnabled}
                onChange={(event) => setCompanyEnabled(event.target.value as "true" | "false")}
              >
                <option value="false">Off</option>
                <option value="true">On</option>
              </Select>
            </Field>
            <Button type="button" loading={pending} onClick={addOverride}>
              Add override
            </Button>
          </div>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Card>
  );
}
