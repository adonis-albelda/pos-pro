import { KeyRound } from "lucide-react";
import { requireSuperadmin } from "@/lib/platform";
import { PageHeader } from "@/components/ui";
import { DemoAccessPageClient } from "./demo-access-page-client";

/**
 * Thin Server Component so the superadmin-only gate runs before any of the
 * client bundle/data below it ever mounts — same split as /platform itself.
 */
export default async function DemoAccessPage() {
  await requireSuperadmin();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={KeyRound}
        title="Demo access codes"
        description="One-time codes for the demo@store.com account. Generate one and send it to a prospect yourself — nothing here delivers it for you."
      />
      <DemoAccessPageClient />
    </div>
  );
}
