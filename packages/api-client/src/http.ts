/**
 * Transport for the Tally API (Laravel, Sanctum bearer tokens). Replaces
 * PostgREST/supabase-js as the wire layer — company scoping now happens
 * server-side off the token, so callers never filter by company_id.
 */

export interface JsonApiResource<Attrs = Record<string, unknown>> {
  type: string;
  id: string;
  attributes: Attrs;
}

export interface JsonApiOne<Attrs = Record<string, unknown>> {
  data: JsonApiResource<Attrs>;
  meta?: Record<string, unknown>;
}

export interface JsonApiPage<Attrs = Record<string, unknown>> {
  data: JsonApiResource<Attrs>[];
  links?: {
    first?: string | null;
    last?: string | null;
    prev?: string | null;
    next?: string | null;
  };
  meta?: {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
  };
}

/** Plain (non-JSON:API) envelope used by POS sync + auth endpoints. */
export interface DataEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors: Record<string, string[]> | null;

  constructor(status: number, message: string, errors: Record<string, string[]> | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }

  get isValidation(): boolean {
    return this.status === 422;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Sends a generated Idempotency-Key header — required by mutating POST endpoints that create records. */
  idempotent?: boolean;
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Resolves the current bearer token. Null/undefined sends no Authorization header. */
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
  /** Called after a 401 response, before the ApiError is thrown — e.g. clear a stored session. */
  onUnauthorized?: () => void | Promise<void>;
  /** Sent on every request, e.g. `{ "X-App-Version": "1.4.0" }` from a mobile terminal — so a support request can start from what's actually installed, not what the store lists as current. */
  extraHeaders?: Record<string, string>;
}

function buildQueryString(query: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for RN/older runtimes without crypto.randomUUID.
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: ApiClientOptions["getToken"];
  private readonly onUnauthorized: ApiClientOptions["onUnauthorized"];
  private readonly extraHeaders: Record<string, string>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.getToken = options.getToken;
    this.onUnauthorized = options.onUnauthorized;
    this.extraHeaders = options.extraHeaders ?? {};
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, query, idempotent } = options;
    const token = await this.getToken();

    const headers: Record<string, string> = {
      ...this.extraHeaders,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    if (idempotent) headers["Idempotency-Key"] = generateIdempotencyKey();

    const response = await fetch(`${this.baseUrl}${path}${buildQueryString(query)}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      await this.onUnauthorized?.();
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        (payload?.message as string | undefined) ?? response.statusText,
        (payload?.errors as Record<string, string[]> | undefined) ?? null,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  get<T>(path: string, query?: RequestOptions["query"]): Promise<T> {
    return this.request<T>(path, { method: "GET", query });
  }

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, "method" | "body"> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  /**
   * A file upload — the only caller so far is products/extract-from-photo.
   * Separate from request()/post() because those always JSON.stringify the
   * body and set Content-Type: application/json; a multipart body needs
   * fetch to set its own Content-Type (with the boundary) instead.
   */
  async postMultipart<T>(path: string, formData: FormData): Promise<T> {
    const token = await this.getToken();

    const headers: Record<string, string> = { ...this.extraHeaders, Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (response.status === 401) {
      await this.onUnauthorized?.();
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        (payload?.message as string | undefined) ?? response.statusText,
        (payload?.errors as Record<string, string[]> | undefined) ?? null,
      );
    }

    return (await response.json()) as T;
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", body });
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}
