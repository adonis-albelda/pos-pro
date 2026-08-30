import type Echo from "laravel-echo";
import type { Channel } from "laravel-echo";
import { toProduct, type ProductAttrs } from "@double-a/api-client";
import { updateProductCatalogFields, updateProductStock } from "@/db/products";
import { apiUrl } from "@/lib/api/client";
import { getSessionToken } from "@/lib/api/session";

/**
 * require(), not `import Echo from "laravel-echo"` / `import Pusher from
 * "pusher-js/react-native"` — Metro's ESM-default interop for these two
 * packages has produced a non-constructor default export under Hermes
 * ("Object cannot be used as a constructor") depending on exactly how each
 * package's CJS/ESM fields line up. require() returns the raw
 * `module.exports` with no interop step, so `.default ?? <the export
 * itself>` below always lands on the real class regardless of which shape
 * either package ships.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
const EchoModule = require("laravel-echo");
const EchoCtor: typeof Echo = EchoModule.default ?? EchoModule;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
const PusherModule = require("pusher-js/react-native");
// The react-native build exports the class as a *named* `.Pusher` property
// (`module.exports.Pusher = r`), unlike the node/web builds which export it
// as the module itself / `.default` — this is the actual "Object cannot be
// used as a constructor" cause: falling through to `.default` here lands on
// `undefined`, then on the whole `{ Pusher }` wrapper object, not the class.
const PusherCtor = PusherModule.Pusher ?? PusherModule.default ?? PusherModule;

interface StockUpdatedPayload {
  product_id: string;
  location_id: string;
  quantity: number;
}

interface ProductUpdatedPayload {
  id: string;
  type: string;
  attributes: ProductAttrs;
}

let echo: Echo<"reverb"> | null = null;
let connectedLocationId: string | null = null;
let connectedCompanyId: string | null = null;
/** The real Pusher-protocol socket state — "connected" is the only state that means what the store-header dot promises. Not the same as `echo !== null`, which is true the instant Echo is constructed, well before the handshake finishes (or fails). */
let socketState = "disconnected";

/**
 * Live stock ticks for one branch (ProductStockUpdated) plus company-wide
 * catalogue edits (ProductUpdated — name/price/unit/etc, never stock; see
 * updateProductCatalogFields's own comment for why those two stay separate
 * writers). Connects only while effective-online (see sync-provider.tsx's
 * lifecycle effect) — offline mode or no connectivity means this never
 * runs, same spirit as CLAUDE.md's old "no real-time subscriptions on
 * mobile" rule, just now scoped to "unless online mode says otherwise."
 */
export async function connectRealtime(
  locationId: string,
  companyId: string,
  onStockTick: () => void,
  onStateChange?: (connected: boolean) => void,
): Promise<void> {
  if (echo && connectedLocationId === locationId && connectedCompanyId === companyId) return;
  disconnectRealtime();

  const token = await getSessionToken();
  if (!token) return;

  const host = process.env.EXPO_PUBLIC_REVERB_HOST;
  const key = process.env.EXPO_PUBLIC_REVERB_APP_KEY;
  if (!host || !key) return; // Not configured on this build — fail quiet, same as any other optional feature.

  const scheme = process.env.EXPO_PUBLIC_REVERB_SCHEME ?? "https";
  const port = Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? (scheme === "https" ? 443 : 80));
  const authEndpoint = `${apiUrl().replace(/\/v1\/?$/, "")}/broadcasting/auth`;
  if (__DEV__) console.warn("[realtime] authEndpoint:", authEndpoint);

  echo = new EchoCtor({
    broadcaster: "reverb",
    Pusher: PusherCtor,
    key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === "https",
    enabledTransports: ["ws", "wss"],
    // Sanctum bearer token, not a cookie session — Echo attaches this as the
    // Authorization header on /broadcasting/auth, same as every other
    // request this app makes (see lib/api/session.ts). Broadcast::routes()
    // registers at the app root, not under /v1 — apiUrl() is API-v1-scoped
    // (…/v1), so it has to be stripped here or this 404s.
    authEndpoint,
    bearerToken: token,
  });

  // Echo has no public "connected" API of its own — the real Pusher client
  // underneath (echo.connector.pusher) does. Not in laravel-echo's types,
  // hence the cast; this is the same object pusher-js's own docs point at
  // for connection-state debugging.
  const pusherConnection = (
    echo as unknown as { connector: { pusher: { connection: PusherConnectionLike } } }
  ).connector?.pusher?.connection;

  if (pusherConnection) {
    pusherConnection.bind("state_change", (states: { current: string }) => {
      socketState = states.current;
      onStateChange?.(states.current === "connected");
      if (__DEV__) console.warn("[realtime] socket state:", states.current);
    });
  }

  const stockChannel: Channel = echo.private(`location.${locationId}.stock`);
  stockChannel.listen(".stock.updated", (payload: StockUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] stock.updated", payload);
    void updateProductStock(payload.product_id, payload.quantity).then(onStockTick);
  });
  stockChannel.error((error: unknown) => {
    // Almost always a 403/422 from /broadcasting/auth — wrong location_id
    // scoping, an expired token, or REVERB_* env pointed at the wrong host.
    console.warn("[realtime] channel auth failed", error);
  });

  const catalogChannel: Channel = echo.private(`company.${companyId}`);
  catalogChannel.listen(".product.updated", (payload: ProductUpdatedPayload) => {
    if (__DEV__) console.warn("[realtime] product.updated", payload);
    void updateProductCatalogFields(toProduct(payload)).then(onStockTick);
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

interface PusherConnectionLike {
  bind(event: "state_change", callback: (states: { current: string }) => void): void;
}
