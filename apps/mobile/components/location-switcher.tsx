import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Check, ChevronDown, MapPin } from "lucide-react-native";
import { useLocationScope } from "@/lib/location-scope";
import { useSync } from "@/sync/sync-provider";
import { color, fontSize, radius, space } from "@/theme";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";

/**
 * Admin-enrolled tablets only. Device terminals stay locked to their
 * enrolled branch — no control rendered.
 */
export function LocationSwitcher() {
  const { canSwitch, locationId, locations, setLocationId, refresh } = useLocationScope();
  const { replaceAll } = useSync();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!canSwitch) return null;

  const selected = locations.find((row) => row.id === locationId) ?? null;
  const title = selected?.name ?? "Choose branch";
  const subtitle = selected?.address?.trim() || "Branch for stock and sales";

  async function pick(nextId: string) {
    if (nextId === locationId) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setSwitching(true);
    try {
      await setLocationId(nextId);
      await replaceAll();
      await refresh();
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.sales.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    } finally {
      setSwitching(false);
    }
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={switching}
        accessibilityRole="button"
        accessibilityLabel={`Location ${title}. Change branch.`}
        style={({ pressed }) => ({
          maxWidth: 160,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: space.sm,
          paddingVertical: 6,
          borderRadius: radius.sm,
          backgroundColor: "rgba(255,255,255,0.15)",
          opacity: pressed || switching ? 0.7 : 1,
        })}
      >
        <MapPin size={14} color={color.onPrimary} strokeWidth={2.25} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: color.onPrimary, fontSize: fontSize.caption, fontWeight: "700" }}
          >
            {title}
          </Text>
          <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}>
            {subtitle}
          </Text>
        </View>
        {switching ? (
          <ActivityIndicator size="small" color={color.onPrimary} />
        ) : (
          <ChevronDown size={14} color={color.onPrimary} strokeWidth={2.25} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              maxHeight: "70%",
              backgroundColor: color.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingBottom: space.lg,
            }}
          >
            <View
              style={{
                paddingHorizontal: space.md,
                paddingTop: space.md,
                paddingBottom: space.sm,
              }}
            >
              <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
                Selling branch
              </Text>
              <Text style={{ marginTop: 2, fontSize: fontSize.caption, color: color.inkMuted }}>
                Stock and new sales use this location. Customers stay company-wide.
              </Text>
            </View>

            <ScrollView>
              {locations.length === 0 ? (
                <Text
                  style={{
                    paddingHorizontal: space.md,
                    paddingVertical: space.md,
                    color: color.inkMuted,
                    fontSize: fontSize.body,
                  }}
                >
                  No active branches yet.
                </Text>
              ) : (
                locations.map((location) => {
                  const active = location.id === locationId;
                  return (
                    <Pressable
                      key={location.id}
                      onPress={() => void pick(location.id)}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: space.sm,
                        paddingHorizontal: space.md,
                        paddingVertical: space.sm + 2,
                        backgroundColor: pressed
                          ? color.border
                          : active
                            ? color.primaryTint
                            : "transparent",
                      })}
                    >
                      <View
                        style={{
                          marginTop: 2,
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: active ? color.primarySoft : color.paper,
                        }}
                      >
                        <MapPin
                          size={14}
                          color={active ? color.primary : color.inkMuted}
                          strokeWidth={2.25}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontSize: fontSize.body,
                            fontWeight: "600",
                            color: color.ink,
                          }}
                        >
                          {location.name}
                        </Text>
                        <Text
                          style={{
                            marginTop: 2,
                            fontSize: fontSize.caption,
                            color: color.inkMuted,
                          }}
                        >
                          {location.address?.trim() || "Branch"}
                        </Text>
                      </View>
                      {active ? (
                        <Check size={18} color={color.primary} strokeWidth={2.5} />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
