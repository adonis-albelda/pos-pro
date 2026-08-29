"use client";

import { useState } from "react";
import { Check, KeyRound, Lock, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { ApiError } from "@double-a/api-client";
import { Badge, Button, Card, CardHeader, ErrorNote, Field } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { Dialog } from "@/components/overlay";
import { MfaEnrollFlow } from "@/components/mfa-enroll-flow";
import {
  useDisableMfa,
  useMfaStatus,
  useRegenerateMfaRecoveryCodes,
  useSecuritySettings,
  useUpdateSecuritySettings,
} from "@/lib/query/security-settings";

function Toggle({
  enabled,
  disabled,
  onChange,
}: {
  enabled: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={[
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        enabled ? "bg-primary" : "bg-border",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

/** Re-confirms the account password before a sensitive MFA action (disable, regenerate codes) — no separate confirmationText typing, just the password itself. */
function PasswordPromptDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    if (!password) {
      setLocalError("Enter your password.");
      return;
    }
    onConfirm(password);
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        setPassword("");
        setLocalError(null);
        onClose();
      }}
      title={title}
      description={description}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Your password" required>
          <PasswordInput
            icon={Lock}
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </Field>
        {localError ?? error ? <ErrorNote>{localError ?? error}</ErrorNote> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function extractPasswordError(cause: unknown): string {
  if (cause instanceof ApiError && cause.isValidation) {
    return cause.errors?.password?.[0] ?? cause.errors?.mfa?.[0] ?? "That password is incorrect.";
  }
  return cause instanceof Error ? cause.message : "Could not reach the server.";
}

export function SecuritySettingsCard() {
  const settingsQuery = useSecuritySettings();
  const updateSettings = useUpdateSecuritySettings();
  const statusQuery = useMfaStatus();
  const disableMutation = useDisableMfa();
  const regenerateMutation = useRegenerateMfaRecoveryCodes();

  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);

  function toggleCompanyRequirement(next: boolean) {
    setSettingsError(null);
    updateSettings.mutate(next, {
      onError: (cause) => setSettingsError(cause instanceof Error ? cause.message : "Could not save."),
    });
  }

  const status = statusQuery.data;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={ShieldCheck}
          title="Two-factor authentication"
          description="Require every admin in your company to confirm a code from an authenticator app at login."
        />
        <div className="space-y-3 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-body font-medium text-ink">Require 2FA for all admins</p>
              <p className="mt-0.5 text-caption text-ink-muted">
                Applies the next time each admin logs in — nobody currently signed in is interrupted.
              </p>
            </div>
            {settingsQuery.data ? (
              <Toggle
                enabled={settingsQuery.data.mfaRequired}
                disabled={updateSettings.isPending}
                onChange={toggleCompanyRequirement}
              />
            ) : null}
          </div>
          {settingsError ? <ErrorNote>{settingsError}</ErrorNote> : null}
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={KeyRound}
          title="Your account"
          description="Your own authenticator app enrollment."
          action={
            status ? (
              <Badge tone={status.confirmed ? "success" : status.required ? "warning" : "neutral"}>
                {status.confirmed ? "Enabled" : status.required ? "Setup required" : "Not enabled"}
              </Badge>
            ) : null
          }
        />
        <div className="flex flex-wrap items-center gap-2 px-4 py-5 sm:px-6">
          {!status?.confirmed ? (
            <Button type="button" icon={ShieldCheck} onClick={() => setEnrollOpen(true)}>
              Enable 2FA
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                icon={RefreshCw}
                onClick={() => {
                  setRegenerateError(null);
                  setNewRecoveryCodes(null);
                  setRegenerateOpen(true);
                }}
              >
                Regenerate recovery codes
              </Button>
              {!status.required ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={ShieldOff}
                  onClick={() => {
                    setDisableError(null);
                    setDisableOpen(true);
                  }}
                >
                  Disable
                </Button>
              ) : (
                <p className="text-caption text-ink-muted">
                  Required by your company — ask an owner to turn it off first if you need to disable it.
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      <Dialog
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        title="Enable two-factor authentication"
        description="Scan the QR code with an authenticator app to finish."
      >
        <MfaEnrollFlow onDone={() => setEnrollOpen(false)} />
      </Dialog>

      <PasswordPromptDialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Disable two-factor authentication"
        description="Confirm your password to turn off 2FA for your account."
        confirmLabel="Disable 2FA"
        pending={disableMutation.isPending}
        error={disableError}
        onConfirm={(password) => {
          setDisableError(null);
          disableMutation.mutate(password, {
            onSuccess: () => setDisableOpen(false),
            onError: (cause) => setDisableError(extractPasswordError(cause)),
          });
        }}
      />

      <Dialog
        open={regenerateOpen}
        onClose={() => setRegenerateOpen(false)}
        title="Regenerate recovery codes"
        description={
          newRecoveryCodes
            ? "Save these — your old codes no longer work."
            : "Confirm your password. Your old 8 codes stop working immediately."
        }
      >
        {newRecoveryCodes ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-paper p-4 font-mono text-body">
              {newRecoveryCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <Button type="button" icon={Check} className="w-full" onClick={() => setRegenerateOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setRegenerateError(null);
              const formData = new FormData(event.currentTarget);
              const password = String(formData.get("password") ?? "");
              if (!password) {
                setRegenerateError("Enter your password.");
                return;
              }
              regenerateMutation.mutate(password, {
                onSuccess: (codes) => setNewRecoveryCodes(codes),
                onError: (cause) => setRegenerateError(extractPasswordError(cause)),
              });
            }}
          >
            <Field label="Your password" required>
              <PasswordInput icon={Lock} name="password" autoComplete="current-password" autoFocus required />
            </Field>
            {regenerateError ? <ErrorNote>{regenerateError}</ErrorNote> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                disabled={regenerateMutation.isPending}
                onClick={() => setRegenerateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={regenerateMutation.isPending}>
                Regenerate
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
