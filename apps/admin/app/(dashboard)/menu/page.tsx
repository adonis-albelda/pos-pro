"use client";

import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav";
import { Card } from "@/components/ui";
import { useStoreSettings } from "@/lib/query/settings";
import { useProductCount } from "@/lib/query/products";
import { useUserCount } from "@/lib/query/users";
import { useNavFeatureEnabled } from "@/lib/query/nav-features";

const TILE_STYLES: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  accent: "bg-accent/20 text-[#8a6516]",
  success: "bg-success/12 text-success",
  warning: "bg-warning/18 text-[#8a6516]",
  danger: "bg-danger/12 text-danger",
  neutral: "bg-border/70 text-ink-muted",
};

/**
 * The classic launcher: one screen of labelled icons, the way back-office till
 * software has always opened. Same routes as the sidebar, different doorway.
 */
export default function MenuPage() {
  const storeQuery = useStoreSettings();
  const productCountQuery = useProductCount({ includeInactive: true });
  const userCountQuery = useUserCount();
  const { isEnabled } = useNavFeatureEnabled();
  const tiles = NAV_ITEMS.filter((item) => !item.featureKey || isEnabled(item.featureKey));

  const isPending = storeQuery.isPending || productCountQuery.isPending || userCountQuery.isPending;
  const error = storeQuery.error ?? productCountQuery.error ?? userCountQuery.error;

  const now = new Date();

  return (
    <div className="space-y-3">
      <Card className="px-2 py-4 sm:px-6 sm:py-6">
        <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-5">
          {tiles.map(({ href, label, icon: Icon, blurb, tone }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col items-center gap-1.5 rounded-sm px-1 py-2 text-center transition-colors hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none sm:gap-2 sm:px-2 sm:py-3"
            >
              <span
                className={[
                  "flex size-12 items-center justify-center rounded-md transition-transform group-hover:-translate-y-0.5 sm:size-14",
                  TILE_STYLES[tone] ?? TILE_STYLES.neutral,
                ].join(" ")}
              >
                <Icon size={24} strokeWidth={1.75} className="sm:hidden" />
                <Icon size={28} strokeWidth={1.75} className="hidden sm:block" />
              </span>
              <span className="text-caption font-semibold text-ink sm:text-body">
                {label}
              </span>
              <span className="hidden text-caption leading-snug text-ink-muted sm:block">
                {blurb}
              </span>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-heading-sm font-semibold">
            System Information
          </h2>
          <p className="text-caption text-ink-muted">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        {isPending ? (
          <p className="mt-3 text-caption text-ink-muted">Loading…</p>
        ) : error ? (
          <p className="mt-3 text-caption text-danger">
            {error instanceof Error ? error.message : "Could not load system information."}
          </p>
        ) : (
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-caption sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-ink-muted">Shop</dt>
              <dd className="font-medium text-ink">{storeQuery.data!.name}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Products on file</dt>
              <dd className="num font-medium text-ink">{productCountQuery.data}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Users on file</dt>
              <dd className="num font-medium text-ink">{userCountQuery.data ?? 0}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Data</dt>
              <dd className="font-medium text-ink">Tally API (online)</dd>
            </div>
          </dl>
        )}
      </Card>
    </div>
  );
}
