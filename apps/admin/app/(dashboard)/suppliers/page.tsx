"use client";

import { Truck } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { SuppliersPageClient } from "./suppliers-page-client";

export default function SuppliersPage() {
  return (
    <AdminGate
      icon={Truck}
      title="Suppliers"
      forbiddenTitle="Suppliers are for the owner's account"
      instruction="Only an admin can manage suppliers and purchase orders."
    >
      <SuppliersPageClient />
    </AdminGate>
  );
}
