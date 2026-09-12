"use client";

import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Check,
  Info,
  KeyRound,
  Lock,
  Mail,
  Shield,
  Smartphone,
  UserCog,
  UserRound,
  X,
} from "lucide-react";
import { isDemoTeamLimitMessage, ROLES, type User, type UserRole } from "@double-a/shared-types";
import {
  Button,
  ErrorNote,
  Field,
  FileInput,
  Input,
  Select,
  SuccessNote,
} from "@/components/ui";
import { ConfirmDialog, SheetFooter, useSheetChrome } from "@/components/overlay";
import { PasswordInput } from "@/components/password-input";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { notifyDemoUpgradeLimit } from "@/lib/demo-upgrade-notice";
import { isImageFile, NOT_AN_IMAGE_MESSAGE } from "@/lib/is-image-file";
import { useInvalidateUsers } from "@/lib/query/users";
import { useLocations } from "@/lib/query/locations";
import { saveCashier } from "./actions";

function successMessage(role: UserRole): string {
  if (role === ROLES.ADMIN || role === ROLES.MANAGER) {
    return "Saved. Password signs in to this dashboard; the PIN, if set, unlocks a terminal.";
  }
  if (role === ROLES.TERMINAL) {
    return "Saved. Use this password on the POS when connecting the terminal.";
  }
  return "Saved. Terminals see a new PIN on the next unlock.";
}

function roleDescription(role: UserRole): string {
  if (role === ROLES.ADMIN) {
    return "Admins need two secrets: a password for this dashboard, and an optional PIN to unlock a terminal on the shop floor. They are separate — changing one never changes the other.";
  }
  if (role === ROLES.MANAGER) {
    return "Managers get the same dashboard/POS access as an admin, except company settings and user management — those stay owner-only. Same two secrets as admin: a password, and an optional PIN.";
  }
  if (role === ROLES.TERMINAL) {
    return "Terminals sign in once with this email and password on the mobile app's setup screen. That session stays on the device — cashiers then unlock with their own PIN, not this password.";
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
  const formId = useId();
  const inSheet = useSheetChrome() !== null;
  const [state, action, pending] = useActionState(saveCashier, EMPTY_FORM_STATE);
  const [role, setRole] = useState<UserRole>(user?.role ?? defaultRole);
  const [branchId, setBranchId] = useState(user?.locationId ?? "");
  const [confirmBranch, setConfirmBranch] = useState(false);
  const allowBranchSubmit = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const invalidateUsers = useInvalidateUsers();
  const locationsQuery = useLocations({ type: "branch" });

  // Previewed from the chosen file rather than after the round trip, so the
  // admin sees the photo they picked before committing to it.
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const shownAvatar = avatarPreview ?? user?.avatarUrl ?? null;

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
    role === ROLES.ADMIN
      ? Shield
      : role === ROLES.MANAGER
        ? UserCog
        : role === ROLES.TERMINAL
          ? Smartphone
          : UserRound;
  const branches = locationsQuery.data ?? [];

  useEffect(() => {
    if (role === ROLES.TERMINAL && !branchId && branches[0]?.id) {
      setBranchId(branches[0].id);
    }
  }, [role, branchId, branches]);

  const branchChanged =
    Boolean(user) &&
    user?.role === ROLES.TERMINAL &&
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

  const actions = (
    <div className="flex justify-end gap-2">
      {onDone ? (
        <Button type="button" variant="secondary" icon={X} onClick={onDone}>
          Cancel
        </Button>
      ) : null}
      <Button
        type="submit"
        form={inSheet ? formId : undefined}
        loading={pending}
        icon={Check}
      >
        {pending ? "Saving..." : user ? "Save changes" : "Add person"}
      </Button>
    </div>
  );

  return (
    <>
      <form
        id={formId}
        ref={formRef}
        action={action}
        onSubmit={onSubmit}
        className="space-y-5"
      >
        {user ? <input type="hidden" name="id" value={user.id} /> : null}

        <div className="flex items-start gap-3 rounded-md border border-border bg-primary-tint px-4 py-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <RoleIcon size={18} strokeWidth={2} />
          </span>
          <p className="text-caption leading-relaxed text-ink-muted">
            {roleDescription(role)}
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-paper">
            {shownAvatar ? (
              // Public S3 URL — no next/image host allowlist needed.
              <img src={shownAvatar} alt="" className="size-full object-cover" />
            ) : (
              <UserRound size={24} strokeWidth={2} className="text-ink-muted" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <Field label="Photo" hint="PNG, JPEG or WebP, under 1 MB." required={false}>
              <FileInput
                name="avatar"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file && !isImageFile(file)) {
                    toast.error(NOT_AN_IMAGE_MESSAGE);
                    event.currentTarget.value = "";
                    return;
                  }
                  setAvatarPreview(file ? URL.createObjectURL(file) : null);
                }}
              />
            </Field>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input icon={UserRound} name="name" defaultValue={user?.name} required />
          </Field>
          <Field label="Email" hint="Optional — sign-in by email requires it be verified.">
            <Input
              icon={Mail}
              name="email"
              type="email"
              defaultValue={user?.email ?? ""}
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
              <option value="terminal">Terminal</option>
            </Select>
          </Field>

          {role === ROLES.TERMINAL ? (
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

          {role === ROLES.CASHIER || role === ROLES.ADMIN || role === ROLES.MANAGER ? (
            <Field
              label={user ? "New PIN" : "PIN"}
              hint={
                user
                  ? "Leave empty to keep the current PIN."
                  : role === ROLES.ADMIN || role === ROLES.MANAGER
                    ? "Optional — 4 to 6 digits, for unlocking a terminal."
                    : "4 to 6 digits."
              }
              required={!user && role === ROLES.CASHIER}
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

          {!user && (role === ROLES.ADMIN || role === ROLES.MANAGER || role === ROLES.TERMINAL) ? (
            <Field
              label="Password"
              hint={
                role === ROLES.TERMINAL
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

        {role === ROLES.CASHIER || role === ROLES.ADMIN || role === ROLES.MANAGER ? (
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

        {user && (role === ROLES.ADMIN || role === ROLES.MANAGER) ? (
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

        {!inSheet ? (
          <div className="border-t border-border pt-4">{actions}</div>
        ) : null}
      </form>
      {inSheet ? <SheetFooter>{actions}</SheetFooter> : null}

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
