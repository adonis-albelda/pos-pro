"use client";

import { useSearchParams } from "next/navigation";
import { resolveDayWindow } from "@/lib/date-range";
import { Card } from "@/components/ui";
import { FetchingDataOverlay } from "@/components/overlay";
import { useLocationFilter } from "@/components/location-filter-provider";
import { useSalesList, useSalesStats } from "@/lib/query/sales";
import { useUsers } from "@/lib/query/users";
import { SalesPanel } from "./sales-panel";

export function SalesPageClient() {
  const searchParams = useSearchParams();
  const { locationId } = useLocationFilter();
  const dayWindow = resolveDayWindow({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  const userId = searchParams.get("userId") ?? undefined;
  const deviceId = searchParams.get("deviceId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const listFilter = {
    from: dayWindow.from,
    to: dayWindow.to,
    userId,
    deviceId,
    status,
    locationId: locationId ?? undefined,
  };

  const usersQuery = useUsers({ includeInactive: true });
  const salesQuery = useSalesList(listFilter);
  const statsQuery = useSalesStats(listFilter);

  const fetching = salesQuery.isFetching || statsQuery.isFetching;
  const error = salesQuery.error ?? statsQuery.error;

  if (error) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {error instanceof Error ? error.message : "Could not load sales."}
      </Card>
    );
  }

  return (
    <>
      <FetchingDataOverlay open={fetching} />
      <SalesPanel
        sales={salesQuery.data ?? []}
        stats={
          statsQuery.data ?? {
            revenue: 0,
            cost: 0,
            discount: 0,
            grossProfit: 0,
            marginPercent: 0,
            count: 0,
          }
        }
        users={usersQuery.data ?? []}
        fromDay={dayWindow.fromDay}
        toDay={dayWindow.toDay}
      />
    </>
  );
}
