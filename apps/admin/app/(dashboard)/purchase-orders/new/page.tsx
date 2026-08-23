"use client";

import { ClipboardList } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { NewPurchaseOrderPageClient } from "./new-purchase-order-page-client";

export default function NewPurchaseOrderPage() {
  return (
    <AdminGate
      icon={ClipboardList}
      title="New purchase order"
      forbiddenTitle="Purchase orders are for the owner's account"
      instruction="Only an admin can create a purchase order."
    >
      <NewPurchaseOrderPageClient />
    </AdminGate>
  );
}
