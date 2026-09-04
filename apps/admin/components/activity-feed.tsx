"use client";

import { History, Pencil, PlusCircle, Trash2 } from "lucide-react";
import type { Activity } from "@double-a/api-client/queries";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui";

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  restored: "Restored",
};

const EVENT_ICON: Record<string, typeof Pencil> = {
  created: PlusCircle,
  updated: Pencil,
  deleted: Trash2,
};

function formatFieldName(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ActivityRow({ activity }: { activity: Activity }) {
  const Icon = (activity.event ? EVENT_ICON[activity.event] : undefined) ?? History;
  const label = (activity.event ? EVENT_LABEL[activity.event] : undefined) ?? activity.event ?? "Activity";
  const changedFields = Object.keys(activity.changes.attributes ?? {});

  return (
    <li className="flex gap-3 px-4 py-3 sm:px-6">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon size={14} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body">
          <span className="font-medium text-ink">{label}</span>
          {activity.causerName ? (
            <>
              {" "}
              by <span className="font-medium text-ink">{activity.causerName}</span>
            </>
          ) : null}
        </p>
        <p className="text-caption text-ink-muted">{formatTimestamp(activity.createdAt)}</p>
        {changedFields.length > 0 ? (
          <ul className="mt-2 space-y-1 text-caption">
            {changedFields.map((field) => (
              <li key={field} className="text-ink-muted">
                <span className="font-medium text-ink">{formatFieldName(field)}:</span>{" "}
                {formatValue(activity.changes.old?.[field])}
                {" → "}
                {formatValue(activity.changes.attributes?.[field])}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

/** Mounted on Product/Supplier/GoodsReceipt detail pages and the per-user activity dialog — same shape everywhere. */
export function ActivityFeed({
  activities,
  isPending,
  bare = false,
}: {
  activities: Activity[] | undefined;
  isPending: boolean;
  /** true = no Card/CardHeader wrapper (already inside a Card, e.g. a Dialog). */
  bare?: boolean;
}) {
  const body = isPending ? (
    <div className="space-y-3 px-4 py-4 sm:px-6">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  ) : !activities || activities.length === 0 ? (
    <EmptyState icon={History} title="No activity yet" instruction="Changes will show up here." />
  ) : (
    <ul className="divide-y divide-border">
      {activities.map((activity) => (
        <ActivityRow key={activity.id} activity={activity} />
      ))}
    </ul>
  );

  if (bare) return body;

  return (
    <Card>
      <CardHeader icon={History} title="Activity" />
      {body}
    </Card>
  );
}
