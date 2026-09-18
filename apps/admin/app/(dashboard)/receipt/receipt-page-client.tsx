"use client";

import { useSearchParams } from "next/navigation";
import { BadgeCheck, FileText, Printer, ScrollText } from "lucide-react";
import { CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { TabNav } from "@/components/tab-nav";
import { ReceiptLayoutForm } from "./receipt-layout-form";
import { ReceiptTemplatesPanel } from "./receipt-templates-panel";
import { useReceiptLayout, useStoreSettings } from "@/lib/query/settings";

const RECEIPT_TABS = [
  { key: "official", label: "Official Receipt", icon: BadgeCheck },
  { key: "customer", label: "Customer Receipt", icon: Printer },
  { key: "custom", label: "Custom Receipt", icon: ScrollText },
] as const;

type ReceiptTab = (typeof RECEIPT_TABS)[number]["key"];

function parseTab(raw: string | undefined): ReceiptTab {
  if (raw === "official") return "official";
  if (raw === "custom") return "custom";
  return "customer";
}

function buildHref(tab: ReceiptTab): string {
  if (tab === "customer") return "/receipt";
  return `/receipt?tab=${tab}`;
}

export function ReceiptPageClient() {
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab") ?? undefined);
  const layoutQuery = useReceiptLayout();
  const storeQuery = useStoreSettings();

  const isPending = layoutQuery.isPending || storeQuery.isPending;
  const error = layoutQuery.error ?? storeQuery.error;

  const tabs = RECEIPT_TABS.map((entry) => ({ ...entry, href: buildHref(entry.key) }));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Printer}
        title="Receipt layout"
        description="What shows on the PT-210 (58mm). Terminals pull this on sync; each device pairs its own Bluetooth printer."
      />

      {/* No overflow-hidden here, unlike Settings' shell — the customer-receipt
          tab's preview (receipt-layout-form.tsx) uses xl:sticky, which an
          overflow-hidden ancestor would clip out of view. */}
      <div className="rounded-md border border-border bg-surface">
        <TabNav
          items={tabs}
          active={tab}
          ariaLabel="Receipt type"
          className="mx-0 bg-surface px-2 sm:px-3"
        />

        <div className="px-4 py-5 sm:px-6">
          {tab === "official" ? (
            <>
              <CardHeader
                icon={BadgeCheck}
                title="Official Receipt (OR)"
                description="BIR-accredited official receipts for tax-compliant sales."
              />
              <div className="pt-5">
                <EmptyState
                  icon={FileText}
                  title="Official Receipt coming soon"
                  instruction="We're currently accrediting with the BIR so this system can generate Official Receipts. The customer receipt stays available in the meantime."
                />
              </div>
            </>
          ) : tab === "customer" ? (
            isPending ? (
              <p className="py-8 text-center text-body text-ink-muted">Loading…</p>
            ) : error ? (
              <p className="py-8 text-center text-body text-danger">
                {error instanceof Error ? error.message : "Could not load the receipt layout."}
              </p>
            ) : (
              <>
                <CardHeader
                  icon={Printer}
                  title="Blocks on the customer receipt"
                  description="Toggle sections. The preview on the right is the paper output — not an Official Receipt. Every sale prints this."
                />
                <div className="pt-5">
                  <ReceiptLayoutForm layout={layoutQuery.data!} store={storeQuery.data!} />
                </div>
              </>
            )
          ) : isPending ? (
            <p className="py-8 text-center text-body text-ink-muted">Loading…</p>
          ) : error ? (
            <p className="py-8 text-center text-body text-danger">
              {error instanceof Error ? error.message : "Could not load store settings."}
            </p>
          ) : (
            <ReceiptTemplatesPanel store={storeQuery.data!} />
          )}
        </div>
      </div>
    </div>
  );
}
