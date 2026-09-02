"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Camera, PackageCheck, Plus } from "lucide-react";
import type { GoodsReceipt } from "@double-a/api-client/queries";
import type { Location } from "@double-a/shared-types";
import { STORE_TIME_ZONE } from "@double-a/shared-types";
import { formatStoreDay, storeDayOf } from "@/lib/date-range";
import { isInitialQueryLoad, matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui";
import { Pagination, SearchField } from "@/components/record-list";
import { useLocationFilter } from "@/components/location-filter-provider";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { useGoodsReceipts } from "@/lib/query/goods-receipts";
import { useLocations } from "@/lib/query/locations";
import { useSuppliers } from "@/lib/query/suppliers";
import { ReceivingFollowUpBanner } from "./receiving-follow-up-banner";
import { consumeReceivingFollowUp, type ReceivingFollowUp } from "./receiving-follow-up";
import { ReceiptPhotoDialog } from "./receipt-photo-dialog";

function formatReceiptCreated(instant: string): { date: string; time: string } {
  return {
    date: formatStoreDay(storeDayOf(instant)),
    time: new Date(instant).toLocaleString("en-PH", {
      timeStyle: "short",
      timeZone: STORE_TIME_ZONE,
    }),
  };
}

function receiptSupplierLabel(
  receipt: GoodsReceipt,
  supplierNameById: Map<string, string>,
): string {
  const snapshot = receipt.supplierName?.trim();
  if (snapshot) return snapshot;
  if (receipt.supplierId) {
    return supplierNameById.get(receipt.supplierId) ?? "—";
  }
  return "—";
}

export function ReceivingPageClient() {
  const searchParams = useSearchParams();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const { locationId: currentLocationFilter } = useLocationFilter();
  const [followUp, setFollowUp] = useState<ReceivingFollowUp | null>(null);

  useEffect(() => {
    setFollowUp(consumeReceivingFollowUp());
  }, []);

  const receiptsQuery = useGoodsReceipts({ pageSize: 200 });
  const locationsQuery = useLocations({ type: "branch" });
  const suppliersQuery = useSuppliers();

  const loading =
    isInitialQueryLoad(receiptsQuery.isPending, Boolean(receiptsQuery.data)) ||
    locationsQuery.isPending ||
    suppliersQuery.isPending;
  const error = receiptsQuery.error ?? locationsQuery.error ?? suppliersQuery.error;

  return (
    <div className="space-y-6">
      {followUp ? (
        <ReceivingFollowUpBanner followUp={followUp} onDismiss={() => setFollowUp(null)} />
      ) : null}

      {loading ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : error ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {error instanceof Error ? error.message : "Could not load received orders."}
        </Card>
      ) : (
        <ReceivingListBody
          receipts={receiptsQuery.data ?? []}
          locations={locationsQuery.data ?? []}
          suppliers={suppliersQuery.data ?? []}
          locationFilter={currentLocationFilter}
          q={q}
          page={page}
          fetching={receiptsQuery.isFetching && Boolean(receiptsQuery.data)}
        />
      )}
    </div>
  );
}

function ReceivingListBody({
  receipts,
  locations,
  suppliers,
  locationFilter,
  q,
  page,
  fetching = false,
}: {
  receipts: GoodsReceipt[];
  locations: Location[];
  suppliers: { id: string; name: string }[];
  locationFilter: string | null;
  q: string;
  page: number;
  fetching?: boolean;
}) {
  const mutationsLocked = useLocationMutationsLocked();
  const locationNameById = new Map(locations.map((location) => [location.id, location.name]));
  const supplierNameById = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const showLocationColumn = locationFilter === null;

  const scoped = locationFilter
    ? receipts.filter((receipt) => receipt.locationId === locationFilter)
    : receipts;

  const filtered = scoped.filter((receipt) =>
    matchesQuery(
      [
        receiptSupplierLabel(receipt, supplierNameById),
        receipt.referenceNo,
        receipt.notes,
        locationNameById.get(receipt.locationId),
      ],
      q,
    ),
  );
  const { pageItems, page: safePage, pageCount, total, pageSize } = paginateItems(filtered, page);

  const listQuery = { q: q || undefined };
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  return (
    <>
    <Card>
      <CardHeader
        icon={PackageCheck}
        title="Receive orders"
        description="Deliveries you've logged — stock restocked and prices updated from each receipt."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              placeholder="Search supplier, reference, notes…"
              defaultValue={q}
              preserve={listQuery}
              className="sm:max-w-xs"
            />
            {mutationsLocked ? (
              <ButtonLink
                href="/receiving"
                icon={Plus}
                className="pointer-events-none opacity-40"
                aria-disabled
                title="Pick a specific location to receive a delivery"
              >
                New receive order
              </ButtonLink>
            ) : (
              <ButtonLink href="/receiving/new" icon={Plus}>
                New receive order
              </ButtonLink>
            )}
          </div>
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={q ? "Nothing matches that search" : "No received orders yet"}
          instruction={
            q
              ? "Try a different supplier or reference."
              : "Log a delivery to restock inventory and record what actually arrived."
          }
          action={
            !q ? (
              <ButtonLink
                href={mutationsLocked ? "/receiving" : "/receiving/new"}
                className={mutationsLocked ? "pointer-events-none opacity-40" : undefined}
                aria-disabled={mutationsLocked || undefined}
              >
                New receive order
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <Table fetching={fetching}>
          <thead>
            <tr>
              <Th>Photo</Th>
              <Th>Created</Th>
              <Th>Supplier</Th>
              <Th>Reference</Th>
              {showLocationColumn ? <Th>Location</Th> : null}
              <Th numeric>Items</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Open</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((receipt) => {
              const href = `/receiving/${receipt.id}` as Route;
              const created = formatReceiptCreated(receipt.createdAt ?? receipt.receivedAt);
              const supplierLabel = receiptSupplierLabel(receipt, supplierNameById);

              return (
                <tr key={receipt.id} className="group relative cursor-pointer">
                  <Td>
                    <Link
                      href={href}
                      className="absolute inset-0 z-10"
                      aria-label={`View receipt for ${supplierLabel}`}
                    />
                    <span className="relative z-0 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-paper">
                      {receipt.photoUrl ? (
                        <button
                          type="button"
                          className="relative z-20 size-full cursor-zoom-in"
                          aria-label={`View receipt photo for ${supplierLabel}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPhotoPreviewUrl(receipt.photoUrl);
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={receipt.photoUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                        </button>
                      ) : (
                        <Camera size={16} strokeWidth={2} className="text-ink-muted" />
                      )}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="num font-medium text-primary group-hover:underline">
                      {created.date}
                    </span>
                    <p className="mt-0.5 text-caption text-ink-muted">{created.time}</p>
                  </Td>
                  <Td>{supplierLabel}</Td>
                  <Td className="max-w-[12rem] truncate">{receipt.referenceNo ?? "—"}</Td>
                  {showLocationColumn ? (
                    <Td>{locationNameById.get(receipt.locationId) ?? "—"}</Td>
                  ) : null}
                  <Td numeric>{receipt.items.length}</Td>
                  <Td>
                    {receipt.hasDiscrepancy ? (
                      <Badge tone="warning">Discrepancy</Badge>
                    ) : (
                      <Badge tone="success">Received</Badge>
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
        basePath="/receiving"
        query={listQuery}
      />
    </Card>

    <ReceiptPhotoDialog
      open={photoPreviewUrl !== null}
      onClose={() => setPhotoPreviewUrl(null)}
      photoUrl={photoPreviewUrl}
    />
    </>
  );
}
