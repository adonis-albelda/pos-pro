"use client";

import { useActionState, useEffect, useTransition } from "react";
import { MapPin, Warehouse } from "lucide-react";
import type { Location, StockTransfer } from "@double-a/shared-types";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  SuccessNote,
} from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateLocations, useLocations, useStockTransfers } from "@/lib/query/locations";
import { useProducts } from "@/lib/query/products";
import { removeLocation, saveLocation, saveTransfer, setTransferStatus } from "./actions";

export default function LocationsPage() {
  const locationsQuery = useLocations({ includeInactive: true });
  const transfersQuery = useStockTransfers();
  const productsQuery = useProducts({ includeInactive: false, pageSize: 200 });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MapPin}
        title="Locations"
        description="Branches sell; warehouses hold stock. Transfer between them when a branch needs restocking."
      />

      {locationsQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : locationsQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {locationsQuery.error instanceof Error
            ? locationsQuery.error.message
            : "Could not load locations."}
        </Card>
      ) : (
        <LocationsBody
          locations={locationsQuery.data ?? []}
          transfers={transfersQuery.data?.transfers ?? []}
          products={productsQuery.data?.products ?? []}
        />
      )}
    </div>
  );
}

function LocationsBody({
  locations,
  transfers,
  products,
}: {
  locations: Location[];
  transfers: StockTransfer[];
  products: Array<{ id: string; name: string }>;
}) {
  const invalidate = useInvalidateLocations();
  const [locationState, locationAction, locationPending] = useActionState(
    saveLocation,
    EMPTY_FORM_STATE,
  );
  const [transferState, transferAction, transferPending] = useActionState(
    saveTransfer,
    EMPTY_FORM_STATE,
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (locationState.ok || transferState.ok) invalidate();
  }, [locationState.ok, transferState.ok, invalidate]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-4">
        <h2 className="text-title font-semibold text-ink">Locations</h2>
        <ul className="divide-y divide-border">
          {locations.map((location) => (
            <li key={location.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-body font-medium text-ink">{location.name}</p>
                <p className="text-caption text-ink-muted">
                  {location.type}
                  {location.address ? ` · ${location.address}` : ""}
                  {!location.isActive ? " · inactive" : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await removeLocation(location.id);
                    invalidate();
                  })
                }
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>

        <form action={locationAction} className="space-y-3 border-t border-border pt-4">
          <h3 className="text-body font-medium text-ink">Add location</h3>
          {locationState.error ? <ErrorNote>{locationState.error}</ErrorNote> : null}
          {locationState.ok ? <SuccessNote>Saved.</SuccessNote> : null}
          <Field label="Name">
            <Input name="name" required />
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue="branch">
              <option value="branch">Branch</option>
              <option value="warehouse">Warehouse</option>
            </Select>
          </Field>
          <Field label="Address">
            <Input name="address" />
          </Field>
          <Button type="submit" disabled={locationPending}>
            {locationPending ? "Saving…" : "Add location"}
          </Button>
        </form>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="flex items-center gap-2 text-title font-semibold text-ink">
          <Warehouse size={18} /> Stock transfers
        </h2>

        <form action={transferAction} className="space-y-3">
          {transferState.error ? <ErrorNote>{transferState.error}</ErrorNote> : null}
          {transferState.ok ? <SuccessNote>Transfer saved.</SuccessNote> : null}
          <Field label="From">
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
          <Field label="To">
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
          <Field label="Product">
            <Select name="product_id" required defaultValue="">
              <option value="" disabled>
                Select product
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity">
            <Input name="quantity" type="number" min="0.001" step="any" required />
          </Field>
          <label className="flex items-center gap-2 text-caption text-ink-muted">
            <input
              type="checkbox"
              name="receive_now"
              value="true"
              defaultChecked
              className="accent-primary"
            />
            Receive immediately (move stock now)
          </label>
          <Button type="submit" disabled={transferPending}>
            {transferPending ? "Saving…" : "Create transfer"}
          </Button>
        </form>

        <ul className="divide-y divide-border border-t border-border pt-4">
          {transfers.length === 0 ? (
            <li className="py-3 text-caption text-ink-muted">No transfers yet.</li>
          ) : (
            transfers.map((transfer) => (
              <li key={transfer.id} className="space-y-2 py-3">
                <p className="text-body text-ink">
                  {transfer.fromLocationName} → {transfer.toLocationName}
                </p>
                <p className="text-caption text-ink-muted">
                  {transfer.status}
                  {transfer.items[0]
                    ? ` · ${transfer.items[0].productName ?? "product"} × ${transfer.items[0].quantity}`
                    : ""}
                </p>
                {transfer.status !== "received" && transfer.status !== "cancelled" ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await setTransferStatus(transfer.id, "received");
                          invalidate();
                        })
                      }
                    >
                      Mark received
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await setTransferStatus(transfer.id, "cancelled");
                          invalidate();
                        })
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
