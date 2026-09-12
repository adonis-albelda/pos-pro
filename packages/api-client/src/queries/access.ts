import type { User } from "@double-a/shared-types";
import { type ApiClient, type JsonApiResource } from "../http";
import { type UserAttrs, toUser } from "../mappers";

export type AccessRoleName = "admin" | "manager" | "cashier" | "inventory_clerk" | "terminal";

export interface AccessPermission {
  name: string;
  label: string;
}

export interface AccessRole {
  name: AccessRoleName;
  label: string;
}

export interface AccessCatalog {
  permissions: AccessPermission[];
  roles: AccessRole[];
  /** Keyed by whatever roles the server's roles-table query returned — not every AccessRoleName is guaranteed present. */
  roleDefaults: Partial<Record<AccessRoleName, string[]>>;
}

interface AccessCatalogResponse {
  data: {
    permissions: AccessPermission[];
    roles: AccessRole[];
    role_defaults: Record<string, string[]>;
  };
}

/**
 * Permission catalog + role templates for the Access page. Owner-only.
 * Roles and their default permission sets come straight from the server's
 * live Spatie roles-table query — no hardcoded role list here, so a newly
 * seeded role shows up without a frontend change.
 */
export async function listAccessCatalog(client: ApiClient): Promise<AccessCatalog> {
  const body = await client.get<AccessCatalogResponse>("/permissions");
  return {
    permissions: body.data.permissions ?? [],
    roles: (body.data.roles ?? []) as AccessRole[],
    roleDefaults: (body.data.role_defaults ?? {}) as Partial<Record<AccessRoleName, string[]>>,
  };
}

export interface UpdateUserAccessInput {
  role: AccessRoleName;
  permissions: string[];
}

/** Assign Spatie role + direct permissions for one shop user. Owner-only. */
export async function updateUserAccess(
  client: ApiClient,
  userId: string,
  input: UpdateUserAccessInput,
): Promise<User> {
  const { data } = await client.put<{ data: JsonApiResource<UserAttrs> }>(
    `/users/${userId}/access`,
    {
      role: input.role,
      permissions: input.permissions,
    },
  );
  return toUser(data);
}
