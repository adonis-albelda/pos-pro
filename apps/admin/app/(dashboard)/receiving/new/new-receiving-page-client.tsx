"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { useSuppliers } from "@/lib/query/suppliers";
import { useLocations } from "@/lib/query/locations";
import { usePurchaseOrder, usePurchaseOrders } from "@/lib/query/purchase-orders";
import { useLocationFilter } from "@/components/location-filter-provider";
import { ReceivingForm } from "../receiving-form";

export function NewReceivingPageClient() {
  const searchParams = useSearchParams();
  const [purchaseOrderId, setPurchaseOrderId] = useState(
    searchParams.get("purchase_order_id") ?? "",
  );
  const { locationId: currentLocationFilter } = useLocationFilter();

  const suppliersQuery = useSuppliers();
  const locationsQuery = useLocations({ type: "branch" });
  const openOrdersQuery = usePurchaseOrders({ status: "ordered", limit: 100 });
  const orderQuery = usePurchaseOrder(purchaseOrderId);

  const isPending =
    suppliersQuery.isPending ||
    locationsQuery.isPending ||
    openOrdersQuery.isPending ||
    (Boolean(purchaseOrderId) && orderQuery.isPending);
  const error =
    suppliersQuery.error ?? locationsQuery.error ?? openOrdersQuery.error ?? orderQuery.error;

  if (isPending) {
    return (
      <div className="space-y-6">
        <PageHeader icon={PackageCheck} title="New receive order" />
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader icon={PackageCheck} title="New receive order" />
        <Card className="px-4 py-8 text-center text-body text-danger">
          {error instanceof Error ? error.message : "Could not load this page."}
        </Card>
      </div>
    );
  }

  const linkedOrder = purchaseOrderId ? (orderQuery.data ?? null) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={PackageCheck}
        title="New receive order"
        description={
          linkedOrder
            ? "Log what actually arrived against this purchase order — restocks inventory and can adjust prices."
            : "Log a delivery — from a supplier, with or without a purchase order — and restock inventory."
        }
      />
      <ReceivingForm
        suppliers={suppliersQuery.data ?? []}
        locations={locationsQuery.data ?? []}
        openPurchaseOrders={openOrdersQuery.data ?? []}
        purchaseOrderId={purchaseOrderId}
        onSelectPurchaseOrder={setPurchaseOrderId}
        linkedOrder={linkedOrder}
        defaultLocationId={currentLocationFilter}
      />
    </div>
  );
}
