"use client";

import { useEffect, useState, useTransition } from "react";
import { Save, Sparkles } from "lucide-react";
import type { AiPlanId, AiSubscriptionPlan } from "@double-a/shared-types";
import { Button, Card, CardHeader, ErrorNote, Field, Input } from "@/components/ui";
import {
  useInvalidatePlatformAiSettings,
  usePlatformAiSettings,
} from "@/lib/query/platform-ai-settings";
import { savePlatformAiSettingsAction } from "./actions";

export function PlatformAiSettingsPageClient() {
  const settingsQuery = usePlatformAiSettings();

  if (settingsQuery.isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (settingsQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {settingsQuery.error instanceof Error
          ? settingsQuery.error.message
          : "Could not load AI settings."}
      </Card>
    );
  }

  return <PlatformAiSettingsForm settings={settingsQuery.data} />;
}

function PlatformAiSettingsForm({
  settings,
}: {
  settings: {
    photoOverageChargePeso: number;
    plans: AiSubscriptionPlan[];
  };
}) {
  const invalidate = useInvalidatePlatformAiSettings();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overageCharge, setOverageCharge] = useState(String(settings.photoOverageChargePeso));
  const [plans, setPlans] = useState(settings.plans);

  useEffect(() => {
    setOverageCharge(String(settings.photoOverageChargePeso));
    setPlans(settings.plans);
  }, [settings.photoOverageChargePeso, settings.plans]);

  function updatePlan(
    planId: AiPlanId,
    field: "photoExtractWeeklyLimit" | "vectorSearchWeeklyLimit",
    value: string,
  ) {
    setPlans((current) =>
      current.map((plan) => (plan.id === planId ? { ...plan, [field]: value } : plan)),
    );
  }

  function save() {
    const photoOverageChargePeso = Number.parseInt(overageCharge, 10);
    const parsedPlans = plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      photoExtractWeeklyLimit: Number.parseInt(String(plan.photoExtractWeeklyLimit), 10),
      vectorSearchWeeklyLimit: Number.parseInt(String(plan.vectorSearchWeeklyLimit), 10),
    }));

    if (
      !Number.isFinite(photoOverageChargePeso) ||
      photoOverageChargePeso < 0 ||
      parsedPlans.some(
        (plan) =>
          !Number.isFinite(plan.photoExtractWeeklyLimit) ||
          plan.photoExtractWeeklyLimit < 0 ||
          !Number.isFinite(plan.vectorSearchWeeklyLimit) ||
          plan.vectorSearchWeeklyLimit < 0,
      )
    ) {
      setError("Enter whole numbers zero or greater.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await savePlatformAiSettingsAction({
        photoOverageChargePeso,
        plans: parsedPlans,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      invalidate();
    });
  }

  return (
    <Card>
      <CardHeader
        icon={Sparkles}
        title="AI subscription plans"
        description="Configure weekly free allowances per plan and the paid photo overage rate when a shop opts in."
      />

      <div className="space-y-4 px-4 py-5 sm:px-6">
        <Field label="Photo overage charge (per request)">
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={overageCharge}
            onChange={(event) => setOverageCharge(event.target.value)}
          />
        </Field>

        <div className="space-y-4">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-sm border border-border bg-paper/40 p-4">
              <p className="text-body font-medium text-ink">
                Plan {plan.id}: {plan.name}
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Photo to text (free per week)">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={String(plan.photoExtractWeeklyLimit)}
                    onChange={(event) =>
                      updatePlan(plan.id, "photoExtractWeeklyLimit", event.target.value)
                    }
                  />
                </Field>
                <Field label="Vector search (free per week)">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={String(plan.vectorSearchWeeklyLimit)}
                    onChange={(event) =>
                      updatePlan(plan.id, "vectorSearchWeeklyLimit", event.target.value)
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>

        <p className="text-caption text-ink-muted">
          Counts reset every Monday. Assign each company a plan on its detail page. Shops only need
          to turn AI on in Settings when they want paid photo reads beyond the free weekly allowance.
        </p>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex justify-end">
          <Button type="button" icon={Save} loading={pending} onClick={save}>
            Save AI settings
          </Button>
        </div>
      </div>
    </Card>
  );
}
