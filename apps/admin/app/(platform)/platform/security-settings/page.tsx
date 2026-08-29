"use client";

import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PlatformSecuritySettingsPageClient } from "./platform-security-settings-page-client";

/** Superadmin gate lives in (platform)/layout.tsx. */
export default function PlatformSecuritySettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="Security"
        description="Two-factor authentication requirements for platform accounts."
      />
      <PlatformSecuritySettingsPageClient />
    </div>
  );
}
