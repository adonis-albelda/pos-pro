"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, HandCoins, Receipt, UserRound } from "lucide-react";
import { formatMoney } from "@double-a/shared-types";
import { listSales } from "@double-a/api-client/queries";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { queryKeys } from "@/lib/query/keys";
import { useCustomer, useCustomerBalance, useCustomerPayments } from "@/lib/query/customers";
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
import { CustomerForm } from "../customer-form";
import { DeleteCustomerButton } from "./delete-customer-button";
import { RecordCustomerPaymentForm } from "./record-customer-payment-form";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();

  const customerQuery = useCustomer(id);
  const balanceQuery = useCustomerBalance(id);
  const paymentsQuery = useCustomerPayments(id);

  // GAP: `IndexSalesController` caps `per_page` at 200 server-side and
  // `listSales` only fetches page 1 (see queries/sales.ts) — a customer with
  // more than 200 sales on record will only show the most recent 200 here,
  // unlike the old `limit: 500` PostgREST query.
  const salesQuery = useQuery({
    queryKey: queryKeys.sales.list({ customerId: id, limit: 500 }),
    queryFn: () => listSales(getBrowserApiClient(), { customerId: id, limit: 500 }),
    enabled: Boolean(id),
  });

  if (customerQuery.isPending || salesQuery.isPending || balanceQuery.isPending) {
    return (
      <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
    );
  }

  if (customerQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {customerQuery.error instanceof Error
          ? customerQuery.error.message
          : "Could not load the customer."}
      </Card>
    );
  }

  const customer = customerQuery.data;
  if (!customer) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        Customer not found.
      </Card>
    );
  }

  const sales = salesQuery.data ?? [];
  const revenue = sales
    .filter((sale) => sale.status === "completed")
    .reduce((sum, sale) => sum + sale.totalAmount, 0);
  const balance = balanceQuery.data ?? 0;
  const payments = paymentsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={"/customers" as Route}
            className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} />
            Back to customers
          </Link>
          <h1 className="mt-2 text-heading-md font-semibold sm:text-heading-lg">
            {customer.name}
          </h1>
          <p className="mt-1 text-body text-ink-muted">
            {[customer.contact, customer.address].filter(Boolean).join(" · ") ||
              "No contact details"}
          </p>
        </div>
        <DeleteCustomerButton customerId={id} customerName={customer.name} />
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={HandCoins}
          label="Credit balance"
          value={formatMoney(balance)}
          hint="Across unpaid credit sales"
          tone={balance > 0 ? "warning" : "neutral"}
        />
      </div>

      <Card>
        <CardHeader
          icon={HandCoins}
          title="Record a payment"
          description="A lump sum against this customer's tab — not tied to one specific sale."
        />
        <div className="px-4 py-5 sm:px-6">
          <RecordCustomerPaymentForm customerId={id} />
        </div>
      </Card>

      {payments.length > 0 ? (
        <Card>
          <CardHeader icon={Receipt} title="Payment history" />
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Note</Th>
                <Th numeric>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <Td>
                    {new Date(payment.paidAt).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Td>
                  <Td>{payment.note ?? "—"}</Td>
                  <Td numeric>
                    <Money value={payment.amount} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      <Card>
        <CardHeader icon={UserRound} title="Details" />
        <div className="px-4 py-5 sm:px-6">
          <CustomerForm customer={customer} />
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={Receipt}
          title={`${sales.length} sales`}
          description={`${formatMoney(revenue)} from completed sales.`}
        />
        {sales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No sales yet"
            instruction="Sales linked to this customer from the POS will show up here after sync."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Payment</Th>
                <Th>Fulfillment</Th>
                <Th>Paid</Th>
                <Th numeric>Total</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <Td>
                    {new Date(sale.createdAt).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </Td>
                  <Td className="capitalize">{sale.paymentMethod ?? "—"}</Td>
                  <Td className="capitalize">
                    {sale.fulfillment}
                    {sale.fulfillment === "delivery"
                      ? sale.deliveryCompleted
                        ? " · done"
                        : " · open"
                      : ""}
                  </Td>
                  <Td>
                    {sale.paymentMethod === "credit" ? (
                      <span className="text-caption text-ink-muted">See balance ↑</span>
                    ) : sale.isPaid ? (
                      <Badge tone="success">Paid</Badge>
                    ) : (
                      <Badge tone="warning">Unpaid</Badge>
                    )}
                  </Td>
                  <Td numeric>
                    <Money value={sale.totalAmount} />
                  </Td>
                  <Td>
                    <Link
                      href={`/sales/${sale.id}`}
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
    </div>
  );
}
