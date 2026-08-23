"use client";

import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Banknote,
  ChevronRight,
  CreditCard,
  Plus,
  Receipt,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { formatMoney } from "@double-a/shared-types";
import type { SaleWithItems, User } from "@double-a/shared-types";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Money,
  PageHeader,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { Pagination, RecordToolbar } from "@/components/record-list";
import { SalesFilters } from "./sales-filters";
import { useSalesList } from "@/lib/query/sales";
import { useUsers } from "@/lib/query/users";

export default function SalesPage() {
  const searchParams = useSearchParams();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const userId = searchParams.get("userId") ?? undefined;
  const deviceId = searchParams.get("deviceId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const usersQuery = useUsers({ includeInactive: true });
  const salesQuery = useSalesList({ from, to, userId, deviceId, status });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Receipt}
        title="Sales"
        description="Every sale synced from a terminal. A sale made offline appears here only after its terminal syncs."
        action={
          <ButtonLink href="/sales/new" icon={Plus}>
            New sale
          </ButtonLink>
        }
      />

      {salesQuery.isPending || usersQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : salesQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {salesQuery.error instanceof Error ? salesQuery.error.message : "Could not load sales."}
        </Card>
      ) : (
        <SalesBody
          sales={salesQuery.data ?? []}
          users={usersQuery.data ?? []}
          q={q}
          page={page}
          from={from}
          to={to}
          userId={userId}
          deviceId={deviceId}
          status={status}
        />
      )}
    </div>
  );
}

function SalesBody({
  sales,
  users,
  q,
  page,
  from,
  to,
  userId,
  deviceId,
  status,
}: {
  sales: SaleWithItems[];
  users: User[];
  q: string;
  page: number;
  from?: string;
  to?: string;
  userId?: string;
  deviceId?: string;
  status?: string;
}) {
  const cashierNameById = new Map(users.map((user) => [user.id, user.name]));

  const filtered = sales.filter((sale) =>
    matchesQuery(
      [
        sale.userId ? cashierNameById.get(sale.userId) : null,
        sale.customerName,
        sale.deviceId,
        sale.paymentMethod,
        sale.status,
        sale.id,
      ],
      q,
    ),
  );
  const { pageItems, page: safePage, pageCount, total, pageSize } = paginateItems(
    filtered,
    page,
  );

  const revenue = filtered
    .filter((sale) => sale.status === "completed")
    .reduce((sum, sale) => sum + sale.totalAmount, 0);

  const devices = [...new Set(sales.map((sale) => sale.deviceId).filter(Boolean))] as string[];

  const exportQuery = new URLSearchParams();
  if (from) exportQuery.set("from", from);
  if (to) exportQuery.set("to", to);
  if (status) exportQuery.set("status", status);

  const listQuery = {
    q: q || undefined,
    from,
    to,
    userId,
    deviceId,
    status,
  };

  return (
    <>
      <Card>
        <CardHeader icon={SlidersHorizontal} title="Filter" />
        <div className="px-4 py-5 sm:px-6">
          <SalesFilters users={users} devices={devices} />
        </div>
      </Card>

      <Card>
        <RecordToolbar
          searchPlaceholder="Search cashier, customer, terminal…"
          query={q}
          exportHref={`/api/export/sales?${exportQuery.toString()}`}
          preserve={listQuery}
        />
        <div className="border-b border-border px-4 py-3 text-caption text-ink-muted sm:px-6">
          {formatMoney(revenue)} from completed sales in this range
          {q ? ` · ${total} match${total === 1 ? "" : "es"}` : ""}
        </div>

        {total === 0 ? (
          <EmptyState
            icon={Receipt}
            title={q ? "Nothing matches that search" : "No sales in this range"}
            instruction={
              q
                ? "Try a different cashier, customer or terminal."
                : "Widen the dates, or check that the terminal has synced."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sold at</Th>
                <Th>Cashier</Th>
                <Th>Terminal</Th>
                <Th>Payment</Th>
                <Th numeric>Items</Th>
                <Th numeric>Total</Th>
                <Th>State</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((sale) => {
                const soldAt = new Date(sale.createdAt).toLocaleString("en-PH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                });

                return (
                  <tr key={sale.id} className="group relative cursor-pointer">
                    <Td className="whitespace-nowrap">
                      <Link
                        href={`/sales/${sale.id}` as Route}
                        className="absolute inset-0 z-10"
                        aria-label={`View sale from ${soldAt}`}
                      />
                      <span className="num font-medium text-primary group-hover:underline">
                        {soldAt}
                      </span>
                      <span className="num mt-0.5 block text-caption text-ink-muted">
                        {sale.invoiceNumber ?? sale.id.slice(0, 8)}
                      </span>
                      {sale.customerName ? (
                        <span className="mt-0.5 flex items-center gap-1.5 text-caption text-ink-muted">
                          <UserRound size={12} />
                          {sale.customerName}
                        </span>
                      ) : null}
                    </Td>
                    <Td>{(sale.userId && cashierNameById.get(sale.userId)) ?? "—"}</Td>
                    <Td className="num text-ink-muted">{sale.deviceId ?? "—"}</Td>
                    <Td>
                      {sale.paymentMethod ? (
                        <span className="inline-flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-2 whitespace-nowrap capitalize">
                            {sale.paymentMethod === "cash" ? (
                              <Banknote size={15} className="text-ink-muted" />
                            ) : (
                              <CreditCard size={15} className="text-ink-muted" />
                            )}
                            {sale.paymentMethod}
                          </span>
                          <span className="flex flex-wrap gap-1">
                            {sale.isPaid ? (
                              <Badge tone="success">Paid</Badge>
                            ) : (
                              <Badge tone="warning">Unpaid</Badge>
                            )}
                            {sale.fulfillment === "delivery" ? (
                              <Badge tone={sale.deliveryCompleted ? "success" : "warning"}>
                                {sale.deliveryCompleted ? "Delivered" : "Delivery"}
                              </Badge>
                            ) : null}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td numeric>
                      {sale.items.reduce((count, item) => count + item.quantity, 0)}
                    </Td>
                    <Td numeric>
                      <Money value={sale.totalAmount} className="font-semibold" />
                    </Td>
                    <Td>
                      {sale.status === "completed" ? (
                        <Badge tone="success">Completed</Badge>
                      ) : sale.status === "voided" ? (
                        <Badge tone="danger">Voided</Badge>
                      ) : (
                        <Badge tone="warning">Refunded</Badge>
                      )}
                    </Td>
                    <Td>
                      <ChevronRight
                        size={16}
                        className="text-ink-muted transition-colors group-hover:text-primary"
                        aria-hidden
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination
          page={safePage}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          basePath="/sales"
          query={listQuery}
        />
      </Card>
    </>
  );
}
