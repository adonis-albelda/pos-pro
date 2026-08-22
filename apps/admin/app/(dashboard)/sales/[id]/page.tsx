"use client";

import type { Route } from "next";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Boxes,
  CreditCard,
  ListOrdered,
  Smartphone,
  UserRound,
} from "lucide-react";
import {
  hasCustomerDetails,
  lineProfit,
  roundMoney,
  saleCustomer,
} from "@double-a/shared-types";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Money,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { useSale, useSaleMovements } from "@/lib/query/sales";
import { VoidSale } from "./void-sale";
import { SaleFlags } from "./sale-flags";
import { ReplaceItem } from "./replace-item";

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const saleQuery = useSale(id);
  const movementsQuery = useSaleMovements(id);

  if (saleQuery.isPending || movementsQuery.isPending) {
    return (
      <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
    );
  }

  if (saleQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {saleQuery.error instanceof Error ? saleQuery.error.message : "Could not load sale."}
      </Card>
    );
  }

  const sale = saleQuery.data;
  if (!sale) notFound();

  const movements = movementsQuery.data ?? [];
  const customer = saleCustomer(sale);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/sales"
            className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} />
            Back to sales
          </Link>
          <h1 className="mt-2 text-heading-md font-semibold sm:text-heading-lg">
            Sale <span className="num text-heading-sm sm:text-heading-md">{id.slice(0, 8)}</span>
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-ink-muted">
            <span>
              {new Date(sale.createdAt).toLocaleString("en-PH", {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </span>
            {sale.deviceId ? (
              <span className="inline-flex items-center gap-1.5">
                <Smartphone size={14} />
                <span className="num">{sale.deviceId}</span>
              </span>
            ) : null}
          </p>
        </div>
        {sale.status === "completed" ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <VoidSale saleId={id} mode="test" />
            <VoidSale saleId={id} />
          </div>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-3">
        {sale.status === "completed" ? (
          <Badge tone="success">Completed</Badge>
        ) : sale.status === "voided" ? (
          <Badge tone="danger">Voided</Badge>
        ) : (
          <Badge tone="warning">Refunded</Badge>
        )}
        <Badge
          tone="neutral"
          icon={sale.paymentMethod === "card" ? CreditCard : Banknote}
        >
          {sale.paymentMethod ?? "payment not recorded"}
        </Badge>
        {sale.isPaid ? (
          <Badge tone="success">Paid</Badge>
        ) : (
          <Badge tone="warning">Unpaid</Badge>
        )}
        <Badge tone={sale.fulfillment === "delivery" ? "warning" : "neutral"}>
          {sale.fulfillment === "delivery"
            ? sale.deliveryCompleted
              ? "Delivery done"
              : "Delivery open"
            : "Pickup"}
        </Badge>
      </div>

      {sale.status === "completed" ? (
        <SaleFlags
          saleId={id}
          isPaid={sale.isPaid}
          fulfillment={sale.fulfillment}
          deliveryCompleted={sale.deliveryCompleted}
        />
      ) : null}

      {/* Absent on most sales, and absent from the page rather than shown empty:
          a walk-in was never asked, which is not missing data. */}
      {hasCustomerDetails(customer) ? (
        <Card>
          <CardHeader
            icon={UserRound}
            title="Customer"
            description={
              sale.customerId
                ? "Linked customer — text below is the snapshot from the sale."
                : "Taken at the counter and snapshotted onto the sale."
            }
          />
          <dl className="grid gap-4 px-4 py-4 sm:grid-cols-3 sm:px-6">
            <div>
              <dt className="text-caption text-ink-muted">Name</dt>
              <dd className="mt-1 text-body font-medium">
                {sale.customerId ? (
                  <Link
                    href={`/customers/${sale.customerId}` as Route}
                    className="text-primary hover:underline"
                  >
                    {customer.name ?? "—"}
                  </Link>
                ) : (
                  (customer.name ?? "—")
                )}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Contact</dt>
              <dd className="num mt-1 text-body font-medium">{customer.contact ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Address</dt>
              <dd className="mt-1 text-body font-medium">{customer.address ?? "—"}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          icon={ListOrdered}
          title="Line items"
          description="Names and prices are snapshots from the moment of sale."
        />
        {sale.items.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="No line items on this sale"
            instruction="The header synced without its items. Re-sync the terminal that took it."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th numeric>Qty</Th>
                <Th numeric>Shelf</Th>
                <Th numeric>Charged</Th>
                <Th numeric>Discount</Th>
                <Th numeric>Subtotal</Th>
                {sale.status === "completed" ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => {
                const lineDiscount = roundMoney(
                  Math.max(item.listPrice - item.unitPrice, 0) * item.quantity,
                );
                const belowCost = item.unitPrice < item.unitCost;
                const replaced = item.replacedByProductId !== null;

                return (
                  <tr key={item.id} className={replaced ? "opacity-60" : undefined}>
                    <Td>
                      <span className="font-medium">{item.productName}</span>
                      {belowCost ? (
                        <span className="mt-0.5 block text-caption text-danger">
                          Below cost (
                          <Money value={item.unitCost} />)
                        </span>
                      ) : null}
                      {replaced ? (
                        <span className="mt-0.5 block text-caption text-warning-ink">
                          Replaced by {item.replacedByProductName ?? "another product"}
                        </span>
                      ) : null}
                    </Td>
                    <Td numeric>{item.quantity}</Td>
                    <Td numeric>
                      <Money value={item.listPrice} />
                    </Td>
                    <Td numeric>
                      <Money value={item.unitPrice} />
                    </Td>
                    <Td numeric>
                      {lineDiscount > 0 ? (
                        <Money value={lineDiscount} className="text-warning-ink" />
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td numeric>
                      <Money value={item.subtotal} className="font-semibold" />
                      <span className="mt-0.5 block text-caption text-ink-muted">
                        Profit{" "}
                        <Money
                          value={lineProfit(item.unitPrice, item.unitCost, item.quantity)}
                        />
                      </span>
                    </Td>
                    {sale.status === "completed" ? (
                      <Td>{replaced ? null : <ReplaceItem saleId={id} item={item} />}</Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {/* The ledger line: line items end, the total begins. */}
        <div className="ledger-line mx-4 sm:mx-6" />
        <div className="space-y-2 px-4 py-4 sm:px-6">
          {sale.discountAmount > 0 ? (
            <div className="flex items-baseline justify-between text-body">
              <span className="text-ink-muted">Discount given</span>
              <Money value={sale.discountAmount} className="text-warning-ink" />
            </div>
          ) : null}
          <div className="flex items-baseline justify-between">
            <span className="text-body font-medium tracking-wide uppercase">Total</span>
            <Money value={sale.totalAmount} className="text-heading-md font-semibold" />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={Boxes}
          title="Stock effect"
          description="What this sale did to inventory when it landed."
        />
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Reason</Th>
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
                <Td>{movement.reason === "sale" ? "Sale" : "Sale voided"}</Td>
                <Td
                  numeric
                  className={
                    movement.changeQuantity < 0
                      ? "font-semibold text-danger"
                      : "font-semibold text-success"
                  }
                >
                  {movement.changeQuantity > 0 ? "+" : ""}
                  {movement.changeQuantity}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
