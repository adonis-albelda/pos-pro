"use client";

import { Database } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { BackupsPageClient } from "./backups-page-client";

/** Superadmin database backup list + manual trigger. Gate lives in (platform)/layout.tsx. */
export default function BackupsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={Database}
        title="Database backups"
        description="Download full MySQL dumps for disaster recovery. Dumps run on the Tally API server; this page only lists and downloads them."
      />
      <BackupsPageClient />
    </div>
  );
}
