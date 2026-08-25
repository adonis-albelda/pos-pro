"use client";

import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { DemoAccessPageClient } from "./demo-access-page-client";

/**
 * Client page — codes via useDemoAccessCodes().
 * Superadmin gate lives in (platform)/layout.tsx.
 */
export default function DemoAccessPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={KeyRound}
        title="Demo access codes"
        description="One-time codes for demo-flagged accounts, generated and sent to prospects by the external site that hands out demo access."
      />
      <DemoAccessPageClient />
    </div>
  );
}
