"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu, X } from "lucide-react";
import { storeInitial } from "@double-a/shared-types";
import { signOut } from "@/app/login/actions";
import { IconButton } from "@/components/ui";
import { LocationSwitcher } from "@/components/location-switcher";
import { LocationMutationsBanner } from "@/components/location-mutations-banner";
import { BrandFooter, SidebarPoweredBy } from "@/components/brand-footer";
import { SidebarNav } from "@/components/sidebar-nav";
import { UiModeToggle } from "@/components/ui-mode-toggle";
import type { UiMode } from "@/lib/ui-mode";

/**
 * Desktop: viewport-locked shell — side rail stays put, only main scrolls.
 * Phone/tablet: top bar + off-canvas drawer.
 * Main stays `min-w-0` so wide tables scroll inside the page, not the viewport.
 * Header chrome (clock, location, notif, user, sign-out, UI mode) sits outside
 * the scroll pane so the location popover is not clipped by overflow-y-auto.
 */
export function DashboardShell({
  storeName,
  storeLogoUrl,
  userName,
  userEmail,
  initials,
  mode,
  embedded = false,
  children,
}: {
  storeName: string;
  storeLogoUrl: string | null;
  userName: string | null;
  userEmail: string | null;
  initials: string;
  mode: UiMode;
  embedded?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const brandMark = storeLogoUrl ? (
    // Plain img: the logo is an arbitrary Supabase Storage URL, and
    // routing it through next/image would mean listing that host in
    // the build config of every deployment.
    <img
      src={storeLogoUrl}
      alt=""
      className="size-9 shrink-0 rounded-md object-contain"
    />
  ) : (
    <span className="flex size-9 items-center justify-center rounded-md bg-primary font-display text-body-lg font-bold text-white">
      {storeInitial(storeName)}
    </span>
  );

  const headerActions = (
    <HeaderActions
      userName={userName}
      userEmail={userEmail}
      initials={initials}
      mode={mode}
      embedded={embedded}
    />
  );

  return (
    <div className="flex min-h-screen lg:h-dvh lg:overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-surface pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-ink transition-colors hover:bg-border/60 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            aria-expanded={open}
            aria-controls="admin-sidebar"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
          </button>
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="shrink-0 scale-90">{brandMark}</span>
            <span className="truncate text-body font-semibold tracking-tight">{storeName}</span>
          </Link>
          <LocationSwitcher className="shrink-0" />
          <NotificationsBell />
          {!embedded ? (
            <form action={signOut}>
              <IconButton type="submit" icon={LogOut} label="Sign out" />
            </form>
          ) : null}
        </div>
      </header>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        id="admin-sidebar"
        aria-label={`${storeName} navigation`}
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-[min(16.5rem,88vw)] flex-col border-r border-border bg-surface",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          // Desktop: in-flow column of the h-dvh shell (not sticky-in-tall-flex —
          // stretch made the rail as tall as main, so it scrolled away with the page).
          "lg:static lg:z-0 lg:h-full lg:w-60 lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="hidden px-5 py-6 lg:block">
          <Link href="/" className="flex items-center gap-3">
            {brandMark}
            <span className="min-w-0">
              <span className="block truncate text-body-lg font-semibold tracking-tight">
                {storeName}
              </span>
              <span className="block text-caption text-ink-muted">Admin dashboard</span>
            </span>
          </Link>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 lg:hidden">
          <div className="min-w-0">
            <p className="truncate text-body font-semibold">{storeName}</p>
            <p className="text-caption text-ink-muted">Admin dashboard</p>
          </div>
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-border/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <SidebarNav onNavigate={() => setOpen(false)} />

        <div className="mt-auto shrink-0">
          {/* Mobile drawer: user + UI mode (desktop shows these in the top bar). */}
          <div className="border-t border-border px-4 py-4 sm:px-5 lg:hidden">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold text-primary">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-body font-medium">{userName ?? "Signed in"}</p>
                <p className="truncate text-caption text-ink-muted">{userEmail}</p>
              </div>
            </div>
            <UiModeToggle mode={mode} className="mt-3" />
          </div>

          <div className="border-t border-border">
            <SidebarPoweredBy />
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] lg:min-h-0 lg:pt-0">
        <div className="relative z-30 hidden shrink-0 items-center gap-3 border-b border-border bg-surface px-5 py-2.5 lg:flex">
          <HeaderClock />
          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">{headerActions}</div>
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-y-auto">
          <LocationMutationsBanner />
          <div className="flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">{children}</div>

          <footer className="mt-auto border-t border-border bg-primary/5 px-3 py-3 sm:px-4 lg:px-5">
            <BrandFooter />
          </footer>
        </main>
      </div>
    </div>
  );
}

function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // SSR + first client paint: empty placeholder (same width class) so
  // locale time never mismatches hydrate. Live clock starts after mount.
  if (!now) {
    return (
      <span
        className="inline-block shrink-0 text-caption font-medium tabular-nums text-ink-muted"
        aria-hidden
      >
        &nbsp;
      </span>
    );
  }

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <time
      dateTime={now.toISOString()}
      className="shrink-0 text-caption font-medium tabular-nums text-ink-muted"
    >
      <span className="text-ink">{dateLabel}</span>
      <span className="mx-1.5 text-border">·</span>
      <span>{timeLabel}</span>
    </time>
  );
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <IconButton
        icon={Bell}
        label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      />
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute top-[calc(100%+4px)] right-0 z-50 w-56 rounded-md border border-border bg-surface px-3 py-3 shadow-lg"
        >
          <p className="text-caption font-semibold text-ink">Notifications</p>
          <p className="mt-1 text-caption text-ink-muted">Coming soon</p>
        </div>
      ) : null}
    </div>
  );
}

function HeaderActions({
  userName,
  userEmail,
  initials,
  mode,
  embedded,
}: {
  userName: string | null;
  userEmail: string | null;
  initials: string;
  mode: UiMode;
  embedded: boolean;
}) {
  return (
    <>
      <LocationSwitcher className="shrink-0" />
      <NotificationsBell />
      <UiModeToggle mode={mode} compact />
      <div className="flex min-w-0 items-center gap-2.5 border-l border-border pl-2.5 sm:pl-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold text-primary">
          {initials}
        </span>
        <div className="min-w-0 max-w-[10rem] xl:max-w-[14rem]">
          <p className="truncate text-caption font-semibold leading-tight text-ink">
            {userName ?? "Signed in"}
          </p>
          <p className="truncate text-[11px] leading-tight text-ink-muted">{userEmail}</p>
        </div>
      </div>
      {!embedded ? (
        <form action={signOut}>
          <IconButton type="submit" icon={LogOut} label="Sign out" tone="danger" />
        </form>
      ) : null}
    </>
  );
}
