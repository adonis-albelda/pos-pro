"use client";

import { ErrorFallback } from "@/components/error-fallback";

/** Catches a crash anywhere under the superadmin platform console, including (platform)/layout.tsx itself. */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} />;
}
