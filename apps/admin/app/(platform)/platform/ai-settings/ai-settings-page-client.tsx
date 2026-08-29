"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Save, Sparkles, X } from "lucide-react";
import type { AiPlanId, AiSubscriptionPlan } from "@double-a/shared-types";
import { Button, Card, CardHeader, ErrorNote, Field, Input } from "@/components/ui";
import { ConfirmDialog } from "@/components/overlay";
import { toast } from "sonner";
import {
  useCancelEmbedAllBatch,
  useEmbedAllBatchStatus,
  useEmbedAllProducts,
  usePlatformAiSettings,
  useProductEmbeddingCoverage,
  useUpdatePlatformAiSettings,
} from "@/lib/query/platform-ai-settings";

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

  return (
    <div className="space-y-6">
      <PlatformAiSettingsForm settings={settingsQuery.data} />
      <ProductEmbeddingCard />
    </div>
  );
}

/**
 * Coverage across every company. Products created/renamed after this
 * feature shipped embed themselves automatically (ProductObserver) — this
 * is only for backfilling whatever predates it.
 */
function ProductEmbeddingCard() {
  const coverageQuery = useProductEmbeddingCoverage();
  const embedAll = useEmbedAllProducts();
  const cancelBatch = useCancelEmbedAllBatch();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const statusQuery = useEmbedAllBatchStatus(activeBatchId);
  const status = statusQuery.data;
  const running = activeBatchId !== null && !!status && !status.finished && !status.cancelled;

  const missing = coverageQuery.data ? coverageQuery.data.total - coverageQuery.data.embedded : 0;

  useEffect(() => {
    if (!status || !activeBatchId) return;
    if (status.finished && !status.cancelled) {
      toast.success(`Finished embedding — ${status.processedJobs} product${status.processedJobs === 1 ? "" : "s"} done.`);
      setActiveBatchId(null);
    } else if (status.cancelled) {
      toast(`Cancelled — ${status.processedJobs} of ${status.totalJobs} had already finished.`);
      setActiveBatchId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per finished/cancelled transition, not on every status poll
  }, [status?.finished, status?.cancelled]);

  function run() {
    embedAll.mutate(undefined, {
      onSuccess: ({ queued, batchId }) => {
        setConfirmOpen(false);
        if (queued > 0 && batchId) {
          setActiveBatchId(batchId);
          toast.success(`Queued ${queued} product${queued === 1 ? "" : "s"} for embedding.`);
        } else {
          toast.success("Every active product already has an embedding.");
        }
      },
      onError: (error) => {
        setConfirmOpen(false);
        toast.error(error instanceof Error ? error.message : "Could not queue embedding.");
      },
    });
  }

  function cancel() {
    if (!activeBatchId) return;
    cancelBatch.mutate(activeBatchId, {
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : "Could not cancel.");
      },
    });
  }

  return (
    <Card>
      <CardHeader
        icon={BrainCircuit}
        title="Product embeddings"
        description="Backfills smart search's vector for products created before the feature shipped. Already-embedded products are left alone."
      />
      <div className="space-y-4 px-4 py-5 sm:px-6">
        {coverageQuery.isPending ? (
          <p className="text-body text-ink-muted">Loading…</p>
        ) : coverageQuery.isError ? (
          <p className="text-body text-danger">
            {coverageQuery.error instanceof Error
              ? coverageQuery.error.message
              : "Could not load coverage."}
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-body text-ink-muted">
                {coverageQuery.data.embedded} of {coverageQuery.data.total} active products
                embedded
              </span>
              <span className="num text-body-lg font-semibold text-ink">
                {coverageQuery.data.percent}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.min(100, coverageQuery.data.percent)}%` }}
              />
            </div>
          </>
        )}

        {running && status ? (
          <div className="space-y-2 rounded-sm border border-primary/30 bg-primary-tint px-3 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-body text-primary-dark">
                Embedding in progress — {status.processedJobs} of {status.totalJobs}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                loading={cancelBatch.isPending}
                onClick={cancel}
              >
                Cancel
              </Button>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{
                  width: `${status.totalJobs > 0 ? Math.min(100, (status.processedJobs / status.totalJobs) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              type="button"
              icon={Sparkles}
              disabled={coverageQuery.isPending || coverageQuery.isError || missing === 0}
              onClick={() => setConfirmOpen(true)}
            >
              Embed all missing products
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={run}
        pending={embedAll.isPending}
        title="Embed all missing products"
        description={
          missing > 0
            ? `Queues ${missing} product${missing === 1 ? "" : "s"} across every company that ${missing === 1 ? "doesn't" : "don't"} have an embedding yet. Already-embedded products are left alone. You can cancel the run once it starts.`
            : "Every active product already has an embedding."
        }
        confirmLabel="Queue embedding"
        confirmIcon={Sparkles}
      />
    </Card>
  );
}

function PlatformAiSettingsForm({
  settings,
}: {
  settings: {
    photoOverageChargePeso: number;
    plans: AiSubscriptionPlan[];
  };
}) {
  const mutation = useUpdatePlatformAiSettings();
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
    mutation.mutate(
      { photoOverageChargePeso, plans: parsedPlans },
      {
        onError: (saveError) => {
          setError(saveError instanceof Error ? saveError.message : "Could not save AI settings.");
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader
        icon={Sparkles}
        title="Subscription tiers"
        description="Each plan is what a shop pays to use the app. AI weekly limits and photo overage pricing are configured per tier."
      />

      <div className="space-y-4 px-4 py-5 sm:px-6">
        <Field label="Photo overage charge (per request)" required>
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
                <Field label="Photo to text (free per week)" required>
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
                <Field label="Vector search (free per week)" required>
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
          Counts reset every Monday. Assign each company a tier on its detail page. Shops only need
          to turn on paid photo overage in Settings when they want reads beyond the free weekly
          allowance.
        </p>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex justify-end">
          <Button type="button" icon={Save} loading={mutation.isPending} onClick={save}>
            Save AI settings
          </Button>
        </div>
      </div>
    </Card>
  );
}
