"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Building2, KeyRound, LogOut, Menu, ToggleLeft, X } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui";

export function PlatformShell({
  userName,
  userEmail,
  initials,
  children,
}: {
  userName: string | null;
  userEmail: string | null;
  initials: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-surface pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-14 items-center gap-3 px-3">
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-ink transition-colors hover:bg-border/60 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
            aria-expanded={open}
            aria-controls="platform-sidebar"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
          </button>
          <Link href={"/platform" as Route} className="min-w-0 flex-1 truncate text-body font-semibold tracking-tight">
            Platform
          </Link>
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
        id="platform-sidebar"
        aria-label="Platform navigation"
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-[min(16.5rem,88vw)] flex-col border-r border-border bg-surface",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          "lg:sticky lg:top-0 lg:z-0 lg:h-screen lg:w-60 lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="hidden px-5 py-6 lg:block">
          <Link href={"/platform" as Route} className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary font-display text-body-lg font-bold text-white">
              P
            </span>
            <span className="min-w-0">
              <span className="block truncate text-body-lg font-semibold tracking-tight">
                Platform
              </span>
              <span className="block text-caption text-ink-muted">Superadmin</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-2">
          <Link
            href={"/platform" as Route}
            className={[
              "flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-body font-medium",
              pathname === "/platform" || pathname.startsWith("/platform/companies")
                ? "bg-primary/10 text-primary"
                : "text-ink hover:bg-border/60",
            ].join(" ")}
          >
            <Building2 size={18} strokeWidth={2} />
            Companies
          </Link>
          <Link
            href={"/platform/features" as Route}
            className={[
              "flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-body font-medium",
              pathname.startsWith("/platform/features")
                ? "bg-primary/10 text-primary"
                : "text-ink hover:bg-border/60",
            ].join(" ")}
          >
            <ToggleLeft size={18} strokeWidth={2} />
            Features
          </Link>
          <Link
            href={"/platform/demo-access" as Route}
            className={[
              "flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-body font-medium",
              pathname.startsWith("/platform/demo-access")
                ? "bg-primary/10 text-primary"
                : "text-ink hover:bg-border/60",
            ].join(" ")}
          >
            <KeyRound size={18} strokeWidth={2} />
            Demo access
          </Link>
        </nav>

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
          <form action={signOut} className="mt-3">
            <Button variant="secondary" size="sm" icon={LogOut} type="submit" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <main className="flex min-h-screen min-w-0 flex-1 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-0">
        <div className="flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">{children}</div>
      </main>
    </div>
  );
}
