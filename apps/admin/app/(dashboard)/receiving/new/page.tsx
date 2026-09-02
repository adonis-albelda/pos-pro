"use client";

import { PackageCheck } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { NewReceivingPageClient } from "./new-receiving-page-client";

export default function NewReceivingPage() {
  return (
    <AdminGate
      icon={PackageCheck}
      title="New receive order"
      forbiddenTitle="Receiving is for the owner's account"
      instruction="Only an admin can log a delivery."
    >
      <NewReceivingPageClient />
    </AdminGate>
  );
}
