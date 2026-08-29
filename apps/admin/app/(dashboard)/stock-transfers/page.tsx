"use client";

import { useActionState, useEffect, useTransition } from "react";
import { ArrowLeftRight, Check, X } from "lucide-react";
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

  useEffect(() => {
    if (transferState.ok) invalidate();
  }, [transferState.ok, invalidate]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_1fr]">
      <Card className="space-y-4 p-4 self-start">
        <div>
          <h2 className="text-body font-semibold text-ink">New transfer</h2>
          <p className="text-caption text-ink-muted">
            From and to must differ. Receive now moves stock immediately.
          </p>
        </div>

        <form action={transferAction} className="space-y-3">
          {transferState.error ? <ErrorNote>{transferState.error}</ErrorNote> : null}
          {transferState.ok ? <SuccessNote>Transfer saved.</SuccessNote> : null}
          <Field label="From" required>
            <Select name="from_location_id" required defaultValue="">
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
            <Select name="to_location_id" required defaultValue="">
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
          <Field label="Product" required>
            <Combobox
              name="product_id"
              required
              defaultValue=""
              placeholder="Select product"
              options={products.map((product) => ({ value: product.id, label: product.name }))}
            />
          </Field>
          <Field label="Quantity" required>
            <Input name="quantity" type="number" min="0.001" step="any" required />
          </Field>
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
          <Button type="submit" loading={transferPending} icon={ArrowLeftRight} className="w-full" disabled={mutationsLocked}>
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
