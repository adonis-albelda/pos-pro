"use client";

import { Printer } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { ReceiptPageClient } from "./receipt-page-client";

export default function ReceiptLayoutPage() {
  return (
    <AdminGate
      icon={Printer}
      title="Receipt layout"
      forbiddenTitle="Receipt layout is for the owner's account"
      instruction="Only an admin can change what prints on the thermal receipt."
    >
      <ReceiptPageClient />
    </AdminGate>
  );
}
