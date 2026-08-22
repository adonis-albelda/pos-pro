"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useMutation } from "@tanstack/react-query";
import { LogIn, Lock, Mail } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { login } from "@double-a/api-client/queries";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { getBrowserBareClient, startBrowserSession } from "@/lib/api/browser-client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
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
      if (cause instanceof ApiError && (cause.isValidation || cause.isUnauthenticated)) {
        setError("That email and password do not match an account.");
        return;
      }
      setError(cause instanceof Error ? cause.message : "Could not reach the server.");
    },
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    mutation.mutate({ email, password });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Email">
        <Input
          icon={Mail}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@business.com"
          required
        />
      </Field>
      <Field label="Password">
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
