"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";
import { useExitCompany } from "@/lib/query/companies";

export function ImpersonationBanner({ storeName }: { storeName: string }) {
  const exitCompany = useExitCompany();

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-md border border-accent bg-accent-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-body text-accent-ink">
        Viewing <span className="font-semibold">{storeName}</span> as superadmin.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={ArrowLeft}
        loading={exitCompany.isPending}
        onClick={() => exitCompany.mutate()}
      >
        Exit to platform
      </Button>
    </div>
  );
}
