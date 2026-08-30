"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ArrowLeftRight, Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Location, StockTransfer } from "@double-a/shared-types";
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
  PageHeader,
  Select,
  SuccessNote,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateLocations, useLocations, useStockTransfers } from "@/lib/query/locations";
import { useProducts } from "@/lib/query/products";
import { saveTransfer, setTransferStatus } from "./actions";

export default function StockTransfersPage() {
  const locationsQuery = useLocations({ includeInactive: false });
  const transfersQuery = useStockTransfers();
  const productsQuery = useProducts({ includeInactive: false, pageSize: 200 });

  const loading =
    locationsQuery.isPending || transfersQuery.isPending || productsQuery.isPending;
  const error =
    locationsQuery.error ?? transfersQuery.error ?? productsQuery.error;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ArrowLeftRight}
        title="Stock transfers"
        description="Move units between branches and warehouses. Stock only changes when a transfer is marked received."
      />

      {loading ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : error ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {error instanceof Error ? error.message : "Could not load transfers."}
        </Card>
      ) : (
        <TransfersBody
          locations={locationsQuery.data ?? []}
          transfers={transfersQuery.data?.transfers ?? []}
          products={productsQuery.data?.products ?? []}
        />
      )}
    </div>
  );
}

interface TransferItemRow {
  key: string;
  productId: string;
  quantity: string;
}

function newRowKey(): string {
  return Math.random().toString(36).slice(2);
}

function emptyRow(): TransferItemRow {
  return { key: newRowKey(), productId: "", quantity: "" };
}

function statusTone(status: StockTransfer["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "received") return "success";
  if (status === "cancelled") return "neutral";
  if (status === "in_transit") return "warning";
  return "warning";
}

function TransfersBody({
  locations,
  transfers,
  products,
}: {
  locations: Location[];
  transfers: StockTransfer[];
  products: Array<{ id: string; name: string }>;
}) {
  const mutationsLocked = useLocationMutationsLocked();
  const invalidate = useInvalidateLocations();
  const [transferState, transferAction, transferPending] = useActionState(
    saveTransfer,
    EMPTY_FORM_STATE,
  );
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<TransferItemRow[]>([emptyRow()]);
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");

  // Location-scoped stock, fetched only once a side is picked — this is what
  // lets each row show "N left at the source" / "N once received" instead of
  // the company-wide total the plain product list carries.
  const fromStockQuery = useProducts(
    { locationId: fromLocationId, includeInactive: false, pageSize: 200 },
    { enabled: Boolean(fromLocationId) },
  );
  const toStockQuery = useProducts(
    { locationId: toLocationId, includeInactive: false, pageSize: 200 },
    { enabled: Boolean(toLocationId) },
  );
  const fromStockById = new Map(
    (fromStockQuery.data?.products ?? []).map((product) => [product.id, product.stockQuantity]),
  );
  const toStockById = new Map(
    (toStockQuery.data?.products ?? []).map((product) => [product.id, product.stockQuantity]),
  );

  useEffect(() => {
    if (transferState.ok) {
      invalidate();
      // One transfer can carry several products (a single delivery) — start
      // the next one clean rather than leaving the last one's rows behind.
      setItems([emptyRow()]);
      setFromLocationId("");
      setToLocationId("");
    }
  }, [transferState.ok, invalidate]);

  function updateItem(key: string, patch: Partial<TransferItemRow>) {
    setItems((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addItem() {
    setItems((previous) => [...previous, emptyRow()]);
  }

  function removeItem(key: string) {
    setItems((previous) => (previous.length > 1 ? previous.filter((row) => row.key !== key) : previous));
  }

  const itemsJson = JSON.stringify(
    items
      .filter((row) => row.productId && Number(row.quantity) > 0)
      .map((row) => ({ productId: row.productId, quantity: Number(row.quantity) })),
  );

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-4">
        <div>
          <h2 className="text-body font-semibold text-ink">New transfer</h2>
          <p className="text-caption text-ink-muted">
            One delivery can carry several products. From and to must differ — receive now moves
            stock immediately.
          </p>
        </div>

        <form action={transferAction} className="space-y-3">
          {transferState.error ? <ErrorNote>{transferState.error}</ErrorNote> : null}
          {transferState.ok ? <SuccessNote>Transfer saved.</SuccessNote> : null}
          <input type="hidden" name="items_json" value={itemsJson} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" required>
              <Select
                name="from_location_id"
                required
                value={fromLocationId}
                onChange={(event) => setFromLocationId(event.target.value)}
              >
                <option value="" disabled>
                  Select source
                </option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({location.type})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To" required>
              <Select
                name="to_location_id"
                required
                value={toLocationId}
                onChange={(event) => setToLocationId(event.target.value)}
              >
                <option value="" disabled>
                  Select destination
                </option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({location.type})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="space-y-2">
            <span className="text-caption font-medium text-ink-muted">Products</span>
            {items.map((row) => {
              const quantity = Number(row.quantity) || 0;
              const sourceStock = row.productId ? fromStockById.get(row.productId) : undefined;
              const destStock = row.productId ? toStockById.get(row.productId) : undefined;
              // Same product on two rows would just split one delivery's
              // quantity across rows for no reason — one row, one product;
              // add more of it by editing that row's quantity instead.
              const usedElsewhere = new Set(
                items
                  .filter((other) => other.key !== row.key && other.productId)
                  .map((other) => other.productId),
              );

              return (
                <div key={row.key} className="rounded-sm border border-border bg-surface p-2">
                  <div className="flex items-start gap-2">
                    <div className="w-full">
                      <Combobox
                        value={row.productId}
                        onChange={(productId) => updateItem(row.key, { productId })}
                        placeholder="Select product"
                        emptyLabel="Every matching product is already on another row."
                        options={products
                          .filter((product) => !usedElsewhere.has(product.id))
                          .map((product) => ({
                            value: product.id,
                            label: product.name,
                          }))}
                      />
                    </div>
                    <div className="w-48">
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        placeholder="Qty"
                        className="w-24"
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

                  {row.productId && (fromLocationId || toLocationId) ? (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-1 text-caption">
                      {fromLocationId ? (
                        sourceStock === undefined ? (
                          <span className="text-ink-muted">Not stocked at the source.</span>
                        ) : (
                          <span
                            className={
                              sourceStock - quantity < 0 ? "font-medium text-danger" : "text-ink-muted"
                            }
                          >
                            Remaining at source after transfer:{" "}
                            <span className="font-medium">{sourceStock - quantity}</span> (currently{" "}
                            {sourceStock})
                          </span>
                        )
                      ) : null}
                      {toLocationId ? (
                        <span className="text-ink-muted">
                          New stock at destination once received:{" "}
                          <span className="font-medium text-ink">
                            {(destStock ?? 0) + quantity}
                          </span>{" "}
                          (currently {destStock ?? 0})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addItem}>
              Add another product
            </Button>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border bg-surface px-3 text-caption text-ink-muted">
            <input
              type="checkbox"
              name="receive_now"
              value="true"
              defaultChecked
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
            Pending transfers wait until marked received — that is when stock moves.
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
                  </Td>
                  <Td className="text-ink-muted">
                    {transfer.items[0]
                      ? `${transfer.items[0].productName ?? "Product"} × ${transfer.items[0].quantity}`
                      : "—"}
                    {transfer.items.length > 1
                      ? ` +${transfer.items.length - 1} more`
                      : ""}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(transfer.status)}>{transfer.status}</Badge>
                  </Td>
                  <Td>
                    {transfer.status !== "received" && transfer.status !== "cancelled" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon={Check}
                          disabled={pending || mutationsLocked}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await setTransferStatus(transfer.id, "received");
                              if (result.error) toast.error(result.error);
                              else {
                                toast.success("Marked received.");
                                invalidate();
                              }
                            })
                          }
                        >
                          Receive
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon={X}
                          disabled={pending || mutationsLocked}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await setTransferStatus(transfer.id, "cancelled");
                              if (result.error) toast.error(result.error);
                              else {
                                toast.success("Transfer cancelled.");
                                invalidate();
                              }
                            })
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : null}
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
