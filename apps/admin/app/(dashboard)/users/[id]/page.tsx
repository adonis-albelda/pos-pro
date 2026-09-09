"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserCog } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import {
  createTerminal,
  deleteTerminal,
  listTerminals,
  setUserPin,
  updateUser,
  type UpsertTerminalInput,
} from "@double-a/api-client/queries";
import type { Terminal, UserRole } from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { useInvalidateUsers, useUser } from "@/lib/query/users";
import { useLocations } from "@/lib/query/locations";

const EDIT_ROLES: { value: Extract<UserRole, "admin" | "manager" | "cashier" | "inventory_clerk" | "device" | "driver" | "helper">; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "inventory_clerk", label: "Inventory Clerk" },
  { value: "device", label: "Terminal (legacy device user)" },
  { value: "driver", label: "Driver" },
  { value: "helper", label: "Helper" },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Save failed.";
}

export default function EditUserPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const userQuery = useUser(id);
  const locationsQuery = useLocations({ includeInactive: false });
  const invalidate = useInvalidateUsers();
  const [pending, setPending] = useState(false);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalsLoading, setTerminalsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setTerminalsLoading(true);
    listTerminals(getBrowserApiClient(), { userId: id })
      .then((rows) => {
        if (!cancelled) setTerminals(rows);
      })
      .catch(() => {
        if (!cancelled) setTerminals([]);
      })
      .finally(() => {
        if (!cancelled) setTerminalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userQuery.data) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const username = String(form.get("username") ?? "").trim() || null;
    const role = String(form.get("role") ?? userQuery.data.role) as (typeof EDIT_ROLES)[number]["value"];
    const pin = String(form.get("pin") ?? "").trim();
    const isActive = form.get("is_active") === "on";

    setPending(true);
    try {
      const client = getBrowserApiClient();
      await updateUser(client, id, { name, email, username, role, isActive });
      if (pin) await setUserPin(client, id, pin);
      invalidate();
      toast.success("User saved.");
      await userQuery.refetch();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function onAddTerminal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: UpsertTerminalInput = {
      userId: id,
      name: String(form.get("name") ?? "").trim(),
      code: String(form.get("code") ?? "").trim(),
      deviceIdentifier: String(form.get("device_identifier") ?? "").trim() || null,
      locationId: String(form.get("location_id") ?? "").trim() || null,
      status: "active",
    };
    if (!input.name || !input.code) {
      toast.error("Terminal name and code required.");
      return;
    }
    try {
      const row = await createTerminal(getBrowserApiClient(), input);
      setTerminals((prev) => [...prev, row].sort((a, b) => a.name.localeCompare(b.name)));
      (event.target as HTMLFormElement).reset();
      toast.success("Terminal linked.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onRemoveTerminal(terminalId: string) {
    try {
      await deleteTerminal(getBrowserApiClient(), terminalId);
      setTerminals((prev) => prev.filter((row) => row.id !== terminalId));
      toast.success("Terminal removed.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (userQuery.isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }
  if (userQuery.isError || !userQuery.data) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {userQuery.error instanceof Error ? userQuery.error.message : "User not found."}
      </Card>
    );
  }

  const user = userQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        icon={UserCog}
        title={user.name}
        description="Update login fields, role, PIN. Link many terminals to this user below."
        action={
          <Button type="button" variant="secondary" onClick={() => router.push("/users")}>
            Back to users
          </Button>
        }
      />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4 p-4 sm:p-5">
          <Field label="Full name" required>
            <Input name="name" defaultValue={user.name} required />
          </Field>
          <Field label="Email" required>
            <Input name="email" type="email" defaultValue={user.email} required />
          </Field>
          <Field label="Username">
            <Input name="username" defaultValue={user.username ?? ""} />
          </Field>
          <Field label="Role" required>
            <Select name="role" defaultValue={user.role}>
              {EDIT_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New PIN" hint="Leave blank to keep current PIN.">
            <Input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="text-caption text-ink-muted">
              Last login:{" "}
              <span className="font-medium text-ink">
                {user.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleString("en-PH")
                  : "Never"}
              </span>
            </p>
            <p className="text-caption text-ink-muted">
              PIN set:{" "}
              <Badge tone={user.hasPin ? "success" : "neutral"}>
                {user.hasPin ? "Yes" : "No"}
              </Badge>
            </p>
          </div>
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={user.isActive}
              className="size-4 accent-primary"
            />
            Active
          </label>
          <p className="text-caption text-ink-muted">
            Profile photo upload comes next (avatar_url column ready on API).
          </p>
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              Save user
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="text-body-lg font-semibold text-ink">Terminals</h2>
          <p className="text-caption text-ink-muted">
            One user may link to many tills. POS enroll still uses legacy device users until migrated.
          </p>
        </div>

        {terminalsLoading ? (
          <p className="text-caption text-ink-muted">Loading terminals…</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Code</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {terminals.length === 0 ? (
                <tr>
                  <Td colSpan={4} className="py-4 text-center text-ink-muted">
                    No terminals linked yet.
                  </Td>
                </tr>
              ) : (
                terminals.map((terminal) => (
                  <tr key={terminal.id} className="border-t border-border">
                    <Td>{terminal.name}</Td>
                    <Td className="font-mono text-caption">{terminal.code}</Td>
                    <Td>
                      <Badge tone="neutral">{terminal.status}</Badge>
                    </Td>
                    <Td>
                      <button
                        type="button"
                        className="text-caption text-danger hover:underline"
                        onClick={() => onRemoveTerminal(terminal.id)}
                      >
                        Remove
                      </button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        )}

        <form onSubmit={onAddTerminal} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input name="name" required placeholder="Counter 1" />
          </Field>
          <Field label="Code" required>
            <Input name="code" required placeholder="TILL-01" />
          </Field>
          <Field label="Device identifier">
            <Input name="device_identifier" placeholder="Optional hardware id" />
          </Field>
          <Field label="Branch">
            <Select name="location_id" defaultValue="">
              <option value="">—</option>
              {(locationsQuery.data ?? [])
                .filter((location) => location.type === "branch")
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="secondary" size="sm">
              Add terminal
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
