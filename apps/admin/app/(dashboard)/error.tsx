"use client";

import { ErrorFallback } from "@/components/error-fallback";

/** Catches a crash anywhere under the shop dashboard, including (dashboard)/layout.tsx itself. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} />;
}
