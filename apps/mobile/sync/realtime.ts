import Echo, { type Channel } from "laravel-echo";
// The `react-native` entry is the RN-compatible build (no browser WebSocket-
// global assumptions) — Echo's `Pusher` option takes the class directly so
// nothing needs `window.Pusher` set globally.
import Pusher from "pusher-js/react-native";
import { updateProductStock } from "@/db/products";
import { apiUrl } from "@/lib/api/client";
import { getSessionToken } from "@/lib/api/session";

interface StockUpdatedPayload {
  product_id: string;
  location_id: string;
  quantity: number;
}

let echo: Echo<"reverb"> | null = null;
let connectedLocationId: string | null = null;

/**
 * Live stock ticks for one branch (ProductStockUpdated, backend). Connects
 * only while effective-online (see sync-provider.tsx's lifecycle effect) —
 * offline mode or no connectivity means this never runs, same spirit as
 * CLAUDE.md's old "no real-time subscriptions on mobile" rule, just now
 * scoped to "unless online mode says otherwise."
 */
export async function connectRealtime(
  locationId: string,
  onStockTick: () => void,
): Promise<void> {
  if (echo && connectedLocationId === locationId) return;
  disconnectRealtime();

  const token = await getSessionToken();
  if (!token) return;

  const host = process.env.EXPO_PUBLIC_REVERB_HOST;
  const key = process.env.EXPO_PUBLIC_REVERB_APP_KEY;
  if (!host || !key) return; // Not configured on this build — fail quiet, same as any other optional feature.

  const scheme = process.env.EXPO_PUBLIC_REVERB_SCHEME ?? "https";
  const port = Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? (scheme === "https" ? 443 : 80));

  echo = new Echo({
    broadcaster: "reverb",
    Pusher,
    key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === "https",
    enabledTransports: ["ws", "wss"],
    // Sanctum bearer token, not a cookie session — Echo attaches this as the
    // Authorization header on /broadcasting/auth, same as every other
    // request this app makes (see lib/api/session.ts).
    authEndpoint: `${apiUrl()}/broadcasting/auth`,
    bearerToken: token,
  });

  const channel: Channel = echo.private(`location.${locationId}.stock`);
  channel.listen(".stock.updated", (payload: StockUpdatedPayload) => {
    void updateProductStock(payload.product_id, payload.quantity).then(onStockTick);
  });

  connectedLocationId = locationId;
}

export function disconnectRealtime(): void {
  echo?.disconnect();
  echo = null;
  connectedLocationId = null;
}

export function isRealtimeConnected(): boolean {
  return echo !== null;
}
