"use client";

import { ActivityFeed } from "@/components/activity-feed";
import { useProductActivity } from "@/lib/query/activity";

export function ProductActivitySection({ productId }: { productId: string }) {
  const activityQuery = useProductActivity(productId);

  return <ActivityFeed activities={activityQuery.data} isPending={activityQuery.isPending} />;
}
