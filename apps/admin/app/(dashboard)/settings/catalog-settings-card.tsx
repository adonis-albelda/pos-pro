"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardHeader, ErrorNote } from "@/components/ui";
import { useCatalogSettings, useUpdateCatalogSettings } from "@/lib/query/catalog-settings";

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

export function CatalogSettingsCard() {
  const settingsQuery = useCatalogSettings();
  const updateSettings = useUpdateCatalogSettings();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    updateSettings.mutate(next, {
      onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save."),
    });
  }

  return (
    <Card>
      <CardHeader
        icon={Sparkles}
        title="Product catalog"
        description="Help catch a spec baked into a product name before it becomes a duplicate-product problem."
      />
      <div className="space-y-3 px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-body font-medium text-ink">Suggest attributes based on product names</p>
            <p className="mt-0.5 text-caption text-ink-muted">
              When a name looks like it hides a size, color, or measurement, offer to set it up as
              an attribute instead.
            </p>
          </div>
          {settingsQuery.data ? (
            <Toggle
              enabled={settingsQuery.data.variantSignalDetectionEnabled}
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
