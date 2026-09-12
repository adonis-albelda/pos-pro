"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Plus,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Location, StockTransfer } from "@double-a/shared-types";
import type { ProductVariantListRow } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  Card,
  Combobox,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  StatCard,
  StatCardSkeleton,
  SuccessNote,
  Table,
  TableSkeleton,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import {
  MatchProductCombobox,
  variantListLabel,
} from "@/app/(dashboard)/receiving/match-product-combobox";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateLocations, useLocations, useStockTransfers } from "@/lib/query/locations";
import { saveTransfer, setTransferStatus } from "./actions";

function statusTone(status: StockTransfer["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "received") return "success";
  if (status === "cancelled") return "neutral";
  if (status === "partially_received") return "warning";
  if (status === "in_transit") return "warning";
  return "warning";
}

const STATUS_LABEL: Record<StockTransfer["status"], string> = {
  pending: "Draft",
  in_transit: "In transit",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

export default function StockTransfersPage() {
  const locationsQuery = useLocations({ includeInactive: false });

  const [statusFilter, setStatusFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const transfersQuery = useStockTransfers({
    status: (statusFilter || undefined) as StockTransfer["status"] | undefined,
    fromLocationId: fromFilter || undefined,
    toLocationId: toFilter || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    search: search || undefined,
    pageSize: 100,
  });

  const loading = locationsQuery.isPending || transfersQuery.isPending;
  const error = locationsQuery.error ?? transfersQuery.error;

  const activeFilterCount = [statusFilter, fromFilter, toFilter, dateFrom, dateTo].filter(
    Boolean,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-heading-lg font-semibold">Stock transfers</h1>
          <p className="text-body text-ink-muted">
            Move units between branches and warehouses. Stock only changes when a transfer is
            received.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          icon={SlidersHorizontal}
          onClick={() => setFiltersOpen((was) => !was)}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
      </div>

      {filtersOpen ? (
        <Card className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Search" required={false} hint="Transfer number.">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ST-…"
            />
          </Field>
          <Field label="Status" required={false}>
            <Combobox
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Any status"
              options={[
                { value: "", label: "Any status" },
                ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
              ]}
            />
          </Field>
          <Field label="From location" required={false}>
            <Combobox
              value={fromFilter}
              onChange={setFromFilter}
              placeholder="Any location"
              options={[
                { value: "", label: "Any location" },
                ...(locationsQuery.data ?? []).map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
          </Field>
          <Field label="To location" required={false}>
            <Combobox
              value={toFilter}
              onChange={setToFilter}
              placeholder="Any location"
              options={[
                { value: "", label: "Any location" },
                ...(locationsQuery.data ?? []).map((l) => ({ value: l.id, label: l.name })),
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From date" required={false}>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field label="To date" required={false}>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
          </div>
          {activeFilterCount > 0 ? (
            <div className="flex items-end sm:col-span-2 xl:col-span-5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={X}
                onClick={() => {
                  setStatusFilter("");
                  setFromFilter("");
                  setToFilter("");
                  setDateFrom("");
                  setDateTo("");
                  setSearch("");
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {loading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <StatCardSkeleton key={index} />
            ))}
          </div>
          <TableSkeleton columns={["w-48", "w-24", "w-16", ""]} />
        </>
      ) : error ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {error instanceof Error ? error.message : "Could not load transfers."}
        </Card>
      ) : (
        <TransfersBody
          locations={locationsQuery.data ?? []}
          transfers={transfersQuery.data?.transfers ?? []}
        />
      )}
    </div>
  );
}

interface TransferItemRow {
  key: string;
  productId: string;
  variantId: string;
  quantity: string;
}

function newRowKey(): string {
  return Math.random().toString(36).slice(2);
}

function emptyRow(): TransferItemRow {
  return { key: newRowKey(), productId: "", variantId: "", quantity: "" };
}

function TransfersBody({
  locations,
  transfers,
}: {
  locations: Location[];
  transfers: StockTransfer[];
}) {
  const mutationsLocked = useLocationMutationsLocked();
  const invalidate = useInvalidateLocations();
  const [transferState, transferAction, transferPending] = useActionState(
    saveTransfer,
    EMPTY_FORM_STATE,
  );
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [items, setItems] = useState<TransferItemRow[]>([emptyRow()]);
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [pickedVariants, setPickedVariants] = useState<Map<string, ProductVariantListRow>>(
    () => new Map(),
  );

  useEffect(() => {
    if (transferState.ok) {
      invalidate();
      setItems([emptyRow()]);
      setFromLocationId("");
      setToLocationId("");
      setNotes("");
    }
  }, [transferState.ok, invalidate]);

  function updateItem(key: string, patch: Partial<TransferItemRow>) {
    setItems((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function pickVariant(key: string, variant: ProductVariantListRow) {
    setPickedVariants((previous) => new Map(previous).set(variant.id, variant));
    updateItem(key, { productId: variant.productId, variantId: variant.id });
  }

  function clearProduct(key: string) {
    updateItem(key, { productId: "", variantId: "" });
  }

  function addItem() {
    setItems((previous) => [...previous, emptyRow()]);
  }

  function removeItem(key: string) {
    setItems((previous) => (previous.length > 1 ? previous.filter((row) => row.key !== key) : previous));
  }

  function excludeVariantIds(currentKey: string): string[] {
    return items.filter((row) => row.key !== currentKey && row.variantId).map((row) => row.variantId);
  }

  const itemsJson = useMemo(
    () =>
      JSON.stringify(
        items
          .filter((row) => row.productId && Number(row.quantity) > 0)
          .map((row) => ({
            productId: row.productId,
            variantId: row.variantId || null,
            quantity: Number(row.quantity),
          })),
      ),
    [items],
  );

  const pendingCount = transfers.filter((t) => t.status === "pending").length;
  const inTransitCount = transfers.filter((t) => t.status === "in_transit").length;
  const partiallyReceivedCount = transfers.filter((t) => t.status === "partially_received").length;
  const receivedCount = transfers.filter((t) => t.status === "received").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={ArrowLeftRight} label="Total transfers" value={String(transfers.length)} />
        <StatCard
          icon={Clock}
          label="Draft"
          value={String(pendingCount)}
          hint="Not sent yet"
          tone={pendingCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={Send}
          label="In transit"
          value={String(inTransitCount)}
          hint="On the way"
          tone={inTransitCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={SlidersHorizontal}
          label="Partially received"
          value={String(partiallyReceivedCount)}
          hint="Some units still remaining"
          tone={partiallyReceivedCount > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={CheckCircle2}
          label="Received"
          value={String(receivedCount)}
          hint="Fully received"
          tone={receivedCount > 0 ? "success" : "neutral"}
        />
      </div>

      <Card className="space-y-4 p-4">
        <div>
          <h2 className="text-body font-semibold text-ink">New transfer</h2>
          <p className="text-caption text-ink-muted">
            One delivery can carry several product variants. From and to must differ — stock only
            moves once the destination receives it.
          </p>
        </div>

        <form action={transferAction} className="space-y-3">
          {transferState.error ? <ErrorNote>{transferState.error}</ErrorNote> : null}
          {transferState.ok ? <SuccessNote>Transfer saved.</SuccessNote> : null}
          <input type="hidden" name="items_json" value={itemsJson} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" required>
              <Combobox
                name="from_location_id"
                value={fromLocationId}
                onChange={setFromLocationId}
                placeholder="Select source"
                options={locations.map((l) => ({ value: l.id, label: `${l.name} (${l.type})` }))}
              />
            </Field>
            <Field label="To" required>
              <Combobox
                name="to_location_id"
                value={toLocationId}
                onChange={setToLocationId}
                placeholder="Select destination"
                options={locations
                  .filter((l) => l.id !== fromLocationId)
                  .map((l) => ({ value: l.id, label: `${l.name} (${l.type})` }))}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <span className="text-caption font-medium text-ink-muted">Products</span>
            {items.map((row) => {
              const picked = row.variantId ? pickedVariants.get(row.variantId) : undefined;
              return (
                <div key={row.key} className="rounded-sm border border-border bg-surface p-2">
                  <div className="flex items-start gap-2">
                    <div className="w-full">
                      <MatchProductCombobox
                        locationId={fromLocationId || undefined}
                        excludeVariantIds={excludeVariantIds(row.key)}
                        value={row.variantId}
                        selectedLabel={picked ? variantListLabel(picked) : undefined}
                        onPick={(variant) => pickVariant(row.key, variant)}
                        onClear={() => clearProduct(row.key)}
                        placeholder="Search your catalogue…"
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        placeholder="Qty"
                        value={row.quantity}
                        onChange={(event) => updateItem(row.key, { quantity: event.target.value })}
                      />
                    </div>
                    <IconButton
                      icon={Trash2}
                      label="Remove product"
                      tone="danger"
                      disabled={items.length === 1}
                      onClick={() => removeItem(row.key)}
                    />
                  </div>
                </div>
              );
            })}
            <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addItem}>
              Add another product
            </Button>
          </div>

          <Field label="Notes" required={false}>
            <Textarea
              name="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </Field>

          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border bg-surface px-3 text-caption text-ink-muted">
            <input
              type="checkbox"
              name="receive_now"
              value="true"
              className="size-4 accent-primary"
            />
            Receive immediately (move stock now)
          </label>
          <Button
            type="submit"
            loading={transferPending}
            icon={ArrowLeftRight}
            className="w-full sm:w-auto"
            disabled={mutationsLocked}
          >
            Create transfer
          </Button>
        </form>
      </Card>

      <Card>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-body font-semibold text-ink">Transfer history</h2>
          <p className="text-caption text-ink-muted">
            Draft and in-transit transfers wait until received — that is when stock moves.
          </p>
        </div>

        {transfers.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transfers yet"
            instruction="Create a transfer when a branch needs restocking from a warehouse or another branch."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Route</Th>
                <Th>Items</Th>
                <Th>Status</Th>
                <Th>Created by</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={transfer.id}>
                  <Td>
                    <p className="font-medium text-ink">
                      {transfer.fromLocationName} → {transfer.toLocationName}
                    </p>
                    <p className="text-caption text-ink-muted">
                      ST-{transfer.id.slice(0, 8).toUpperCase()}
                    </p>
                  </Td>
                  <Td className="text-ink-muted">
                    {transfer.items[0]
                      ? `${transfer.items[0].productName ?? "Product"} × ${transfer.items[0].quantity}`
                      : "—"}
                    {transfer.items.length > 1 ? ` +${transfer.items.length - 1} more` : ""}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(transfer.status)}>{STATUS_LABEL[transfer.status]}</Badge>
                  </Td>
                  <Td className="text-ink-muted">{transfer.createdByName ?? "—"}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/stock-transfers/${transfer.id}` as Route}
                        className="inline-flex"
                      >
                        <IconButton icon={Eye} label="View transfer" />
                      </Link>
                      <a href={`/api/stock-transfers/${transfer.id}/pdf`} className="inline-flex">
                        <IconButton icon={Download} label="Download PDF" />
                      </a>
                      {transfer.status !== "received" && transfer.status !== "cancelled" ? (
                        <IconButton
                          icon={X}
                          label="Cancel transfer"
                          tone="danger"
                          disabled={cancellingId === transfer.id || mutationsLocked}
                          onClick={() => {
                            setCancellingId(transfer.id);
                            setTransferStatus(transfer.id, "cancelled")
                              .then((result) => {
                                if (result.error) toast.error(result.error);
                                else {
                                  toast.success("Transfer cancelled.");
                                  invalidate();
                                }
                              })
                              .finally(() => setCancellingId(null));
                          }}
                        />
                      ) : null}
                    </div>
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
