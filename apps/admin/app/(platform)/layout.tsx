"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PlatformShell } from "@/components/platform-shell";
import { hasBrowserSession } from "@/lib/api/browser-client";
import { isSuperadmin } from "@/lib/authz";
import { useCurrentUser } from "@/lib/query/session";

/**
 * Client replacement for requireSuperadmin() layout gate. proxy.ts already
 * steers shop admins off /platform and bare superadmins onto it; this is the
 * in-tree check so PlatformShell never mounts with a non-superadmin session
 * (same role as AdminGate on shop pages). User profile for the shell comes
 * from useCurrentUser() / GET /auth/me — no server cookie hop.
 */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: user, isPending, isFetched } = useCurrentUser();

  useEffect(() => {
    if (!hasBrowserSession()) {
      router.replace("/login");
      return;
    }
    if (isFetched && !isSuperadmin(user)) {
      router.replace("/");
    }
  }, [isFetched, user, router]);

  if (isPending || !isSuperadmin(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-body text-ink-muted">
        Loading…
      </div>
    );
  }

  const initials = (user.name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <PlatformShell
      userName={user.name ?? null}
      userEmail={user.email ?? null}
      initials={initials}
    >
      {children}
    </PlatformShell>
  );
}
