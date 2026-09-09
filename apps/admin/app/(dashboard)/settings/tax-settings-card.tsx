"use client";

import { useState } from "react";
import { Percent, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input } from "@/components/ui";
import { useTaxSettings, useUpdateTaxSettings } from "@/lib/query/discounts";

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

export function TaxSettingsCard() {
  const query = useTaxSettings();
  const update = useUpdateTaxSettings();
  const [vatRateDraft, setVatRateDraft] = useState<string | null>(null);

  if (query.isPending) {
    return (
      <Card>
        <CardHeader icon={Percent} title="Tax & discounts" description="VAT registration and promo behaviour." />
        <p className="px-4 py-8 text-center text-body text-ink-muted sm:px-6">Loading…</p>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <CardHeader icon={Percent} title="Tax & discounts" description="VAT registration and promo behaviour." />
        <div className="px-4 py-5 sm:px-6">
          <ErrorNote>Could not load tax settings.</ErrorNote>
        </div>
      </Card>
    );
  }

  const settings = query.data;
  const vatRateValue = vatRateDraft ?? String(settings.vatRate);

  return (
    <Card>
      <CardHeader
        icon={Percent}
        title="Tax & discounts"
        description="VAT-registered shops treat shelf prices as VAT-inclusive. Senior/PWD discounts back VAT out before applying 20%."
      />
      <div className="space-y-5 px-4 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-body font-medium text-ink">VAT registered</p>
            <p className="text-caption text-ink-muted">
              Off = non-VAT (percentage tax). Receipts hide VAT lines. On = PH retail VAT-inclusive prices.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={settings.isVatRegistered ? "success" : "neutral"}>
              {settings.isVatRegistered ? "VAT" : "Non-VAT"}
            </Badge>
            <Toggle
              enabled={settings.isVatRegistered}
              disabled={update.isPending}
              onChange={(next) =>
                update.mutate(
                  { isVatRegistered: next },
                  { onError: () => toast.error("Could not update VAT registration.") },
                )
              }
            />
          </div>
        </div>

        <Field label="VAT rate (%)" hint="Philippines default is 12. Editable for locale changes." required={false}>
          <div className="flex gap-2">
            <Input
              icon={Receipt}
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={vatRateValue}
              disabled={!settings.isVatRegistered || update.isPending}
              onChange={(event) => setVatRateDraft(event.currentTarget.value)}
            />
            <Button
              type="button"
              disabled={!settings.isVatRegistered || update.isPending || vatRateDraft === null}
              onClick={() => {
                const rate = Number(vatRateDraft);
                if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
                  toast.error("Enter a rate between 0 and 100.");
                  return;
                }
                update.mutate(
                  { vatRate: rate },
                  {
                    onSuccess: () => setVatRateDraft(null),
                    onError: () => toast.error("Could not save VAT rate."),
                  },
                );
              }}
            >
              Save
            </Button>
          </div>
        </Field>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-body font-medium text-ink">Auto-apply promo discounts</p>
            <p className="text-caption text-ink-muted">
              When a complex promo qualifies at checkout, apply it automatically. Off = show one-tap Apply suggestion.
            </p>
          </div>
          <Toggle
            enabled={settings.autoApplyComplexDiscounts}
            disabled={update.isPending}
            onChange={(next) =>
              update.mutate(
                { autoApplyComplexDiscounts: next },
                { onError: () => toast.error("Could not update promo auto-apply.") },
              )
            }
          />
        </div>
      </div>
    </Card>
  );
}
