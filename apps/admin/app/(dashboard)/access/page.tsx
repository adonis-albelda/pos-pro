"use client";

import { useMemo, useState } from "react";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import { ROLES, type User } from "@double-a/shared-types";
import type { AccessRoleName } from "@double-a/api-client/queries";
import { AdminGate } from "@/components/admin-gate";
import {
  Button,
  Card,
  CardBody,
  Field,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui";
import { useAccessCatalog, useUpdateUserAccess } from "@/lib/query/access";
import { useUser, useUsers } from "@/lib/query/users";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function groupPermissionName(name: string): string {
  const [group] = name.split(".");
  switch (group) {
    case "dashboard":
      return "Dashboard";
    case "catalog":
      return "Catalog";
    case "inventory":
      return "Inventory";
    case "purchasing":
      return "Purchasing";
    case "sales":
      return "Sales";
    case "finance":
      return "Finance";
    case "people":
      return "People";
    case "settings":
      return "Settings";
    default:
      return group ?? name;
  }
}

export default function AccessPage() {
  return (
    <AdminGate
      icon={Shield}
      title="Access"
      ownerOnly
      forbiddenTitle="Owner only"
      instruction="Only the shop admin can assign roles and permissions."
    >
      <AccessBody />
    </AdminGate>
  );
}

function AccessBody() {
  const usersQuery = useUsers({ includeInactive: true });
  const catalogQuery = useAccessCatalog();
  const updateAccess = useUpdateUserAccess();

  const staff = useMemo(
    () =>
      (usersQuery.data ?? []).filter((user) =>
        user.role === ROLES.ADMIN ||
        user.role === ROLES.MANAGER ||
        user.role === ROLES.CASHIER ||
        user.role === ROLES.INVENTORY_CLERK ||
        user.role === ROLES.TERMINAL,
      ),
    [usersQuery.data],
  );

  const [selectedId, setSelectedId] = useState<string>("");
  const selected = staff.find((user) => user.id === selectedId) ?? staff[0] ?? null;
  const detailQuery = useUser(selected?.id ?? null);

  const [role, setRole] = useState<AccessRoleName | null>(null);
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const [draftForId, setDraftForId] = useState<string | null>(null);

  const activeRole: AccessRoleName =
    role && draftForId === selected?.id
      ? role
      : ((selected?.role as AccessRoleName | undefined) ?? "manager");

  const detailPermissions = detailQuery.data?.permissions;

  const activeChecked = useMemo(() => {
    if (checked && draftForId === selected?.id) return checked;
    if (!selected) return new Set<string>();
    if (selected.role === ROLES.ADMIN) {
      return new Set(catalogQuery.data?.permissions.map((p) => p.name) ?? []);
    }
    return new Set(detailPermissions ?? []);
  }, [checked, draftForId, selected, catalogQuery.data, detailPermissions]);

  function selectUser(user: User) {
    setSelectedId(user.id);
    setDraftForId(user.id);
    setRole(user.role as AccessRoleName);
    if (user.role === ROLES.ADMIN) {
      setChecked(new Set(catalogQuery.data?.permissions.map((p) => p.name) ?? []));
    } else {
      // Non-admin perms come from GET /users/{id} (detailQuery) — list no
      // longer embeds Spatie. Clear draft until detail lands.
      setChecked(null);
    }
  }

  function onRoleChange(next: AccessRoleName) {
    if (!selected) return;
    setDraftForId(selected.id);
    setRole(next);
    const defaults = catalogQuery.data?.roleDefaults[next] ?? [];
    setChecked(new Set(defaults));
  }

  function togglePermission(name: string) {
    if (!selected || activeRole === ROLES.ADMIN || activeRole === ROLES.TERMINAL) return;
    setDraftForId(selected.id);
    setRole(activeRole);
    setChecked((prev) => {
      const base = new Set(prev && draftForId === selected.id ? prev : activeChecked);
      if (base.has(name)) base.delete(name);
      else base.add(name);
      return base;
    });
  }

  function save() {
    if (!selected) return;
    updateAccess.mutate(
      {
        userId: selected.id,
        role: activeRole,
        permissions: Array.from(activeChecked),
      },
      {
        onSuccess: () => toast.success("Access updated."),
        onError: (error) => toast.error(errorMessage(error, "Could not update access.")),
      },
    );
  }

  const grouped = useMemo(() => {
    const perms = catalogQuery.data?.permissions ?? [];
    const map = new Map<string, typeof perms>();
    for (const perm of perms) {
      const key = groupPermissionName(perm.name);
      const list = map.get(key) ?? [];
      list.push(perm);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [catalogQuery.data]);

  if (usersQuery.isPending || catalogQuery.isPending) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Shield}
          title="Access"
          description="Roles and permissions per user. Admin can do everything."
        />
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Card>
            <CardBody className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex flex-col gap-1.5 px-3 py-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-9 w-40" />
              </div>
              {Array.from({ length: 3 }).map((_, group) => (
                <div key={group} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, item) => (
                      <Skeleton key={item} className="h-4 w-full max-w-56" />
                    ))}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  if (usersQuery.isError || catalogQuery.isError) {
    return (
      <div className="space-y-6">
        <PageHeader icon={Shield} title="Access" />
        <Card className="px-4 py-8 text-center text-body text-danger">
          {errorMessage(
            usersQuery.error ?? catalogQuery.error,
            "Could not load access settings.",
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Shield}
        title="Access"
        description="Roles and permissions per user. Admin can do everything by default."
      />

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card>
          <CardBody className="space-y-1 p-2">
            {staff.length === 0 ? (
              <p className="px-2 py-4 text-caption text-ink-muted">No admin, manager, or cashier yet.</p>
            ) : (
              staff.map((user) => {
                const active = (selected?.id ?? "") === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => selectUser(user)}
                    className={[
                      "flex w-full flex-col rounded-sm px-3 py-2 text-left transition-colors",
                      active ? "bg-primary text-white" : "hover:bg-border/50",
                    ].join(" ")}
                  >
                    <span className="text-body font-medium">{user.name}</span>
                    <span className={active ? "text-caption text-white/80" : "text-caption text-ink-muted"}>
                      {user.role}
                      {!user.isActive ? " · inactive" : ""}
                    </span>
                  </button>
                );
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-5">
            {!selected ? (
              <p className="text-body text-ink-muted">Pick a user.</p>
            ) : detailQuery.isPending && selected.role !== ROLES.ADMIN ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-9 w-40" />
                </div>
                {Array.from({ length: 3 }).map((_, group) => (
                  <div key={group} className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, item) => (
                        <Skeleton key={item} className="h-4 w-full max-w-56" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-body font-medium text-ink">{selected.name}</p>
                    <p className="text-caption text-ink-muted">{selected.email}</p>
                  </div>
                  <Field label="Role">
                    <Select
                      value={activeRole}
                      onChange={(event) => onRoleChange(event.target.value as AccessRoleName)}
                      className="min-w-[10rem]"
                    >
                      {(catalogQuery.data?.roles ?? []).map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                {activeRole === ROLES.ADMIN ? (
                  <p className="rounded-sm border border-border bg-canvas px-3 py-2 text-caption text-ink-muted">
                    Admin can do everything. Permission checkboxes are locked.
                  </p>
                ) : activeRole === ROLES.TERMINAL ? (
                  <p className="rounded-sm border border-border bg-canvas px-3 py-2 text-caption text-ink-muted">
                    Terminals have no dashboard permissions of their own — nothing to grant here.
                  </p>
                ) : null}

                <div className="space-y-4">
                  {grouped.map(([group, perms]) => (
                    <div key={group} className="space-y-2">
                      <p className="text-[0.6875rem] font-medium tracking-wide text-ink-muted/80 uppercase">
                        {group}
                      </p>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {perms.map((perm) => {
                          const on = activeChecked.has(perm.name);
                          const locked = activeRole === ROLES.ADMIN || activeRole === ROLES.TERMINAL;
                          return (
                            <label
                              key={perm.name}
                              className={[
                                "flex min-h-9 items-center gap-2 rounded-sm border border-border px-2.5 text-caption",
                                locked ? "bg-canvas text-ink-muted" : "bg-surface text-ink",
                              ].join(" ")}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                disabled={locked}
                                onChange={() => togglePermission(perm.name)}
                                className="size-4 accent-primary"
                              />
                              <span className="text-caption">{perm.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={save}
                    disabled={updateAccess.isPending}
                  >
                    {updateAccess.isPending ? "Saving…" : "Save access"}
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
