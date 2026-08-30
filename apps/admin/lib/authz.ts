import type { User } from "@double-a/shared-types";

/**
 * Shop dashboard writer: a company admin, a manager (near-admin — see
 * User::actsAsAdmin(), Laravel), or a superadmin who has opened a company.
 */
export function isShopAdmin(user: User | null | undefined): user is User {
  return Boolean(
    user && (user.role === "admin" || user.role === "manager" || user.role === "superadmin"),
  );
}

/**
 * Owner tier — admin or an acting superadmin, never manager (see
 * User::actsAsOwner(), Laravel). Gates the handful of pages a manager is
 * explicitly excluded from: company settings and user management.
 */
export function isShopOwner(user: User | null | undefined): user is User {
  return Boolean(user && (user.role === "admin" || user.role === "superadmin"));
}

/** Platform console only — company_id is always null (CLAUDE.md §15). */
export function isSuperadmin(user: User | null | undefined): user is User {
  return Boolean(user && user.role === "superadmin");
}
