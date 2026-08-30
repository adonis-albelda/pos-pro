"use client";

import type Echo from "laravel-echo";
import type { Channel } from "laravel-echo";
import { assertApiUrl } from "@double-a/api-client";
import { readCookie } from "@/lib/api/browser-client";
import { SESSION_COOKIE } from "@/lib/api/cookie-names";

/**
 * require(), not `import Echo from "laravel-echo"` / `import Pusher from
 * "pusher-js"` — mirrors apps/mobile/sync/realtime.ts's own note: depending
 * on exactly how a bundler unwraps each package's CJS/UMD export, a plain
 * default import has landed on a non-constructor value before. require()
 * returns the raw `module.exports`, so `.default ?? <the export itself>`
 * always lands on the real class regardless of bundler/interop shape.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
const EchoModule = require("laravel-echo");
const EchoCtor: typeof Echo = EchoModule.default ?? EchoModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
const PusherModule = require("pusher-js");
const PusherCtor = PusherModule.default ?? PusherModule;

interface StockUpdatedPayload {
  product_id: string;
  location_id: string;
  quantity: number;
}

function apiUrl(): string {
  return assertApiUrl(process.env.NEXT_PUBLIC_TALLY_API_URL, "NEXT_PUBLIC_TALLY_API_URL");
}

let echo: Echo<"reverb"> | null = null;
let connectedLocationId: string | null = null;
let connectedCompanyId: string | null = null;
/** The real Pusher-protocol socket state — "connected" is the only state that means an actual live connection, not just "Echo got constructed." */
let socketState = "disconnected";

interface PusherConnectionLike {
  bind(event: "state_change", callback: (states: { current: string }) => void): void;
}

/**
 * Live stock ticks for one branch (ProductStockUpdated) plus company-wide
 * catalogue edits (ProductUpdated — name/price/unit/etc) — the dashboard
 * counterpart to apps/mobile/sync/realtime.ts. The stock channel needs one
 * concrete location (LocationFilterProvider's `locationId === null` means
 * "all locations," no single branch to subscribe to); the catalogue channel
 * has no such requirement and connects whenever a companyId is known, so a
 * product rename shows up live even while viewing "all locations."
 */
export function connectRealtime(
  locationId: string | null,
  companyId: string,
  onStockTick: (payload: StockUpdatedPayload) => void,
  onCatalogUpdate: () => void,
  onStateChange?: (connected: boolean) => void,
): void {
  if (echo && connectedLocationId === locationId && connectedCompanyId === companyId) return;
  disconnectRealtime();

  const token = readCookie(SESSION_COOKIE);
  if (!token) return;

  const host = process.env.NEXT_PUBLIC_REVERB_HOST;
  const key = process.env.NEXT_PUBLIC_REVERB_APP_KEY;
  if (!host || !key) return; // Not configured on this build — fail quiet, same as any other optional feature.

  const scheme = process.env.NEXT_PUBLIC_REVERB_SCHEME ?? "https";
  const port = Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? (scheme === "https" ? 443 : 80));
  const authEndpoint = `${apiUrl().replace(/\/v1\/?$/, "")}/broadcasting/auth`;
  if (process.env.NODE_ENV !== "production") console.warn("[realtime] authEndpoint:", authEndpoint);

  echo = new EchoCtor({
    broadcaster: "reverb",
    Pusher: PusherCtor,
    key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === "https",
    enabledTransports: ["ws", "wss"],
    // Sanctum bearer token, not a cookie session on the *Laravel* side — Echo
    // attaches this as the Authorization header on /broadcasting/auth.
    // Broadcast::routes() registers at the app root, not under /v1 —
    // apiUrl() is API-v1-scoped, so it has to be stripped here or this 404s.
    authEndpoint,
    bearerToken: token,
  });

  // Echo has no public "connected" API of its own — the real Pusher client
  // underneath (echo.connector.pusher) does. Not in laravel-echo's types,
  // hence the cast.
  const pusherConnection = (
    echo as unknown as { connector: { pusher: { connection: PusherConnectionLike } } }
  ).connector?.pusher?.connection;

  if (pusherConnection) {
    pusherConnection.bind("state_change", (states: { current: string }) => {
      socketState = states.current;
      onStateChange?.(states.current === "connected");
      if (process.env.NODE_ENV !== "production") console.warn("[realtime] socket state:", states.current);
    });
  }

  if (locationId) {
    const stockChannel: Channel = echo.private(`location.${locationId}.stock`);
    stockChannel.listen(".stock.updated", (payload: StockUpdatedPayload) => {
      if (process.env.NODE_ENV !== "production") console.warn("[realtime] stock.updated", payload);
      onStockTick(payload);
    });
    stockChannel.error((error: unknown) => {
      // Almost always a 403/422 from /broadcasting/auth — an admin viewing a
      // branch outside their own acting company, an expired session, or
      // NEXT_PUBLIC_REVERB_* pointed at the wrong host.
      console.warn("[realtime] channel auth failed", error);
    });
  }

  const catalogChannel: Channel = echo.private(`company.${companyId}`);
  catalogChannel.listen(".product.updated", (payload: unknown) => {
    if (process.env.NODE_ENV !== "production") console.warn("[realtime] product.updated", payload);
    onCatalogUpdate();
  });
  catalogChannel.error((error: unknown) => {
    console.warn("[realtime] catalog channel auth failed", error);
  });

  connectedLocationId = locationId;
  connectedCompanyId = companyId;
}

export function disconnectRealtime(): void {
  echo?.disconnect();
  echo = null;
  connectedLocationId = null;
  connectedCompanyId = null;
  socketState = "disconnected";
}

export function isRealtimeConnected(): boolean {
  return socketState === "connected";
}
