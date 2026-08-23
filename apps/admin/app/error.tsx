"use client";

import { useEffect } from "react";
import { RotateCw, ServerCrash } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";

/**
 * Catches a render/data-loading crash anywhere under the root layout and
 * replaces Next's bare "Internal Server Error" response with something a
 * cashier or owner can actually act on. `reset()` re-renders this segment —
 * the framework's built-in retry, not a full navigation.
 */
export default function Error({
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
