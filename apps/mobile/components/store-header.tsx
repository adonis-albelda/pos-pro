import { useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Menu, ShoppingCart } from "lucide-react-native";
import { formatMoney, storeInitial } from "@double-a/shared-types";
import { AccountDrawer } from "@/components/account-drawer";
import { LocationSwitcher } from "@/components/location-switcher";
import { summariseToday, type LocalDaySummary } from "@/db/sales";
import { useCartSummary } from "@/lib/cart-summary";
import { useFlyToCart } from "@/lib/fly-to-cart";
import { useStoreSettings } from "@/lib/store";
import { useLayout } from "@/lib/layout";
import { useSync } from "@/sync/sync-provider";
import { pendingLabel, syncLook, useMinuteTick, type SyncLook } from "@/sync/status";
import { color, fontSize, radius, space } from "@/theme";

/**
 * One chrome row on every POS screen: logo (opens drawer with tabs), time +
 * sync chip inline on the left, then cart chip (phone Sell) or today's sales
 * (tablet). Sync chip taps through to Sync — does not sync itself.
 */
export function StoreHeader() {
  const store = useStoreSettings();
  const state = useSync();
  const cart = useCartSummary();
  const router = useRouter();
  const pathname = usePathname();
  const { compact } = useLayout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [daySummary, setDaySummary] = useState<LocalDaySummary | null>(null);
  const onSellScreen = pathname === "/pos";

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
          onPress={() => setDrawerOpen(true)}
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

        <Pressable
          onPress={() => setDrawerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${store.name}. Open menu.`}
          style={({ pressed }) => ({
            width: logoSize,
            height: logoSize,
            borderRadius: radius.sm,
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: store.logoUrl ? color.surface : "rgba(255,255,255,0.2)",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {store.logoUrl ? (
            <Image
              source={{ uri: store.logoUrl }}
              resizeMode="contain"
              style={{ width: "100%", height: "100%" }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text
              style={{
                fontSize: compact ? fontSize.body : fontSize.bodyLg,
                fontWeight: "700",
                color: color.onPrimary,
              }}
            >
              {storeInitial(store.name)}
            </Text>
          )}
        </Pressable>

        {/* Time + sync as HeaderStat twins, then a rule before cart/sales. */}
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
          <HeaderStat value={timeLabel} label={dateLabel} />
          <HeaderStatDivider />
          <SyncStat
            look={look}
            pendingSales={state.pendingSales}
            onPress={() => router.replace("/pos/sync")}
          />
        </View>

        {/* Phone Sell: cart chip. Tablet: today's sales (CartShell already shows
            the cart — this chip was redundant). Other phone tabs: spacer. */}
        {onSellScreen && compact ? (
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
            <HeaderStat
              value={formatMoney(daySummary?.revenue ?? 0)}
              label={`${daySummary?.salesCount ?? 0} sale${(daySummary?.salesCount ?? 0) === 1 ? "" : "s"}`}
            />
            <HeaderStatDivider />
            <HeaderStat
              value={formatMoney(daySummary?.discountTotal ?? 0)}
              label={`${daySummary?.discountedSalesCount ?? 0} discount${(daySummary?.discountedSalesCount ?? 0) === 1 ? "" : "s"}`}
            />
            <HeaderStatDivider />
            <HeaderStat
              value={formatMoney(daySummary?.refundTotal ?? 0)}
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

      <AccountDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
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
      style={({ pressed }) => ({
        minWidth: 0,
        flexShrink: 1,
        opacity: pressed ? 0.7 : 1,
      })}
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
