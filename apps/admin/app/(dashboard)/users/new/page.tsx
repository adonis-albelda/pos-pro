"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@double-a/api-client";
import { createUser, setUserPin } from "@double-a/api-client/queries";
import type { UserRole } from "@double-a/shared-types";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { useInvalidateUsers } from "@/lib/query/users";

const CREATE_ROLES: { value: Extract<UserRole, "admin" | "manager" | "cashier" | "inventory_clerk">; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "inventory_clerk", label: "Inventory Clerk" },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const first = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Could not create user.";
}

export default function NewUserPage() {
  const router = useRouter();
  const invalidate = useInvalidateUsers();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const username = String(form.get("username") ?? "").trim() || null;
    const role = String(form.get("role") ?? "cashier") as (typeof CREATE_ROLES)[number]["value"];
    const password = String(form.get("password") ?? "");
    const pin = String(form.get("pin") ?? "").trim() || null;
    const isActive = form.get("is_active") === "on";

    if (!name || !email) {
      toast.error("Name and email are required.");
      return;
    }
    if ((role === "admin" || role === "manager" || role === "inventory_clerk") && password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setPending(true);
    try {
      const client = getBrowserApiClient();
      const user = await createUser(client, {
        name,
        email,
        username,
        role,
        password: password || null,
        isActive,
        canSell: role === "cashier" || role === "admin" || role === "manager",
        pin: null,
      });
      if (pin) {
        await setUserPin(client, user.id, pin);
      }
      invalidate();
      toast.success("User created.");
      router.push(`/users/${user.id}` as Route);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        icon={UserPlus}
        title="New user"
        description="Email or username, password, optional PIN, role, and active flag. Last login fills after first sign-in."
      />

      <Card>
        <form onSubmit={onSubmit} className="space-y-4 p-4 sm:p-5">
          <Field label="Full name" required>
            <Input name="name" required autoComplete="name" />
          </Field>
          <Field label="Email" required>
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label="Username" hint="Optional login alias (letters, numbers, dash, underscore).">
            <Input name="username" autoComplete="username" />
          </Field>
          <Field label="Role" required>
            <Select name="role" defaultValue="cashier">
              {CREATE_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Password" hint="Required for Admin, Manager, Inventory Clerk.">
            <PasswordInput name="password" autoComplete="new-password" />
          </Field>
          <Field label="PIN" hint="Optional 4–6 digits for terminal unlock.">
            <Input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} />
          </Field>
          <label className="flex items-center gap-2 text-body text-ink">
            <input type="checkbox" name="is_active" defaultChecked className="size-4 accent-primary" />
            Active
          </label>
          <p className="text-caption text-ink-muted">
            Profile photo upload lands on the edit screen after create. Last login is system-set.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push("/users")}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Create user
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
