"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, PackageCheck } from "lucide-react";
import type { GoodsReceiptItem } from "@double-a/api-client/queries";
import { formatQuantity, roundMoney } from "@double-a/shared-types";
import { formatStoreDay, storeDayOf } from "@/lib/date-range";
import { Badge, Card, CardHeader, EmptyState, Money, Table, Td, Th } from "@/components/ui";
import { useGoodsReceipt } from "@/lib/query/goods-receipts";
import { useLocations } from "@/lib/query/locations";
import { useSuppliers } from "@/lib/query/suppliers";
import { ReceiptPhotoDialog } from "../receipt-photo-dialog";
import { receiptHasCountDiscrepancy } from "../receiving-discrepancy";

function ItemStatusBadge({ item }: { item: GoodsReceiptItem }) {
  if (!item.productId) {
    return <Badge tone="neutral">New product</Badge>;
  }
  return <Badge tone="success">Existing product</Badge>;
}

export default function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const receiptQuery = useGoodsReceipt(id);
  const locationsQuery = useLocations({ type: "branch" });
  const suppliersQuery = useSuppliers();

  const loading = receiptQuery.isPending || locationsQuery.isPending || suppliersQuery.isPending;
  const receipt = receiptQuery.data;

  if (loading) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (receiptQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {receiptQuery.error instanceof Error
          ? receiptQuery.error.message
          : "Could not load this receipt."}
      </Card>
    );
  }

  if (!receipt) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">Receipt not found.</Card>
    );
  }

  const locationName =
    (locationsQuery.data ?? []).find((location) => location.id === receipt.locationId)?.name ??
    "—";
  const supplierLabel =
    receipt.supplierName?.trim() ||
    (receipt.supplierId
      ? ((suppliersQuery.data ?? []).find((supplier) => supplier.id === receipt.supplierId)?.name ??
        "—")
      : "Received delivery");
  const receivedDay = formatStoreDay(storeDayOf(receipt.receivedAt));
  const receivedTime = new Date(receipt.receivedAt).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const totalAmount = roundMoney(
    receipt.items.reduce((sum, item) => sum + item.quantityReceived * item.unitCost, 0),
  );

  return (
    <div className="space-y-6">
      <Link
        href={"/receiving" as Route}
        className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to receive orders
      </Link>

      <Card>
        <CardHeader
          icon={PackageCheck}
          title={supplierLabel}
          description={[receivedDay, locationName, receipt.referenceNo ? `Ref ${receipt.referenceNo}` : null]
            .filter(Boolean)
            .join(" · ")}
          action={
            receiptHasCountDiscrepancy(receipt) ? (
              <Badge tone="warning">Discrepancy</Badge>
            ) : (
              <Badge tone="success">Received</Badge>
            )
          }
        />

        <dl className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-2 sm:px-6">
          <div>
            <dt className="text-caption font-medium text-ink-muted">Received at</dt>
            <dd className="mt-0.5 text-body text-ink">{receivedTime}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-ink-muted">Branch</dt>
            <dd className="mt-0.5 text-body text-ink">{locationName}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-ink-muted">Reference</dt>
            <dd className="mt-0.5 text-body text-ink">{receipt.referenceNo ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-ink-muted">Purchase order</dt>
            <dd className="mt-0.5 text-body text-ink">
              {receipt.purchaseOrderId ? (
                <Link
                  href={`/purchase-orders/${receipt.purchaseOrderId}` as Route}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  View linked order
                  <ExternalLink size={14} className="shrink-0" />
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-caption font-medium text-ink-muted">Total amount</dt>
            <dd className="mt-0.5 text-body font-semibold text-ink">
              <Money value={totalAmount} />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-caption font-medium text-ink-muted">Notes</dt>
            <dd className="mt-0.5 text-body text-ink">{receipt.notes?.trim() || "—"}</dd>
          </div>
        </dl>

        {receipt.photoUrl ? (
          <div className="border-t border-border px-4 py-4 sm:px-6">
            <p className="text-caption font-medium text-ink-muted">Receipt photo</p>
            <button
              type="button"
              className="mt-2 cursor-zoom-in"
              onClick={() => setPhotoPreviewOpen(true)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={receipt.photoUrl}
                alt="Delivery receipt"
                className="max-h-64 rounded-md border border-border object-contain transition-opacity hover:opacity-90"
              />
            </button>
          </div>
        ) : null}
      </Card>

      <ReceiptPhotoDialog
        open={photoPreviewOpen}
        onClose={() => setPhotoPreviewOpen(false)}
        photoUrl={receipt.photoUrl}
      />

      <Card>
        <CardHeader
          icon={PackageCheck}
          title="Line items"
          description={`${receipt.items.length} item${receipt.items.length === 1 ? "" : "s"} on this receipt`}
        />

        {receipt.items.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="No line items"
            instruction="This receipt has no recorded items."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Status</Th>
                <Th numeric>Qty received</Th>
                <Th numeric>Ordered</Th>
                <Th numeric>Cost</Th>
                <Th numeric>Shelf price</Th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={item.id}>
                  <Td>
                    <p className="font-medium text-ink">{item.name}</p>
                    {item.sku ? (
                      <p className="mt-0.5 text-caption text-ink-muted">{item.sku}</p>
                    ) : null}
                    {item.note?.trim() ? (
                      <p className="mt-1 text-caption text-ink-muted">{item.note}</p>
                    ) : null}
                    {item.productId ? (
                      <Link
                        href={`/products/${item.productId}` as Route}
                        className="mt-1 inline-flex items-center gap-1 text-caption text-primary hover:underline"
                      >
                        View product
                        <ExternalLink size={12} className="shrink-0" />
                      </Link>
                    ) : null}
                  </Td>
                  <Td>
                    <ItemStatusBadge item={item} />
                    {item.isFlagged ? (
                      <p className="mt-1 text-caption text-warning-ink">Flagged</p>
                    ) : null}
                  </Td>
                  <Td numeric>{formatQuantity(item.quantityReceived)}</Td>
                  <Td numeric>
                    {item.quantityOrdered !== null ? formatQuantity(item.quantityOrdered) : "—"}
                  </Td>
                  <Td numeric>
                    <Money value={item.unitCost} />
                  </Td>
                  <Td numeric>
                    {item.appliedPrice !== null ? <Money value={item.appliedPrice} /> : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
