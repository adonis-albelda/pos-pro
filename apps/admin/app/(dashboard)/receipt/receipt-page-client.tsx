"use client";

import { useState } from "react";
import { BadgeCheck, FileText, Printer, Truck } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { ReceiptLayoutForm } from "./receipt-layout-form";
import { useReceiptLayout, useStoreSettings } from "@/lib/query/settings";

type ReceiptTab = "official" | "delivery";

const TABS: { id: ReceiptTab; label: string; icon: typeof Printer }[] = [
  { id: "official", label: "Official Receipt", icon: BadgeCheck },
  { id: "delivery", label: "Delivery Receipt", icon: Truck },
];

export function ReceiptPageClient() {
  const [tab, setTab] = useState<ReceiptTab>("delivery");
  const layoutQuery = useReceiptLayout();
  const storeQuery = useStoreSettings();

  const isPending = layoutQuery.isPending || storeQuery.isPending;
  const error = layoutQuery.error ?? storeQuery.error;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Printer}
        title="Receipt layout"
        description="What shows on the PT-210 (58mm). Terminals pull this on sync; each device pairs its own Bluetooth printer."
      />

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <div
          className="flex flex-wrap gap-1 px-2 sm:px-3"
          role="tablist"
          aria-label="Receipt type"
        >
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(entry.id)}
                className={[
                  "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-body font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                  active
                    ? "border-primary text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                ].join(" ")}
              >
                <Icon size={16} strokeWidth={2} />
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "official" ? (
        <Card>
          <CardHeader
            icon={BadgeCheck}
            title="Official Receipt (OR)"
            description="BIR-accredited official receipts for tax-compliant sales."
          />
          <div className="px-4 py-5 sm:px-6">
            <EmptyState
              icon={FileText}
              title="Official Receipt coming soon"
              instruction="We're currently accrediting with the BIR so this system can generate Official Receipts. Delivery receipts stay available in the meantime."
            />
          </div>
        </Card>
      ) : (
        <Card className="relative z-0 overflow-visible">
          <CardHeader
            icon={Truck}
            title="Blocks on the delivery receipt"
            description="Toggle sections. The preview on the right is the paper output — not an Official Receipt."
          />
          <div className="relative z-0 px-4 py-5 sm:px-6">
            {isPending ? (
              <p className="py-8 text-center text-body text-ink-muted">Loading…</p>
            ) : error ? (
              <p className="py-8 text-center text-body text-danger">
                {error instanceof Error ? error.message : "Could not load the receipt layout."}
              </p>
            ) : (
              <ReceiptLayoutForm layout={layoutQuery.data!} store={storeQuery.data!} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
