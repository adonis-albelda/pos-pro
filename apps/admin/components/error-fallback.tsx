"use client";

import { useEffect } from "react";
import { RotateCw, ServerCrash } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";

/**
 * Shared body for every `error.tsx` in the app — root, and one per route
 * group ((dashboard), (platform)) so a crash is always caught by the
 * boundary closest to it rather than relying on it bubbling all the way to
 * root. Next only wires an error.tsx to the segments below it, not the
 * layout it sits beside (that gap is what global-error.tsx covers), so each
 * top-level route group gets its own copy of this rather than one shared
 * instance further up the tree.
 */
export function ErrorFallback({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <EmptyState
          icon={ServerCrash}
          title="Something went wrong loading this page"
          instruction="That's on us, not you. Try reloading — if it keeps happening, let an admin know."
          action={
            <Button icon={RotateCw} onClick={reset}>
              Reload
            </Button>
          }
        />
      </Card>
    </div>
  );
}
