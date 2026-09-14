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
import type { Location } from "@double-a/shared-types";
import { useLocationScope } from "@/lib/location-scope";
import { useSync } from "@/sync/sync-provider";
import { color, fontSize, radius, space } from "@/theme";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";

/**
 * Shared branch-switch state and side effects (replaceAll pull, cache
 * invalidation) — used by both the header pill (LocationSwitcher) and
 * AccountDrawer's compact on-shift card, so the actual location-swap logic
 * lives in exactly one place.
 */
export function useBranchPicker() {
  const { canSwitch, locationId, locations, setLocationId, refresh } = useLocationScope();
  const { replaceAll } = useSync();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const selected = locations.find((row) => row.id === locationId) ?? locations[0] ?? null;
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

  return {
    canSwitch,
    canPick,
    locations,
    locationId,
    selectedName: selected?.name ?? "Choose branch",
    open,
    setOpen,
    switching,
    pick,
  };
}

/** The "Selling branch" bottom-sheet list — shared by every branch-switch entry point. */
export function BranchPickerDialog({
  open,
  onClose,
  locations,
  locationId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  locations: Location[];
  locationId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
        onPress={onClose}
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
                    onPress={() => onPick(location.id)}
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
  );
}

/**
 * Admin-enrolled tablets only. Device terminals stay locked to their
 * enrolled branch — no control rendered. Lives on StoreHeader's tablet
 * chrome; phone folds the same picker into AccountDrawer's on-shift card
 * instead (too crowded up top there).
 */
export function LocationSwitcher() {
  const { canSwitch, canPick, locations, locationId, selectedName, open, setOpen, switching, pick } =
    useBranchPicker();

  // A single-branch shop has nothing to switch between — the label read as
  // an unexplained bit of chrome rather than a useful control.
  if (!canSwitch || !canPick) return null;

  return (
    <>
      <Pressable
        onPress={() => {
          if (canPick) setOpen(true);
        }}
        disabled={switching || !canPick}
        accessibilityRole="button"
        accessibilityLabel={
          canPick ? `Location ${selectedName}. Change branch.` : `Location ${selectedName}.`
        }
        style={({ pressed }) => ({
          alignSelf: "stretch",
          minHeight: 40,
          maxWidth: 180,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: space.xs,
          opacity: pressed && canPick ? 0.7 : switching ? 0.7 : 1,
        })}
      >
        <Store size={14} color={color.onPrimary} strokeWidth={2.25} />
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ color: color.onPrimary, fontSize: fontSize.caption, fontWeight: "700" }}
          >
            {selectedName}
          </Text>
        </View>
        {switching ? (
          <ActivityIndicator size="small" color={color.onPrimary} />
        ) : canPick ? (
          <ChevronDown size={14} color={color.onPrimary} strokeWidth={2.25} />
        ) : null}
      </Pressable>

      <BranchPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        locations={locations}
        locationId={locationId}
        onPick={pick}
      />
    </>
  );
}
