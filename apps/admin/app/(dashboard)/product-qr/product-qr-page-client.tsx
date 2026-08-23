"use client";

import { useMemo } from "react";
import { QrCode } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ProductQrPanel } from "./product-qr-panel";
import { useProductLabels } from "@/lib/query/products";

export function ProductQrPageClient() {
  const labelsQuery = useProductLabels();

  const withSku = useMemo(
    () =>
      (labelsQuery.data ?? [])
        .filter((product) => product.sku.trim())
        .map((product) => ({
          id: product.id,
          sku: product.sku.trim(),
          name: product.name,
          category: product.category,
          categoryId: product.categoryId,
        })),
    [labelsQuery.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={QrCode}
        title="Product QR & barcode labels"
        description="Print a sheet of SKU codes for the counter scanner. One page, A4 or Legal."
      />

      {labelsQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : labelsQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {labelsQuery.error instanceof Error
            ? labelsQuery.error.message
            : "Could not load products."}
        </Card>
      ) : withSku.length === 0 ? (
        <Card>
          <EmptyState
            icon={QrCode}
            title="No products with a SKU"
            instruction="Add a SKU on each product first — the code encodes that value."
          />
        </Card>
      ) : (
        <ProductQrPanel products={withSku} />
      )}
    </div>
  );
}
