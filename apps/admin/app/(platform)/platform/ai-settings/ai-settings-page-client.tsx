"use client";

import { useEffect, useState, useTransition } from "react";
import { Save, Sparkles } from "lucide-react";
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
    photoExtractWeeklyLimit: number;
    vectorSearchWeeklyLimit: number;
  };
}) {
  const invalidate = useInvalidatePlatformAiSettings();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoLimit, setPhotoLimit] = useState(String(settings.photoExtractWeeklyLimit));
  const [vectorLimit, setVectorLimit] = useState(String(settings.vectorSearchWeeklyLimit));

  useEffect(() => {
    setPhotoLimit(String(settings.photoExtractWeeklyLimit));
    setVectorLimit(String(settings.vectorSearchWeeklyLimit));
  }, [settings.photoExtractWeeklyLimit, settings.vectorSearchWeeklyLimit]);

  function save() {
    const photoExtractWeeklyLimit = Number.parseInt(photoLimit, 10);
    const vectorSearchWeeklyLimit = Number.parseInt(vectorLimit, 10);

    if (
      !Number.isFinite(photoExtractWeeklyLimit) ||
      photoExtractWeeklyLimit < 0 ||
      !Number.isFinite(vectorSearchWeeklyLimit) ||
      vectorSearchWeeklyLimit < 0
    ) {
      setError("Enter whole numbers zero or greater.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await savePlatformAiSettingsAction({
        photoExtractWeeklyLimit,
        vectorSearchWeeklyLimit,
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
        title="AI weekly limits"
        description="Free requests per company each week. Shops still opt in under Settings; overage billing for photo reads stays unchanged."
      />

      <div className="space-y-4 px-4 py-5 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Photo to text (free per week)">
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={photoLimit}
              onChange={(event) => setPhotoLimit(event.target.value)}
            />
          </Field>
          <Field label="Vector search (free per week)">
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={vectorLimit}
              onChange={(event) => setVectorLimit(event.target.value)}
            />
          </Field>
        </div>

        <p className="text-caption text-ink-muted">
          Counts reset every Monday. Changing limits applies immediately to every company&apos;s AI
          settings payload and quota checks.
        </p>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex justify-end">
          <Button type="button" icon={Save} loading={pending} onClick={save}>
            Save limits
          </Button>
        </div>
      </div>
    </Card>
  );
}
