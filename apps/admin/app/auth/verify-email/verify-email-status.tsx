"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { verifyEmail } from "@double-a/api-client/queries";
import { getBrowserBareClient } from "@/lib/api/browser-client";

type Status = "verifying" | "success" | "already" | "error";

export function VerifyEmailStatus({
  id,
  hash,
  expires,
  signature,
}: {
  id?: string;
  hash?: string;
  expires?: string;
  signature?: string;
}) {
  const [status, setStatus] = useState<Status>("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !hash || !expires || !signature) {
      setStatus("error");
      setError("This verification link is incomplete. Ask an admin to resend it.");
      return;
    }

    let cancelled = false;
    void verifyEmail(getBrowserBareClient(), { id, hash, expires, signature })
      .then((result) => {
        if (cancelled) return;
        setStatus(result.alreadyVerified ? "already" : "success");
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(
          caught instanceof ApiError
            ? caught.message
            : "This verification link has expired or is no longer valid.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id, hash, expires, signature]);

  if (status === "verifying") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Loader2 size={28} strokeWidth={2} className="animate-spin text-primary" />
        <p className="text-body text-ink-muted">Verifying your email…</p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 size={32} strokeWidth={2} className="text-success" />
        <h2 className="text-heading-lg font-bold text-ink">Email verified</h2>
        <p className="text-body text-ink-muted">Your account is ready. You can sign in now.</p>
        <Link
          href="/login"
          className="mt-2 inline-flex h-10 items-center justify-center rounded-sm bg-primary px-4 text-body font-medium text-white transition-colors hover:bg-primary/90"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (status === "already") {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <CheckCircle2 size={32} strokeWidth={2} className="text-primary" />
        <h2 className="text-heading-lg font-bold text-ink">Email already verified</h2>
        <p className="text-body text-ink-muted">
          This link was already used. Your account is ready — sign in normally.
        </p>
        <Link
          href="/login"
          className="mt-2 inline-flex h-10 items-center justify-center rounded-sm bg-primary px-4 text-body font-medium text-white transition-colors hover:bg-primary/90"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <TriangleAlert size={32} strokeWidth={2} className="text-danger" />
      <h2 className="text-heading-lg font-bold text-ink">Link not valid</h2>
      <p className="text-body text-ink-muted">{error}</p>
      <p className="text-caption text-ink-muted">
        Ask an admin to resend the verification email from the Users page.
      </p>
    </div>
  );
}
