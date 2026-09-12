"use client";

import { useSearchParams } from "next/navigation";
import { ClipboardList, TriangleAlert } from "lucide-react";
import { storeToday } from "@/lib/date-range";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { CreatePurchaseOrderForm } from "./create-po-form";
import { useSuppliers } from "@/lib/query/suppliers";
import { useLocations } from "@/lib/query/locations";
import { useLocationFilter } from "@/components/location-filter-provider";

export function NewPurchaseOrderPageClient() {
  const searchParams = useSearchParams();
  const supplier = searchParams.get("supplier") ?? undefined;
  const { locationId: currentLocationFilter } = useLocationFilter();

  // Suppliers only — product catalogue loads on demand in the line picker
  // (paginated search), not a full listProducts walk that can hang for minutes.
  const suppliersQuery = useSuppliers();
  const locationsQuery = useLocations({ type: "branch" });

  if (suppliersQuery.isPending || locationsQuery.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader icon={ClipboardList} title="New purchase order" />
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      </div>
    );
  }

  const loadError = suppliersQuery.error ?? locationsQuery.error;
  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader icon={ClipboardList} title="New purchase order" />
        <Card className="px-4 py-8 text-center text-body text-danger">
          {loadError instanceof Error ? loadError.message : "Could not load this page."}
        </Card>
      </div>
    );
  }

  const suppliers = suppliersQuery.data ?? [];
  const locations = locationsQuery.data ?? [];

  if (suppliers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader icon={ClipboardList} title="New purchase order" />
        <Card>
          <EmptyState
            icon={TriangleAlert}
            title="Add a supplier first"
            instruction="A purchase order needs a supplier to order from."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ClipboardList}
        title="New purchase order"
        description="Pick a supplier and location, then add line items."
      />
      <CreatePurchaseOrderForm
        suppliers={suppliers}
        locations={locations}
        defaultSupplierId={supplier}
        defaultLocationId={currentLocationFilter ?? undefined}
        defaultOrderDate={storeToday()}
      />
    </div>
  );
}
