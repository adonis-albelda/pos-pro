"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Save,
  Smartphone,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import {
  createTerminal,
  deleteTerminal,
  listTerminals,
  setUserPin,
  uploadUserAvatar,
  type UpsertTerminalInput,
} from "@double-a/api-client/queries";
import { ROLES, type Terminal, type User, type UserRole } from "@double-a/shared-types";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FileInput,
  IconButton,
  Input,
  Select,
  StatCard,
  Table,
  TableSkeleton,
  Td,
  Th,
} from "@/components/ui";
import { ConfirmDialog, Sheet } from "@/components/overlay";
import { PasswordInput } from "@/components/password-input";
import { Pagination, SearchField } from "@/components/record-list";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { isImageFile, NOT_AN_IMAGE_MESSAGE } from "@/lib/is-image-file";
import { useCurrentUser } from "@/lib/query/session";
import { useLocations } from "@/lib/query/locations";
import {
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUser,
  useUserRoles,
  useUsers,
} from "@/lib/query/users";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Request failed.";
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function UsersPage() {
  const searchParams = useSearchParams();
  const { q, page } = parseListQuery({
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
  });
  const { data: currentUser } = useCurrentUser();
  const usersQuery = useUsers({ includeInactive: true });
  const rolesQuery = useUserRoles();
  const roleLabel: Record<string, string> = Object.fromEntries(
    (rolesQuery.data ?? []).map((role) => [role.name, role.label]),
  );
  const deleteUser = useDeleteUser();

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  // Never the signed-in account itself — it isn't a row to edit or delete
  // from here, and showing it invites exactly the mistake the backend
  // separately blocks (UserPolicy::delete).
  const users = (usersQuery.data ?? []).filter((user) => user.id !== currentUser?.id);
  const activeCount = users.filter((user) => user.isActive).length;
  const inactiveCount = users.filter((user) => !user.isActive).length;

  const filtered = users.filter((user) =>
    matchesQuery([user.name, user.email, user.username ?? "", user.role], q),
  );
  const { pageItems, page: safePage, pageCount, total, pageSize } = paginateItems(filtered, page);

  function confirmDelete() {
    if (!deleting) return;
    deleteUser.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("User deleted.");
        setDeleting(null);
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Total users" value={String(users.length)} loading={usersQuery.isPending} />
        <StatCard
          icon={UserCheck}
          label="Active"
          value={String(activeCount)}
          tone="success"
          loading={usersQuery.isPending}
        />
        <StatCard
          icon={UserX}
          label="Inactive"
          value={String(inactiveCount)}
          tone={inactiveCount > 0 ? "neutral" : "success"}
          loading={usersQuery.isPending}
        />
      </div>

      {usersQuery.isPending ? (
        <TableSkeleton columns={["w-40", "w-48", "w-20", "w-16", "w-28", "w-12"]} />
      ) : usersQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {usersQuery.error instanceof Error ? usersQuery.error.message : "Could not load users."}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <CardHeader
            icon={Users}
            title="Users"
            description="One directory for every login. Your own account doesn't show here — edit it from the account menu."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <SearchField placeholder="Search name, email, username…" defaultValue={q} />
                <Button type="button" icon={Plus} onClick={() => setCreating(true)}>
                  New user
                </Button>
              </div>
            }
          />

          {total === 0 ? (
            <EmptyState
              icon={Users}
              title={q ? "Nothing matches that search" : "No other users yet"}
              instruction={
                q ? "Try a different name, email, or username." : "Create a login for a manager, cashier, or clerk."
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email / username</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Last login</Th>
                  <Th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((user) => (
                  <tr key={user.id} className="border-t border-border">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                        ) : (
                          <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold text-primary">
                            {user.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="font-medium text-ink">{user.name}</span>
                      </div>
                    </Td>
                    <Td>
                      <div className="min-w-0">
                        <p className="truncate text-body text-ink">{user.email ?? "—"}</p>
                        {user.username ? (
                          <p className="truncate text-caption text-ink-muted">@{user.username}</p>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone="neutral">{roleLabel[user.role] ?? user.role}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={user.isActive ? "success" : "danger"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </Td>
                    <Td className="text-caption text-ink-muted">{formatWhen(user.lastLoginAt)}</Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <IconButton icon={UserCog} label="Edit user" onClick={() => setEditingId(user.id)} />
                        <IconButton
                          icon={Trash2}
                          label="Delete user"
                          tone="danger"
                          onClick={() => setDeleting(user)}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <Pagination
            page={safePage}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            basePath="/users"
            query={{ q: q || undefined }}
          />
        </Card>
      )}

      <CreateUserSheet open={creating} onClose={() => setCreating(false)} />
      <EditUserSheet userId={editingId} onClose={() => setEditingId(null)} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={deleteUser.isPending}
        title="Delete user?"
        description={
          deleting
            ? `${deleting.name} loses access immediately. This is a soft delete — restorable from the database if needed, but there is no Undo in this screen.`
            : ""
        }
        confirmLabel="Delete user"
      />
    </div>
  );
}

function CreateUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createUser = useCreateUser();
  const rolesQuery = useUserRoles();
  const roles = rolesQuery.data ?? [];
  const locationsQuery = useLocations({ type: "branch" });
  const branches = locationsQuery.data ?? [];
  const [role, setRole] = useState<UserRole>("cashier");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file && !isImageFile(file)) {
      toast.error(NOT_AN_IMAGE_MESSAGE);
      event.currentTarget.value = "";
      return;
    }
    setAvatarFile(file ?? null);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim() || null;
    const username = String(form.get("username") ?? "").trim() || null;
    const role = String(form.get("role") ?? "cashier") as Extract<
      UserRole,
      "cashier" | "admin" | "manager" | "inventory_clerk" | "terminal"
    >;
    const password = String(form.get("password") ?? "");
    const pin = String(form.get("pin") ?? "").trim() || null;
    const isActive = form.get("is_active") === "on";
    const locationId = String(form.get("location_id") ?? "").trim() || null;
    const code = String(form.get("code") ?? "").trim();
    const deviceIdentifier = String(form.get("device_identifier") ?? "").trim() || null;

    if (!name) {
      toast.error("Name is required.");
      return;
    }
    if (!email && !username) {
      toast.error("Set an email or a username — an account needs at least one.");
      return;
    }
    if (username?.includes("@")) {
      toast.error("Username cannot look like an email address.");
      return;
    }
    if ((role === ROLES.ADMIN || role === ROLES.MANAGER || role === ROLES.INVENTORY_CLERK || role === ROLES.TERMINAL) && password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (role === ROLES.TERMINAL && !locationId) {
      toast.error("Pick which branch this terminal sells from.");
      return;
    }
    if (role === ROLES.TERMINAL && !code) {
      toast.error("Give this terminal a code.");
      return;
    }

    setPending(true);
    try {
      const user = await createUser.mutateAsync({
        name,
        email,
        username,
        role,
        password: password || null,
        isActive,
        canSell: role === ROLES.CASHIER || role === ROLES.ADMIN || role === ROLES.MANAGER,
        pin: null,
        locationId: role === ROLES.TERMINAL ? locationId : undefined,
      });
      if (pin) {
        await setUserPin(getBrowserApiClient(), user.id, pin);
      }
      if (avatarFile) {
        await uploadUserAvatar(getBrowserApiClient(), user.id, avatarFile);
      }
      if (role === ROLES.TERMINAL) {
        await createTerminal(getBrowserApiClient(), {
          userId: user.id,
          name,
          code,
          deviceIdentifier,
          locationId,
          status: "active",
        });
      }
      toast.success("User created.");
      (event.target as HTMLFormElement).reset();
      setRole("cashier");
      setAvatarFile(null);
      setAvatarPreview(null);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      className="min-w-2xl max-w-2xl"
      open={open}
      onClose={onClose}
      title="New user"
      description="Email or username, password, optional PIN, role, and active flag."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" icon={X} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-user-form" icon={UserPlus} loading={pending}>
            Create user
          </Button>
        </div>
      }
    >
      <form id="new-user-form" onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-paper">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="size-full object-cover" />
            ) : (
              <UserPlus size={20} strokeWidth={2} className="text-ink-muted" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <Field label="Photo" hint="PNG, JPEG or WebP, under 1 MB." required={false}>
              <FileInput name="avatar" accept="image/png,image/jpeg,image/webp" onChange={onAvatarChange} />
            </Field>
          </div>
        </div>
        <Field label="Full name" required>
          <Input name="name" required autoComplete="name" />
        </Field>
        <Field label="Email" hint="Optional — sign-in by email requires it be verified.">
          <Input name="email" type="email" autoComplete="email" />
        </Field>
        <Field label="Username" hint="Set one of email/username. Cannot look like an email address.">
          <Input name="username" autoComplete="username" />
        </Field>
        <Field label="Role" required>
          <Select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        {role === ROLES.TERMINAL ? (
          <>
            <Field label="Code" hint="Short till code, e.g. TILL-01." required>
              <Input name="code" required placeholder="TILL-01" />
            </Field>
            <Field label="Device identifier" hint="Optional hardware id.">
              <Input name="device_identifier" placeholder="Optional hardware id" />
            </Field>
            <Field label="Branch" hint="Stock for this terminal comes from this branch only." required>
              <Select name="location_id" defaultValue={branches[0]?.id ?? ""}>
                {branches.length === 0 ? (
                  <option value="">No branches yet — add one under Locations</option>
                ) : (
                  branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))
                )}
              </Select>
            </Field>
          </>
        ) : null}
        <Field
          label="Password"
          hint={
            role === ROLES.TERMINAL
              ? "Enter this on the POS app's setup screen to connect the terminal."
              : "Required for Admin, Manager, Inventory Clerk."
          }
        >
          <PasswordInput name="password" autoComplete="new-password" />
        </Field>
        {role !== ROLES.TERMINAL ? (
          <Field label="PIN" hint="Optional 4–6 digits for terminal unlock.">
            <Input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} />
          </Field>
        ) : null}
        <label className="flex items-center gap-2 text-body text-ink">
          <input type="checkbox" name="is_active" defaultChecked className="size-4 accent-primary" />
          Active
        </label>
      </form>
    </Sheet>
  );
}

function EditUserSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const userQuery = useUser(userId);
  const updateUser = useUpdateUser();
  const rolesQuery = useUserRoles();
  const roles = rolesQuery.data ?? [];
  const locationsQuery = useLocations({ includeInactive: false });
  const [pending, setPending] = useState(false);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalsLoading, setTerminalsLoading] = useState(true);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    // A new user was picked — drop the previous one's unsent preview/file.
    setAvatarFile(null);
    setAvatarPreview(null);
  }, [userId]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file && !isImageFile(file)) {
      toast.error(NOT_AN_IMAGE_MESSAGE);
      event.currentTarget.value = "";
      return;
    }
    setAvatarFile(file ?? null);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  }

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setTerminalsLoading(true);
    listTerminals(getBrowserApiClient(), { userId })
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
  }, [userId]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !userQuery.data) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const username = String(form.get("username") ?? "").trim() || null;
    const role = String(form.get("role") ?? userQuery.data.role) as Extract<
      UserRole,
      "cashier" | "admin" | "manager" | "inventory_clerk" | "terminal"
    >;
    const pin = String(form.get("pin") ?? "").trim();
    const isActive = form.get("is_active") === "on";

    setPending(true);
    try {
      await updateUser.mutateAsync({ id: userId, patch: { name, email, username, role, isActive } });
      if (pin) await setUserPin(getBrowserApiClient(), userId, pin);
      if (avatarFile) await uploadUserAvatar(getBrowserApiClient(), userId, avatarFile);
      toast.success("User saved.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function onAddTerminal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId) return;
    const form = new FormData(event.currentTarget);
    const input: UpsertTerminalInput = {
      userId,
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

  const user = userQuery.data;

  return (
    <Sheet
      open={userId !== null}
      onClose={onClose}
      title={user ? user.name : "Edit user"}
      description="Update login fields, role, PIN. Link terminals below."
      wide
      footer={
        user ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" icon={X} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="edit-user-form" icon={Save} loading={pending}>
              Save user
            </Button>
          </div>
        ) : null
      }
    >
      {userQuery.isPending ? (
        <p className="py-8 text-center text-body text-ink-muted">Loading…</p>
      ) : userQuery.isError || !user ? (
        <p className="py-8 text-center text-body text-danger">
          {userQuery.error instanceof Error ? userQuery.error.message : "User not found."}
        </p>
      ) : (
        <div className="space-y-6">
          <form id="edit-user-form" onSubmit={onSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-paper">
                {avatarPreview ?? user.avatarUrl ? (
                  <img src={avatarPreview ?? user.avatarUrl ?? ""} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-body-lg font-semibold text-ink-muted">
                    {user.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <Field label="Photo" hint="PNG, JPEG or WebP, under 1 MB." required={false}>
                  <FileInput name="avatar" accept="image/png,image/jpeg,image/webp" onChange={onAvatarChange} />
                </Field>
              </div>
            </div>
            <Field label="Full name" required>
              <Input name="name" defaultValue={user.name} required />
            </Field>
            <Field label="Email" hint="Optional — sign-in by email requires it be verified.">
              <Input name="email" type="email" defaultValue={user.email ?? ""} />
            </Field>
            <Field label="Username" hint="Cannot look like an email address.">
              <Input name="username" defaultValue={user.username ?? ""} />
            </Field>
            <Field label="Role" required>
              <Select name="role" defaultValue={user.role}>
                {roles.map((role) => (
                  <option key={role.name} value={role.name}>
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
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-PH") : "Never"}
                </span>
              </p>
              <p className="text-caption text-ink-muted">
                PIN set: <Badge tone={user.hasPin ? "success" : "neutral"}>{user.hasPin ? "Yes" : "No"}</Badge>
              </p>
            </div>
            <label className="flex items-center gap-2 text-body text-ink">
              <input type="checkbox" name="is_active" defaultChecked={user.isActive} className="size-4 accent-primary" />
              Active
            </label>
          </form>

          <div className="space-y-4 border-t border-border pt-5">
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
                <Button type="submit" variant="secondary" size="sm" icon={Smartphone}>
                  Add terminal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Sheet>
  );
}
