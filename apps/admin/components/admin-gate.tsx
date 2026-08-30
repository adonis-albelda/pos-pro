"use client";

import type { LucideIcon } from "lucide-react";
import { TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/lib/query/session";
import { isShopAdmin, isShopOwner } from "@/lib/authz";
import { Card, EmptyState, PageHeader } from "@/components/ui";

/**
 * Client-side replacement for the "thin Server Component gate" every
 * admin-only dashboard page used to open with (getCurrentUser() +
 * isShopAdmin() before any client bundle mounted). That pattern predates
 * useCurrentUser() — there was no client-side equivalent yet — and mixed a
 * server data read into otherwise fully TanStack-Query-driven pages. This
 * is the one place that check now lives; every page below it is a plain
 * client component.
 */
export function AdminGate({
  icon: Icon,
  title,
  forbiddenTitle,
  instruction,
  /** Owner tier (admin/acting superadmin) only — excludes manager. See isShopOwner(). */
  ownerOnly = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  forbiddenTitle: string;
  instruction: string;
  ownerOnly?: boolean;
  children: React.ReactNode;
}) {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) {
    return (
      <div className="space-y-6">
        <PageHeader icon={Icon} title={title} />
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      </div>
    );
  }

  const allowed = ownerOnly ? isShopOwner(user) : isShopAdmin(user);

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader icon={Icon} title={title} />
        <Card>
          <EmptyState icon={TriangleAlert} title={forbiddenTitle} instruction={instruction} />
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
