"use client";

import { useSearchParams } from "next/navigation";
import { Percent, Settings, ShieldCheck, Sparkles, Store } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { TabNav } from "@/components/tab-nav";
import { AdminGate } from "@/components/admin-gate";
import { StoreForm } from "./store-form";
import { AiSettingsCard } from "./ai-settings-card";
import { SecuritySettingsCard } from "./security-settings-card";
import { TaxSettingsCard } from "./tax-settings-card";
import { useStoreSettings } from "@/lib/query/settings";
import { useAiSettings } from "@/lib/query/ai-settings";

const SETTINGS_TABS = [
  { key: "info", label: "Company info", icon: Store },
  { key: "tax", label: "Tax & discounts", icon: Percent },
  { key: "ai", label: "AI Usage", icon: Sparkles },
  { key: "security", label: "Security", icon: ShieldCheck },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

function parseTab(raw: string | undefined): SettingsTab {
  if (raw === "ai") return "ai";
  if (raw === "security") return "security";
  if (raw === "tax") return "tax";
  return "info";
}

function buildHref(tab: SettingsTab): string {
  if (tab === "info") return "/settings";
  return `/settings?tab=${tab}`;
}

export default function SettingsPage() {
  return (
    <AdminGate
      icon={Settings}
      title="Company settings"
      forbiddenTitle="Company settings are for the owner's account"
      instruction="Only an admin can view or change these — not a manager."
      ownerOnly
    >
      <SettingsPageClient />
    </AdminGate>
  );
}

function SettingsPageClient() {
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab") ?? undefined);
  const settingsQuery = useStoreSettings();
  const aiQuery = useAiSettings();

  const tabs = SETTINGS_TABS.map((entry) => ({
    ...entry,
    href: buildHref(entry.key),
  }));

  // Title stays put across tabs — only the panel below TabNav swaps.
  const companyName = settingsQuery.data?.name?.trim() || "Company settings";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Store}
        title={companyName}
        description="Terminals show the name and logo, and pick up changes on their next sync."
      />

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <TabNav
          items={tabs}
          active={tab}
          ariaLabel="Company settings"
          className="mx-0 bg-surface px-2 sm:px-3"
        />

        <div className="px-4 py-5 sm:px-6">
          {tab === "info" ? (
            settingsQuery.isPending ? (
              <p className="py-8 text-center text-body text-ink-muted">Loading…</p>
            ) : settingsQuery.isError ? (
              <p className="py-8 text-center text-body text-danger">
                {settingsQuery.error instanceof Error
                  ? settingsQuery.error.message
                  : "Could not load settings."}
              </p>
            ) : (
              <StoreForm settings={settingsQuery.data} />
            )
          ) : tab === "tax" ? (
            <TaxSettingsCard embedded />
          ) : tab === "ai" ? (
            aiQuery.isPending ? (
              <p className="py-8 text-center text-body text-ink-muted">Loading…</p>
            ) : aiQuery.isError ? (
              <p className="py-8 text-center text-body text-danger">
                {aiQuery.error instanceof Error
                  ? aiQuery.error.message
                  : "Could not load AI settings."}
              </p>
            ) : aiQuery.data ? (
              <AiSettingsCard settings={aiQuery.data} embedded />
            ) : null
          ) : (
            <SecuritySettingsCard embedded />
          )}
        </div>
      </div>
    </div>
  );
}
