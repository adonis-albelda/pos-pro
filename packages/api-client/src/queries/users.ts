import type { User, UserRole } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiResource } from "../http";
import { type UserAttrs, toUser } from "../mappers";

/**
 * Live PIN verification (cashier unlock) and session/current-user lookups
 * (`current_app_role` / `current_app_user` on the old Supabase client) are
 * out of scope here — they live under `/pos/cashiers/verify-pin` and the
 * auth flow, built in a different query file. This file is the admin-side
 * user directory + admin-set-PIN action only.
 */

export interface CreateUserInput {
  name: string;
  email: string;
  /**
   * "superadmin" cannot be created through this endpoint — platform
   * superadmin creation lives on its own flow, not here.
   */
  role: Extract<UserRole, "cashier" | "admin" | "manager" | "driver" | "helper" | "device">;
  /**
   * Required for role "admin"/"manager"/"device" server-side; ignored/optional
   * for "cashier"/"driver"/"helper" (random password generated if omitted —
   * driver/helper never sign in, so it's simply unusable for them).
   */
  password?: string | null;
  canSell?: boolean;
  isActive?: boolean;
  /** Required for role "device" — branch the terminal sells from. */
  locationId?: string | null;
}

function toCreatePayload(input: CreateUserInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: input.name,
    email: input.email,
    role: input.role,
  };
  if (input.password !== undefined) payload.password = input.password;
  if (input.canSell !== undefined) payload.can_sell = input.canSell;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.locationId !== undefined) payload.location_id = input.locationId;
  return payload;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  canSell?: boolean;
  isActive?: boolean;
  /** Device/terminal only — rebind which branch the POS sells from. */
  locationId?: string | null;
}

function toUpdatePayload(input: UpdateUserInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.email !== undefined) payload.email = input.email;
  if (input.canSell !== undefined) payload.can_sell = input.canSell;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.locationId !== undefined) payload.location_id = input.locationId;
  return payload;
}

/**
 * GAP: IndexUsersController takes no `is_active` filter query param (unlike
 * the old Postgres `.eq("is_active", true)`) and returns every company user
 * unpaginated. `includeInactive` is therefore applied client-side after the
 * full list comes back — fine for a shop-sized staff list.
 */
export async function listUsers(
  client: ApiClient,
  options: { includeInactive?: boolean } = {},
): Promise<User[]> {
  const { data } = await client.get<{ data: JsonApiResource<UserAttrs>[] }>("/users");
  const users = data.map(toUser);
  return options.includeInactive ? users : users.filter((user) => user.isActive);
}

/** Who can unlock a terminal. Same filter the old client-side listCashiers used. */
export async function listCashiers(client: ApiClient): Promise<User[]> {
  const users = await listUsers(client);
  return users.filter((user) => user.role === "cashier" || user.role === "admin");
}

export async function getUser(client: ApiClient, id: string): Promise<User | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<UserAttrs> }>(`/users/${id}`);
    return toUser(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createUser(client: ApiClient, input: CreateUserInput): Promise<User> {
  const { data } = await client.post<{ data: JsonApiResource<UserAttrs> }>("/users", toCreatePayload(input));
  return toUser(data);
}

/**
 * GAP: UpdateUserRequest does not accept `role` or `password` — neither can
 * be changed through this endpoint. No Tally API equivalent for a role
 * change or an admin-initiated password reset was found under Users; flag
 * to backend if a call site needs either.
 */
export async function updateUser(client: ApiClient, id: string, patch: UpdateUserInput): Promise<User> {
  const { data } = await client.patch<{ data: JsonApiResource<UserAttrs> }>(`/users/${id}`, toUpdatePayload(patch));
  return toUser(data);
}

export async function setUserActive(client: ApiClient, id: string, isActive: boolean): Promise<User> {
  return updateUser(client, id, { isActive });
}

/** Hard delete — DestroyUserController has no deactivate-instead option; use setUserActive(false) for that. */
export async function deleteUser(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/users/${id}`);
}

/** Admin sets a cashier's PIN. Distinct from cashier unlock (`verify-pin`), which lives elsewhere. */
export async function setUserPin(client: ApiClient, id: string, pin: string): Promise<User> {
  const { data } = await client.put<{ data: JsonApiResource<UserAttrs> }>(`/users/${id}/pin`, { pin });
  return toUser(data);
}

/**
 * `GET /users/count` (`UserCountController`) — one count query, not the
 * full `listUsers()` payload fetched just to read `.length`.
 */
export async function countUsers(client: ApiClient): Promise<number> {
  const { data } = await client.get<{ data: { count: number } }>("/users/count");
  return data.count;
}

/** Shop admin resends verification email for an unverified admin/manager. */
export async function sendUserEmailVerification(client: ApiClient, id: string): Promise<string> {
  const { message } = await client.post<{ message: string }>(`/users/${id}/email/verification-notification`);
  return message;
}
