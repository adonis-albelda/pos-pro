"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, KeyRound, ShieldCheck } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { Button, ErrorNote, Field, Input } from "@/components/ui";
import { useConfirmMfa, useEnableMfa } from "@/lib/query/security-settings";

type Step = "loading" | "confirm" | "codes" | "error";

/**
 * QR-scan → confirm-code → show-recovery-codes-once, shared by the forced
 * /enroll-mfa page and the Settings > Security "Enable 2FA" dialog — same
 * enrollment call sequence (enableMfa then confirmMfa) either way, only what
 * happens after the codes screen differs.
 */
export function MfaEnrollFlow({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("loading");
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enableMutation = useEnableMfa();
  const confirmMutation = useConfirmMfa();

  function start() {
    setStep("loading");
    setError(null);
    enableMutation.mutate(undefined, {
      onSuccess: async ({ secret: newSecret, otpauthUri }) => {
        setSecret(newSecret);
        setQrDataUrl(await QRCode.toDataURL(otpauthUri));
        setStep("confirm");
      },
      onError: (cause) => {
        setError(cause instanceof Error ? cause.message : "Could not start setup.");
        setStep("error");
      },
    });
  }

  // Runs once on mount — `start` closes over mutation objects whose
  // identity isn't meant to retrigger this.
  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirmSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("code") ?? "").trim();
    if (!code) {
      setError("Enter the 6-digit code.");
      return;
    }
    confirmMutation.mutate(code, {
      onSuccess: (codes) => {
        setRecoveryCodes(codes);
        setStep("codes");
      },
      onError: (cause) => {
        if (cause instanceof ApiError && cause.isValidation) {
          setError(cause.errors?.code?.[0] ?? "That code is invalid.");
          return;
        }
        setError(cause instanceof Error ? cause.message : "Could not reach the server.");
      },
    });
  }

  function handleCopyAll() {
    void navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
  }

  if (step === "loading") {
    return <p className="py-8 text-center text-body text-ink-muted">Setting up...</p>;
  }

  if (step === "error") {
    return (
      <div className="space-y-4">
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button type="button" className="w-full" onClick={start}>
          Try again
        </Button>
      </div>
    );
  }

  if (step === "codes") {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-border bg-paper px-4 py-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
          <p className="text-caption text-ink-muted">
            Save these 8 recovery codes somewhere safe. Each works once, if you ever lose access to
            your authenticator app. They won&apos;t be shown again.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-paper p-4 font-mono text-body">
          {recoveryCodes.map((code) => (
            <span key={code}>{code}</span>
          ))}
        </div>
        <Button type="button" variant="secondary" icon={Copy} className="w-full" onClick={handleCopyAll}>
          {copied ? "Copied" : "Copy all codes"}
        </Button>
        <Button type="button" icon={Check} className="w-full" onClick={onDone}>
          I&apos;ve saved these, continue
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleConfirmSubmit} className="space-y-4">
      <p className="text-caption text-ink-muted">
        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter
        the 6-digit code it shows.
      </p>
      {qrDataUrl ? (
        // A locally generated data: URI — not a remote image Next's <Image> optimizer can do anything useful with.
        <img src={qrDataUrl} alt="Authenticator QR code" className="mx-auto size-48" />
      ) : null}
      <Field label="Can't scan it? Enter this key manually" hint={secret}>
        <Input readOnly value={secret} className="font-mono" />
      </Field>
      <Field label="Authentication code" required>
        <Input icon={KeyRound} name="code" autoComplete="one-time-code" placeholder="123456" required autoFocus />
      </Field>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" icon={Check} loading={confirmMutation.isPending} className="w-full">
        {confirmMutation.isPending ? "Verifying..." : "Confirm and continue"}
      </Button>
    </form>
  );
}
