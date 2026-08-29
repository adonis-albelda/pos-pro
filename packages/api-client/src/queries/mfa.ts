import type { ApiClient } from "../http";

/**
 * The caller's own two-factor enrollment — separate from LoginInput's
 * mfaCode/recoveryCode (auth.ts), which only apply while logging in. These
 * calls need an already-issued bearer token (post-login), used by the forced
 * /enroll-mfa flow and the Settings > Security "your account" card.
 */

export interface MfaStatus {
  enabled: boolean;
  confirmed: boolean;
  required: boolean;
}

export async function getMfaStatus(client: ApiClient): Promise<MfaStatus> {
  const { data } = await client.get<{ data: MfaStatus }>("/auth/mfa");
  return data;
}

export interface EnableMfaResult {
  secret: string;
  otpauthUri: string;
}

/** Starts (or restarts) enrollment. Refuses with a validation error if already confirmed. */
export async function enableMfa(client: ApiClient): Promise<EnableMfaResult> {
  const { data } = await client.post<{ data: { secret: string; otpauth_uri: string } }>("/auth/mfa/enable");
  return { secret: data.secret, otpauthUri: data.otpauth_uri };
}

/** Proves the enrolled secret works. Returns the 8 recovery codes — visible only this once. */
export async function confirmMfa(client: ApiClient, code: string): Promise<string[]> {
  const { data } = await client.post<{ data: { recovery_codes: string[] } }>("/auth/mfa/confirm", { code });
  return data.recovery_codes;
}

/** Blocked server-side (422) while MFA is required for this account. */
export async function disableMfa(client: ApiClient, password: string): Promise<void> {
  await client.post<{ message: string }>("/auth/mfa/disable", { password });
}

/** Invalidates the old 8 codes and issues a fresh set. */
export async function regenerateMfaRecoveryCodes(client: ApiClient, password: string): Promise<string[]> {
  const { data } = await client.post<{ data: { recovery_codes: string[] } }>("/auth/mfa/recovery-codes", {
    password,
  });
  return data.recovery_codes;
}
