"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCw } from "lucide-react";
import { Button } from "@/components/ui";

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
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <Image src="/logo.png" alt="" width={48} height={48} className="size-12 object-contain" />
        <p className="font-display text-display font-bold tracking-wide text-primary">SORRY</p>
        <div className="space-y-1.5">
          <p className="text-heading-sm font-semibold text-ink">Something went wrong loading this page</p>
          <p className="text-body text-ink-muted">
            That&apos;s on us, not you. Try reloading — if it keeps happening, let an admin know.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => router.back()}>
            Go Back
          </Button>
          <Button icon={RotateCw} onClick={reset}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
