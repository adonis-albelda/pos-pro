"use client";

import { ArrowLeft } from "lucide-react";
import { exitCompany } from "@/app/(platform)/platform/actions";
import { Button } from "@/components/ui";

export function ImpersonationBanner({ storeName }: { storeName: string }) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-md border border-accent bg-accent-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body text-accent-ink">
        Viewing <span className="font-semibold">{storeName}</span> as superadmin.
      </p>
      <form action={exitCompany}>
        <Button type="submit" variant="secondary" size="sm" icon={ArrowLeft}>
          Exit to platform
        </Button>
      </form>
    </div>
  );
}
