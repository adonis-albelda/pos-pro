"use client";

import { ClipboardList } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { PurchaseOrdersPageClient } from "./purchase-orders-page-client";

export default function PurchaseOrdersPage() {
  return (
    <AdminGate
      icon={ClipboardList}
      title="Purchase orders"
      forbiddenTitle="Purchase orders are for the owner's account"
      instruction="Only an admin can manage suppliers and purchase orders."
    >
      <PurchaseOrdersPageClient />
    </AdminGate>
  );
}
