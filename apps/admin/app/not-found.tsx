"use client";

import { Home, SearchX } from "lucide-react";
import { ButtonLink } from "@/components/ui";

/**
 * Root catch — any URL with no matching route, anywhere in the app. Flat,
 * no card/white bg, same house style as error.tsx's ErrorFallback (which
 * this deliberately doesn't reuse — a 404 isn't a crash, so no `reset()`
 * and no console.error to make here).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex size-24 items-center justify-center rounded-full bg-primary-soft">
          <SearchX size={48} strokeWidth={1.5} className="text-primary" />
        </div>
        <p className="font-display text-display font-bold tracking-wide text-primary">404</p>
        <div className="space-y-1.5">
          <p className="text-heading-sm font-semibold text-ink">This page could not be found</p>
          <p className="text-body text-ink-muted">
            Check the address, or head back to somewhere that exists.
          </p>
        </div>
        <div className="pt-2">
          <ButtonLink href="/" icon={Home} variant="primary">
            Go Home
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
