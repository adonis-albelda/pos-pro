"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Badge, Button, ErrorNote } from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { useFeatureFlagsAdmin, useUpdateFeatureFlag } from "@/lib/query/features";

/**
 * Global on/off default for every catalog feature — the fallback a company
 * uses when it has no override of its own (set per-company on that
 * company's detail page → Features tab instead of here).
 */
export function GlobalFeatureDefaultsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" icon={SlidersHorizontal} onClick={() => setOpen(true)}>
        Feature defaults
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Feature defaults"
        description="The fallback state every company gets unless overridden on its own Features tab."
        className="max-w-xl"
      >
        <GlobalFeatureDefaultsList />
      </Sheet>
    </>
  );
}

function GlobalFeatureDefaultsList() {
  const flagsQuery = useFeatureFlagsAdmin();
  const updateFlag = useUpdateFeatureFlag();
  const [error, setError] = useState<string | null>(null);

  if (flagsQuery.isPending) {
    return <p className="py-8 text-center text-body text-ink-muted">Loading…</p>;
  }

  if (flagsQuery.isError) {
    return (
      <p className="py-8 text-center text-body text-danger">
        {flagsQuery.error instanceof Error ? flagsQuery.error.message : "Could not load features."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {flagsQuery.data.map((flag) => (
        <div
          key={flag.key}
          className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2.5"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-body font-medium text-ink">{flag.label}</p>
              <Badge tone="neutral">{flag.plan}</Badge>
            </div>
            {flag.description ? (
              <p className="truncate text-caption text-ink-muted">{flag.description}</p>
            ) : null}
            {flag.overrides.length > 0 ? (
              <p className="text-caption text-ink-muted">
                {flag.overrides.length} compan{flag.overrides.length === 1 ? "y" : "ies"} overriding this
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={updateFlag.isPending}
            onClick={() => {
              setError(null);
              updateFlag.mutate(
                { key: flag.key, enabled: !flag.enabled },
                {
                  onError: (cause) =>
                    setError(cause instanceof Error ? cause.message : "Could not update feature."),
                },
              );
            }}
          >
            {flag.enabled ? "On for everyone" : "Off for everyone"}
          </Button>
        </div>
      ))}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}
