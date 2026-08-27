"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Ban,
  CircleCheck,
  KeyRound,
  Lock,
  Pencil,
  Shield,
  Smartphone,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import type { User } from "@double-a/shared-types";
import {
  Badge,
  Button,
  ErrorNote,
  Field,
  IconButton,
  SuccessNote,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { ConfirmDialog, Dialog, Sheet } from "@/components/overlay";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useToggleUserCanSell } from "@/lib/query/users";
import { useLocations } from "@/lib/query/locations";
import { resetUserPassword } from "./actions";
import { UserForm } from "./user-form";

const ROLE_ICONS: Record<string, LucideIcon> = {
  cashier: UserRound,
  admin: Shield,
  device: Smartphone,
};

function ResetPasswordForm({
  user,
  onDone,
}: {
  user: User;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(resetUserPassword, EMPTY_FORM_STATE);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={user.id} />
      <p className="text-caption text-ink-muted">
        Sets a new Auth password for <span className="font-medium text-ink">{user.email}</span>.
        Cashiers use a PIN — reset that from Edit instead.
      </p>
      <Field label="New password">
        <PasswordInput
          icon={Lock}
          name="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </Field>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border bg-surface px-3 text-body">
        <input
          type="checkbox"
          name="must_change_password"
          value="true"
          defaultChecked
          className="size-4 accent-primary"
        />
        Require password change after next login
      </label>
      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? <SuccessNote>Password updated.</SuccessNote> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} icon={KeyRound}>
          Reset password
        </Button>
      </div>
    </form>
  );
}

export function UsersTable({
  users,
  showBranch = false,
  mutationsLocked = false,
}: {
  users: User[];
  showBranch?: boolean;
  mutationsLocked?: boolean;
}) {
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [toggling, setToggling] = useState<User | null>(null);
  const toggleCanSell = useToggleUserCanSell();
  const locationsQuery = useLocations({ type: "branch" });
  const branchNameById = new Map(
    (locationsQuery.data ?? []).map((branch) => [branch.id, branch.name]),
  );

  function confirmToggleSell() {
    if (!toggling) return;
    toggleCanSell.mutate(
      { id: toggling.id, canSell: !toggling.canSell },
      {
        onSuccess: () => setToggling(null),
        onError: (error) => {
          const message =
            error instanceof ApiError ? error.message : "Could not update this user.";
          toast.error(message);
        },
      },
    );
  }

  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            {showBranch ? <Th>Branch</Th> : null}
            <Th>State</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const RoleIcon = ROLE_ICONS[user.role] ?? UserRound;
            const canResetPassword = user.role === "admin" || user.role === "device";
            const showSellToggle = user.role !== "device";

            return (
              <tr
                key={user.id}
                className={user.canSell && user.isActive ? "" : "opacity-60"}
              >
                <Td>
                  <span className="flex items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <RoleIcon size={14} strokeWidth={2} />
                    </span>
                    <span className="font-medium">{user.name}</span>
                  </span>
                </Td>
                <Td className="text-ink-muted">{user.email}</Td>
                {showBranch ? (
                  <Td className="text-ink-muted">
                    {user.locationId
                      ? (branchNameById.get(user.locationId) ?? user.locationId)
                      : "—"}
                  </Td>
                ) : null}
                <Td>
                  <span className="flex flex-wrap gap-1.5">
                    {!user.isActive ? (
                      <Badge tone="neutral">Inactive</Badge>
                    ) : !user.canSell && user.role !== "device" ? (
                      <Badge tone="warning">Sales off</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                    {user.mustChangePassword && canResetPassword ? (
                      <Badge tone="warning">Must change password</Badge>
                    ) : null}
                  </span>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <IconButton
                      icon={Pencil}
                      label="Edit user"
                      onClick={() => setEditing(user)}
                      disabled={mutationsLocked}
                    />
                    {canResetPassword ? (
                      <IconButton
                        icon={KeyRound}
                        label="Reset password"
                        onClick={() => setResetting(user)}
                        disabled={mutationsLocked}
                      />
                    ) : null}
                    {showSellToggle ? (
                      <IconButton
                        icon={user.canSell ? Ban : CircleCheck}
                        label={user.canSell ? "Disable sales" : "Enable sales"}
                        tone={user.canSell ? "danger" : "neutral"}
                        onClick={() => setToggling(user)}
                        disabled={mutationsLocked}
                      />
                    ) : null}
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : "Edit user"}
        description="Changes reach terminals on their next sync."
        wide
      >
        {editing ? (
          <UserForm key={editing.id} user={editing} onDone={() => setEditing(null)} />
        ) : null}
      </Sheet>

      <Dialog
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title="Reset password"
        description={
          resetting
            ? `New Auth password for ${resetting.name}.`
            : "New Auth password."
        }
      >
        {resetting ? (
          <ResetPasswordForm
            key={resetting.id}
            user={resetting}
            onDone={() => setResetting(null)}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={toggling !== null}
        onClose={() => setToggling(null)}
        onConfirm={confirmToggleSell}
        pending={toggleCanSell.isPending}
        title={toggling?.canSell ? "Disable sales?" : "Enable sales?"}
        description={
          toggling?.canSell
            ? `${toggling.name} can still unlock a terminal, but cannot complete a sale until you turn sales back on.`
            : `${toggling?.name ?? "This person"} can complete sales again after the next unlock or refresh.`
        }
        confirmLabel={toggling?.canSell ? "Disable sales" : "Enable sales"}
      />
    </>
  );
}
