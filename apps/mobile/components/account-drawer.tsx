import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Pressable,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import {
  Building2,
  CloudUpload,
  LogOut,
  Receipt,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  UserRound,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { APP_VERSION } from "@/lib/api/client";
import { useSession } from "@/lib/session";
import { useStoreSettings } from "@/lib/store";
import { useSync } from "@/sync/sync-provider";
import { Button } from "@/components/ui";
import { color, fontSize, space, styles } from "@/theme";

const POS_TABS = [
  { href: "/pos", label: "Sell", icon: ShoppingCart },
  { href: "/pos/delivery", label: "Delivery", icon: Truck },
  { href: "/pos/history", label: "History", icon: Receipt },
  { href: "/pos/settings", label: "Settings", icon: Settings },
  { href: "/pos/sync", label: "Sync", icon: CloudUpload },
] as const;

/**
 * Admin dashboard mode — every domain apps/admin manages, online-only (see
 * app/admin/_layout.tsx). Only ever shown to a role: "admin" cashier; a
 * plain cashier never sees this tile at all. Building2 (not Shield, already
 * used for the role badge above) so this reads as "the office", not a
 * repeat of "you are an admin".
 */
const ADMIN_TAB = {
  href: "/admin",
  label: "Admin dashboard",
  description: "Products, reports, users, and settings",
  icon: Building2,
} as const;

const DRAWER_WIDTH_RATIO = 0.82;
const DRAWER_MAX_WIDTH = 360;
const ANIM_MS = 220;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as setup.tsx/company-intro.tsx; no *.png module declaration in this project
const LOGO = require("../assets/logo.png");

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
  function go(href: (typeof POS_TABS)[number]["href"] | typeof ADMIN_TAB.href) {
    onClose();
    setTimeout(() => router.replace(href), ANIM_MS);
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
            paddingTop: insets.top + space.md,
            paddingBottom: insets.bottom + space.lg,
            paddingHorizontal: space.lg,
            gap: space.lg,
            // Floats over the scrim now — shadow does the separation, not a flat border.
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 8, height: 0 },
            elevation: 16,
            transform: [{ translateX }],
          }}
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
                borderRadius: 16,
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
            {cashier.role === "admin" ? (
              <DrawerTab
                key={ADMIN_TAB.href}
                icon={ADMIN_TAB.icon}
                label={ADMIN_TAB.label}
                description={ADMIN_TAB.description}
                active={pathname === ADMIN_TAB.href}
                onPress={() => go(ADMIN_TAB.href)}
              />
            ) : null}
          </View>

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
                borderRadius: 18,
                backgroundColor: color.primaryTint,
                borderWidth: 1,
                borderColor: color.primarySoft,
                shadowColor: "#000",
                shadowOpacity: 0.05,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: 2,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
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
                  {cashier.role === "admin" ? (
                    <Shield size={14} color={color.primary} strokeWidth={2} />
                  ) : (
                    <UserRound size={14} color={color.primary} strokeWidth={2} />
                  )}
                  <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    {cashier.role === "admin" ? "Admin" : "Cashier"}
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
              borderRadius: 14,
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
            style={{ borderRadius: 14 }}
            onPress={endShift}
          />

          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, textAlign: "center" }}>
            Version {APP_VERSION}
          </Text>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, textAlign: "center" }}>
            Copyright © 2026 PROPos - All Rights Reserved.
          </Text>
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
        borderRadius: 14,
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
