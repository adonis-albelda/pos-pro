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
 * screen sitting elsewhere in the tree. app/_layout.tsx forces that: it
 * remounts the whole app (a `key` bump) whenever a theme preference
 * changes, which is what makes a Theme menu pick apply live instead of
 * "next time you happen to revisit this screen."
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
    // A literal, not radius.md — this app's own rounder-corner direction,
    // kept local to mobile rather than changing the shared token admin reads too.
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.border,
  },
  /** A card that should read as brand surface rather than plain paper. */
  cardTinted: {
    backgroundColor: color.primaryTint,
    borderRadius: 18,
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
   * settings) — matches setup/unlock's floating-card look. Never apply this to
   * a repeating list/grid (product tiles, cashier picker): shadows on many
   * simultaneous items cost real battery on the shop floor, which is exactly
   * why styles.card itself stays flat.
   */
  floatShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  });
}

export const styles: ReturnType<typeof buildStyles> = new Proxy({} as ReturnType<typeof buildStyles>, {
  get(_target, prop: string | symbol) {
    return buildStyles()[prop as keyof ReturnType<typeof buildStyles>];
  },
});
