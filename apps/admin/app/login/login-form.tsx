"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, LogIn, Lock, Mail, ShieldCheck } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { login } from "@double-a/api-client/queries";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { getBrowserBareClient, startBrowserSession } from "@/lib/api/browser-client";

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pendingMfaCredentials, setPendingMfaCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const mutation = useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      mfaCode?: string;
      recoveryCode?: string;
    }) => {
      return login(getBrowserBareClient(), { ...input, deviceName: "admin-web" });
    },
    onSuccess: ({ user, token, expiresAt }) => {
      if (user.role !== "admin" && user.role !== "superadmin") {
        setError("This account is not an active admin. Ask an owner to grant access.");
        return;
      }
      if (user.role === "admin" && user.companyIsActive === false) {
        setError("This shop account is disabled. Contact the platform operator.");
        return;
      }

      startBrowserSession(token, expiresAt);

      const destination =
        user.mustEnrollMfa
          ? "/enroll-mfa"
          : user.mustChangePassword
            ? "/change-password"
            : user.role === "superadmin"
              ? next.startsWith("/platform")
                ? next
                : "/platform"
              : next.startsWith("/")
                ? next
                : "/";

      window.location.assign(destination);
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.isValidation) {
        const mfaCodeError = cause.errors?.mfa_code?.[0];
        if (mfaCodeError) {
          setError(pendingMfaCredentials ? mfaCodeError : null);
          return;
        }
        setError("That email and password do not match an account.");
        return;
      }
      if (cause instanceof ApiError && cause.isUnauthenticated) {
        setError("That email and password do not match an account.");
        return;
      }
      setError(cause instanceof Error ? cause.message : "Could not reach the server.");
    },
  });

  function handleCredentialsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }

    mutation.mutate(
      { email, password },
      {
        onError: (cause) => {
          if (cause instanceof ApiError && cause.isValidation && cause.errors?.mfa_code) {
            setPendingMfaCredentials({ email, password });
          }
        },
      },
    );
  }

  function handleMfaSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!pendingMfaCredentials) return;

    const formData = new FormData(event.currentTarget);
    const value = String(formData.get(useRecoveryCode ? "recovery_code" : "mfa_code") ?? "").trim();
    if (!value) {
      setError(useRecoveryCode ? "Enter a recovery code." : "Enter your 6-digit code.");
      return;
    }

    mutation.mutate({
      ...pendingMfaCredentials,
      ...(useRecoveryCode ? { recoveryCode: value } : { mfaCode: value }),
    });
  }

  if (pendingMfaCredentials) {
    return (
      <form onSubmit={handleMfaSubmit} className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-paper px-4 py-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-caption text-ink-muted">
            {useRecoveryCode
              ? "Enter one of your saved recovery codes."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>
        <Field label={useRecoveryCode ? "Recovery code" : "Authentication code"} required>
          <Input
            key={useRecoveryCode ? "recovery" : "totp"}
            icon={KeyRound}
            name={useRecoveryCode ? "recovery_code" : "mfa_code"}
            autoComplete="one-time-code"
            placeholder={useRecoveryCode ? "e.g. AB12-CD34" : "123456"}
            autoFocus
            required
          />
        </Field>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button type="submit" className="w-full" loading={mutation.isPending} icon={LogIn}>
          {mutation.isPending ? "Verifying..." : "Continue"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setUseRecoveryCode((current) => !current);
            setError(null);
          }}
          className="w-full text-center text-caption font-medium text-ink-muted transition-colors hover:text-ink"
        >
          {useRecoveryCode ? "Use your authenticator app instead" : "Use a recovery code instead"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPendingMfaCredentials(null);
            setUseRecoveryCode(false);
            setError(null);
          }}
          className="w-full text-center text-caption font-medium text-ink-muted transition-colors hover:text-ink"
        >
          Use a different account
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleCredentialsSubmit} className="space-y-4">
      <Field label="Email" required>
        <Input
          icon={Mail}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@business.com"
          required
        />
      </Field>
      <Field label="Password" required>
        <PasswordInput
          icon={Lock}
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" className="w-full" loading={mutation.isPending} icon={LogIn}>
        {mutation.isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
