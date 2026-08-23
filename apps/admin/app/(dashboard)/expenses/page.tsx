"use client";

import { Wallet } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { ExpensesPageClient } from "./expenses-page-client";

export default function ExpensesPage() {
  return (
    <AdminGate
      icon={Wallet}
      title="Expenses"
      forbiddenTitle="Expenses are for the owner's account"
      instruction="Only an admin can log outlays and see them on the books."
    >
      <ExpensesPageClient />
    </AdminGate>
  );
}
