"use client";

import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { ImportHistoryPanel } from "./import-history-panel";

export default function ImportHistoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={History}
        title="Import history"
        description="Every CSV import this company has run. Roll one back if it turns out to be wrong."
      />

      <Link
        href="/products/import"
        className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
      >
        <ArrowLeft size={14} />
        Back to import
      </Link>

      <ImportHistoryPanel />
    </div>
  );
}
