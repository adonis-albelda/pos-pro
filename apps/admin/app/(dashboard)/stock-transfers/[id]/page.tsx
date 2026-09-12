"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, PackageCheck, X } from "lucide-react";
import { formatQuantity } from "@double-a/shared-types";
import type { StockTransfer } from "@double-a/shared-types";
import { receiveStockTransfer, updateStockTransfer } from "@double-a/api-client/queries";
import { ApiError } from "@double-a/api-client";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ConfirmDialog, Dialog } from "@/components/overlay";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { useInvalidateLocations, useStockTransfer } from "@/lib/query/locations";

const STATUS_LABEL: Record<StockTransfer["status"], string> = {
  pending: "Draft",
  in_transit: "In transit",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

function statusTone(status: StockTransfer["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "received") return "success";
  if (status === "cancelled") return "neutral";
  return "warning";
}

function itemStatus(item: StockTransfer["items"][number]): { label: string; tone: "success" | "warning" | "neutral" } {
  if (item.quantityRemaining <= 0) return { label: "Complete", tone: "success" };
  if (item.quantityReceived > 0) return { label: "Partial", tone: "warning" };
  return { label: "Not received", tone: "neutral" };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const firstFieldError = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return firstFieldError ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export default function StockTransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const invalidate = useInvalidateLocations();
  const transferQuery = useStockTransfer(id);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});

  const receiveMutation = useMutation({
    mutationFn: (lines: Array<{ itemId: string; quantityReceived: number }>) =>
      receiveStockTransfer(getBrowserApiClient(), id, lines),
    onSuccess: () => {
      toast.success("Received.");
      invalidate();
      transferQuery.refetch();
      setReceiveOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => updateStockTransfer(getBrowserApiClient(), id, { status: "cancelled" }),
    onSuccess: () => {
      toast.success("Transfer cancelled.");
      invalidate();
      transferQuery.refetch();
      setCancelOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const transfer = transferQuery.data;

  const remainingItems = useMemo(
    () => (transfer ? transfer.items.filter((item) => item.quantityRemaining > 0) : []),
    [transfer],
  );

  function openReceiveDialog() {
    if (!transfer) return;
    setReceiveQuantities(
      Object.fromEntries(remainingItems.map((item) => [item.id, String(item.quantityRemaining)])),
    );
    setReceiveOpen(true);
  }

  function submitReceive() {
    const lines = remainingItems
      .map((item) => ({ itemId: item.id, quantityReceived: Number(receiveQuantities[item.id]) || 0 }))
      .filter((line) => line.quantityReceived > 0);

    if (lines.length === 0) {
      toast.error("Enter a quantity to receive for at least one item.");
      return;
    }
    receiveMutation.mutate(lines);
  }

  if (transferQuery.isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (transferQuery.isError || !transfer) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {transferQuery.error instanceof Error ? transferQuery.error.message : "Transfer not found."}
      </Card>
    );
  }

  const label = `ST-${transfer.id.slice(0, 8).toUpperCase()}`;
  const canReceive = transfer.status !== "received" && transfer.status !== "cancelled" && remainingItems.length > 0;
  const canCancel = transfer.status !== "received" && transfer.status !== "cancelled";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" icon={ArrowLeft} onClick={() => router.push("/stock-transfers" as Route)}>
          Back
        </Button>
      </div>

      <PageHeader
        icon={PackageCheck}
        title={label}
        description={`${transfer.fromLocationName ?? "—"} → ${transfer.toLocationName ?? "—"}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="space-y-3 p-4 lg:col-span-1">
          <CardHeader title="Details" />
          <dl className="space-y-2 text-body">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Status</dt>
              <dd><Badge tone={statusTone(transfer.status)}>{STATUS_LABEL[transfer.status]}</Badge></dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Transfer date</dt>
              <dd>{new Date(transfer.createdAt).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Created by</dt>
              <dd>{transfer.createdByName ?? "—"}</dd>
            </div>
            {transfer.receivedAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-muted">Received at</dt>
                <dd>{new Date(transfer.receivedAt).toLocaleString()}</dd>
              </div>
            ) : null}
            {transfer.notes ? (
              <div className="border-t border-border pt-2">
                <dt className="mb-1 text-ink-muted">Notes</dt>
                <dd className="whitespace-pre-wrap text-ink">{transfer.notes}</dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {canReceive ? (
              <Button type="button" size="sm" icon={PackageCheck} onClick={openReceiveDialog}>
                Receive items
              </Button>
            ) : null}
            <a href={`/api/stock-transfers/${transfer.id}/pdf`}>
              <Button type="button" variant="secondary" size="sm" icon={Download}>
                Print / PDF
              </Button>
            </a>
            {canCancel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                onClick={() => setCancelOpen(true)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Items" description="Transferred, received, and what's left." />
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th numeric>Transferred</Th>
                  <Th numeric>Received</Th>
                  <Th numeric>Remaining</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {transfer.items.map((item) => {
                  const status = itemStatus(item);
                  return (
                    <tr key={item.id}>
                      <Td>
                        <p className="font-medium text-ink">{item.productName ?? "Product"}</p>
                        {item.sku ? <p className="text-caption text-ink-muted">{item.sku}</p> : null}
                      </Td>
                      <Td numeric>{formatQuantity(item.quantity)}</Td>
                      <Td numeric>{formatQuantity(item.quantityReceived)}</Td>
                      <Td numeric>{formatQuantity(item.quantityRemaining)}</Td>
                      <Td><Badge tone={status.tone}>{status.label}</Badge></Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Receiving history" />
            {transfer.receipts.length === 0 ? (
              <p className="px-4 py-6 text-body text-ink-muted">Nothing received yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {transfer.receipts.map((receipt, index) => {
                  const total = receipt.items.reduce((sum, line) => sum + line.quantityReceived, 0);
                  return (
                    <li key={receipt.id} className="px-4 py-3">
                      <p className="font-medium text-ink">Receiving #{index + 1}</p>
                      <p className="text-caption text-ink-muted">
                        {receipt.receivedAt ? new Date(receipt.receivedAt).toLocaleString() : "—"} ·{" "}
                        {formatQuantity(total)} units
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Dialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title="Receive items"
        description="Only the remaining quantity per item can be received."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" loading={receiveMutation.isPending} onClick={submitReceive}>
              Receive
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {remainingItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{item.productName ?? "Product"}</p>
                <p className="text-caption text-ink-muted">
                  Remaining {formatQuantity(item.quantityRemaining)}
                </p>
              </div>
              <Input
                type="number"
                min="0"
                max={item.quantityRemaining}
                step="any"
                className="w-28"
                value={receiveQuantities[item.id] ?? ""}
                onChange={(event) => {
                  const raw = Number(event.target.value) || 0;
                  const clamped = Math.min(Math.max(0, raw), item.quantityRemaining);
                  setReceiveQuantities((previous) => ({
                    ...previous,
                    [item.id]: event.target.value === "" ? "" : String(clamped),
                  }));
                }}
              />
            </div>
          ))}
        </div>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancel this transfer?"
        description="Whatever has already been received stays received — only the remaining, unreceived quantity is cancelled."
        confirmLabel="Cancel transfer"
      />
    </div>
  );
}
