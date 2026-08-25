import type { User } from "@double-a/shared-types";

/** Shop dashboard writer: a company admin, or a superadmin who has opened a company. */
export function isShopAdmin(user: User | null | undefined): user is User {
  return Boolean(user && (user.role === "admin" || user.role === "superadmin"));
}

/** Platform console only — company_id is always null (CLAUDE.md §15). */
export function isSuperadmin(user: User | null | undefined): user is User {
  return Boolean(user && user.role === "superadmin");
}
