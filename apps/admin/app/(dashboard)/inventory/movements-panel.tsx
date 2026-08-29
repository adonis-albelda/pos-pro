"use client";

import { Fragment, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { FilterX, History, Receipt } from "lucide-react";
import type { InventoryMovement, InventoryReason } from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconLink,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { Pagination, RecordToolbar, SearchField } from "@/components/record-list";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { DateRangePicker, type DayWindowValue } from "@/components/date-range-picker";
import { formatStoreDay, storeDayOf } from "@/lib/date-range";
import {
  movementSaleId,
  REASONS,
  reasonIcon,
  reasonLabel,
} from "@/lib/inventory-reasons";
import { RestockSheet } from "./restock-sheet";

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

export function MovementsPanel({
  movements,
  total,
  page,
  pageSize,
  productNames,
  userNames,
  query,
  reason,
  focusedProduct,
  fromDay,
  toDay,
  rangeLabel,
  fetching = false,
}: {
  movements: InventoryMovement[];
  total: number;
  page: number;
  pageSize: number;
  productNames: Record<string, string>;
  userNames: Record<string, string>;
  query: string;
  reason?: InventoryReason;
  focusedProduct?: string;
  fromDay: string | null;
  toDay: string | null;
  rangeLabel: string;
  fetching?: boolean;
}) {
  const mutationsLocked = useLocationMutationsLocked();
  const router = useRouter();
  const search = useSearchParams();
  const [restocking, setRestocking] = useState<{ productId?: string } | null>(null);

  function push(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(search.toString());
    next.set("tab", "movements");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    router.push(`/inventory?${next.toString()}` as Route);
  }

  function applyWindow(window: DayWindowValue) {
    push({ from: window.fromDay ?? undefined, to: window.toDay ?? undefined });
  }

  const filters = {
    tab: "movements",
    reason,
    product: focusedProduct,
    from: fromDay ?? undefined,
    to: toDay ?? undefined,
  };
  const filtered = Boolean(reason || focusedProduct || fromDay || toDay || query);

  const exportParams = new URLSearchParams();
  if (fromDay) exportParams.set("from", fromDay);
  if (toDay) exportParams.set("to", toDay);
  if (reason) exportParams.set("reason", reason);
  if (focusedProduct) exportParams.set("product", focusedProduct);
  const exportQuery = exportParams.toString();

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const shownPage = Math.min(page, pageCount);
  let lastDay: string | null = null;

  return (
    <>
      <Card>
        <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 shrink-0">
            <h1 className="text-heading-md font-semibold text-ink">Movement history</h1>
            <p className="mt-1 max-w-xl text-body text-ink-muted">
              Every stock change, newest first.
            </p>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
            <SearchField
              placeholder="Search by product or SKU…"
              defaultValue={query}
              preserve={filters}
              className="sm:max-w-xs"
            />
            <RecordToolbar
              searchPlaceholder=""
              hideSearch
              embedded
              addLabel="Record movement"
              onAdd={() => setRestocking({})}
              addDisabled={mutationsLocked}
              exportHref={
                exportQuery ? `/api/export/movements?${exportQuery}` : "/api/export/movements"
              }
              preserve={filters}
            />
          </div>
        </div>

        <div className="space-y-2 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <span className="mb-1 block text-caption font-medium text-ink-muted">
                Dates
              </span>
              <DateRangePicker fromDay={fromDay} toDay={toDay} onApply={applyWindow} />
            </div>

            <label className="block min-w-0 flex-1">
              <span className="mb-1 block text-caption font-medium text-ink-muted">
                Reason
              </span>
              <Select
                value={reason ?? ""}
                onChange={(event) => push({ reason: event.target.value })}
              >
                <option value="">Every reason</option>
                {REASONS.map((option) => (
                  <option key={option} value={option}>
                    {reasonLabel(option)}
                  </option>
                ))}
              </Select>
            </label>

            {filtered ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={FilterX}
                onClick={() => router.push("/inventory?tab=movements" as Route)}
              >
                Clear
              </Button>
            ) : null}
          </div>

          <p className="flex items-center gap-2 text-caption text-ink-muted">
            <History size={13} strokeWidth={2} />
            {focusedProduct
              ? `${productNames[focusedProduct] ?? "One product"} · ${rangeLabel} · newest first`
              : `${rangeLabel} · every stock change, newest first`}
          </p>
        </div>

        {movements.length === 0 ? (
          <EmptyState
            icon={History}
            title={filtered ? "No movements in this range" : "No movements yet"}
            instruction={
              filtered
                ? "Widen the dates, or clear the filters to see the whole history."
                : "Record a restock, or wait for a terminal to sync its sales."
            }
            action={
              filtered ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={FilterX}
                  onClick={() => router.push("/inventory?tab=movements" as Route)}
                >
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : (
          <Table fetching={fetching}>
            <thead>
              <tr>
                <Th>Time</Th>
                <Th>Product</Th>
                <Th>Reason</Th>
                <Th numeric>Change</Th>
                <Th>Note</Th>
                <Th>Recorded by</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => {
                const ReasonIcon = reasonIcon(movement.reason);
                const saleId = movementSaleId(movement.reason, movement.referenceId);
                const day = storeDayOf(movement.createdAt);
                const newDay = day !== lastDay;
                lastDay = day;

                return (
                  <Fragment key={movement.id}>
                    {newDay ? (
                      <tr>
                        {/* A shop day is a real boundary in the ledger, so it gets the dashed line. */}
                        <Td
                          colSpan={7}
                          className="ledger-line bg-paper/60 text-caption font-semibold tracking-wide text-ink-muted uppercase"
                        >
                          {formatStoreDay(day)}
                        </Td>
                      </tr>
                    ) : null}
                    <tr>
                      <Td className="num whitespace-nowrap text-ink-muted">
                        {new Date(movement.createdAt).toLocaleTimeString("en-PH", TIME_FORMAT)}
                      </Td>
                      <Td className="font-medium">
                        {productNames[movement.productId] ?? "Deleted product"}
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <ReasonIcon size={15} className="text-ink-muted" />
                          {reasonLabel(movement.reason)}
                        </span>
                      </Td>
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
                      <Td className="max-w-xs text-ink-muted">{movement.note ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-ink-muted">
                        {movement.createdBy ? (
                          userNames[movement.createdBy] ?? "Removed user"
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
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination
          page={shownPage}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          basePath="/inventory"
          query={{ ...filters, q: query || undefined }}
        />
      </Card>

      <RestockSheet
        open={restocking !== null}
        onClose={() => setRestocking(null)}
        defaultProductId={restocking?.productId}
      />
    </>
  );
}
