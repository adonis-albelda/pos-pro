import type { ApiClient } from "../http";

/** Platform-wide toggle for whether superadmin accounts must confirm a TOTP code at login — superadmin-only. */
export interface PlatformSecuritySettings {
  superadminMfaRequired: boolean;
}

interface PlatformSecuritySettingsAttrs {
  superadmin_mfa_required: boolean;
}

export async function getPlatformSecuritySettings(client: ApiClient): Promise<PlatformSecuritySettings> {
  const { data } = await client.get<{ data: PlatformSecuritySettingsAttrs }>("/superadmin/security-settings");
  return { superadminMfaRequired: data.superadmin_mfa_required };
}

export async function updatePlatformSecuritySettings(
  client: ApiClient,
  superadminMfaRequired: boolean,
): Promise<PlatformSecuritySettings> {
  const { data } = await client.patch<{ data: PlatformSecuritySettingsAttrs }>("/superadmin/security-settings", {
    superadmin_mfa_required: superadminMfaRequired,
  });
  return { superadminMfaRequired: data.superadmin_mfa_required };
}
