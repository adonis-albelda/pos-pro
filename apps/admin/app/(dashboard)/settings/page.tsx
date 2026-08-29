"use client";

import { useSearchParams } from "next/navigation";
import { Settings, ShieldCheck, Sparkles, Store } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { TabNav } from "@/components/tab-nav";
import { StoreForm } from "./store-form";
import { AiSettingsCard } from "./ai-settings-card";
import { SecuritySettingsCard } from "./security-settings-card";
import { useStoreSettings } from "@/lib/query/settings";
import { useAiSettings } from "@/lib/query/ai-settings";

const SETTINGS_TABS = [
  { key: "info", label: "Company info", icon: Store },
  { key: "ai", label: "AI Usage", icon: Sparkles },
  { key: "security", label: "Security", icon: ShieldCheck },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];

function parseTab(raw: string | undefined): SettingsTab {
  if (raw === "ai") return "ai";
  if (raw === "security") return "security";
  return "info";
}

function buildHref(tab: SettingsTab): string {
  if (tab === "info") return "/settings";
  return `/settings?tab=${tab}`;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab") ?? undefined);
  const settingsQuery = useStoreSettings();
  const aiQuery = useAiSettings();

  const tabs = SETTINGS_TABS.map((entry) => ({
    ...entry,
    href: buildHref(entry.key),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="Company settings"
        description="Shop identity on receipts and terminals, plus weekly AI usage."
      />

      <TabNav items={tabs} active={tab} ariaLabel="Company settings" />

      {tab === "info" ? (
        <Card>
          <CardHeader
            icon={Store}
            title="Company details"
            description="Terminals show the name and logo, and pick up changes on their next sync."
          />
          <div className="px-4 py-5 sm:px-6">
            {settingsQuery.isPending ? (
              <p className="py-8 text-center text-body text-ink-muted">Loading…</p>
            ) : settingsQuery.isError ? (
              <p className="py-8 text-center text-body text-danger">
                {settingsQuery.error instanceof Error
                  ? settingsQuery.error.message
                  : "Could not load settings."}
              </p>
            ) : (
              <StoreForm settings={settingsQuery.data} />
            )}
          </div>
        </Card>
      ) : tab === "ai" ? (
        <>
          {aiQuery.isPending ? (
            <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
          ) : aiQuery.isError ? (
            <Card className="px-4 py-8 text-center text-body text-danger">
              {aiQuery.error instanceof Error
                ? aiQuery.error.message
                : "Could not load AI settings."}
            </Card>
          ) : aiQuery.data ? (
            <AiSettingsCard settings={aiQuery.data} />
          ) : null}
        </>
      ) : (
        <SecuritySettingsCard />
      )}
    </div>
  );
}
