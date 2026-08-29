"use client";

import { Truck } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { NewSupplierPageClient } from "./new-supplier-page-client";

export default function NewSupplierPage() {
  return (
    <AdminGate
      icon={Truck}
      title="New supplier"
      forbiddenTitle="Suppliers are for the owner's account"
      instruction="Only an admin can add a supplier."
    >
      <NewSupplierPageClient />
    </AdminGate>
  );
}
