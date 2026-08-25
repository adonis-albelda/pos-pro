"use client";

import { ToggleLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { FeaturesPageClient } from "./features-page-client";

/**
 * Client page — flags via useFeatureFlagsAdmin() / useCompanyStats().
 * Superadmin gate lives in (platform)/layout.tsx.
 */
export default function FeaturesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={ToggleLeft}
        title="Features"
        description="Turn a feature off for every shop, or for one shop only. Everything starts on."
      />
      <FeaturesPageClient />
    </div>
  );
}
