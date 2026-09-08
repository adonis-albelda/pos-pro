"use client";

import { ActivityFeed } from "@/components/activity-feed";
import { useProductActivity } from "@/lib/query/activity";

export function ProductActivitySection({
  productId,
  bare = false,
}: {
  productId: string;
  /** true = no Card/CardHeader wrapper (already inside a bordered tab panel). */
  bare?: boolean;
}) {
  const activityQuery = useProductActivity(productId);

  return <ActivityFeed activities={activityQuery.data} isPending={activityQuery.isPending} bare={bare} />;
}
