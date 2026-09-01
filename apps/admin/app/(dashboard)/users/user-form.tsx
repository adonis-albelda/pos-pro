"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  HandHelping,
  Info,
  KeyRound,
  Lock,
  Mail,
  Shield,
  Smartphone,
  Truck,
  UserCog,
  UserRound,
} from "lucide-react";
import { isDemoTeamLimitMessage, type User, type UserRole } from "@double-a/shared-types";
import {
  Button,
  ErrorNote,
  Field,
  Input,
  Select,
  SuccessNote,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/overlay";
import { PasswordInput } from "@/components/password-input";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { notifyDemoUpgradeLimit } from "@/lib/demo-upgrade-notice";
import { useInvalidateUsers } from "@/lib/query/users";
import { useLocations } from "@/lib/query/locations";
import { saveCashier } from "./actions";

function successMessage(role: UserRole): string {
  if (role === "admin" || role === "manager") {
    return "Saved. Password signs in to this dashboard; the PIN, if set, unlocks a terminal.";
  }
  if (role === "device") {
    return "Saved. Use this password on the POS when connecting the terminal.";
  }
  if (role === "driver" || role === "helper") {
    return "Saved as a staff record — no PIN or dashboard login.";
  }
  return "Saved. Terminals see a new PIN on the next unlock.";
}

function roleDescription(role: UserRole): string {
  if (role === "admin") {
    return "Admins need two secrets: a password for this dashboard, and an optional PIN to unlock a terminal on the shop floor. They are separate — changing one never changes the other.";
  }
  if (role === "manager") {
    return "Managers get the same dashboard/POS access as an admin, except company settings and user management — those stay owner-only. Same two secrets as admin: a password, and an optional PIN.";
  }
  if (role === "device") {
    return "Terminals enroll once with this Auth email and password. That session stays on the device — cashiers then unlock with their own PIN, not this password.";
  }
  if (role === "driver" || role === "helper") {
    return "A staff record only — no PIN and no dashboard login. Use this to attribute a delivery or a task to a real person without giving them access to anything.";
  }
  return "Cashiers unlock with a PIN against the live server. They have no dashboard login. Disabling sales still lets them unlock, but they cannot complete a sale.";
}

export function UserForm({
  user,
  defaultRole = "cashier",
  onDone,
}: {
  user?: User;
  /** Pre-select role when adding from a tab. Ignored when editing. */
  defaultRole?: UserRole;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveCashier, EMPTY_FORM_STATE);
  const [role, setRole] = useState<UserRole>(user?.role ?? defaultRole);
  const [branchId, setBranchId] = useState(user?.locationId ?? "");
  const [confirmBranch, setConfirmBranch] = useState(false);
  const allowBranchSubmit = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const invalidateUsers = useInvalidateUsers();
  const locationsQuery = useLocations({ type: "branch" });

  useEffect(() => {
    if (state.ok) {
      invalidateUsers();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, onDone]);

  useEffect(() => {
    if (!state.error || !isDemoTeamLimitMessage(state.error)) return;
    notifyDemoUpgradeLimit();
    onDone?.();
  }, [state.error, onDone]);

  const showInlineError = state.error && !isDemoTeamLimitMessage(state.error);

  const RoleIcon =
    role === "admin"
      ? Shield
      : role === "manager"
        ? UserCog
        : role === "device"
          ? Smartphone
          : role === "driver"
            ? Truck
            : role === "helper"
              ? HandHelping
              : UserRound;
  const branches = locationsQuery.data ?? [];

  useEffect(() => {
    if (role === "device" && !branchId && branches[0]?.id) {
      setBranchId(branches[0].id);
    }
  }, [role, branchId, branches]);

  const branchChanged =
    Boolean(user) &&
    user?.role === "device" &&
    branchId !== "" &&
    branchId !== (user?.locationId ?? "");
  const fromBranchName =
    branches.find((b) => b.id === user?.locationId)?.name ?? user?.locationId ?? "—";
  const toBranchName = branches.find((b) => b.id === branchId)?.name ?? branchId;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (branchChanged && !allowBranchSubmit.current) {
      event.preventDefault();
      setConfirmBranch(true);
      return;
    }
    allowBranchSubmit.current = false;
  }

  function confirmBranchChange() {
    allowBranchSubmit.current = true;
    setConfirmBranch(false);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={action} onSubmit={onSubmit} className="space-y-5">
        {user ? <input type="hidden" name="id" value={user.id} /> : null}

        <div className="flex items-start gap-3 rounded-md border border-border bg-primary-tint px-4 py-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <RoleIcon size={18} strokeWidth={2} />
          </span>
          <p className="text-caption leading-relaxed text-ink-muted">
            {roleDescription(role)}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input icon={UserRound} name="name" defaultValue={user?.name} required />
          </Field>
          <Field label="Email" required>
            <Input
              icon={Mail}
              name="email"
              type="email"
              defaultValue={user?.email}
              required
            />
          </Field>
          <Field
            label="Role"
            hint={
              user
                ? "Role can't be changed after creation."
                : "Controls dashboard access, PIN unlock, or terminal sign-in."
            }
            required
          >
            {user ? <input type="hidden" name="role" value={role} /> : null}
            <Select
              name={user ? undefined : "role"}
              value={role}
              disabled={Boolean(user)}
              onChange={(event) => setRole(event.target.value as UserRole)}
            >
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="driver">Driver</option>
              <option value="helper">Helper</option>
              <option value="device">Terminal</option>
            </Select>
          </Field>

          {role === "device" ? (
            <Field
              label="Branch"
              hint={
                user
                  ? "Changing branch moves this terminal's stock and sales to the new location after the next sync."
                  : "Stock for this terminal comes from this branch only."
              }
              required
            >
              <Select
                name="location_id"
                required
                value={branchId || branches[0]?.id || ""}
                onChange={(event) => setBranchId(event.target.value)}
              >
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
          ) : null}

          {role === "cashier" || role === "admin" || role === "manager" ? (
            <Field
              label={user ? "New PIN" : "PIN"}
              hint={
                user
                  ? "Leave empty to keep the current PIN."
                  : role === "admin" || role === "manager"
                    ? "Optional — 4 to 6 digits, for unlocking a terminal."
                    : "4 to 6 digits."
              }
              required={!user && role === "cashier"}
            >
              <Input
                icon={KeyRound}
                name="pin"
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                autoComplete="off"
              />
            </Field>
          ) : null}

          {!user && (role === "admin" || role === "manager" || role === "device") ? (
            <Field
              label="Password"
              hint={
                role === "device"
                  ? "Enter this on the POS app's setup screen to connect the terminal."
                  : "Dashboard login — not a cashier PIN."
              }
              required
            >
              <PasswordInput
                icon={Lock}
                name="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
          ) : null}
        </div>

        {role === "cashier" || role === "admin" || role === "manager" ? (
          <Field
            label="Sales"
            hint="Off = can still unlock a terminal, but cannot complete a sale."
            required={false}
          >
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border bg-surface px-3 text-body">
              <input
                type="checkbox"
                name="can_sell"
                value="true"
                defaultChecked={user?.canSell ?? true}
                className="size-4 accent-primary"
              />
              Allow this person to complete a sale
            </label>
          </Field>
        ) : (
          <input type="hidden" name="can_sell" value="true" />
        )}

        {user && (role === "admin" || role === "manager") ? (
          <p className="flex items-start gap-2 text-caption text-ink-muted">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              To reset this admin&rsquo;s password or force a change on next
              sign-in, ask a superadmin on the Platform surface.
            </span>
          </p>
        ) : null}

        <p className="flex items-start gap-2 text-caption text-ink-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Changes reach terminals on their next Sync or Refresh. PIN and
            dashboard password stay on separate paths.
          </span>
        </p>

        {showInlineError ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? <SuccessNote>{successMessage(role)}</SuccessNote> : null}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row">
          <Button type="submit" loading={pending} icon={Check} className="w-full sm:w-auto">
            {pending ? "Saving..." : user ? "Save changes" : "Add person"}
          </Button>
          {onDone ? (
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>

      <ConfirmDialog
        open={confirmBranch}
        onClose={() => setConfirmBranch(false)}
        onConfirm={confirmBranchChange}
        title="Change terminal branch?"
        description={`Move "${user?.name ?? "this terminal"}" from ${fromBranchName} to ${toBranchName}. Stock estimates and new sales will use the new branch after the next sync.`}
        confirmLabel="Change branch"
      />
    </>
  );
}
