"use client";

import { ChartColumn } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { ReportsPageClient } from "./reports-page-client";

export default function ReportsPage() {
  return (
    <AdminGate
      icon={ChartColumn}
      title="Reports"
      forbiddenTitle="Reports are for the owner's account"
      instruction="Profit, supplier cost and margin are only shown to an admin. Ask the owner to sign in."
    >
      <ReportsPageClient />
    </AdminGate>
  );
}
