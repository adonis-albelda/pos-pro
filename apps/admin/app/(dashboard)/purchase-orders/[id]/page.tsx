"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Boxes, FileDown, ListOrdered, Wallet } from "lucide-react";
import {
  formatMoney,
  formatQuantity,
  PURCHASE_ORDER_STATUS_LABELS,
  poItemReceiveState,
  purchaseOrderBalance,
} from "@double-a/shared-types";
import { getSupplier } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "@/lib/query/keys";
import { usePurchaseOrder, usePurchaseOrderMovements } from "@/lib/query/purchase-orders";
import { PO_STATUS_TONE } from "@/lib/purchase-order-status";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Money,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ReceiveLineForm } from "./receive-line-form";
import { PaymentStatusButton, UpdateStatusButton } from "./status-actions";

const RECEIVE_STATE_BADGE = {
  pending: { tone: "neutral" as const, label: "Not received" },
  partial: { tone: "warning" as const, label: "Partially received" },
  received: { tone: "success" as const, label: "Received" },
};

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();

  const orderQuery = usePurchaseOrder(id);
  const order = orderQuery.data;

  // GAP: PurchaseOrderResource carries no supplier name (see
  // queries/purchase-orders.ts). No lib/query/suppliers.ts hook exists yet
  // (being built in parallel) — inline against getSupplier directly rather
  // than block on it. Only runs once the order (and its supplierId) is loaded.
  const supplierQuery = useQuery({
    queryKey: queryKeys.suppliers.detail(order?.supplierId ?? ""),
    queryFn: () => getSupplier(getBrowserApiClient(), order!.supplierId),
    enabled: Boolean(order?.supplierId),
  });

  // GAP: IndexInventoryMovementsController has no `reference_id` filter (see
  // queries/inventory.ts) — usePurchaseOrderMovements walks recent shop-wide
  // movements looking for this order's, capped rather than a full unbounded scan.
  const movementsQuery = usePurchaseOrderMovements(id);

  if (orderQuery.isPending || movementsQuery.isPending || (order && supplierQuery.isPending)) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (orderQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {orderQuery.error instanceof Error
          ? orderQuery.error.message
          : "Could not load this purchase order."}
      </Card>
    );
  }

  if (!order) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        Purchase order not found.
      </Card>
    );
  }

  const supplier = supplierQuery.data;
  const movements = movementsQuery.data ?? [];
  const balance = purchaseOrderBalance(order.payments);
  const canReceive = order.status === "ordered" || order.status === "partially_received";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={"/purchase-orders" as Route}
            className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} />
            Back to purchase orders
          </Link>
          <h1 className="mt-2 text-heading-md font-semibold sm:text-heading-lg">
            <Link
              href={`/suppliers/${order.supplierId}` as Route}
              className="text-primary hover:underline"
            >
              {supplier?.name ?? "Supplier"}
            </Link>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink-muted">
            <span>Ordered {order.orderDate}</span>
            {order.expectedDate ? <span>Expected {order.expectedDate}</span> : null}
            {order.referenceNo ? <span className="num">Ref {order.referenceNo}</span> : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink
            href={`/api/purchase-orders/${order.id}/pdf`}
            icon={FileDown}
            size="sm"
            download
          >
            Generate PDF
          </ButtonLink>
          {order.status === "draft" ? (
            <UpdateStatusButton id={order.id} status="ordered" label="Mark as ordered" />
          ) : null}
          {order.status === "draft" || order.status === "ordered" ? (
            <UpdateStatusButton
              id={order.id}
              status="cancelled"
              label="Cancel order"
              variant="secondary"
            />
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <Badge tone={PO_STATUS_TONE[order.status]}>
          {PURCHASE_ORDER_STATUS_LABELS[order.status]}
        </Badge>
      </div>

      {order.notes ? (
        <Card>
          <CardHeader icon={ListOrdered} title="Notes" />
          <p className="px-4 py-4 text-body text-ink-muted sm:px-6">{order.notes}</p>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          icon={ListOrdered}
          title="Line items"
          description={
            order.status === "draft"
              ? "Sent to the supplier once you mark this order as ordered."
              : canReceive
                ? "Record what actually shows up — partial deliveries are fine."
                : "Every line has been received."
          }
        />
        {order.items.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="No line items"
            instruction="This order has no products on it."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th numeric>Ordered</Th>
                <Th numeric>Received</Th>
                <Th numeric>Unit cost</Th>
                <Th numeric>Line total</Th>
                <Th>State</Th>
                {canReceive ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => {
                const state = poItemReceiveState(item);
                const remaining = item.quantityOrdered - item.quantityReceived;
                const badge = RECEIVE_STATE_BADGE[state];

                return (
                  <tr key={item.id}>
                    <Td className="font-medium">{item.productName}</Td>
                    <Td numeric>{formatQuantity(item.quantityOrdered)}</Td>
                    <Td numeric>{formatQuantity(item.quantityReceived)}</Td>
                    <Td numeric>
                      <Money value={item.unitCost} />
                    </Td>
                    <Td numeric>
                      <Money value={item.lineTotal} className="font-semibold" />
                    </Td>
                    <Td>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </Td>
                    {canReceive ? (
                      <Td>
                        {remaining > 0 ? (
                          <ReceiveLineForm
                            itemId={item.id}
                            purchaseOrderId={order.id}
                            productId={item.productId}
                            currentReceived={item.quantityReceived}
                            remaining={remaining}
                          />
                        ) : null}
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="ledger-line mx-4 sm:mx-6" />
        <div className="flex items-baseline justify-between px-4 py-4 sm:px-6">
          <span className="text-body font-medium tracking-wide uppercase">Total</span>
          <Money value={order.totalAmount} className="text-heading-md font-semibold" />
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={Wallet}
          title="Payment terms"
          description={
            order.payments.length === 0
              ? "No installments recorded — mark the whole order paid whenever it settles."
              : `${formatMoney(balance)} still owed across unpaid terms.`
          }
        />
        {order.payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payment terms"
            instruction="This order has no installment schedule."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Term</Th>
                <Th>Due date</Th>
                <Th numeric>Amount</Th>
                <Th>State</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {order.payments
                .slice()
                .sort((a, b) => a.termNumber - b.termNumber)
                .map((term) => (
                  <tr key={term.id}>
                    <Td>#{term.termNumber}</Td>
                    <Td className="num text-ink-muted">{term.dueDate ?? "—"}</Td>
                    <Td numeric>
                      <Money value={term.amount} />
                    </Td>
                    <Td>
                      {term.isPaid ? (
                        <Badge tone="success">Paid</Badge>
                      ) : (
                        <Badge tone="warning">Unpaid</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        <PaymentStatusButton
                          paymentId={term.id}
                          purchaseOrderId={order.id}
                          isPaid={term.isPaid}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          icon={Boxes}
          title="Stock effect"
          description="What receiving this order did to inventory."
        />
        {movements.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="Nothing received yet"
            instruction="Movements appear here as lines are marked received."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th numeric>Change</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <Td className="num text-ink-muted">
                    {new Date(movement.createdAt).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Td>
                  <Td numeric className="font-semibold text-success">
                    +{movement.changeQuantity}
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
