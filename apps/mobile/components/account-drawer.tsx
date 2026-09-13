import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
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
  CalendarClock,
  CloudUpload,
  LogOut,
  Palette,
  Settings,
  Shield,
  Tag,
  UserRound,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { APP_VERSION } from "@/lib/api/client";
import { useLayout } from "@/lib/layout";
import { usePriceInquiry } from "@/lib/price-inquiry";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useSync } from "@/sync/sync-provider";
import { Button } from "@/components/ui";
import { LocationSwitcher } from "@/components/location-switcher";
import { circleRadius, color, fontSize, radius, space, styles } from "@/theme";

// Sell / Delivery / History / Admin dashboard moved to BottomTabBar
// (components/bottom-tab-bar.tsx, phone only) — reachable in one tap from
// anywhere instead of opening this drawer first. What's left here doesn't
// need that: Theme/Settings/Sync are occasional visits, not
// switched-between-all-shift destinations.
const POS_TABS = [
  { href: "/pos/theme", label: "Theme", icon: Palette },
  { href: "/pos/settings", label: "Settings", icon: Settings },
  { href: "/pos/sync", label: "Sync", icon: CloudUpload },
] as const;

const DRAWER_WIDTH_RATIO = 0.82;
const DRAWER_MAX_WIDTH = 360;
const ANIM_MS = 220;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as setup.tsx/company-intro.tsx; no *.png module declaration in this project
const LOGO = require("../assets/logo.webp");

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
  const { style: priceInquiryStyle, open: openPriceInquiryModal } = usePriceInquiry();
  const { compact } = useLayout();
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
  function go(href: (typeof POS_TABS)[number]["href"]) {
    onClose();
    setTimeout(() => router.replace(href), ANIM_MS);
  }

  function openPriceInquiry() {
    onClose();
    setTimeout(openPriceInquiryModal, ANIM_MS);
  }

  function openAttendance() {
    onClose();
    setTimeout(() => router.push("/attendance"), ANIM_MS);
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
          <View style={{ alignItems: "center", gap: space.sm }}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.tapTarget, { position: "absolute", top: -space.xs, right: -space.xs }]}
            >
              <X size={22} color={color.inkMuted} strokeWidth={2} />
            </Pressable>

            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: radius.md,
                backgroundColor: color.primarySoft,
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <Image
                source={LOGO}
                style={{ width: 40, height: 40 }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
            <Text
              numberOfLines={1}
              style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink, textAlign: "center" }}
            >
              {store.name}
            </Text>
          </View>

          <View style={{ gap: space.xs }}>
            {POS_TABS.map((tab) => (
              <DrawerTab
                key={tab.href}
                icon={tab.icon}
                label={tab.label}
                active={pathname === tab.href}
                onPress={() => go(tab.href)}
              />
            ))}
            {priceInquiryStyle === "menu" ? (
              <DrawerTab
                key="price-inquiry"
                icon={Tag}
                label="Price inquiry"
                active={false}
                onPress={openPriceInquiry}
              />
            ) : null}
            <DrawerTab
              key="attendance"
              icon={CalendarClock}
              label="Attendance"
              active={pathname === "/attendance"}
              onPress={openAttendance}
            />
          </View>

          {compact ? <LocationSwitcher variant="drawer" /> : null}

          <View style={[styles.ledgerLine, { marginVertical: space.xs }]} />

          <View style={{ gap: space.md }}>
            <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.inkMuted }}>
              On shift
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                padding: space.md,
                borderRadius: radius.lg,
                backgroundColor: color.primaryTint,
                borderWidth: 1,
                borderColor: color.primarySoft,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: circleRadius(52),
                  backgroundColor: color.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: fontSize.headingSm,
                    fontWeight: "700",
                    color: color.onPrimary,
                  }}
                >
                  {cashier.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>

              <View style={{ flex: 1, minWidth: 0, gap: space.xs }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}
                >
                  {cashier.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                  {cashier.role === ROLES.ADMIN ? (
                    <Shield size={14} color={color.primary} strokeWidth={2} />
                  ) : (
                    <UserRound size={14} color={color.primary} strokeWidth={2} />
                  )}
                  <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    {cashier.role === ROLES.ADMIN ? "Admin" : "Cashier"}
                  </Text>
                </View>
                {cashier.email ? (
                  <Text numberOfLines={1} style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    {cashier.email}
                  </Text>
                ) : null}
              </View>
            </View>
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

          <Button
            label="End shift"
            variant="secondary"
            icon={LogOut}
            large
            onPress={endShift}
          />

          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, textAlign: "center" }}>
            Version {APP_VERSION}
          </Text>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, textAlign: "center" }}>
            Copyright © 2026 POSPro - All Rights Reserved.
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
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        paddingHorizontal: space.md,
        paddingVertical: description ? space.sm : 0,
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
