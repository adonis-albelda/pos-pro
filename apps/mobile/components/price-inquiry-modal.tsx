import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Package, Search, Tag, Truck, Warehouse, X } from "lucide-react-native";
import type { ProductWithEstimatedStock } from "@double-a/shared-types";
import { searchLocalProducts } from "@/db/products";
import { useKeyboardHeight } from "@/components/bottom-sheet";
import { IconButton, Money } from "@/components/ui";
import { useLayout } from "@/lib/layout";
import { usePriceInquiry } from "@/lib/price-inquiry";
import { color, fontSize, radius, space } from "@/theme";

/** Matches the debounce feel of the rest of the POS's own search fields. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Matches admin Dialog `lg:min-w-4xl` (896). Old bottom sheet capped at 560 —
 * this is the new floor/ceiling on tablet; phones use full available width.
 */
const DIALOG_MAX_WIDTH = 896;
const DIALOG_MIN_WIDTH = 720;

function ResultThumbnail({ photoUrl, size }: { photoUrl: string | null; size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.sm,
        overflow: "hidden",
        backgroundColor: color.surfacePressed,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <Package size={size * 0.4} color={color.inkMuted} />
      )}
    </View>
  );
}

function DetailBox({
  icon: Icon,
  label,
  children,
  style,
}: {
  icon: typeof Tag;
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View
      style={[
        { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: color.border, padding: space.sm, gap: 2 },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Icon size={13} color={color.inkMuted} />
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

/**
 * A quick lookup reachable from anywhere in the POS (see the floating
 * button/menu entry that opens this) — mirrors admin's price-inquiry
 * dialog, but searches the local catalog (searchLocalProducts,
 * db/products.ts) instead of a live API call: the POS is offline-first,
 * and this needs to work identically with no connection.
 */
export function PriceInquiryModal() {
  const { isOpen, close } = usePriceInquiry();
  const { width, compact, landscape, gutter } = useLayout();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductWithEstimatedStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ProductWithEstimatedStock | null>(null);

  // Phone or upright tablet: dock at the bottom, same as BottomSheet. Tablet
  // held sideways: keep the centered dialog box — there's width to spare.
  const centered = !compact && landscape;
  const horizontalPad = centered ? Math.max(gutter, space.md) : 0;
  const available = Math.max(0, width - horizontalPad * 2);
  // Tablet with room: at least DIALOG_MIN_WIDTH. Low-res / phone: fill available
  // only — never force a min past the screen edge.
  const panelWidth =
    centered && available >= DIALOG_MIN_WIDTH
      ? Math.min(DIALOG_MAX_WIDTH, available)
      : available;

  useEffect(() => {
    if (isOpen) return;
    setQuery("");
    setResults([]);
    setSelected(null);
  }, [isOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void searchLocalProducts(trimmed).then((rows) => {
        if (!alive) return;
        setResults(rows);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  if (!isOpen) return null;

  return (
    <Modal visible transparent animationType={centered ? "fade" : "slide"} onRequestClose={close}>
      <View
        style={{
          flex: 1,
          backgroundColor: `${color.ink}99`,
          alignItems: centered ? "center" : undefined,
          justifyContent: centered ? "center" : "flex-end",
          paddingHorizontal: horizontalPad,
          paddingTop: centered ? Math.max(insets.top, space.md) : 0,
          paddingBottom: centered ? Math.max(insets.bottom, space.md) + keyboardHeight : 0,
        }}
      >
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={StyleSheet.absoluteFill}
        />

        <View
          style={{
            width: panelWidth,
            maxWidth: DIALOG_MAX_WIDTH,
            maxHeight: centered ? (keyboardHeight > 0 ? "88%" : "82%") : "92%",
            backgroundColor: color.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderBottomLeftRadius: centered ? radius.lg : 0,
            borderBottomRightRadius: centered ? radius.lg : 0,
            padding: compact ? space.md : space.lg,
            paddingBottom: centered
              ? (compact ? space.md : space.lg)
              : Math.max(insets.bottom, space.md) + keyboardHeight,
            gap: space.md,
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 16,
          }}
        >
          {selected ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: space.md }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Pressable
                  onPress={() => setSelected(null)}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flex: 1, minWidth: 0 }}
                >
                  <ArrowLeft size={14} color={color.inkMuted} />
                  <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.inkMuted }}>
                    Back to results
                  </Text>
                </Pressable>
                <IconButton icon={X} label="Close price inquiry" onPress={close} />
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <ResultThumbnail photoUrl={selected.photoUrl} size={64} />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
                    {selected.name}
                  </Text>
                  <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    {[selected.sku ?? "No SKU", selected.category].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: `${color.primary}4D`,
                  backgroundColor: color.primaryTint,
                  paddingVertical: space.md,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: fontSize.caption, fontWeight: "700", color: color.primary }}>
                  SHELF PRICE
                </Text>
                <Money
                  value={selected.price}
                  style={{ fontSize: fontSize.headingLg, fontWeight: "800", color: color.primary, marginTop: 2 }}
                />
              </View>

              <View style={{ flexDirection: compact && width < 400 ? "column" : "row", gap: space.sm }}>
                <DetailBox icon={Tag} label="Cost price">
                  <Money
                    value={selected.costPrice}
                    style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}
                  />
                </DetailBox>
                <DetailBox icon={Warehouse} label="Stock">
                  <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
                    {selected.estimatedStock} {selected.unit}
                  </Text>
                </DetailBox>
              </View>

              <DetailBox icon={Truck} label="Supplier">
                <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                  {selected.supplierNames || "No supplier on file"}
                </Text>
              </DetailBox>
            </ScrollView>
          ) : (
            <View style={{ gap: space.md, minHeight: 0, flexShrink: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text style={{ flex: 1, fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink, minWidth: 0 }}>
                  Price inquiry
                </Text>
                <IconButton icon={X} label="Close price inquiry" onPress={close} />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  borderWidth: 1,
                  borderColor: color.border,
                  borderRadius: radius.md,
                  paddingHorizontal: space.sm,
                }}
              >
                <Search size={16} color={color.inkMuted} />
                <TextInput
                  autoFocus
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search name, SKU or barcode…"
                  placeholderTextColor={color.inkMuted}
                  style={{ flex: 1, paddingVertical: space.sm, fontSize: fontSize.body, color: color.ink }}
                />
              </View>

              {loading ? (
                <ActivityIndicator color={color.primary} style={{ paddingVertical: space.xl }} />
              ) : query.trim() && results.length === 0 ? (
                <Text style={{ textAlign: "center", color: color.inkMuted, paddingVertical: space.xl }}>
                  Nothing matches &quot;{query.trim()}&quot;.
                </Text>
              ) : results.length > 0 ? (
                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: compact ? 280 : 360, flexGrow: 0 }}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => setSelected(item)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: space.sm,
                        paddingVertical: space.sm,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1, minWidth: 0 }}>
                        <ResultThumbnail photoUrl={item.photoUrl} size={36} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                            {item.name}
                          </Text>
                          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                            {item.sku ?? "No SKU"}
                          </Text>
                        </View>
                      </View>
                      <Money value={item.price} style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }} />
                    </Pressable>
                  )}
                />
              ) : (
                <Text style={{ textAlign: "center", color: color.inkMuted, paddingVertical: space.xl }}>
                  Search by name, SKU or barcode to see its price.
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
