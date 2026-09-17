import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { CheckCircle2, Menu, ShoppingCart } from "lucide-react-native";
import { formatMoney, type SyncPhase } from "@double-a/shared-types";
import { AccountDrawer } from "@/components/account-drawer";
import { LocationSwitcher } from "@/components/location-switcher";
import { summariseToday, type LocalDaySummary } from "@/db/sales";
import { useAccountDrawer } from "@/lib/account-drawer";
import { useCartSummary } from "@/lib/cart-summary";
import { useDraftSummary } from "@/lib/draft-summary";
import { useFlyToCart } from "@/lib/fly-to-cart";
import { useLayout } from "@/lib/layout";
import { useSync } from "@/sync/sync-provider";
import { pendingLabel, syncLook, useMinuteTick, type SyncLook } from "@/sync/status";
import { color, fontSize, radius, space } from "@/theme";

/**
 * One chrome row on every POS screen: hamburger (opens drawer with tabs),
 * time + sync chip inline on the left, then cart chip (phone Sell) or
 * today's sales (tablet). Sync chip taps through to Sync — does not sync
 * itself.
 */
export function StoreHeader() {
  const state = useSync();
  const cart = useCartSummary();
  const draft = useDraftSummary();
  const router = useRouter();
  const pathname = usePathname();
  const { compact } = useLayout();
  const { open: drawerOpen, openDrawer, closeDrawer } = useAccountDrawer();
  const [daySummary, setDaySummary] = useState<LocalDaySummary | null>(null);
  const onSellScreen = pathname === "/pos";
  // The embedded web dashboard has its own live data — this chrome's time/
  // sync/cart readouts describe the terminal's own SQLite state, which
  // doesn't apply there and reads as confusing noise on top of it.
  const onAdminScreen = pathname === "/admin";

  // Where a "flying" product lands (lib/fly-to-cart.tsx) — phone only.
  // Tablet cart panel (CartShell) registers itself as the landing spot;
  // the header chip is hidden there, so it never needs measuring.
  const { setTarget } = useFlyToCart();
  const cartChipRef = useRef<View>(null);
  function measureCartChip() {
    if (!compact) return;
    cartChipRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) setTarget({ x, y, width, height });
    });
  }
  useEffect(() => {
    if (compact && !onSellScreen) setTarget(null);
  }, [compact, onSellScreen, setTarget]);

  useMinuteTick();
  const look = syncLook(state);

  // A one-shot confirmation the instant Sync/Pull/Replace (all three land on
  // phase "done" — sync.tsx has no way to tell them apart) finishes, not a
  // persistent "you're synced" indicator — the header's own sync chip
  // already covers that. Fires only on the idle/pulling/pushing → done
  // transition, not on every render while phase happens to already be
  // "done" (it stays "done" until the next action or a reload).
  const [banner, setBanner] = useState<string | null>(null);
  const previousPhase = useRef<SyncPhase>(state.phase);
  useEffect(() => {
    const justFinished = state.phase === "done" && previousPhase.current !== "done";
    previousPhase.current = state.phase;
    if (justFinished) setBanner(state.message || "Synced");
  }, [state.phase, state.message]);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(timer);
  }, [banner]);

  const logoSize = compact ? 32 : 36;

  // Tablet: today's terminal totals in the space the cart chip used to hold.
  // Re-read when pendingSales moves (sale just completed calls refresh()) or
  // dataVersion bumps (pull / sync / live stock).
  useEffect(() => {
    if (compact) {
      setDaySummary(null);
      return;
    }
    let cancelled = false;
    void summariseToday().then((summary) => {
      if (!cancelled) setDaySummary(summary);
    });
    return () => {
      cancelled = true;
    };
  }, [compact, state.dataVersion, state.pendingSales]);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = now.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });

  // Pops the cart chip every time a tap on a tile adds to it — the only
  // feedback a cashier gets that the add actually registered, now that the
  // chip lives up here instead of a bottom bar the tile sat right next to.
  // Keyed off itemCount rising, not the chip being pressed — the chip's own
  // onPress opens the cart, it never adds to it.
  const cartScale = useRef(new Animated.Value(1)).current;
  const previousItemCount = useRef(cart.itemCount);
  useEffect(() => {
    if (cart.itemCount > previousItemCount.current) {
      cartScale.setValue(1);
      Animated.sequence([
        Animated.spring(cartScale, { toValue: 1.22, speed: 40, bounciness: 14, useNativeDriver: true }),
        Animated.spring(cartScale, { toValue: 1, speed: 20, bounciness: 8, useNativeDriver: true }),
      ]).start();
    }
    previousItemCount.current = cart.itemCount;
  }, [cart.itemCount, cartScale]);

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: compact ? space.xs : space.sm,
          paddingHorizontal: compact ? space.sm : space.md,
          paddingVertical: compact ? space.xs : space.sm,
          backgroundColor: color.primary,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.15)",
        }}
      >
        {/* Explicit hamburger — the logo alone opened the drawer but read as a brand mark, not a control. */}
        <Pressable
          onPress={openDrawer}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={4}
          style={({ pressed }) => ({
            width: logoSize,
            height: logoSize,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Menu size={compact ? 20 : 22} color={color.onPrimary} strokeWidth={2.25} />
        </Pressable>

        {/* Time + sync as HeaderStat twins, then a rule before cart/sales —
            swapped for a plain label on the admin dashboard, where none of
            this terminal-local state applies. */}
        {onAdminScreen ? (
          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: space.xs }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: fontSize.body, fontWeight: "700", color: color.onPrimary }}
            >
              Viewing Backoffice
            </Text>
          </View>
        ) : (
          <View
            accessibilityLabel={`${dateLabel}, ${timeLabel}. ${look.text}. ${pendingLabel(state.pendingSales)}.`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              flexShrink: 0,
              paddingRight: space.sm,
              borderRightWidth: 1,
              borderRightColor: "rgba(255,255,255,0.25)",
            }}
          >
            {/* Phone: too crowded with sync/drafts/cart already fighting for
                the same row — dropped entirely. Tablet keeps it, there's room. */}
            {compact ? null : (
              <>
                <HeaderStat value={timeLabel} label={dateLabel} />
                <HeaderStatDivider />
              </>
            )}
            <SyncStat
              look={look}
              pendingSales={state.pendingSales}
              onPress={() => router.replace("/pos/sync")}
            />
            {/* Sell-screen-only, same as the cart chip below — draft.open is
                only ever published while app/pos/index.tsx (the only screen
                with parked carts) is actually mounted. */}
            {onSellScreen && draft.open ? (
              <>
                <HeaderStatDivider />
                <DraftStat count={draft.count} onPress={draft.open} />
              </>
            ) : null}
          </View>
        )}

        {/* Phone Sell: cart chip. Tablet: today's sales (CartShell already shows
            the cart — this chip was redundant). Other phone tabs: spacer.
            Admin dashboard: nothing — the label above already took the flex slot. */}
        {onAdminScreen ? null : onSellScreen && compact ? (
          <Pressable
            ref={cartChipRef}
            onLayout={measureCartChip}
            onPress={cart.open}
            disabled={!cart.open || cart.itemCount === 0}
            accessibilityRole="button"
            accessibilityLabel={
              cart.itemCount === 0
                ? "Cart is empty"
                : `Open cart, ${cart.itemCount} item${cart.itemCount === 1 ? "" : "s"}, ${formatMoney(cart.total)}`
            }
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: space.xs,
              paddingHorizontal: space.sm,
              paddingVertical: 6,
              borderRadius: radius.sm,
              backgroundColor: "rgba(255,255,255,0.15)",
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Animated.View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.xs,
                transform: [{ scale: cartScale }],
              }}
            >
              <ShoppingCart size={16} color={color.onPrimary} strokeWidth={2.25} />
              <Text
                numberOfLines={1}
                style={{
                  fontSize: fontSize.body,
                  fontWeight: "700",
                  color: color.onPrimary,
                }}
              >
                {cart.itemCount === 0 ? "Cart empty" : `${cart.itemCount} · ${formatMoney(cart.total)}`}
              </Text>
            </Animated.View>
          </Pressable>
        ) : !compact ? (
          <View
            accessibilityLabel={`Today ${daySummary?.salesCount ?? 0} sales, ${formatMoney(daySummary?.revenue ?? 0)}. Discounts ${formatMoney(daySummary?.discountTotal ?? 0)} on ${daySummary?.discountedSalesCount ?? 0} sales. Refunds ${formatMoney(daySummary?.refundTotal ?? 0)}, ${daySummary?.refundCount ?? 0}.`}
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              paddingHorizontal: space.sm,
              paddingVertical: 4,
            }}
          >
            <AnimatedHeaderStat
              value={daySummary?.revenue ?? 0}
              format={formatMoney}
              label={`${daySummary?.salesCount ?? 0} sale${(daySummary?.salesCount ?? 0) === 1 ? "" : "s"}`}
            />
            <HeaderStatDivider />
            <AnimatedHeaderStat
              value={daySummary?.discountTotal ?? 0}
              format={formatMoney}
              label={`${daySummary?.discountedSalesCount ?? 0} discount${(daySummary?.discountedSalesCount ?? 0) === 1 ? "" : "s"}`}
            />
            <HeaderStatDivider />
            <AnimatedHeaderStat
              value={daySummary?.refundTotal ?? 0}
              format={formatMoney}
              label={`${daySummary?.refundCount ?? 0} refund${(daySummary?.refundCount ?? 0) === 1 ? "" : "s"}`}
            />
          </View>
        ) : (
          <View style={{ flex: 1, minWidth: 0 }} />
        )}

        {/* Phone: too crowded next to the cart chip — moved into the account
            drawer instead. Tablet keeps it here. */}
        {compact ? null : <LocationSwitcher />}
      </View>

      {banner ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: space.xs,
            paddingVertical: space.xs,
            backgroundColor: color.successSoft,
            borderBottomWidth: 1,
            borderBottomColor: color.successInk + "33",
          }}
        >
          <CheckCircle2 size={14} color={color.successInk} strokeWidth={2.5} />
          <Text style={{ fontSize: fontSize.caption, fontWeight: "700", color: color.successInk }}>
            {banner}
          </Text>
        </View>
      ) : null}

      <AccountDrawer open={drawerOpen} onClose={closeDrawer} />
    </>
  );
}

function SyncStat({
  look,
  pendingSales,
  onPress,
}: {
  look: SyncLook;
  pendingSales: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${look.text}. ${pendingLabel(pendingSales)}. Opens sync.`}
      style={({ pressed }) => [headerButtonStyle(pressed), { minWidth: 0, flexShrink: 1 }]}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: fontSize.body,
          fontWeight: "700",
          color: color.onPrimary,
        }}
      >
          {look.shortText}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: fontSize.caption,
          color: "rgba(255,255,255,0.75)",
        }}
      >
        Synced
      </Text>
    </Pressable>
  );
}

/** Count on top, "Draft sales" label below — same two-line shape as HeaderStat, Pressable like SyncStat. */
function DraftStat({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        count === 0 ? "No drafts saved" : `Open draft sales, ${count} saved`
      }
      disabled={count === 0}
      style={({ pressed }) => [
        headerButtonStyle(pressed, count === 0),
        { minWidth: 0, flexShrink: 1 },
      ]}
    >
      <Text numberOfLines={1} style={{ fontSize: fontSize.body, fontWeight: "700", color: color.onPrimary }}>
        {count}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: fontSize.caption, color: "rgba(255,255,255,0.75)" }}>
        Draft sales
      </Text>
    </Pressable>
  );
}

/**
 * Shared "this is a button" chrome for the header's pressable stats (Synced,
 * Draft sales) — a faint pill, same treatment the cart chip already uses,
 * so they read as tappable instead of looking like the plain read-only
 * HeaderStat twins (time/date) sitting right next to them.
 */
function headerButtonStyle(pressed: boolean, disabled = false) {
  return {
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    backgroundColor: pressed ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.15)",
    opacity: disabled ? 0.55 : 1,
  };
}

function HeaderStatDivider() {
  return (
    <View
      style={{
        width: 1,
        alignSelf: "stretch",
        backgroundColor: "rgba(255,255,255,0.25)",
      }}
    />
  );
}

function HeaderStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ minWidth: 0, flexShrink: 1 }}>
      <Text
        numberOfLines={1}
        style={{
          fontSize: fontSize.body,
          fontWeight: "700",
          color: color.onPrimary,
        }}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: fontSize.caption,
          color: "rgba(255,255,255,0.75)",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const COUNT_UP_DURATION_MS = 500;

/**
 * Tweens from the previous number to the next one instead of jumping —
 * every completed sale bumps daySummary's revenue/discount/refund totals,
 * and a flat re-render read as the figure just silently changing; counting
 * up to it reads as "a sale just landed."
 */
function useCountUp(value: number, durationMs = COUNT_UP_DURATION_MS): number {
  const [display, setDisplay] = useState(value);
  const previousValue = useRef(value);
  const animatedValue = useRef(new Animated.Value(value)).current;

  useEffect(() => {
    if (previousValue.current === value) return;
    animatedValue.setValue(previousValue.current);
    previousValue.current = value;

    // JS-driven, not native: the native driver can't hand a live numeric
    // value back to JS on every frame, and that number is exactly what
    // formats into the displayed text below.
    const listenerId = animatedValue.addListener(({ value: current }) => setDisplay(current));
    const animation = Animated.timing(animatedValue, {
      toValue: value,
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) setDisplay(value);
    });

    return () => {
      animation.stop();
      animatedValue.removeListener(listenerId);
    };
  }, [value, durationMs, animatedValue]);

  return display;
}

/** Same two-line shape as HeaderStat, but the number counts up/down from its previous value instead of jumping straight to the new one. */
function AnimatedHeaderStat({
  value,
  format,
  label,
}: {
  value: number;
  format: (n: number) => string;
  label: string;
}) {
  const display = useCountUp(value);
  return (
    <View style={{ minWidth: 0, flexShrink: 1 }}>
      <Text
        numberOfLines={1}
        style={{
          fontSize: fontSize.body,
          fontWeight: "700",
          color: color.onPrimary,
        }}
      >
        {format(display)}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: fontSize.caption,
          color: "rgba(255,255,255,0.75)",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
