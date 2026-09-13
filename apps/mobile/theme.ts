import { StyleSheet } from "react-native";
import {
  MIN_TAP_TARGET,
  color as baseColor,
  fontSize,
  radius as baseRadius,
  space,
} from "@double-a/ui";
import { RADIUS_SCALES, getThemePreferences, resolvePrimaryPalette } from "@/lib/theme-preferences";

export { MIN_TAP_TARGET, fontSize, space };

/**
 * `color` and `radius` used to be the plain objects from packages/ui,
 * re-exported unchanged. They are Proxies now, resolved fresh on every
 * property read against whatever the Theme menu has set (lib/theme-
 * preferences.ts) — so every one of this app's many inline
 * `color.primary`/`radius.sm` references (and `styles` below) stays
 * accurate without those call sites changing at all. Only the primary/
 * brand tokens are ever overridden (see resolvePrimaryPalette) — semantic
 * colors (success/danger/warning/ink/etc.) are fixed regardless of theme.
 *
 * A property read reflects the *latest* choice the instant it runs, but a
 * component only re-runs its render (and thus re-reads) when React decides
 * to re-render it — which a settings change alone does not cause for a
 * screen sitting elsewhere in the tree. Deliberately NOT "fixed" with a
 * whole-app remount: an earlier version keyed the root view on a theme-tick
 * counter to force one, which also remounted SessionProvider/SyncProvider/
 * LocationScopeProvider underneath it — wiping the signed-in cashier and
 * bouncing straight to the unlock screen every time someone picked a color.
 * In practice this still applies promptly without that: the Theme screen
 * itself re-renders instantly (app/pos/theme.tsx calls useThemePreferences,
 * which subscribes), and every POS tab is reached via router.replace()
 * (app/pos/_layout.tsx's lateral tabs), which remounts that screen fresh —
 * so the very next tab visited already reads the new values. Only whatever
 * screen was sitting mounted *before* the change, off-screen, might show
 * stale colors until it next re-renders on its own.
 */
export const color: typeof baseColor = new Proxy(baseColor, {
  get(target, prop: string | symbol) {
    const overrides = resolvePrimaryPalette(getThemePreferences().colorId);
    if (typeof prop === "string" && prop in overrides) {
      return overrides[prop as keyof typeof overrides];
    }
    return target[prop as keyof typeof target];
  },
});

export const radius: typeof baseRadius = new Proxy(baseRadius, {
  get(_target, prop: string | symbol) {
    const scale = RADIUS_SCALES[getThemePreferences().radiusStyle];
    return prop in scale ? scale[prop as keyof typeof scale] : undefined;
  },
});

/**
 * Disc shapes (avatar, FAB, icon well). Flat → square; reduced → lg;
 * full → true circle. Never hardcode diameter/2 — Flat corners would stay round.
 */
export function circleRadius(diameter: number): number {
  const style = getThemePreferences().radiusStyle;
  if (style === "flat") return 0;
  if (style === "reduced") return RADIUS_SCALES.reduced.lg;
  return diameter / 2;
}

/**
 * Shop-floor rules from design-system.md: big tap targets, high contrast, flat
 * surfaces (shadows cost battery), and totals rendered large enough to read at
 * a glance under bad lighting.
 *
 * A plain object built fresh on every property access (not
 * `StyleSheet.create`, which would freeze `color`/`radius` at whatever they
 * resolved to the first time this module loaded — before the Theme
 * preference has even finished hydrating) — see the `color`/`radius` Proxies
 * above for why that matters. React Native accepts a plain style object
 * exactly like a StyleSheet id, so every existing `styles.card` etc. call
 * site is unaffected. Still runs through `StyleSheet.create` (which can be
 * called any time, not just at module load) purely so TypeScript keeps
 * narrowing things like `fontWeight: "700"` to RN's literal union instead of
 * widening it to `string`, same as it always has.
 */
function buildStyles() {
  return StyleSheet.create({
  screen: {
    flex: 1,
    // Paper + PaperBackdrop live on the root shell; screens stay clear so the
    // soft pattern shows between cards and around empty space.
    backgroundColor: "transparent",
  },
  card: {
    backgroundColor: color.surface,
    // radius.lg, not a literal — this is the Theme menu's corner-style
    // setting (lib/theme-preferences.ts), and product tiles on the Sell
    // grid are the highest-visibility surface it has to reach.
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
  },
  /** A card that should read as brand surface rather than plain paper. */
  cardTinted: {
    backgroundColor: color.primaryTint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.primarySoft,
  },
  /** Square well behind an icon, sized by the caller. */
  iconWell: {
    borderRadius: radius.sm,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    fontSize: fontSize.headingMd,
    fontWeight: "600",
    color: color.ink,
  },
  subheading: {
    fontSize: fontSize.headingSm,
    fontWeight: "600",
    color: color.ink,
  },
  body: {
    fontSize: fontSize.bodyLg,
    color: color.ink,
  },
  muted: {
    fontSize: fontSize.body,
    color: color.inkMuted,
  },
  /** Tabular figures so columns of pesos line up like a printed receipt. */
  numeric: {
    fontVariant: ["tabular-nums"],
    color: color.ink,
  },
  /** A price the cashier is reading off a tile, carried in brand teal. */
  price: {
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    color: color.primary,
  },
  total: {
    fontVariant: ["tabular-nums"],
    fontSize: fontSize.headingMd,
    fontWeight: "700",
    color: color.ink,
  },
  /**
   * The ledger line. Used only at real boundaries: cart items from the total,
   * pending sales from synced ones.
   */
  ledgerLine: {
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: color.border,
  },
  tapTarget: {
    minHeight: MIN_TAP_TARGET,
    minWidth: MIN_TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * Opt-in shadow for a lone or small handful of cards on a screen (e.g. sync,
   * settings) — matches setup/unlock's floating-card look. Prefer this over
   * `tileShadow` when only one/few cards sit on the page.
   */
  floatShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  /**
   * Product tiles cast right only (see product-tile right-edge strip). Kept
   * for any caller that still spreads it — offset to the right, no downward
   * float. Prefer the edge strip for a true one-sided look on Android too
   * (elevation is always omnidirectional).
   */
  tileShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 5,
    shadowOffset: { width: 4, height: 0 },
    elevation: 0,
  },
  });
}

export const styles: ReturnType<typeof buildStyles> = new Proxy({} as ReturnType<typeof buildStyles>, {
  get(_target, prop: string | symbol) {
    return buildStyles()[prop as keyof ReturnType<typeof buildStyles>];
  },
});
