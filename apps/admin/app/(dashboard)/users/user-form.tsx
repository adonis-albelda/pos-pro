"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Check,
  Info,
  KeyRound,
  Lock,
  Mail,
  Shield,
  Smartphone,
  UserRound,
} from "lucide-react";
import type { User, UserRole } from "@double-a/shared-types";
import {
  Button,
  ErrorNote,
  Field,
  Input,
  Select,
  SuccessNote,
} from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateUsers } from "@/lib/query/users";
import { saveCashier } from "./actions";

function successMessage(role: UserRole): string {
  if (role === "admin") {
    return "Saved. Password signs in to this dashboard; the PIN, if set, unlocks a terminal.";
  }
  if (role === "device") {
    return "Saved. Use this password on the POS when connecting the terminal.";
  }
  return "Saved. Terminals see a new PIN on the next unlock.";
}

function roleDescription(role: UserRole): string {
  if (role === "admin") {
    return "Admins need two secrets: a password for this dashboard, and an optional PIN to unlock a terminal on the shop floor. They are separate — changing one never changes the other.";
  }
  if (role === "device") {
    return "Terminals enroll once with this Auth email and password. That session stays on the device — cashiers then unlock with their own PIN, not this password.";
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
  const invalidateUsers = useInvalidateUsers();

  useEffect(() => {
    if (state.ok) {
      invalidateUsers();
      onDone?.();
    }
    // invalidateUsers is stable enough for this effect; only state.ok/onDone gate re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, onDone]);

  const RoleIcon =
    role === "admin" ? Shield : role === "device" ? Smartphone : UserRound;

  return (
    <form action={action} className="space-y-5">
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
        <Field label="Name">
          <Input icon={UserRound} name="name" defaultValue={user?.name} required />
        </Field>
        <Field label="Email">
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
            <option value="device">Terminal</option>
          </Select>
        </Field>

        {role === "cashier" || role === "admin" ? (
          <Field
            label={user ? "New PIN" : "PIN"}
            hint={
              user
                ? "Leave empty to keep the current PIN."
                : role === "admin"
                  ? "Optional — 4 to 6 digits, for unlocking a terminal."
                  : "4 to 6 digits."
            }
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

        {!user && (role === "admin" || role === "device") ? (
          <Field
            label="Password"
            hint={
              role === "admin"
                ? "Dashboard login — not a cashier PIN."
                : "Enter this on the POS app's setup screen to connect the terminal."
            }
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

      {role !== "device" ? (
        <Field
          label="Sales"
          hint="Off = can still unlock a terminal, but cannot complete a sale."
        >
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border bg-surface px-3 text-body">
            <input
              type="checkbox"
              name="can_sell"
              value="true"
              defaultChecked={user?.canSell ?? true}
              className="size-4 accent-primary"
            />
            Allow this person to complete sales
          </label>
        </Field>
      ) : (
        <input type="hidden" name="can_sell" value="true" />
      )}

      {user && role === "admin" ? (
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

      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
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
  );
}
