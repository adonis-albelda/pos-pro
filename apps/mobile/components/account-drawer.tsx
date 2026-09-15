import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import { ROLES } from "@double-a/shared-types";
import {
  Building2,
  ChevronDown,
  CloudUpload,
  HelpCircle,
  HelpCircleIcon,
  Home,
  Info,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Palette,
  Settings,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { APP_VERSION } from "@/lib/api/client";
import { useLocationScope } from "@/lib/location-scope";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useSync } from "@/sync/sync-provider";
import { BranchPickerDialog, useBranchPicker } from "@/components/location-switcher";
import { circleRadius, color, fontSize, radius, space } from "@/theme";

// Sell / Delivery / History / Attendance stay on BottomTabBar only (phone
// only) — tablet has no bar, but attendance is a shift-start/end action, not
// an occasional settings visit, so it doesn't belong duplicated in here.
// Theme/Settings/Sync are occasional push visits. Admin dashboard stays
// gated below.
const POS_TABS = [
  { href: "/pos/theme", label: "Theme", icon: Palette },
  { href: "/pos/settings", label: "Settings", icon: Settings },
  { href: "/pos/sync", label: "Sync", icon: CloudUpload },
] as const;

/** FAQ/About are plain in-app routes, same nav shape as POS_TABS above — kept
 * separate only because they render after Admin, not before it. */
const HELP_TABS = [
  { href: "/pos/faq", label: "FAQ", icon: HelpCircle, description: undefined },
  { href: "/pos/about", label: "About", icon: Info, description: `Version ${APP_VERSION}` },
] as const;

const CONTACT_SUPPORT_URL = "https://www.facebook.com/profile.php?id=61592584295878";

const DRAWER_WIDTH_RATIO = 0.82;
const DRAWER_MAX_WIDTH = 360;
const ANIM_MS = 220;

/**
 * Account panel opened from the store logo. Nav tabs, shift identity, and
 * end-shift live here so the top chrome stays one quiet line.
 */
export function AccountDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { cashier, lock } = useSession();
  const store = useStoreSettings();
  const { offlineModeEnabled, setOfflineModeEnabled } = useSync();
  const branchPicker = useBranchPicker();
  // "Account used to login is admin" (device.ts EnrolledRole) also opens the
  // dashboard, regardless of which PIN shift user is on — same rule as
  // admin/_layout.tsx's own check.
  const { role: enrolledRole } = useLocationScope();
  const canOpenAdminDashboard =
    enrolledRole === ROLES.ADMIN || cashier?.role === ROLES.ADMIN || cashier?.role === ROLES.MANAGER;
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * DRAWER_WIDTH_RATIO, DRAWER_MAX_WIDTH);

  // Stays mounted through the close animation so it slides fully off-screen
  // instead of just popping away mid-motion.
  const [mounted, setMounted] = useState(open);
  const translateX = useRef(new Animated.Value(open ? 0 : -panelWidth)).current;
  const scrim = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
        Animated.timing(scrim, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(translateX, { toValue: -panelWidth, duration: ANIM_MS, useNativeDriver: true }),
      Animated.timing(scrim, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [open, panelWidth, scrim, translateX]);

  if (!cashier || !mounted) return null;

  // Close the drawer first and let its slide-out finish before the screen
  // underneath changes — running both animations at once is what reads as
  // the previous and next screen "mixing up".
  // Pushed, not replaced — these are dead-end detail screens (own header +
  // back arrow, see SubPageHeader/app/pos/_layout.tsx), not tabs to swap
  // between, so a real stack entry is what lets that back arrow pop.
  function go(href: (typeof POS_TABS)[number]["href"] | (typeof HELP_TABS)[number]["href"]) {
    onClose();
    setTimeout(() => router.push(href), ANIM_MS);
  }

  function openHome() {
    onClose();
    setTimeout(() => router.push("/pos"), ANIM_MS);
  }

  function openAdmin() {
    onClose();
    setTimeout(() => router.push("/admin"), ANIM_MS);
  }

  function openContactSupport() {
    onClose();
    setTimeout(() => void Linking.openURL(CONTACT_SUPPORT_URL), ANIM_MS);
  }

  function openHelpCenter() {
    onClose();
    setTimeout(() => router.push("/pos/help-center"), ANIM_MS);
  }

  function endShift() {
    onClose();
    setTimeout(() => {
      lock();
      router.replace("/unlock");
    }, ANIM_MS);
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <Animated.View
          style={{
            width: panelWidth,
            backgroundColor: color.surface,
            // Flat Surfaces: hard edge + border, not a floating shadow.
            borderRightWidth: 1,
            borderRightColor: color.border,
            transform: [{ translateX }],
          }}
        >
          {/*
            Everything below scrolls — a fixed-height column with no
            fallback used to clip "On shift"/Offline mode/End shift/version
            off-screen on a short viewport (tablet landscape, split-screen,
            a small phone with the keyboard-avoiding inset eating space).
            flexGrow:1 on the content container keeps the flex:1 spacer
            below still pinning the footer to the bottom on a tall screen,
            same look as before — it only becomes a real scroll once
            content genuinely doesn't fit.
          */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              paddingTop: insets.top + space.md,
              paddingBottom: insets.bottom + space.lg,
              paddingHorizontal: space.lg,
              gap: space.lg,
            }}
            showsVerticalScrollIndicator={false}
          >
          {/* Identity: avatar + cashier name on top, business name (and branch,
              only once there is more than one to name) underneath — no logo,
              no separate store-name block above this. A single-branch shop
              never sees a branch name here at all, since there is nothing to
              switch between and naming it just reads as unexplained chrome. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
            }}
          >
            <Pressable
              onPress={() => {
                if (branchPicker.canSwitch && branchPicker.canPick) branchPicker.setOpen(true);
              }}
              disabled={branchPicker.switching || !branchPicker.canSwitch || !branchPicker.canPick}
              accessibilityRole="button"
              accessibilityLabel={
                branchPicker.canSwitch && branchPicker.canPick
                  ? `${cashier.name}, ${store.name}, ${branchPicker.selectedName}. Change branch.`
                  : `${cashier.name}, ${store.name}.`
              }
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                opacity:
                  pressed && branchPicker.canSwitch && branchPicker.canPick
                    ? 0.75
                    : branchPicker.switching
                      ? 0.7
                      : 1,
              })}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: circleRadius(40),
                  backgroundColor: color.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.onPrimary }}>
                  {cashier.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}
                >
                  {cashier.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: fontSize.caption, color: color.inkMuted }}>
                    {branchPicker.locations.length > 1
                      ? `${store.name} - ${branchPicker.selectedName}`
                      : store.name}
                  </Text>
                  {branchPicker.switching ? (
                    <ActivityIndicator size="small" color={color.inkMuted} />
                  ) : branchPicker.canSwitch && branchPicker.canPick ? (
                    <ChevronDown size={12} color={color.inkMuted} strokeWidth={2.25} />
                  ) : null}
                </View>
              </View>
            </Pressable>

            <Pressable
              onPress={endShift}
              accessibilityRole="button"
              accessibilityLabel="End shift"
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: space.sm,
                paddingVertical: space.xs,
                borderRadius: radius.sm,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: fontSize.caption, fontWeight: "700", color: color.primary }}>
                End shift
              </Text>
              <LogOut size={16} color={color.primary} strokeWidth={2.25} />
            </Pressable>
          </View>

          <BranchPickerDialog
            open={branchPicker.open}
            onClose={() => branchPicker.setOpen(false)}
            locations={branchPicker.locations}
            locationId={branchPicker.locationId}
            onPick={branchPicker.pick}
          />

          <View style={{ gap: 3 }}>
            <DrawerTab
              key="home"
              icon={Home}
              label="Home"
              active={pathname === "/pos"}
              onPress={openHome}
            />
            {canOpenAdminDashboard ? (
              <DrawerTab
                key="admin"
                icon={Building2}
                label="Backoffice"
                description="Products, Stocks, Employees, etc."
                active={pathname === "/admin"}
                onPress={openAdmin}
              />
            ) : null}
            {POS_TABS.map((tab) => (
              <DrawerTab
                key={tab.href}
                icon={tab.icon}
                label={tab.label}
                active={pathname === tab.href}
                onPress={() => go(tab.href)}
              />
            ))}
            {HELP_TABS.map((tab) => (
              <DrawerTab
                key={tab.href}
                icon={tab.icon}
                label={tab.label}
                description={tab.description}
                active={pathname === tab.href}
                onPress={() => go(tab.href)}
              />
            ))}
            <DrawerTab
              key="contact-support"
              icon={MessageCircle}
              label="Contact support"
              description="Opens Double-A IT Solutions' Facebook page — POSPro One's maker"
              active={false}
              onPress={openContactSupport}
            />
            <DrawerTab
              key="help-center"
              icon={HelpCircleIcon}
              label="Help Center"
              active={pathname === "/pos/help-center"}
              onPress={openHelpCenter}
            />
          </View>

          <View style={{ flex: 1 }} />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              padding: space.sm,
              borderRadius: radius.sm,
              backgroundColor: color.primarySoft,
            }}
          >
            <WifiOff size={18} color={color.ink} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                Offline mode
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                {offlineModeEnabled
                  ? "Sales queue here — sync them yourself from the Sync tab."
                  : "Off — sales and stock updates go live automatically."}
              </Text>
            </View>
            <Switch
              value={offlineModeEnabled}
              onValueChange={(next) => void setOfflineModeEnabled(next)}
              trackColor={{ true: color.primary, false: color.border }}
            />
          </View>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, textAlign: "center" }}>
            Copyright © 2026 POSPro One - All Rights Reserved.
          </Text>
          </ScrollView>
        </Animated.View>

        <Animated.View style={{ flex: 1, opacity: scrim }}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={{ flex: 1, backgroundColor: "rgba(27, 31, 29, 0.35)" }}
          />
        </Animated.View>

        {/* Outside the panel entirely (not straddling its edge) — last child
            of this row so it always paints above the scrim, and slides with
            the panel via the same translateX/opacity rather than popping in
            on its own. Topmost and off to the side, out of the menu's way. */}
        <Animated.View
          style={{
            position: "absolute",
            top: insets.top,
            left: panelWidth + space.md,
            opacity: scrim,
            transform: [{ translateX }],
          }}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: circleRadius(48),
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: color.surface,
              opacity: pressed ? 0.7 : 1,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 4,
            })}
          >
            <X size={24} color={color.ink} strokeWidth={2.25} />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * One shared row style for every drawer link — POS tabs and the
 * admin-dashboard link alike. `description` is optional: a plain tab stays
 * a single line, one with it (currently just Admin dashboard) grows to two
 * without changing the row's own background/active/pressed styling.
 */
function DrawerTab({
  icon: Icon,
  label,
  description,
  active,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingHorizontal: space.sm,
        paddingVertical: description ? space.xs : 0,
        borderRadius: radius.sm,
        backgroundColor: active ? color.primarySoft : pressed ? color.surfacePressed : "transparent",
      })}
    >
      <Icon size={20} color={active ? color.primary : color.inkMuted} strokeWidth={active ? 2.25 : 2} />
      <View style={{ flex: 1, minWidth: 0, gap: description ? 2 : 0 }}>
        <Text
          style={{
            fontSize: fontSize.bodyLg,
            fontWeight: active ? "700" : "600",
            color: active ? color.primary : color.ink,
          }}
        >
          {label}
        </Text>
        {description ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: fontSize.caption,
              color: active ? color.primary : color.inkMuted,
            }}
          >
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
