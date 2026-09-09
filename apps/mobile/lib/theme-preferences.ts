import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "double-a.theme-preferences";

export type RadiusStyle = "flat" | "reduced" | "full";
export type ThemeColorId =
  | "teal"
  | "amber"
  | "terracotta"
  | "ocean"
  | "plum"
  | "rose"
  | "forest"
  | "slate";
export type ProductViewMode = "product" | "variant";
/**
 * "confetti" is not a continuous decoration like the rest — selecting it
 * arms a one-shot celebration burst that fires after a successful sale
 * (see lib/sale-celebration.tsx), rather than looping in the background the
 * whole time a screen is open.
 */
export type BackgroundEffect =
  | "none"
  | "bubbles"
  | "rain"
  | "snow"
  | "confetti"
  | "leaves"
  | "fireflies"
  | "stars"
  | "hearts"
  | "petals"
  | "fireworks"
  | "sparkles"
  | "clouds";
/**
 * "text" drops the thumbnail entirely (name/price/stock only). "image-text"
 * is today's existing tile (a small thumbnail beside the name, unchanged).
 * "image-dominant" covers the whole tile with the product photo and shows
 * only a name overlay — no price or stock line — falling back to a plain
 * color plate for a product with no photo (components/product-tile.tsx).
 */
export type CardDisplayStyle = "text" | "image-text" | "image-dominant";

export interface ThemePreferences {
  radiusStyle: RadiusStyle;
  colorId: ThemeColorId;
  productViewMode: ProductViewMode;
  backgroundEffect: BackgroundEffect;
  cardDisplayStyle: CardDisplayStyle;
}

/** "full" = today's existing corner scale (packages/ui's radius token), "teal" = today's existing brand color, "image-text" = today's existing tile layout — an un-migrated device looks unchanged. */
const DEFAULT_PREFERENCES: ThemePreferences = {
  radiusStyle: "full",
  colorId: "teal",
  productViewMode: "product",
  backgroundEffect: "none",
  cardDisplayStyle: "image-text",
};

export const RADIUS_SCALES: Record<RadiusStyle, { sm: number; md: number; lg: number }> = {
  flat: { sm: 0, md: 0, lg: 0 },
  reduced: { sm: 4, md: 8, lg: 12 },
  full: { sm: 6, md: 12, lg: 20 },
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb: number[]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** amount 0 = `hex` unchanged, 1 = fully `mixWith`. */
function mix(hex: string, mixWith: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(mixWith);
  return rgbToHex(a.map((channel, i) => channel + ((b[i] ?? channel) - channel) * amount));
}

interface PrimaryPalette {
  primary: string;
  primaryDark: string;
  primarySoft: string;
  primaryTint: string;
  onPrimary: string;
}

/**
 * Only the brand/primary tokens are themeable — success/danger/warning/ink
 * stay fixed regardless of color choice, since those carry meaning (a red
 * "out of stock" warning must not shift because the shop picked a red
 * theme). Every preset base is dark/saturated enough that white text always
 * clears contrast, so onPrimary never needs to flip to dark ink.
 */
function derivePrimaryPalette(base: string): PrimaryPalette {
  return {
    primary: base,
    primaryDark: mix(base, "#000000", 0.3),
    primarySoft: mix(base, "#FFFFFF", 0.88),
    primaryTint: mix(base, "#FFFFFF", 0.95),
    onPrimary: "#FFFFFF",
  };
}

export const THEME_COLOR_PRESETS: Record<ThemeColorId, { label: string; base: string }> = {
  teal: { label: "Teal", base: "#0F5C52" },
  amber: { label: "Amber", base: "#B8791A" },
  terracotta: { label: "Terracotta", base: "#B75B3D" },
  ocean: { label: "Ocean", base: "#1E5FA8" },
  plum: { label: "Plum", base: "#6B3FA0" },
  rose: { label: "Rose", base: "#B23A5C" },
  forest: { label: "Forest", base: "#2F7D4F" },
  slate: { label: "Slate", base: "#3E4C59" },
};

export function resolvePrimaryPalette(colorId: ThemeColorId): PrimaryPalette {
  return derivePrimaryPalette(THEME_COLOR_PRESETS[colorId].base);
}

// Module-level cache: theme.ts's color/radius/styles proxies (apps/mobile/theme.ts)
// read this synchronously on every property access, including the very first
// one at JS module-evaluation time — long before hydrateThemePreferences()'s
// SecureStore read can resolve. Defaults above stand in until it does; see
// app/_layout.tsx, which awaits hydration before mounting any real screen so
// nothing actually paints on the stale default once a preference is set.
let cache: ThemePreferences = DEFAULT_PREFERENCES;
let hydrated = false;
const listeners = new Set<() => void>();

export function getThemePreferences(): ThemePreferences {
  return cache;
}

export async function hydrateThemePreferences(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemePreferences>;
      cache = { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch {
    // Corrupt or missing value — keep defaults rather than fail boot over it.
  }
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

async function persist(next: ThemePreferences): Promise<void> {
  cache = next;
  notify();
  await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
}

/** Root layout's remount-key effect (app/_layout.tsx) is the one production subscriber — it forces every mounted screen to re-render and re-read the now-current color/radius/styles proxies. */
export function subscribeThemePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function setRadiusStyle(radiusStyle: RadiusStyle): Promise<void> {
  await persist({ ...cache, radiusStyle });
}

export async function setThemeColorId(colorId: ThemeColorId): Promise<void> {
  await persist({ ...cache, colorId });
}

export async function setProductViewMode(productViewMode: ProductViewMode): Promise<void> {
  await persist({ ...cache, productViewMode });
}

export async function setBackgroundEffect(backgroundEffect: BackgroundEffect): Promise<void> {
  await persist({ ...cache, backgroundEffect });
}

export async function setCardDisplayStyle(cardDisplayStyle: CardDisplayStyle): Promise<void> {
  await persist({ ...cache, cardDisplayStyle });
}

/** Re-renders the calling component on any theme preference change — the Theme screen itself uses this to keep its selection UI in sync; most of the app instead relies on the root remount (app/_layout.tsx). */
export function useThemePreferences(): ThemePreferences {
  const [, setTick] = useState(0);
  useEffect(() => subscribeThemePreferences(() => setTick((tick) => tick + 1)), []);
  return cache;
}
