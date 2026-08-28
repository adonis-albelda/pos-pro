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
        title="App plans"
        description="Subscription tiers for shops. Set weekly AI allowances and photo overage pricing per plan."
      />
      <PlatformAiSettingsPageClient />
    </div>
  );
}
