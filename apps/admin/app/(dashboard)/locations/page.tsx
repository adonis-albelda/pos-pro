"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import {
  Eye,
  EyeOff,
  MapPin,
  Plus,
  Store,
  Trash2,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import type { Location } from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
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
import { ConfirmDialog, Sheet } from "@/components/overlay";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateLocations, useLocations } from "@/lib/query/locations";
import { removeLocation, saveLocation, setLocationActive } from "./actions";

export default function LocationsPage() {
  const locationsQuery = useLocations({ includeInactive: true });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MapPin}
        title="Locations"
        description="Branches sell on the floor. Warehouses hold bulk stock. Disable a location to hide it from POS enrollment and transfers without deleting history."
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
        <LocationsBody locations={locationsQuery.data ?? []} />
      )}
    </div>
  );
}

function LocationsBody({ locations }: { locations: Location[] }) {
  const mutationsLocked = useLocationMutationsLocked();
  const invalidate = useInvalidateLocations();
  const [creating, setCreating] = useState(false);
  const [togglingOff, setTogglingOff] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [pending, startTransition] = useTransition();

  const branches = locations.filter((l) => l.type === "branch").length;
  const warehouses = locations.filter((l) => l.type === "warehouse").length;
  const inactive = locations.filter((l) => !l.isActive).length;

  function applyActive(location: Location, next: boolean) {
    startTransition(async () => {
      const result = await setLocationActive(location.id, next);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(next ? "Location enabled." : "Location disabled.");
        invalidate();
      }
      setTogglingOff(null);
    });
  }

  function onToggleClick(location: Location) {
    if (location.isActive) {
      setTogglingOff(location);
      return;
    }
    applyActive(location, true);
  }

  function confirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const result = await removeLocation(deleting.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Location deleted.");
        invalidate();
      }
      setDeleting(null);
    });
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-caption text-ink-muted">Branches</p>
          <p className="text-title font-semibold text-ink">{branches}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-caption text-ink-muted">Warehouses</p>
          <p className="text-title font-semibold text-ink">{warehouses}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-caption text-ink-muted">Inactive</p>
          <p className="text-title font-semibold text-ink">{inactive}</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-body font-semibold text-ink">All locations</h2>
            <p className="text-caption text-ink-muted">
              {locations.length} total · enable or disable without losing stock history
            </p>
          </div>
          <Button type="button" size="sm" icon={Plus} onClick={() => setCreating(true)} disabled={mutationsLocked}>
            Add location
          </Button>
        </div>

        {locations.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No locations yet"
            instruction="Add a branch for selling and a warehouse if you hold stock off the floor."
            action={
              <Button type="button" icon={Plus} onClick={() => setCreating(true)} disabled={mutationsLocked}>
                Add location
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Address</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => {
                const TypeIcon = location.type === "warehouse" ? Warehouse : Store;
                return (
                  <tr
                    key={location.id}
                    className={location.isActive ? undefined : "opacity-60"}
                  >
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <TypeIcon size={14} strokeWidth={2} />
                        </span>
                        <span className="font-medium">{location.name}</span>
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={location.type === "warehouse" ? "warning" : "neutral"}>
                        {location.type === "warehouse" ? "Warehouse" : "Branch"}
                      </Badge>
                    </Td>
                    <Td className="text-ink-muted">{location.address || "—"}</Td>
                    <Td>
                      {location.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Inactive</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconButton
                          icon={location.isActive ? EyeOff : Eye}
                          label={location.isActive ? "Disable location" : "Enable location"}
                          onClick={() => onToggleClick(location)}
                          disabled={pending || mutationsLocked}
                        />
                        <IconButton
                          icon={Trash2}
                          label="Delete location"
                          tone="danger"
                          onClick={() => setDeleting(location)}
                          disabled={pending || mutationsLocked}
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Add location"
        description="Branches enroll POS terminals. Warehouses only hold stock."
      >
        <AddLocationForm
          onDone={() => {
            setCreating(false);
            invalidate();
          }}
        />
      </Sheet>

      <ConfirmDialog
        open={togglingOff !== null}
        onClose={() => setTogglingOff(null)}
        onConfirm={() => {
          if (togglingOff) applyActive(togglingOff, false);
        }}
        title="Disable location?"
        description={
          togglingOff
            ? `${togglingOff.name} will stop appearing for new transfers and terminal enrollment. Existing stock stays.`
            : ""
        }
        confirmLabel="Disable"
        pending={pending}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete location?"
        description={
          deleting
            ? `Permanently remove ${deleting.name}. Prefer disable if this location ever held stock or sales.`
            : ""
        }
        confirmLabel="Delete"
        confirmationText={deleting?.name ?? ""}
        pending={pending}
      />
    </>
  );
}

function AddLocationForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(saveLocation, EMPTY_FORM_STATE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? <SuccessNote>Location saved.</SuccessNote> : null}
      <Field label="Name" required>
        <Input name="name" required placeholder="Main Branch" />
      </Field>
      <Field label="Type" required>
        <Select name="type" defaultValue="branch">
          <option value="branch">Branch — sells on POS</option>
          <option value="warehouse">Warehouse — holds stock only</option>
        </Select>
      </Field>
      <Field label="Address" required={false}>
        <Input name="address" placeholder="Optional" />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} icon={Plus}>
          Add location
        </Button>
      </div>
    </form>
  );
}
