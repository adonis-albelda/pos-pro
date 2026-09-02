"use client";

import { useSearchParams } from "next/navigation";
import { ClipboardList, TriangleAlert } from "lucide-react";
import { storeToday } from "@/lib/date-range";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { CreatePurchaseOrderForm } from "./create-po-form";
import { useSuppliers } from "@/lib/query/suppliers";

export function NewPurchaseOrderPageClient() {
  const searchParams = useSearchParams();
  const supplier = searchParams.get("supplier") ?? undefined;

  // Suppliers only — product catalogue loads on demand in the line picker
  // (paginated search), not a full listProducts walk that can hang for minutes.
  const suppliersQuery = useSuppliers();

  if (suppliersQuery.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader icon={ClipboardList} title="New purchase order" />
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      </div>
    );
  }

  if (suppliersQuery.error) {
    return (
      <div className="space-y-6">
        <PageHeader icon={ClipboardList} title="New purchase order" />
        <Card className="px-4 py-8 text-center text-body text-danger">
          {suppliersQuery.error instanceof Error
            ? suppliersQuery.error.message
            : "Could not load suppliers."}
        </Card>
      </div>
    );
  }

  const suppliers = suppliersQuery.data ?? [];

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
        description="Add line items and, if the supplier expects installments, a payment schedule."
      />
      <CreatePurchaseOrderForm
        suppliers={suppliers}
        defaultSupplierId={supplier}
        defaultOrderDate={storeToday()}
      />
    </div>
  );
}
