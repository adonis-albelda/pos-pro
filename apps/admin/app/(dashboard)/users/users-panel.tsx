"use client";

import { useState } from "react";
import { Shield, Smartphone, UserRound } from "lucide-react";
import type { User, UserRole } from "@double-a/shared-types";
import { Card, EmptyState } from "@/components/ui";
import { Sheet } from "@/components/overlay";
import { Pagination, RecordToolbar } from "@/components/record-list";
import { useLocationMutationsLocked } from "@/components/location-mutations-banner";
import { UserForm } from "./user-form";
import { UsersTable } from "./users-table";

const TAB_COPY: Record<
  Exclude<UserRole, "superadmin">,
  { addLabel: string; emptyTitle: string; emptyInstruction: string; sheetTitle: string }
> = {
  admin: {
    addLabel: "Add admin",
    emptyTitle: "No admins yet",
    emptyInstruction: "Admins sign in to this dashboard with email and password.",
    sheetTitle: "Add admin",
  },
  cashier: {
    addLabel: "Add cashier",
    emptyTitle: "No cashiers yet",
    emptyInstruction: "Cashiers unlock a terminal with a PIN — no dashboard login.",
    sheetTitle: "Add cashier",
  },
  device: {
    addLabel: "Add terminal",
    emptyTitle: "No terminals yet",
    emptyInstruction: "Each POS device enrolls once with this login, then cashiers use PINs.",
    sheetTitle: "Add terminal",
  },
};

export function UsersPanel({
  tab,
  users,
  query,
  page,
  pageCount,
  total,
  pageSize,
}: {
  tab: Exclude<UserRole, "superadmin">;
  users: User[];
  query: string;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const [creating, setCreating] = useState(false);
  const mutationsLocked = useLocationMutationsLocked();
  const copy = TAB_COPY[tab];
  const TabIcon =
    tab === "admin" ? Shield : tab === "device" ? Smartphone : UserRound;

  return (
    <>
      <Card>
        <RecordToolbar
          searchPlaceholder="Search name or email…"
          query={query}
          preserve={{ tab }}
          addLabel={copy.addLabel}
          onAdd={() => setCreating(true)}
          addDisabled={mutationsLocked}
          exportHref="/api/export/users"
        />

        {total === 0 ? (
          <EmptyState
            icon={TabIcon}
            title={query ? "Nothing matches that search" : copy.emptyTitle}
            instruction={
              query ? "Try a different name or email." : copy.emptyInstruction
            }
          />
        ) : (
          <UsersTable
            users={users}
            showBranch={tab === "device"}
            mutationsLocked={mutationsLocked}
          />
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={pageSize}
          basePath="/users"
          query={{ tab, q: query || undefined }}
        />
      </Card>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={copy.sheetTitle}
        description="The form is set to this tab's role."
        wide
      >
        <UserForm defaultRole={tab} onDone={() => setCreating(false)} />
      </Sheet>
    </>
  );
}
