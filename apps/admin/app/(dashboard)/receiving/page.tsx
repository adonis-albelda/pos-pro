"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { Card, PageHeader } from "@/components/ui";
import { useSuppliers } from "@/lib/query/suppliers";
import { useLocations } from "@/lib/query/locations";
import { usePurchaseOrder, usePurchaseOrders } from "@/lib/query/purchase-orders";
import { useLocationFilter } from "@/components/location-filter-provider";
import { ReceivingForm } from "./receiving-form";
import { ReceivingFollowUpBanner } from "./receiving-follow-up-banner";
import { consumeReceivingFollowUp, type ReceivingFollowUp } from "./receiving-follow-up";

function ReceivingPageClient() {
  const searchParams = useSearchParams();
  const [purchaseOrderId, setPurchaseOrderId] = useState(
    searchParams.get("purchase_order_id") ?? "",
  );
  const [followUp, setFollowUp] = useState<ReceivingFollowUp | null>(null);
  const { locationId: currentLocationFilter } = useLocationFilter();

  useEffect(() => {
    setFollowUp(consumeReceivingFollowUp());
  }, []);

  const suppliersQuery = useSuppliers();
  const locationsQuery = useLocations({ type: "branch" });
  // The "Link to purchase order" dropdown only ever offers what's still
  // open to receive against — draft (not sent yet) and received/cancelled
  // orders have nothing left to deliver.
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
        <PageHeader icon={PackageCheck} title="Receive orders" />
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader icon={PackageCheck} title="Receive orders" />
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
        title="Receive orders"
        description={
          linkedOrder
            ? "Log what actually arrived against this purchase order — restocks inventory and can adjust prices."
            : "Log a delivery — from a supplier, with or without a purchase order — and restock inventory."
        }
      />
      {followUp ? (
        <ReceivingFollowUpBanner followUp={followUp} onDismiss={() => setFollowUp(null)} />
      ) : null}
      <ReceivingForm
        suppliers={suppliersQuery.data ?? []}
        locations={locationsQuery.data ?? []}
        openPurchaseOrders={openOrdersQuery.data ?? []}
        purchaseOrderId={purchaseOrderId}
        onSelectPurchaseOrder={setPurchaseOrderId}
        linkedOrder={linkedOrder}
        defaultLocationId={currentLocationFilter}
        onReceiptSaved={setFollowUp}
      />
    </div>
  );
}

export default function ReceivingPage() {
  return (
    <AdminGate
      icon={PackageCheck}
      title="Receive orders"
      forbiddenTitle="Receiving is for the owner's account"
      instruction="Only an admin can log a delivery."
    >
      <ReceivingPageClient />
    </AdminGate>
  );
}
