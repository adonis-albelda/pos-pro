"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { storeInitial } from "@double-a/shared-types";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui";
import { LocationSwitcher } from "@/components/location-switcher";
import { LocationMutationsBanner } from "@/components/location-mutations-banner";
import { SidebarNav } from "@/components/sidebar-nav";
import { UiModeToggle } from "@/components/ui-mode-toggle";
import type { UiMode } from "@/lib/ui-mode";

/**
 * Desktop: sticky left rail. Phone/tablet: top bar + off-canvas drawer.
 * Main stays `min-w-0` so wide tables scroll inside the page, not the viewport.
 */
export function DashboardShell({
  storeName,
  storeLogoUrl,
  userName,
  userEmail,
  initials,
  mode,
  children,
}: {
  storeName: string;
  storeLogoUrl: string | null;
  userName: string | null;
  userEmail: string | null;
  initials: string;
  mode: UiMode;
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

  return (
    <div className="flex min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-surface pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-14 items-center gap-3 px-3">
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
          "lg:sticky lg:top-0 lg:z-0 lg:h-screen lg:w-60 lg:shrink-0 lg:translate-x-0",
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

        <div className="mt-auto border-t border-border px-4 py-4 sm:px-5">
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
          <form action={signOut} className="mt-2">
            <Button variant="secondary" size="sm" icon={LogOut} type="submit" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <main className="flex min-w-0 min-h-screen flex-1 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-0">
        <div className="hidden items-center justify-end gap-3 border-b border-border bg-surface px-5 py-2.5 lg:flex">
          <LocationSwitcher />
        </div>
        <LocationMutationsBanner />
        <div className="flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">{children}</div>

        <footer className="mt-auto border-t border-border px-3 py-3 sm:px-4 lg:px-5">
          <div className="flex flex-wrap items-center justify-center gap-2 text-caption text-ink-muted">
            <img
              src="/logo.png"
              alt=""
              className="size-5 shrink-0 object-contain"
            />
            <span>
              Powered by:{" "}
              <a
                href="mailto:doubleadigitalsolutions@gmail.com"
                className="text-ink-muted underline decoration-border underline-offset-2 transition-colors hover:text-ink hover:decoration-ink-muted"
              >
                doubleadigitalsolutions@gmail.com
              </a>
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
