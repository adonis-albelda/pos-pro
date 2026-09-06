"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, History, Receipt } from "lucide-react";
import type { Product } from "@double-a/shared-types";
import { Badge, Button, Card, CardHeader, EmptyState, IconLink, Skeleton, Table, Td, Th } from "@/components/ui";
import { useInventoryMovements } from "@/lib/query/inventory";
import { movementSaleId, reasonIcon, reasonLabel } from "@/lib/inventory-reasons";

const PAGE_SIZE = 20;

const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

/** Read-only ledger for this one product — balances change only through Inventory movements, never edited here. */
export function ProductInventorySection({ product }: { product: Product }) {
  const [page, setPage] = useState(1);
  const movementsQuery = useInventoryMovements(
    { productId: product.id, page, pageSize: PAGE_SIZE },
    { enabled: true },
  );

  const movements = movementsQuery.data?.movements ?? [];
  const lastPage = movementsQuery.data?.lastPage ?? 1;
  const total = movementsQuery.data?.total ?? 0;

  return (
    <Card>
      <CardHeader
        icon={History}
        title="Inventory"
        description="Every stock movement for this product, most recent first. Balances only ever change here."
      />
      {movementsQuery.isPending ? (
        <div className="space-y-3 px-4 py-4 sm:px-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : movements.length === 0 ? (
        <EmptyState icon={History} title="No movements yet" instruction="Stock changes for this product will show up here." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Reason</Th>
                  <Th numeric>Change</Th>
                  <Th>Supplier</Th>
                  <Th>Note</Th>
                  <Th>Recorded by</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => {
                  const ReasonIcon = reasonIcon(movement.reason);
                  const saleId = movementSaleId(movement.reason, movement.referenceId);
                  return (
                    <tr key={movement.id}>
                      <Td className="num whitespace-nowrap text-ink-muted">
                        {new Date(movement.createdAt).toLocaleString("en-PH", TIMESTAMP_FORMAT)}
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <ReasonIcon size={15} className="text-ink-muted" />
                          {reasonLabel(movement.reason)}
                        </span>
                      </Td>
                      <Td
                        numeric
                        className={movement.changeQuantity < 0 ? "font-semibold text-danger" : "font-semibold text-success"}
                      >
                        {movement.changeQuantity > 0 ? "+" : ""}
                        {movement.changeQuantity}
                      </Td>
                      <Td className="whitespace-nowrap text-ink-muted">{movement.supplierName ?? "—"}</Td>
                      <Td className="max-w-xs text-ink-muted">{movement.note ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-ink-muted">
                        {movement.createdBy ? (
                          movement.createdByName ?? "Removed user"
                        ) : (
                          <Badge tone="neutral">Terminal</Badge>
                        )}
                      </Td>
                      <Td>
                        <div className="flex justify-end">
                          {saleId ? (
                            <IconLink
                              icon={Receipt}
                              label={`Open sale ${saleId.slice(0, 8)}`}
                              href={`/sales/${saleId}`}
                            />
                          ) : null}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-6">
            <p className="text-caption text-ink-muted">
              {total} {total === 1 ? "movement" : "movements"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={ChevronLeft}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-caption text-ink-muted">
                Page {page} of {lastPage}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={ChevronRight}
                disabled={page >= lastPage}
                onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
