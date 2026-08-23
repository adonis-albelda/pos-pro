"use client";

import { useActionState, useTransition } from "react";
import { KeyRound, Lock, Mail, UserRound } from "lucide-react";
import type { InvoiceNumberMode, User } from "@double-a/shared-types";
import {
  Badge,
  Button,
  ErrorNote,
  Field,
  Input,
  SuccessNote,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateCompanyStats } from "@/lib/query/companies";
import {
  addCompanyAdmin,
  openCompany,
  resetCompanyUserPassword,
  resetCompanyUserPin,
  setCompanyActive,
  setInvoiceMode,
} from "../../actions";

export function AddAdminForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(addCompanyAdmin, EMPTY_FORM_STATE);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="company_id" value={companyId} />
      <Field label="Name">
        <Input icon={UserRound} name="name" required />
      </Field>
      <Field label="Email">
        <Input icon={Mail} name="email" type="email" required />
      </Field>
      <Field label="Password" hint="They must change it on first sign-in.">
        <PasswordInput
          icon={Lock}
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <Field label="PIN" hint="Optional. 4–6 digits to unlock a terminal. Dashboard password will not work on the POS.">
        <Input
          icon={KeyRound}
          name="pin"
          inputMode="numeric"
          minLength={4}
          maxLength={6}
        />
      </Field>
      <div className="flex items-end">
        <Button type="submit" loading={pending}>
          Add admin
        </Button>
      </div>
      {state.error ? (
        <div className="sm:col-span-2">
          <ErrorNote>{state.error}</ErrorNote>
        </div>
      ) : null}
      {state.ok ? (
        <div className="sm:col-span-2">
          <SuccessNote>Admin created.</SuccessNote>
        </div>
      ) : null}
    </form>
  );
}

function ResetPasswordForm({ user, companyId }: { user: User; companyId: string }) {
  const [state, action, pending] = useActionState(
    resetCompanyUserPassword,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="id" value={user.id} />
      <input type="hidden" name="company_id" value={companyId} />
      <Field label={`Password for ${user.name}`}>
        <PasswordInput
          icon={Lock}
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <Button type="submit" loading={pending} icon={KeyRound} size="sm">
        Set password
      </Button>
      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? <SuccessNote>Password updated.</SuccessNote> : null}
    </form>
  );
}

function ResetPinForm({ user, companyId }: { user: User; companyId: string }) {
  const [state, action, pending] = useActionState(
    resetCompanyUserPin,
    EMPTY_FORM_STATE,
  );

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="id" value={user.id} />
      <input type="hidden" name="company_id" value={companyId} />
      <Field label={`PIN for ${user.name}`}>
        <Input
          icon={KeyRound}
          name="pin"
          inputMode="numeric"
          minLength={4}
          maxLength={6}
          required
        />
      </Field>
      <Button type="submit" loading={pending} icon={KeyRound} size="sm">
        Set PIN
      </Button>
      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? <SuccessNote>PIN updated.</SuccessNote> : null}
    </form>
  );
}

export function CompanyUsers({
  companyId,
  users,
}: {
  companyId: string;
  users: User[];
}) {
  return (
    <div className="space-y-6">
      <AddAdminForm companyId={companyId} />

      {users.length === 0 ? (
        <p className="text-caption text-ink-muted">No users on this company yet.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Reset</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    {user.name}
                    {!user.isActive ? <Badge tone="danger">Inactive</Badge> : null}
                  </div>
                </Td>
                <Td>{user.email}</Td>
                <Td className="capitalize">{user.role}</Td>
                <Td>
                  <div className="space-y-3 py-2">
                    {user.role === "admin" || user.role === "device" ? (
                      <ResetPasswordForm user={user} companyId={companyId} />
                    ) : null}
                    {user.role === "cashier" || user.role === "admin" ? (
                      <ResetPinForm user={user} companyId={companyId} />
                    ) : null}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/** setCompanyActive (Server Action) doesn't redirect, so — unlike createCompany
 * (see lib/query/companies.ts) — it's safe to await then invalidate directly. */
function ToggleActiveButton({ companyId, isActive }: { companyId: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const invalidate = useInvalidateCompanyStats();

  function submit() {
    const form = new FormData();
    form.set("company_id", companyId);
    form.set("is_active", isActive ? "false" : "true");
    startTransition(async () => {
      await setCompanyActive(form);
      invalidate();
    });
  }

  return (
    <Button type="button" variant="secondary" loading={pending} onClick={submit}>
      {isActive ? "Disable company" : "Enable company"}
    </Button>
  );
}

/** setInvoiceMode (Server Action) doesn't redirect — same await-then-invalidate shape as ToggleActiveButton. */
function InvoiceModeToggle({
  companyId,
  mode,
}: {
  companyId: string;
  mode: InvoiceNumberMode;
}) {
  const [pending, startTransition] = useTransition();
  const invalidate = useInvalidateCompanyStats();

  function submit(next: InvoiceNumberMode) {
    if (next === mode) return;
    const form = new FormData();
    form.set("company_id", companyId);
    form.set("mode", next);
    startTransition(async () => {
      await setInvoiceMode(form);
      invalidate();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-body-sm font-medium text-ink">Invoice numbers</p>
        <p className="text-caption text-ink-muted">
          {mode === "random"
            ? "Random unguessable strings (e.g. JH-7K4QX2N9)."
            : "Sequential counter (e.g. JH-000001), set by the shop admin."}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "random" ? "primary" : "secondary"}
          size="sm"
          loading={pending}
          onClick={() => submit("random")}
        >
          Random
        </Button>
        <Button
          type="button"
          variant={mode === "incremental" ? "primary" : "secondary"}
          size="sm"
          loading={pending}
          onClick={() => submit("incremental")}
        >
          Incremental
        </Button>
      </div>
    </div>
  );
}

export function CompanyControls({
  companyId,
  isActive,
  invoiceNumberMode,
}: {
  companyId: string;
  isActive: boolean;
  invoiceNumberMode: InvoiceNumberMode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form action={openCompany}>
          <input type="hidden" name="company_id" value={companyId} />
          <Button type="submit">Open company</Button>
        </form>
        <ToggleActiveButton companyId={companyId} isActive={isActive} />
      </div>
      <InvoiceModeToggle companyId={companyId} mode={invoiceNumberMode} />
    </div>
  );
}
