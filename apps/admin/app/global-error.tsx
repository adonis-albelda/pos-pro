"use client";

import { useEffect } from "react";
import { RotateCw, ServerCrash } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import "./globals.css";

/**
 * Root-layout-level crash (RootLayout itself throwing) — Next requires this
 * to render its own <html>/<body> since the real layout never mounted.
 * Same treatment as error.tsx, kept as the last-resort fallback for the
 * one case error.tsx can't catch.
 */
export default function GlobalError({
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
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <EmptyState
              icon={ServerCrash}
              title="Something went wrong loading the app"
              instruction="That's on us, not you. Try reloading — if it keeps happening, let an admin know."
              action={
                <Button icon={RotateCw} onClick={reset}>
                  Reload
                </Button>
              }
            />
          </Card>
        </div>
      </body>
    </html>
  );
}
