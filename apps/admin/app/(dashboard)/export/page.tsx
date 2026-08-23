"use client";

import { Download, TriangleAlert } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { useFeatureFlags } from "@/lib/query/features";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ExportPanel } from "./export-panel";

export default function ExportPage() {
  return (
    <AdminGate
      icon={Download}
      title="Export data"
      forbiddenTitle="Exports are for the owner's account"
      instruction="Only an admin can download catalogue, sales and stock files."
    >
      <ExportGate />
    </AdminGate>
  );
}

function ExportGate() {
  const { isEnabled, isPending } = useFeatureFlags();

  if (isPending) {
    return (
      <div className="space-y-6">
        <PageHeader icon={Download} title="Export data" />
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      </div>
    );
  }

  if (!isEnabled("export")) {
    return (
      <div className="space-y-6">
        <PageHeader icon={Download} title="Export data" />
        <Card>
          <EmptyState
            icon={TriangleAlert}
            title="Export has been turned off for this shop"
            instruction="Ask your platform administrator to turn it back on."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Download}
        title="Export data"
        description="Pull a backup of the shop's records as CSV, Excel or PDF."
      />
      <ExportPanel />
    </div>
  );
}
