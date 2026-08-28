"use client";

import { useState, type FormEvent } from "react";
import { Building2, KeyRound, Lock, Mail, UserRound } from "lucide-react";
import { isValidPin } from "@double-a/shared-types";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { useCreateCompany } from "@/lib/query/companies";

export function CreateCompanyForm() {
  const mutation = useCreateCompany();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const adminName = String(form.get("admin_name") ?? "").trim();
    const adminEmail = String(form.get("admin_email") ?? "").trim();
    const adminPassword = String(form.get("admin_password") ?? "");
    const adminPin = String(form.get("admin_pin") ?? "").trim();

    if (!name) {
      setError("Company name is required.");
      return;
    }
    if (!adminName) {
      setError("Admin name is required.");
      return;
    }
    if (!adminEmail) {
      setError("Admin email is required.");
      return;
    }
    if (adminPassword.length < 8) {
      setError("Admin password must be at least 8 characters.");
      return;
    }
    if (!isValidPin(adminPin)) {
      setError(
        "Admin PIN must be 4 to 6 digits. The POS unlocks with this PIN, not the dashboard password.",
      );
      return;
    }

    mutation.mutate(
      { name, adminName, adminEmail, adminPassword, adminPin },
      {
        onError: (saveError) => {
          setError(saveError instanceof Error ? saveError.message : "Could not create company.");
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label="Company name">
        <Input icon={Building2} name="name" required />
      </Field>
      <Field label="Admin name">
        <Input icon={UserRound} name="admin_name" required />
      </Field>
      <Field label="Admin email">
        <Input icon={Mail} name="admin_email" type="email" required />
      </Field>
      <Field label="Admin password" hint="Dashboard sign-in. They will be asked to change it on first visit.">
        <PasswordInput
          icon={Lock}
          name="admin_password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <Field
        label="Admin PIN"
        hint="4–6 digits. Unlocks a POS terminal. Not the dashboard password."
      >
        <Input
          icon={KeyRound}
          name="admin_pin"
          inputMode="numeric"
          minLength={4}
          maxLength={6}
          required
        />
      </Field>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" loading={mutation.isPending}>
        Create company
      </Button>
    </form>
  );
}
