import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import { ROLES } from "@double-a/shared-types";
import { Building2, Receipt, ShoppingCart, Tag, Truck, type LucideIcon } from "lucide-react-native";
import { useLocationScope } from "@/lib/location-scope";
import { useSession } from "@/lib/session";
import { usePriceInquiryOptional } from "@/lib/price-inquiry";
import { circleRadius, color, fontSize, space } from "@/theme";

const TABS = [
  { href: "/pos", label: "POS", icon: ShoppingCart },
  { href: "/pos/delivery", label: "Delivery", icon: Truck },
  { href: "/pos/history", label: "History", icon: Receipt },
] as const;

/** Same grant rule as AccountDrawer's own admin-dashboard tile — kept in sync with it. */
const ADMIN_TAB = { href: "/admin", label: "Admin", icon: Building2 } as const;

const CENTER_BUTTON_SIZE = 52;

/**
 * Persistent bottom navigation for Sell/Delivery/History/Admin — previously
 * only reachable from the account drawer (a few taps away from whatever
 * screen a cashier was on). Phone only (compact) — a tablet already has
 * room for the drawer and its own tablet-specific chrome (CartShell's side
 * panel, StoreHeader's sales stat), so this doesn't touch that layout.
 * Mounted in both app/pos/_layout.tsx and app/admin/_layout.tsx so it stays
 * visible switching between the two, not just within one.
 */
export function BottomTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { cashier } = useSession();
  // "Account used to login is admin" (device.ts EnrolledRole) also opens the
  // dashboard, regardless of which PIN shift user is on — same rule as
  // account-drawer.tsx's ADMIN_TAB gate and admin/_layout.tsx's own check.
  const { role: enrolledRole } = useLocationScope();
  const canOpenAdminDashboard =
    enrolledRole === ROLES.ADMIN || cashier?.role === ROLES.ADMIN || cashier?.role === ROLES.MANAGER;
  // null outside the POS tree (this bar also mounts in app/admin/_layout.tsx,
  // which has no PriceInquiryProvider) — center button just doesn't render
  // there. This is now the ONLY entry point for price inquiry — the old
  // draggable floating button and account-drawer menu item were retired.
  const priceInquiry = usePriceInquiryOptional();

  const tabs = canOpenAdminDashboard ? [...TABS, ADMIN_TAB] : TABS;
  // Split around the middle so the price-inquiry button lands visually
  // centered regardless of tab count (3 plain, 4 with Admin granted).
  const splitAt = Math.ceil(tabs.length / 2);
  const leftTabs = tabs.slice(0, splitAt);
  const rightTabs = tabs.slice(splitAt);

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
              borderRadius: circleRadius(CENTER_BUTTON_SIZE),
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
