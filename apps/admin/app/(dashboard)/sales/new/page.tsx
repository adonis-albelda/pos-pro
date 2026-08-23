"use client";

import { Receipt } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { PageHeader } from "@/components/ui";
import { CreateSaleForm } from "./create-sale-form";

/**
 * A sale rung up here is office-only: an admin taking a phone order, never
 * something a POS terminal does — the mobile POS still only ever creates a
 * sale through its own offline cart and sync push (CLAUDE.md §3).
 */
export default function NewSalePage() {
  return (
    <AdminGate
      icon={Receipt}
      title="New sale"
      forbiddenTitle="Sales are created by the owner's account here"
      instruction="Only an admin can ring up a sale from the dashboard."
    >
      <div className="space-y-6">
        <PageHeader
          icon={Receipt}
          title="New sale"
          description="A sale rung up directly in the office — e.g. a phone order — not from a POS terminal."
        />
        <CreateSaleForm />
      </div>
    </AdminGate>
  );
}
