import { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Menu } from "lucide-react-native";
import { storeInitial } from "@double-a/shared-types";
import { AccountDrawer } from "@/components/account-drawer";
import { LocationSwitcher } from "@/components/location-switcher";
import { useStoreSettings } from "@/lib/store";
import { useLayout } from "@/lib/layout";
import { useSync } from "@/sync/sync-provider";
import { pendingLabel, syncLook, useMinuteTick } from "@/sync/status";
import { color, fontSize, radius, space } from "@/theme";

/**
 * One chrome row on every POS screen: logo (opens drawer with tabs), shop
 * name, sync chip. Chip taps through to Sync — does not sync itself.
 */
export function StoreHeader() {
  const store = useStoreSettings();
  const state = useSync();
  const router = useRouter();
  const { compact } = useLayout();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useMinuteTick();
  const look = syncLook(state);
  const StatusIcon = look.icon;

  const logoSize = compact ? 32 : 36;

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

        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: compact ? fontSize.body : fontSize.bodyLg,
            fontWeight: "700",
            color: color.onPrimary,
          }}
        >
          {store.name}
        </Text>

        <LocationSwitcher />

        <Pressable
          onPress={() => router.replace("/pos/sync")}
          accessibilityRole="button"
          accessibilityLabel={`${look.text}. ${pendingLabel(state.pendingSales)}. Opens sync.`}
          style={({ pressed }) => ({
            minHeight: 40,
            maxWidth: compact ? 120 : 220,
            flexDirection: "row",
            alignItems: "center",
            gap: space.xs,
            paddingLeft: space.sm,
            paddingRight: compact ? space.sm : space.xs,
            borderRadius: radius.sm,
            backgroundColor: look.fill,
            opacity: pressed ? 0.85 : 1,
            flexShrink: 0,
          })}
        >
          {look.busy ? (
            <ActivityIndicator size="small" color={look.ink} />
          ) : (
            <StatusIcon size={16} color={look.ink} strokeWidth={2} />
          )}

          {/* Live-connection dot: green while the stock-broadcast socket is
              actually connected, amber if online mode is on but it isn't
              (reconnecting, or really offline despite the toggle), gray
              once offline mode is deliberately on. */}
          <View
            accessibilityLabel={
              state.offlineModeEnabled
                ? "Offline mode on"
                : state.realtimeConnected
                  ? "Live"
                  : "Reconnecting"
            }
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: state.offlineModeEnabled
                ? color.inkMuted
                : state.realtimeConnected
                  ? color.success
                  : color.warning,
            }}
          />

          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: fontSize.caption, fontWeight: "700", color: look.ink }}
            >
              {compact ? look.shortText : look.text}
            </Text>
            {compact ? null : (
              <Text
                numberOfLines={1}
                style={{ fontSize: fontSize.caption, color: color.inkMuted }}
              >
                {pendingLabel(state.pendingSales)}
              </Text>
            )}
          </View>

          {compact ? null : <ChevronRight size={16} color={look.ink} strokeWidth={2} />}
        </Pressable>
      </View>

      <AccountDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
