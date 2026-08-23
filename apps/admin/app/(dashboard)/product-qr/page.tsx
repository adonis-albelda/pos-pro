"use client";

import { QrCode } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { ProductQrPageClient } from "./product-qr-page-client";

export default function ProductQrPage() {
  return (
    <AdminGate
      icon={QrCode}
      title="Product QR codes"
      forbiddenTitle="Product QR codes are for the owner's account"
      instruction="Only an admin can generate printable SKU sheets."
    >
      <ProductQrPageClient />
    </AdminGate>
  );
}
