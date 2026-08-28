"use client";

import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PlatformAiSettingsPageClient } from "./ai-settings-page-client";

/** Superadmin gate lives in (platform)/layout.tsx. */
export default function PlatformAiSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Sparkles}
        title="AI settings"
        description="Platform-wide free weekly allowances for photo reading and vector search."
      />
      <PlatformAiSettingsPageClient />
    </div>
  );
}
