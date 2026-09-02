"use client";

import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, ClipboardList, Plus, SlidersHorizontal } from "lucide-react";
import type { PurchaseOrderStatus, Supplier } from "@double-a/shared-types";
import {
  PURCHASE_ORDER_STATUS_LABELS,
  poItemReceiveState,
  purchaseOrderBalance,
} from "@double-a/shared-types";
import type { PurchaseOrderWithLines } from "@double-a/api-client/queries";
import { isInitialQueryLoad, matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import { PO_STATUS_TONE } from "@/lib/purchase-order-status";
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, Money, Table, Td, Th } from "@/components/ui";
import { Dialog } from "@/components/overlay";
import { Pagination, SearchField } from "@/components/record-list";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { PurchaseOrdersFilters } from "./purchase-orders-filters";
import { usePurchaseOrders } from "@/lib/query/purchase-orders";
import { useSuppliers } from "@/lib/query/suppliers";

function FiltersButton({ suppliers, active }: { suppliers: Supplier[]; active: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => setOpen(true)}>
        Filters
        {active ? <span className="ml-1 inline-block size-1.5 rounded-full bg-primary" /> : null}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Filter purchase orders">
        <PurchaseOrdersFilters suppliers={suppliers} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

export function PurchaseOrdersPageClient() {
  const searchParams = useSearchParams();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const supplierId = searchParams.get("supplierId") || undefined;
  const status = (searchParams.get("status") as PurchaseOrderStatus) || undefined;

  // One PO list request (+ suppliers for name join / filters). No catalogue walk.
  const ordersQuery = usePurchaseOrders({ supplierId, status });
  const suppliersQuery = useSuppliers({ includeInactive: true });

  return (
    <div className="space-y-6">
      {isInitialQueryLoad(ordersQuery.isPending, Boolean(ordersQuery.data)) ||
      suppliersQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : ordersQuery.isError || suppliersQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {ordersQuery.error instanceof Error
            ? ordersQuery.error.message
            : suppliersQuery.error instanceof Error
              ? suppliersQuery.error.message
              : "Could not load purchase orders."}
        </Card>
      ) : (
        <PurchaseOrdersBody
          orders={ordersQuery.data ?? []}
          suppliers={suppliersQuery.data ?? []}
          q={q}
          page={page}
          supplierId={supplierId}
          status={status}
          fetching={ordersQuery.isFetching && Boolean(ordersQuery.data)}
        />
      )}
    </div>
  );
}

function PurchaseOrdersBody({
  orders,
  suppliers,
  q,
  page,
  supplierId,
  status,
  fetching = false,
}: {
  orders: PurchaseOrderWithLines[];
  suppliers: Supplier[];
  q: string;
  page: number;
  supplierId?: string;
  status?: PurchaseOrderStatus;
  fetching?: boolean;
}) {
  const mutationsLocked = useLocationMutationsLocked();
  // GAP: PurchaseOrderResource carries no supplier name (see
  // queries/purchase-orders.ts) — joined against the supplier list above.
  const supplierNameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));

  const filtered = orders.filter((order) =>
    matchesQuery([supplierNameById.get(order.supplierId), order.referenceNo, order.notes], q),
  );
  const { pageItems, page: safePage, pageCount, total, pageSize } = paginateItems(filtered, page);

  const listQuery = {
    q: q || undefined,
    supplierId,
    status,
  };

  return (
    <>
      <Card>
        <CardHeader
          icon={ClipboardList}
          title="Purchase orders"
          description="What you've ordered from each supplier, on what terms, and what's still on the way."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <SearchField
                placeholder="Search supplier, reference, notes…"
                defaultValue={q}
                preserve={listQuery}
                className="sm:max-w-xs"
              />
              <FiltersButton suppliers={suppliers} active={Boolean(supplierId || status)} />
              {mutationsLocked ? (
                <ButtonLink
                  href="/purchase-orders"
                  icon={Plus}
                  className="pointer-events-none opacity-40"
                  aria-disabled
                  title="Pick a specific location to create purchase orders"
                >
                  New purchase order
                </ButtonLink>
              ) : (
                <ButtonLink href="/purchase-orders/new" icon={Plus}>
                  New purchase order
                </ButtonLink>
              )}
            </div>
          }
        />

        {total === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={q ? "Nothing matches that search" : "No purchase orders yet"}
            instruction={
              q
                ? "Try a different supplier or reference."
                : "Start one to record what you ordered, on what terms, and what's shown up."
            }
            action={
              !q ? (
                <ButtonLink href={mutationsLocked ? "/purchase-orders" : "/purchase-orders/new"} className={mutationsLocked ? "pointer-events-none opacity-40" : undefined} aria-disabled={mutationsLocked || undefined}>
                  New purchase order
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <Table fetching={fetching}>
            <thead>
              <tr>
                <Th>Order date</Th>
                <Th>Supplier</Th>
                <Th>Status</Th>
                <Th numeric>Lines received</Th>
                <Th numeric>Total</Th>
                <Th numeric>Balance</Th>
                <Th>
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((order) => {
                const receivedLines = order.items.filter(
                  (item) => poItemReceiveState(item) === "received",
                ).length;

                return (
                  <tr key={order.id} className="group relative cursor-pointer">
                    <Td className="whitespace-nowrap">
                      <Link
                        href={`/purchase-orders/${order.id}` as Route}
                        className="absolute inset-0 z-10"
                        aria-label={`View purchase order for ${supplierNameById.get(order.supplierId) ?? "supplier"}`}
                      />
                      <span className="num font-medium text-primary group-hover:underline">
                        {order.orderDate}
                      </span>
                    </Td>
                    <Td>{supplierNameById.get(order.supplierId) ?? "—"}</Td>
                    <Td>
                      <Badge tone={PO_STATUS_TONE[order.status]}>
                        {PURCHASE_ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </Td>
                    <Td numeric>
                      {order.items.length === 0
                        ? "—"
                        : `${receivedLines}/${order.items.length}`}
                    </Td>
                    <Td numeric>
                      <Money value={order.totalAmount} className="font-semibold" />
                    </Td>
                    <Td numeric>
                      <Money value={purchaseOrderBalance(order.payments)} />
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
          basePath="/purchase-orders"
          query={listQuery}
        />
      </Card>
    </>
  );
}
