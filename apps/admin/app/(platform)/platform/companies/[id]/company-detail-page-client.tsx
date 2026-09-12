"use client";

import { useSearchParams } from "next/navigation";
import { Building2, FolderTree, Package, Receipt, SlidersHorizontal, Truck, Users, Warehouse } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { TabNav } from "@/components/tab-nav";
import { useCompanyStats, useCompanyUsers } from "@/lib/query/companies";
import { usePlatformAiSettings } from "@/lib/query/platform-ai-settings";
import { CompanyControls, CompanyUsers } from "./company-detail";
import { CompanyFeaturesTab } from "./company-features-tab";

export function CompanyDetailPageClient({ companyId }: { companyId: string }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "features" ? "features" : "overview";
  const tabs = [
    { key: "overview", label: "Overview", href: `/platform/companies/${companyId}`, icon: Building2 },
    {
      key: "features",
      label: "Features",
      href: `/platform/companies/${companyId}?tab=features`,
      icon: SlidersHorizontal,
    },
  ];
  const statsQuery = useCompanyStats();
  const usersQuery = useCompanyUsers(companyId);
  const plansQuery = usePlatformAiSettings();

  if (statsQuery.isPending || usersQuery.isPending || plansQuery.isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (statsQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {statsQuery.error instanceof Error
          ? statsQuery.error.message
          : "Could not load this company."}
      </Card>
    );
  }

  if (usersQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {usersQuery.error instanceof Error
          ? usersQuery.error.message
          : "Could not load this company's users."}
      </Card>
    );
  }

  if (plansQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {plansQuery.error instanceof Error
          ? plansQuery.error.message
          : "Could not load app plans."}
      </Card>
    );
  }

  // companyStats() has no per-id read (CLAUDE.md-adjacent note in
  // lib/query/companies.ts) — every row comes back and the detail page
  // finds its own, same as the pre-TanStack server code did.
  const stats = statsQuery.data.find((row) => row.id === companyId);
  if (!stats) {
    return (
      <Card className="px-4 py-8 text-center text-body text-ink-muted">Company not found.</Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title={stats.name}
        description="Admins, terminals, and cashiers for this shop. Open company to use the shop dashboard."
        action={
          <Badge tone={stats.isActive ? "success" : "danger"}>
            {stats.isActive ? "Active" : "Disabled"}
          </Badge>
        }
      />

      <TabNav items={tabs} active={tab} ariaLabel="Company sections" />

      {tab === "features" ? (
        <CompanyFeaturesTab companyId={companyId} aiPlanId={stats.aiPlanId} plans={plansQuery.data.plans} />
      ) : (
        <>
          <CompanyControls
            companyId={companyId}
            isActive={stats.isActive}
            invoiceNumberMode={stats.invoiceNumberMode}
            aiPlanId={stats.aiPlanId}
            plans={plansQuery.data.plans}
          />

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatCard icon={Package} label="Products" value={String(stats.productCount)} />
            <StatCard icon={FolderTree} label="Categories" value={String(stats.categoryCount)} />
            <StatCard icon={Truck} label="Suppliers" value={String(stats.supplierCount)} />
            <StatCard icon={Users} label="Customers" value={String(stats.customerCount)} />
            <StatCard icon={Receipt} label="Sales" value={String(stats.saleCount)} />
            <StatCard icon={Users} label="Users" value={String(stats.userCount)} />
            <StatCard icon={Warehouse} label="Stock units" value={String(stats.stockUnits)} />
          </div>

          <Card>
            <CardHeader
              title="Users"
              description="Reset Auth passwords or PINs without opening the shop dashboard. Works even when the company is disabled."
            />
            <CardBody>
              <CompanyUsers companyId={companyId} users={usersQuery.data} />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
