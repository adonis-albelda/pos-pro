"use client";

import { useSearchParams } from "next/navigation";
import { isInitialQueryLoad } from "@/lib/list-query";
import { Card } from "@/components/ui";
import { useLocationFilter } from "@/components/location-filter-provider";
import { useSalesList } from "@/lib/query/sales";
import { useUsers } from "@/lib/query/users";
import { SalesPanel } from "./sales-panel";

export default function SalesPage() {
  const searchParams = useSearchParams();
  const { locationId } = useLocationFilter();
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const userId = searchParams.get("userId") ?? undefined;
  const deviceId = searchParams.get("deviceId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const usersQuery = useUsers({ includeInactive: true });
  const salesQuery = useSalesList({
    from,
    to,
    userId,
    deviceId,
    status,
    locationId: locationId ?? undefined,
  });

  if (isInitialQueryLoad(salesQuery.isPending, Boolean(salesQuery.data)) || usersQuery.isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (salesQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {salesQuery.error instanceof Error ? salesQuery.error.message : "Could not load sales."}
      </Card>
    );
  }

  return <SalesPanel sales={salesQuery.data ?? []} users={usersQuery.data ?? []} />;
}
