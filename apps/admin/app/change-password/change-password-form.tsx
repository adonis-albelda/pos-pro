"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Lock } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { changePassword } from "@double-a/api-client/queries";
import { Button, ErrorNote, Field } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { getBrowserApiClient } from "@/lib/api/browser-client";

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: { currentPassword: string; password: string }) =>
      changePassword(getBrowserApiClient(), input),
    // A soft router.push("/") here left the user stuck on this page: the
    // proxy middleware gates every navigation on the account's own
    // must_change_password flag, but a client-side transition can still
    // serve the previous RSC render of "/" out of Next's Router Cache from
    // before the flag flipped. A hard navigation forces a real request,
    // so middleware and every server component re-evaluate against the
    // post-change session instead of a stale cached one.
    onSuccess: () => {
      window.location.href = "/";
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.isValidation) {
        setError(cause.errors?.current_password?.[0] ?? "That current password is incorrect.");
        return;
      }
      setError(cause instanceof Error ? cause.message : "Could not reach the server.");
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const currentPassword = String(formData.get("current_password") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }

    mutation.mutate({ currentPassword, password });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
      <Field label="Current password">
        <PasswordInput
          icon={Lock}
          name="current_password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field label="New password">
        <PasswordInput
          icon={Lock}
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      <Field label="Confirm password">
        <PasswordInput
          icon={Lock}
          name="confirm"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" loading={mutation.isPending} icon={Check} className="w-full">
        {mutation.isPending ? "Saving..." : "Save and continue"}
      </Button>
    </form>
  );
}
