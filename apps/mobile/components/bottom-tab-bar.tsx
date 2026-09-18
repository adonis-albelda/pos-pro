import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import { Receipt, ShoppingCart, Tag, Truck, User, type LucideIcon } from "lucide-react-native";
import { usePriceInquiryOptional } from "@/lib/price-inquiry";
import { color, fontSize, space } from "@/theme";

// Attendance removed for now (still routable at /pos/attendance, just no
// entry point) — not deleted, in case it comes back.
const TABS = [
  { href: "/pos", label: "POS", icon: ShoppingCart },
  { href: "/pos/delivery", label: "Delivery", icon: Truck },
  { href: "/pos/history", label: "Sales", icon: Receipt },
  { href: "/pos/account", label: "Account", icon: User },
] as const;

const CENTER_BUTTON_SIZE = 52;

/**
 * Persistent bottom navigation for Sell/Delivery/Sales/Account —
 * previously only reachable from the account drawer (a few taps away from
 * whatever screen a cashier was on). Shown at every width and orientation
 * (phone and tablet, portrait or landscape) — a tablet's own chrome
 * (CartShell's side panel, StoreHeader's sales stat) sits above this, not in
 * place of it. Mounted in both app/pos/_layout.tsx and app/admin/_layout.tsx
 * so it stays visible switching between the two, not just within one. Admin
 * dashboard moved back to being drawer-only (AccountDrawer) — this bar's 4
 * slots go to the screens a shift actually rotates through, not an
 * occasional destination.
 */
export function BottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // null outside the POS tree (this bar also mounts in app/admin/_layout.tsx,
  // which has no PriceInquiryProvider) — center button just doesn't render
  // there. This is now the ONLY entry point for price inquiry — the old
  // draggable floating button and account-drawer menu item were retired.
  const priceInquiry = usePriceInquiryOptional();

  // Split around the middle so the price-inquiry button lands visually centered.
  const splitAt = Math.ceil(TABS.length / 2);
  const leftTabs = TABS.slice(0, splitAt);
  const rightTabs = TABS.slice(splitAt);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        borderTopWidth: 1,
        borderTopColor: color.border,
        backgroundColor: color.surface,
        paddingBottom: insets.bottom,
      }}
    >
      {leftTabs.map((tab) => (
        <TabButton
          key={tab.href}
          icon={tab.icon}
          label={tab.label}
          active={pathname === tab.href}
          onPress={() => router.replace(tab.href)}
        />
      ))}
      {priceInquiry ? (
        <View style={{ width: CENTER_BUTTON_SIZE + space.md, alignItems: "center", zIndex: 10 }}>
          <Pressable
            onPress={priceInquiry.open}
            accessibilityRole="button"
            accessibilityLabel="Price inquiry"
            style={{
              position: "absolute",
              // Rises above the bar's top border — the "floating bubble
              // centered on the tabs" look, not just another flush tab.
              bottom: CENTER_BUTTON_SIZE * 0.4,
              width: CENTER_BUTTON_SIZE,
              height: CENTER_BUTTON_SIZE,
              // Hardcoded, not circleRadius() — this floating bubble stays a
              // true circle regardless of the Theme menu's Corners setting
              // (flat/reduced would otherwise square it off).
              borderRadius: CENTER_BUTTON_SIZE / 2,
              backgroundColor: color.primary,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: color.ink,
              shadowOpacity: 0.25,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 8,
            }}
          >
            <Tag size={24} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
        </View>
      ) : null}
      {rightTabs.map((tab) => (
        <TabButton
          key={tab.href}
          icon={tab.icon}
          label={tab.label}
          active={pathname === tab.href}
          onPress={() => router.replace(tab.href)}
        />
      ))}
    </View>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        paddingVertical: space.sm,
      }}
    >
      <Icon size={22} color={active ? color.primary : color.inkMuted} strokeWidth={active ? 2.25 : 2} />
      <Text
        style={{
          fontSize: fontSize.caption,
          fontWeight: active ? "700" : "600",
          color: active ? color.primary : color.inkMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
