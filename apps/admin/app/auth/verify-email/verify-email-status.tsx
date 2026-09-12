"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Smartphone, TriangleAlert } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { verifyEmail, type VerifyEmailResult } from "@double-a/api-client/queries";
import { getBrowserBareClient } from "@/lib/api/browser-client";

type Status = "verifying" | "success" | "already" | "error";

/** Same wording either way — a fresh verify and a re-clicked link both end with the account ready to use. */
function VerifiedPanel({ result }: { result: VerifyEmailResult }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <CheckCircle2 size={32} strokeWidth={2} className="text-success" />
      <h2 className="text-heading-lg font-bold text-ink">Email verified successfully</h2>
      {result.businessName ? (
        <div className="w-full rounded-sm border border-border/60 bg-paper px-4 py-3">
          <p className="text-caption text-ink-muted">Business</p>
          <p className="text-body font-semibold text-ink">{result.businessName}</p>
          {result.email ? <p className="text-caption text-ink-muted">{result.email}</p> : null}
        </div>
      ) : null}
      <div className="mt-1 flex w-full flex-col items-center gap-2 rounded-sm bg-primary-soft px-4 py-3">
        <Smartphone size={22} strokeWidth={2} className="text-primary" />
        <p className="text-body font-medium text-ink">
          Please check the POSPro mobile app to continue using it.
        </p>
        <p className="text-caption text-ink-muted">
          The app was waiting on this — it signs you in on its own now that your email is verified.
        </p>
      </div>
    </div>
  );
}

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
  const [result, setResult] = useState<VerifyEmailResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !hash || !expires || !signature) {
      setStatus("error");
      setError("This verification link is incomplete. Ask an admin to resend it.");
      return;
    }

    let cancelled = false;
    void verifyEmail(getBrowserBareClient(), { id, hash, expires, signature })
      .then((verified) => {
        if (cancelled) return;
        setResult(verified);
        setStatus(verified.alreadyVerified ? "already" : "success");
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

  if (status === "success" || status === "already") {
    return result ? <VerifiedPanel result={result} /> : null;
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
