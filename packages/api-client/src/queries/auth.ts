import type { User } from "@double-a/shared-types";
import type { ApiClient, JsonApiOne } from "../http";
import { type UserAttrs, toUser } from "../mappers";
import type { AuthTokenMeta } from "./pos";

/**
 * Session/account endpoints: login, current user, logout, password change,
 * token management, and password-reset request/confirm. Live network calls
 * only — CLAUDE.md §1 says login (admin email/password, terminal enrollment,
 * cashier PIN unlock) never touches local SQLite, which is naturally true
 * here since this whole file is the network layer. Device enrollment and
 * cashier PIN verification live in queries/pos.ts, not here — this file is
 * "who is logged in," pos.ts is "what a POS terminal does once it is."
 */

export interface LoginInput {
  email: string;
  password: string;
  /** Label for the issued Sanctum token — shows up in `listTokens`. */
  deviceName: string;
  /** Only meaningful for a demo-flagged account — LoginController rejects such a login without it. */
  accessCode?: string;
}

export interface LoginResult {
  user: User;
  token: string;
  tokenType: string;
  /** Null when `sanctum.expiration` is unset — long-lived token. */
  expiresAt: string | null;
}

/**
 * Same endpoint an admin dashboard login and a POS device's own pre-
 * enrollment credential check both call — `device_name` just labels the
 * token either way. NOT idempotent server-side (route carries only
 * `throttle:auth-login`, no `idempotency` middleware) — do not pass
 * `idempotent: true` here, unlike `enrollDevice`.
 */
export async function login(client: ApiClient, input: LoginInput): Promise<LoginResult> {
  const { data, meta } = await client.post<JsonApiOne<UserAttrs> & { meta: AuthTokenMeta }>("/auth/login", {
    email: input.email,
    password: input.password,
    device_name: input.deviceName,
    access_code: input.accessCode,
  });
  return {
    user: toUser(data),
    token: meta.token,
    tokenType: meta.token_type,
    expiresAt: meta.expires_at,
  };
}

/** The user behind the current bearer token. */
export async function me(client: ApiClient): Promise<User> {
  const { data } = await client.get<JsonApiOne<UserAttrs>>("/auth/me");
  return toUser(data);
}

/** Revokes only the current token (the one `client` is authenticated with) — not every session. */
export async function logout(client: ApiClient): Promise<void> {
  await client.post<void>("/auth/logout");
}

export interface ChangePasswordInput {
  currentPassword: string;
  password: string;
}

/**
 * Clears `must_change_password` on success. `password_confirmation` is
 * required server-side by Laravel's `confirmed` rule (must equal
 * `password`) even though `ChangePasswordPayload` never reads it back out —
 * it is validation-only, sent here for that reason.
 */
export async function changePassword(client: ApiClient, input: ChangePasswordInput): Promise<void> {
  await client.post<{ message: string }>("/auth/password/change", {
    current_password: input.currentPassword,
    password: input.password,
    password_confirmation: input.password,
  });
}

/**
 * Sanctum personal access tokens. Not a shared domain type (packages/shared-
 * types has nothing mobile mirrors this into) — kept local to this file
 * rather than added to mappers.ts, which is for cross-app domain resources.
 */
export interface PersonalAccessTokenAttrs {
  name: string;
  abilities: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_current: boolean;
}

export interface PersonalAccessToken {
  id: string;
  name: string;
  abilities: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Whether this is the token `client` itself is authenticated with. */
  isCurrent: boolean;
}

function toPersonalAccessToken(resource: {
  id: string;
  attributes: PersonalAccessTokenAttrs;
}): PersonalAccessToken {
  const a = resource.attributes;
  return {
    id: resource.id,
    name: a.name,
    abilities: a.abilities,
    lastUsedAt: a.last_used_at,
    expiresAt: a.expires_at,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    isCurrent: a.is_current,
  };
}

/** All personal access tokens for the currently authenticated user (every device/session they've logged into). */
export async function listTokens(client: ApiClient): Promise<PersonalAccessToken[]> {
  const { data } = await client.get<{
    data: { type: string; id: string; attributes: PersonalAccessTokenAttrs }[];
  }>("/auth/tokens");
  return data.map(toPersonalAccessToken);
}

/** Revokes one token by id — must belong to the authenticated user, or the server 404s. */
export async function revokeToken(client: ApiClient, tokenId: string | number): Promise<void> {
  await client.delete<void>(`/auth/tokens/${tokenId}`);
}

/** Revokes every token for the authenticated user, including the one `client` is using right now. */
export async function revokeAllTokens(client: ApiClient): Promise<void> {
  await client.delete<void>("/auth/tokens");
}

/**
 * Unauthenticated. Always responds with the same generic message whether or
 * not the email exists (Laravel's `Password::broker()` behavior) — do not
 * branch UI copy on this beyond "check your email." Needs `Idempotency-Key`
 * (route carries `idempotency` middleware) — a doubled tap must not queue a
 * second reset email.
 */
export async function forgotPassword(client: ApiClient, email: string): Promise<void> {
  await client.post<{ message: string }>("/auth/password/forgot", { email }, { idempotent: true });
}

export interface ResetPasswordInput {
  token: string;
  email: string;
  password: string;
}

/** Unauthenticated. Consumes the reset token from the emailed link. */
export async function resetPassword(client: ApiClient, input: ResetPasswordInput): Promise<void> {
  await client.post<{ message: string }>("/auth/password/reset", {
    token: input.token,
    email: input.email,
    password: input.password,
    password_confirmation: input.password,
  });
}
