"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, LogIn, Lock, Mail, ShieldCheck } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { login } from "@double-a/api-client/queries";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { getBrowserBareClient, startBrowserSession } from "@/lib/api/browser-client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Set only after the server tells us this login needs an access code (the
  // demo@store.com account) — email/password stay in memory just long
  // enough to resubmit alongside the code; never written to storage.
  const [pendingCredentials, setPendingCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  // Same shape, for the "enter your 6-digit code" step once MFA is required
  // and confirmed — 422 on mfa_code instead of access_code.
  const [pendingMfaCredentials, setPendingMfaCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const mutation = useMutation({
    mutationFn: async (input: {
      email: string;
      password: string;
      accessCode?: string;
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

      // Enrollment gate takes priority over must_change_password: without a
      // confirmed secret this account can never produce a valid mfa_code on
      // its next login, so it has to be resolved right now.
      if (user.mustEnrollMfa) {
        router.push("/enroll-mfa" as Route);
        return;
      }
      if (user.mustChangePassword) {
        router.push("/change-password");
        return;
      }
      if (user.role === "superadmin") {
        router.push((next.startsWith("/platform") ? next : "/platform") as Route);
        return;
      }
      router.push((next.startsWith("/") ? next : "/") as Route);
    },
    onError: (cause) => {
      if (cause instanceof ApiError && cause.isValidation) {
        const accessCodeError = cause.errors?.access_code?.[0];
        if (accessCodeError) {
          setError(accessCodeError);
          return;
        }
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
          // The demo account: password was fine, but it needs a code too —
          // hold onto the credentials and swap to the code screen instead
          // of leaving this a generic "invalid" error.
          if (cause instanceof ApiError && cause.isValidation && cause.errors?.access_code) {
            setPendingCredentials({ email, password });
            return;
          }
          // MFA required + already confirmed: same shape, different field.
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

  function handleAccessCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!pendingCredentials) return;

    const formData = new FormData(event.currentTarget);
    const accessCode = String(formData.get("access_code") ?? "").trim();
    if (!accessCode) {
      setError("Enter your access code.");
      return;
    }

    mutation.mutate({ ...pendingCredentials, accessCode });
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

  if (pendingCredentials) {
    return (
      <form onSubmit={handleAccessCodeSubmit} className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-paper px-4 py-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-caption text-ink-muted">
            This is a demo account. Enter the one-time access code you were sent to continue.
          </p>
        </div>
        <Field label="Access code" required>
          <Input
            icon={KeyRound}
            name="access_code"
            autoComplete="one-time-code"
            placeholder="e.g. AB12CD34EF"
            autoFocus
            required
          />
        </Field>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button type="submit" className="w-full" loading={mutation.isPending} icon={LogIn}>
          {mutation.isPending ? "Signing in..." : "Continue"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setPendingCredentials(null);
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
