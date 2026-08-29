function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export interface DashboardBarChartItem {
  label: string;
  value: number;
  display?: string;
  barClassName?: string;
}

export function DashboardBarChart({ items }: { items: DashboardBarChartItem[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-caption">
            <span className="text-ink-muted">{item.label}</span>
            <span className="num shrink-0 font-medium text-ink">
              {item.display ?? String(item.value)}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-border/60">
            <div
              className={cx("h-full rounded-full transition-[width]", item.barClassName ?? "bg-primary")}
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardColumnChart({
  items,
}: {
  items: { label: string; value: number; display?: string }[];
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="flex h-44 items-end gap-2 sm:gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <span className="num text-caption font-medium text-ink">
            {item.display ?? (item.value > 0 ? String(item.value) : "")}
          </span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-primary/80 transition-[height]"
              style={{ height: `${Math.max(item.value > 0 ? 8 : 0, (item.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-full truncate text-center text-caption text-ink-muted">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
