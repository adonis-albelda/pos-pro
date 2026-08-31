"use client";

import { useSearchParams } from "next/navigation";
import { isInitialQueryLoad } from "@/lib/list-query";
import { resolveDayWindow } from "@/lib/date-range";
import { Card } from "@/components/ui";
import { useLocationFilter } from "@/components/location-filter-provider";
import { useSalesList } from "@/lib/query/sales";
import { useUsers } from "@/lib/query/users";
import { SalesPanel } from "./sales-panel";

export default function SalesPage() {
  const searchParams = useSearchParams();
  const { locationId } = useLocationFilter();
  // fromDay/toDay (plain yyyy-mm-dd) drive the DateRangePicker UI; from/to
  // are the store-timezone instant boundaries the API actually filters on —
  // a bare "2026-08-15" sent as `to` would cut off at that day's midnight
  // instead of including the whole day.
  const dayWindow = resolveDayWindow({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  const userId = searchParams.get("userId") ?? undefined;
  const deviceId = searchParams.get("deviceId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const usersQuery = useUsers({ includeInactive: true });
  const salesQuery = useSalesList({
    from: dayWindow.from,
    to: dayWindow.to,
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

  return (
    <SalesPanel
      sales={salesQuery.data ?? []}
      users={usersQuery.data ?? []}
      fetching={salesQuery.isFetching && Boolean(salesQuery.data)}
      fromDay={dayWindow.fromDay}
      toDay={dayWindow.toDay}
    />
  );
}
