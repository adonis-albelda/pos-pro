import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Check, ChevronDown, Store } from "lucide-react-native";
import { useLocationScope } from "@/lib/location-scope";
import { useSync } from "@/sync/sync-provider";
import { color, fontSize, radius, space } from "@/theme";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";

/**
 * Admin-enrolled tablets only. Device terminals stay locked to their
 * enrolled branch — no control rendered.
 *
 * "header" (default) is the flat branch label on StoreHeader chrome — phone
 * hides it there (too crowded), tablet keeps it. "drawer" is a full-width
 * list row inside AccountDrawer on phone.
 */
export function LocationSwitcher({ variant = "header" }: { variant?: "header" | "drawer" }) {
  const { canSwitch, locationId, locations, setLocationId, refresh } = useLocationScope();
  const { replaceAll } = useSync();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Device terminals stay locked — no control. Admin tablets always show
  // the active branch name, even with a single branch (still useful label;
  // picker only opens when there is something to switch to).
  if (!canSwitch) return null;

  const selected =
    locations.find((row) => row.id === locationId) ?? locations[0] ?? null;
  const title = selected?.name ?? "Choose branch";
  const canPick = locations.length > 1;

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

  const isDrawer = variant === "drawer";
  const iconColor = isDrawer ? color.primary : color.onPrimary;
  const titleColor = isDrawer ? color.ink : color.onPrimary;

  return (
    <>
      <Pressable
        onPress={() => {
          if (canPick) setOpen(true);
        }}
        disabled={switching || !canPick}
        accessibilityRole="button"
        accessibilityLabel={
          canPick ? `Location ${title}. Change branch.` : `Location ${title}.`
        }
        style={({ pressed }) =>
          isDrawer
            ? {
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                paddingHorizontal: space.md,
                borderRadius: radius.sm,
                backgroundColor: pressed && canPick ? color.surfacePressed : "transparent",
                opacity: switching ? 0.7 : 1,
              }
            : {
                alignSelf: "stretch",
                minHeight: 40,
                maxWidth: 180,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: space.xs,
                opacity: pressed && canPick ? 0.7 : switching ? 0.7 : 1,
              }
        }
      >
        <Store size={isDrawer ? 20 : 14} color={iconColor} strokeWidth={isDrawer ? 2 : 2.25} />
        {/* Header: no flex:1 — that collapses width to 0 inside an
            intrinsic-sized pill. Drawer keeps flex so the row fills. */}
        <View style={isDrawer ? { flex: 1, minWidth: 0 } : { flexShrink: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: titleColor,
              fontSize: isDrawer ? fontSize.bodyLg : fontSize.caption,
              fontWeight: isDrawer ? "600" : "700",
            }}
          >
            {title}
          </Text>
        </View>
        {switching ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : canPick ? (
          <ChevronDown size={isDrawer ? 18 : 14} color={iconColor} strokeWidth={2.25} />
        ) : null}
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
                        alignItems: "center",
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
                          width: 28,
                          height: 28,
                          borderRadius: radius.sm,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: active ? color.primarySoft : color.paper,
                        }}
                      >
                        <Store
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
