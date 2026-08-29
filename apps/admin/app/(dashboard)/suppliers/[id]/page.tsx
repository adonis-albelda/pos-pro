"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { ArrowLeft, ClipboardList, Package, Truck, Wallet } from "lucide-react";
import {
  formatMoney,
  PURCHASE_ORDER_STATUS_LABELS,
  purchaseOrderBalance,
} from "@double-a/shared-types";
import { PO_STATUS_TONE } from "@/lib/purchase-order-status";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Money,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { usePurchaseOrders } from "@/lib/query/purchase-orders";
import { DeleteSupplierButton } from "./delete-supplier-button";
import { SupplierInfoForm } from "./supplier-info-form";
import { SupplierProductsPanel } from "./supplier-products-panel";
import { useSupplier, useSupplierBalance } from "@/lib/query/suppliers";

const TABS = [
  { id: "info", label: "Supplier's info", icon: Truck },
  { id: "products", label: "Products", icon: Package },
  { id: "orders", label: "Purchase orders", icon: ClipboardList },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<TabId>("info");

  const supplierQuery = useSupplier(id);
  const ordersQuery = usePurchaseOrders({ supplierId: id });
  const balanceQuery = useSupplierBalance(id);

  const isPending = supplierQuery.isPending || ordersQuery.isPending || balanceQuery.isPending;

  if (isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  const error = supplierQuery.error ?? ordersQuery.error ?? balanceQuery.error;
  if (error) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {error instanceof Error ? error.message : "Could not load this supplier."}
      </Card>
    );
  }

  const supplier = supplierQuery.data;
  if (!supplier) notFound();

  const orders = ordersQuery.data ?? [];
  const balance = balanceQuery.data ?? 0;

  const openOrders = orders.filter(
    (order) => order.status === "ordered" || order.status === "partially_received",
  ).length;

  return (
    <div className="space-y-6">
      <Link
        href={"/suppliers" as Route}
        className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to suppliers
      </Link>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Balance owed"
          value={formatMoney(balance)}
          hint="Across unpaid installment terms"
          tone={balance > 0 ? "warning" : "neutral"}
        />
        <StatCard icon={ClipboardList} label="Purchase orders" value={String(orders.length)} />
        <StatCard
          icon={ClipboardList}
          label="Open orders"
          value={String(openOrders)}
          hint="Ordered or partially received"
          tone={openOrders > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border">
        <h1 className="shrink-0 text-heading-sm font-semibold sm:text-heading-md">
          {supplier.name}
        </h1>
        <div className="flex flex-1 flex-wrap gap-1">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-body font-medium transition-colors ${
                  active
                    ? "border-primary text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                <Icon size={16} strokeWidth={2} />
                {entry.label}
              </button>
            );
          })}
        </div>
        <DeleteSupplierButton supplierId={id} supplierName={supplier.name} />
      </div>

      {tab === "info" ? (
        <Card>
          <CardHeader icon={Truck} title="Details" />
          <div className="px-4 py-5 sm:px-6">
            <SupplierInfoForm supplier={supplier} />
          </div>
        </Card>
      ) : null}

      {tab === "products" ? <SupplierProductsPanel supplierId={id} /> : null}

      {tab === "orders" ? (
        <Card>
          <CardHeader
            icon={ClipboardList}
            title={`${orders.length} purchase orders`}
            action={
              <Link
                href={`/purchase-orders/new?supplier=${id}` as Route}
                className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
              >
                New order
              </Link>
            }
          />
          {orders.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No purchase orders yet"
              instruction="Start one to record what you ordered, on what terms, and when it's due."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Order date</Th>
                  <Th>Status</Th>
                  <Th numeric>Total</Th>
                  <Th numeric>Balance</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <Td className="num">{order.orderDate}</Td>
                    <Td>
                      <Badge tone={PO_STATUS_TONE[order.status]}>
                        {PURCHASE_ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </Td>
                    <Td numeric>
                      <Money value={order.totalAmount} />
                    </Td>
                    <Td numeric>
                      <Money value={purchaseOrderBalance(order.payments)} />
                    </Td>
                    <Td>
                      <Link
                        href={`/purchase-orders/${order.id}` as Route}
                        className="text-body text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}
    </div>
  );
}
