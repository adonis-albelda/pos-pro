"use client";

import { ErrorFallback } from "@/components/error-fallback";
import "./globals.css";

/**
 * Root-layout-level crash (RootLayout itself throwing) — Next requires this
 * to render its own <html>/<body> since the real layout never mounted.
 * The only case none of the other error.tsx boundaries can catch.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorFallback error={error} reset={reset} />
      </body>
    </html>
  );
}
