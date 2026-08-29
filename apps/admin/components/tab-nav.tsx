import type { Route } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export interface TabItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Shown beside the label — a page can say how much sits behind a tab. */
  count?: number;
  href: string;
}

/**
 * Tabs are links, not state: the URL keeps which one is open, so a refresh, a
 * back button and a shared link all land on the same view. Filters travel in
 * the same query string, which is why each caller builds its own hrefs.
 */
/**
 * Underline style — matches the tab bar on the supplier detail page
 * (Supplier's info / Products / Purchase orders): active tab gets a
 * border-primary underline, no pill background. Kept as real links (not
 * button+state), same reasoning as before — the URL still owns which tab
 * is open.
 */
export function TabNav({
  items,
  active,
  className,
  ariaLabel = "Views",
}: {
  items: TabItem[];
  active: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className={cx(
        "-mx-1 overflow-x-auto overscroll-x-contain border-b border-border px-1 [-webkit-overflow-scrolling:touch]",
        className,
      )}
    >
      <nav aria-label={ariaLabel} className="inline-flex min-w-full gap-1 sm:min-w-0">
        {items.map((item) => {
          const current = item.key === active;
          const Icon = item.icon;

          return (
            <Link
              key={item.key}
              href={item.href as Route}
              aria-current={current ? "page" : undefined}
              className={cx(
                "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-body font-medium whitespace-nowrap transition-colors",
                "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                current
                  ? "border-primary text-ink"
                  : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {Icon ? <Icon size={16} strokeWidth={2} /> : null}
              {item.label}
              {item.count !== undefined ? (
                <span
                  className={cx(
                    "num rounded-sm px-1.5 py-0.5 text-caption",
                    current ? "bg-primary/10 text-primary" : "bg-border/60 text-ink-muted",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
