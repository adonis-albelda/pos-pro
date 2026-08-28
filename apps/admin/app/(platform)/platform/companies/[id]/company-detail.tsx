"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import type { InvoiceNumberMode, User, AiPlanId, AiSubscriptionPlan } from "@double-a/shared-types";
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
import { isValidPin } from "@double-a/shared-types";
import {
  useAddCompanyAdmin,
  useOpenCompany,
  useResetCompanyUserPassword,
  useResetCompanyUserPin,
  useSetCompanyActive,
  useSetCompanyAiPlan,
  useSetCompanyInvoiceMode,
  useSetCompanyUserDemoFlag,
} from "@/lib/query/companies";

export function AddAdminForm({ companyId }: { companyId: string }) {
  const mutation = useAddCompanyAdmin(companyId);
  const [success, setSuccess] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const pin = String(form.get("pin") ?? "").trim();

    if (!name || !email || password.length < 8) return;
    if (pin && !isValidPin(pin)) return;

    mutation.mutate(
      { name, email, password, pin },
      {
        onSuccess: () => {
          setSuccess(true);
          event.currentTarget.reset();
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
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
        <Button type="submit" loading={mutation.isPending}>
          Add admin
        </Button>
      </div>
      {mutation.isError ? (
        <div className="sm:col-span-2">
          <ErrorNote>
            {mutation.error instanceof Error ? mutation.error.message : "Could not add admin."}
          </ErrorNote>
        </div>
      ) : null}
      {success ? (
        <div className="sm:col-span-2">
          <SuccessNote>Admin created.</SuccessNote>
        </div>
      ) : null}
    </form>
  );
}

function ResetPasswordForm({ user, companyId }: { user: User; companyId: string }) {
  const mutation = useResetCompanyUserPassword();
  const [success, setSuccess] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    if (password.length < 8) return;
    mutation.mutate(
      { userId: user.id, password },
      { onSuccess: () => setSuccess(true) },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <Field label={`Password for ${user.name}`}>
        <PasswordInput
          icon={Lock}
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <Button type="submit" loading={mutation.isPending} icon={KeyRound} size="sm">
        Set password
      </Button>
      {mutation.isError ? (
        <ErrorNote>
          {mutation.error instanceof Error ? mutation.error.message : "Could not reset password."}
        </ErrorNote>
      ) : null}
      {success ? <SuccessNote>Password updated.</SuccessNote> : null}
    </form>
  );
}

function ResetPinForm({ user }: { user: User; companyId: string }) {
  const mutation = useResetCompanyUserPin();
  const [success, setSuccess] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    const pin = String(new FormData(event.currentTarget).get("pin") ?? "").trim();
    if (!isValidPin(pin)) return;
    mutation.mutate({ userId: user.id, pin }, { onSuccess: () => setSuccess(true) });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
      <Button type="submit" loading={mutation.isPending} icon={KeyRound} size="sm">
        Set PIN
      </Button>
      {mutation.isError ? (
        <ErrorNote>
          {mutation.error instanceof Error ? mutation.error.message : "Could not reset PIN."}
        </ErrorNote>
      ) : null}
      {success ? <SuccessNote>PIN updated.</SuccessNote> : null}
    </form>
  );
}

function DemoFlagForm({ user, companyId }: { user: User; companyId: string }) {
  const mutation = useSetCompanyUserDemoFlag(companyId);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={user.isDemo ? "secondary" : "ghost"}
        size="sm"
        loading={mutation.isPending}
        icon={ShieldCheck}
        onClick={() => mutation.mutate({ userId: user.id, isDemo: !user.isDemo })}
      >
        {user.isDemo ? "Unflag demo" : "Flag as demo"}
      </Button>
      {mutation.isError ? (
        <ErrorNote>
          {mutation.error instanceof Error ? mutation.error.message : "Could not update demo flag."}
        </ErrorNote>
      ) : null}
    </div>
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
              <Th>Demo</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    {user.name}
                    {!user.isActive ? <Badge tone="danger">Inactive</Badge> : null}
                    {user.isDemo ? <Badge tone="warning">Demo</Badge> : null}
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
                <Td>
                  <DemoFlagForm user={user} companyId={companyId} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function ToggleActiveButton({ companyId, isActive }: { companyId: string; isActive: boolean }) {
  const mutation = useSetCompanyActive();

  function submit() {
    mutation.mutate({ companyId, isActive: !isActive });
  }

  return (
    <Button type="button" variant="secondary" loading={mutation.isPending} onClick={submit}>
      {isActive ? "Disable company" : "Enable company"}
    </Button>
  );
}

function InvoiceModeToggle({
  companyId,
  mode,
}: {
  companyId: string;
  mode: InvoiceNumberMode;
}) {
  const mutation = useSetCompanyInvoiceMode();

  function submit(next: InvoiceNumberMode) {
    if (next === mode || mutation.isPending) return;
    mutation.mutate({ companyId, mode: next });
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
      <div className="flex flex-col gap-2 sm:items-end">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "random" ? "primary" : "secondary"}
            size="sm"
            loading={mutation.isPending}
            onClick={() => submit("random")}
          >
            Random
          </Button>
          <Button
            type="button"
            variant={mode === "incremental" ? "primary" : "secondary"}
            size="sm"
            loading={mutation.isPending}
            onClick={() => submit("incremental")}
          >
            Incremental
          </Button>
        </div>
        {mutation.isError ? (
          <ErrorNote>
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Could not update invoice mode."}
          </ErrorNote>
        ) : null}
      </div>
    </div>
  );
}

function AppPlanSelector({
  companyId,
  aiPlanId,
  plans,
}: {
  companyId: string;
  aiPlanId: AiPlanId;
  plans: AiSubscriptionPlan[];
}) {
  const mutation = useSetCompanyAiPlan();

  function submit(next: AiPlanId) {
    if (next === aiPlanId || mutation.isPending) return;
    mutation.mutate({ companyId, aiPlanId: next });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-body-sm font-medium text-ink">App plan</p>
        <p className="text-caption text-ink-muted">
          Which subscription tier this shop is on. AI weekly limits follow the plan.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:items-end">
        <div className="flex flex-wrap gap-2">
          {plans.map((plan) => (
            <Button
              key={plan.id}
              type="button"
              variant={aiPlanId === plan.id ? "primary" : "secondary"}
              size="sm"
              loading={mutation.isPending}
              onClick={() => submit(plan.id)}
            >
              Plan {plan.id}: {plan.name}
            </Button>
          ))}
        </div>
        {mutation.isError ? (
          <ErrorNote>
            {mutation.error instanceof Error ? mutation.error.message : "Could not update app plan."}
          </ErrorNote>
        ) : null}
      </div>
    </div>
  );
}

function OpenCompanyButton({ companyId }: { companyId: string }) {
  const mutation = useOpenCompany();

  return (
    <Button type="button" loading={mutation.isPending} onClick={() => mutation.mutate(companyId)}>
      Open company
    </Button>
  );
}

export function CompanyControls({
  companyId,
  isActive,
  invoiceNumberMode,
  aiPlanId,
  plans,
}: {
  companyId: string;
  isActive: boolean;
  invoiceNumberMode: InvoiceNumberMode;
  aiPlanId: AiPlanId;
  plans: AiSubscriptionPlan[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <OpenCompanyButton companyId={companyId} />
        <ToggleActiveButton companyId={companyId} isActive={isActive} />
      </div>
      <AppPlanSelector companyId={companyId} aiPlanId={aiPlanId} plans={plans} />
      <InvoiceModeToggle companyId={companyId} mode={invoiceNumberMode} />
    </div>
  );
}
