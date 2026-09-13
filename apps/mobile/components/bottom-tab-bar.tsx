import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import { ROLES } from "@double-a/shared-types";
import { Building2, Receipt, ShoppingCart, Tag, Truck, type LucideIcon } from "lucide-react-native";
import { useLocationScope } from "@/lib/location-scope";
import { useSession } from "@/lib/session";
import { usePriceInquiryOptional } from "@/lib/price-inquiry";
import { circleRadius, color, fontSize, space } from "@/theme";

const LEFT_TABS = [
  { href: "/pos", label: "Sell", icon: ShoppingCart },
] as const;

const RIGHT_TABS = [
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

  const tabs = canOpenAdminDashboard ? [...TABS, ADMIN_TAB] : TABS;

  return (
    <View
      style={{
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: color.border,
        backgroundColor: color.surface,
        paddingBottom: insets.bottom,
      }}
    >
      {tabs.map((tab) => (
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
