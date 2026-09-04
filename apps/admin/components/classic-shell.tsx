"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutGrid, LogOut, Menu, X } from "lucide-react";
import { storeInitial } from "@double-a/shared-types";
import { signOut } from "@/app/login/actions";
import { LocationSwitcher } from "@/components/location-switcher";
import { LocationMutationsBanner } from "@/components/location-mutations-banner";
import { BrandFooter } from "@/components/brand-footer";
import { UiModeToggle } from "@/components/ui-mode-toggle";
import { filterNavGroupsByFeatures, NAV_GROUPS } from "@/lib/nav";
import { useNavFeatureEnabled } from "@/lib/query/nav-features";
import type { UiMode } from "@/lib/ui-mode";

/**
 * The desktop-launcher chrome: a title bar, a menu bar of dropdowns, and a
 * status strip — the shape of the till software many owners ran before this.
 * On a phone the menu bar collapses into one drawer; pages are unchanged.
 */
export function ClassicShell({
  storeName,
  storeLogoUrl,
  userEmail,
  mode,
  embedded = false,
  children,
}: {
  storeName: string;
  storeLogoUrl: string | null;
  userEmail: string | null;
  mode: UiMode;
  embedded?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { isEnabled } = useNavFeatureEnabled();
  const navGroups = filterNavGroupsByFeatures(NAV_GROUPS, isEnabled);

  useEffect(() => {
    setOpenGroup(null);
    setDrawerOpen(false);
  }, [pathname]);

  const brandMark = storeLogoUrl ? (
    <img
      src={storeLogoUrl}
      alt=""
      className="size-7 shrink-0 rounded-sm bg-white object-contain"
    />
  ) : (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-white/15 text-caption font-bold text-white">
      {storeInitial(storeName)}
    </span>
  );

  function isActive(href: string): boolean {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-30">
      {/* Title bar — dropped inside the mobile app's WebView, which already
          shows its own back button + brand above this; a bare border
          separates the two instead. */}
      {embedded ? (
        <div className="flex items-center justify-end border-t border-border bg-surface px-2 py-1.5">
          <LocationSwitcher />
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-primary px-2 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white sm:gap-3 sm:px-3">
          <button
            type="button"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((value) => !value)}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-white/10 md:hidden"
          >
            {drawerOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
          </button>

          <span className="hidden sm:block">{brandMark}</span>
          <span className="min-w-0 flex-1 truncate text-body font-semibold tracking-tight">
            <span className="sm:hidden">{storeName}</span>
            <span className="hidden sm:inline">{storeName} — Back Office</span>
          </span>

          <Link
            href="/menu"
            className={[
              "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-caption font-medium transition-colors md:hidden",
              pathname === "/menu"
                ? "border-white/40 bg-white/15"
                : "border-white/25 hover:bg-white/10",
            ].join(" ")}
          >
            <LayoutGrid size={14} strokeWidth={2} />
            Main menu
          </Link>

          <LocationSwitcher tone="onPrimary" className="shrink-0 md:hidden" />

          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-white/25 px-2 py-1 text-caption transition-colors hover:bg-white/10"
            >
              <LogOut size={13} strokeWidth={2} />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </form>
        </div>
      )}

      {/* Menu bar — desktop */}
      <div
        className="hidden items-center justify-between gap-2 border-b border-border bg-surface px-2 py-1 md:flex"
        onMouseLeave={() => setOpenGroup(null)}
      >
        <div className="flex flex-wrap items-center gap-0.5">
          <Link
            href="/menu"
            className={[
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-caption font-medium transition-colors",
              pathname === "/menu"
                ? "bg-primary text-white"
                : "text-ink hover:bg-border/60",
            ].join(" ")}
          >
            <LayoutGrid size={14} strokeWidth={2} />
            Main menu
          </Link>

          {navGroups.filter((group) => group.label).map((group) => {
            const label = group.label as string;
            const open = openGroup === label;
            const active = group.items.some((item) => isActive(item.href));

            return (
              <div key={label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : label)}
                  onMouseEnter={() => setOpenGroup(label)}
                  className={[
                    "inline-flex items-center gap-1 rounded-sm px-2.5 py-1.5 text-caption transition-colors",
                    active || open
                      ? "bg-border/70 font-medium text-ink"
                      : "text-ink hover:bg-border/60",
                  ].join(" ")}
                >
                  {label}
                  <ChevronDown size={13} strokeWidth={2} className="text-ink-muted" />
                </button>

                {open ? (
                  <div className="absolute top-full left-0 z-30 mt-0.5 min-w-52 rounded-sm border border-border bg-surface py-1 shadow-md">
                    {group.items.map(({ href, label: itemLabel, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setOpenGroup(null)}
                        className="flex items-center gap-2.5 px-3 py-2 text-caption text-ink transition-colors hover:bg-primary-tint"
                      >
                        <Icon size={15} strokeWidth={2} className="text-ink-muted" />
                        {itemLabel}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <UiModeToggle mode={mode} className="w-auto [&_button]:w-auto" />
          <LocationSwitcher />
        </div>
      </div>

      </header>

      {drawerOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-ink/40 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <nav
            aria-label="Main menu"
            className="fixed inset-x-0 top-0 z-50 max-h-[85vh] overflow-y-auto border-b border-border bg-surface pt-[env(safe-area-inset-top)] shadow-md md:hidden"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-3">
              <p className="truncate text-body font-semibold">{storeName}</p>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-sm text-ink-muted hover:bg-border/60 hover:text-ink"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-3 px-3 py-3">
              {navGroups.map((group) => (
                <div key={group.label ?? "top"} className="space-y-1">
                  {group.label ? (
                    <p className="px-1 text-[0.6875rem] font-medium tracking-wide text-ink-muted/80 uppercase">
                      {group.label}
                    </p>
                  ) : null}
                  {group.items.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setDrawerOpen(false)}
                      className={[
                        "flex min-h-11 items-center gap-3 rounded-sm px-3 text-body transition-colors",
                        isActive(href)
                          ? "bg-primary font-medium text-white"
                          : "text-ink hover:bg-border/50",
                      ].join(" ")}
                    >
                      <Icon
                        size={17}
                        strokeWidth={2}
                        className={isActive(href) ? "text-white" : "text-ink-muted"}
                      />
                      {label}
                    </Link>
                  ))}
                </div>
              ))}

              <UiModeToggle mode={mode} className="pt-1" />
            </div>
          </nav>
        </>
      ) : null}

      <LocationMutationsBanner />
      <main className="flex-1 px-2 py-2 sm:px-3 sm:py-3">{children}</main>

      {/* Status strip */}
      <footer className="border-t border-border bg-surface px-3 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
        <BrandFooter userEmail={userEmail} compact={embedded} />
      </footer>
    </div>
  );
}
