import type { ApiClient } from "../http";

/** The acting company's MFA requirement — admin-only to change (actsAsAdmin()). */
export interface SecuritySettings {
  mfaRequired: boolean;
}

interface SecuritySettingsAttrs {
  mfa_required: boolean;
}

export async function getSecuritySettings(client: ApiClient): Promise<SecuritySettings> {
  const { data } = await client.get<{ data: SecuritySettingsAttrs }>("/security-settings");
  return { mfaRequired: data.mfa_required };
}

export async function updateSecuritySettings(
  client: ApiClient,
  mfaRequired: boolean,
): Promise<SecuritySettings> {
  const { data } = await client.patch<{ data: SecuritySettingsAttrs }>("/security-settings", {
    mfa_required: mfaRequired,
  });
  return { mfaRequired: data.mfa_required };
}
