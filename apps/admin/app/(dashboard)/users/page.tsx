"use client";

import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { ClipboardList, Plus, Users } from "lucide-react";
import type { User } from "@double-a/shared-types";
import { matchesQuery, paginateItems, parseListQuery } from "@/lib/list-query";
import { Badge, ButtonLink, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { useUsers } from "@/lib/query/users";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
  inventory_clerk: "Inventory Clerk",
  driver: "Driver",
  helper: "Helper",
  device: "Terminal (legacy)",
};

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
  const usersQuery = useUsers({ includeInactive: true });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Users"
        description="One directory for every login. Create opens a full form — email/username, password, PIN, role."
        action={
          <ButtonLink href={"/users/new" as Route} icon={Plus}>
            New user
          </ButtonLink>
        }
      />

      {usersQuery.isPending ? (
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      ) : usersQuery.isError ? (
        <Card className="px-4 py-8 text-center text-body text-danger">
          {usersQuery.error instanceof Error ? usersQuery.error.message : "Could not load users."}
        </Card>
      ) : (
        <UsersTable users={usersQuery.data ?? []} q={q} page={page} />
      )}
    </div>
  );
}

function UsersTable({ users, q, page }: { users: User[]; q: string; page: number }) {
  const filtered = users.filter((user) =>
    matchesQuery([user.name, user.email, user.username ?? "", user.role], q),
  );
  const { pageItems, pageCount } = paginateItems(filtered, page);

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email / username</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th>Last login</Th>
            <Th className="w-24" />
          </tr>
        </thead>
        <tbody>
          {pageItems.length === 0 ? (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-ink-muted">
                No users match.
              </Td>
            </tr>
          ) : (
            pageItems.map((user) => (
              <tr key={user.id} className="border-t border-border">
                <Td>
                  <div className="flex items-center gap-2.5">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="size-8 rounded-full object-cover"
                      />
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
                    <p className="truncate text-body text-ink">{user.email}</p>
                    {user.username ? (
                      <p className="truncate text-caption text-ink-muted">@{user.username}</p>
                    ) : null}
                  </div>
                </Td>
                <Td>
                  <Badge tone="neutral">{ROLE_LABEL[user.role] ?? user.role}</Badge>
                </Td>
                <Td>
                  <Badge tone={user.isActive ? "success" : "danger"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Td>
                <Td className="text-caption text-ink-muted">{formatWhen(user.lastLoginAt)}</Td>
                <Td>
                  <Link
                    href={`/users/${user.id}` as Route}
                    className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline"
                  >
                    <ClipboardList size={14} strokeWidth={2} />
                    Edit
                  </Link>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-caption text-ink-muted">
          <span>
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/users?q=${encodeURIComponent(q)}&page=${page - 1}` as Route}
                className="text-primary"
              >
                Prev
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/users?q=${encodeURIComponent(q)}&page=${page + 1}` as Route}
                className="text-primary"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
