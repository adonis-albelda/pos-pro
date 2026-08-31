import { useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Minus, Package, Tag, Trash2, Truck, X } from "lucide-react-native";
import { formatMoney, stockLevel, type ProductWithEstimatedStock } from "@double-a/shared-types";
import { color, fontSize, radius, space, styles } from "@/theme";
import { BottomSheet } from "./bottom-sheet";
import { Badge, IconButton } from "./ui";

export function ProductTile({
  product,
  inCart,
  compact = false,
  minHeight,
  /** Same token as the sell-screen gutter — card inset matches page padding. */
  padding = space.sm,
  onPress,
  onRemove,
  onHoldRemove,
  onHoldView,
}: {
  product: ProductWithEstimatedStock;
  inCart: number;
  compact?: boolean;
  minHeight?: number;
  padding?: number;
  onPress: () => void;
  onRemove: () => void;
  /** Holding a tile already in the cart drops the whole line, with confirmation. */
  onHoldRemove: () => void;
  /** Holding a tile not yet in the cart opens the full name/description/supplier detail sheet. */
  onHoldView: () => void;
}) {
  // Per product, not one shop-wide number: a box of screws and a length of GI
  // pipe run out at very different counts.
  const level = stockLevel(product.estimatedStock, product.reorderPoint);
  const outOfStock = product.estimatedStock <= 0;
  const inCartNow = inCart > 0;
  const unitSuffix = product.unit === "pc" ? "" : ` ${product.unit}`;
  // At one, taking one off drops the line entirely, so the control says so.
  const RemoveIcon = inCart === 1 ? Trash2 : Minus;

  // Manual hold timer, same reason as the cart row: Pressable's built-in
  // onLongPress can misfire as a child of a FlatList row. didHold suppresses
  // the trailing onPress (add-to-cart) once the hold has already removed it.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHold = useRef(false);

  function clearHoldTimer() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  return (
    <Pressable
      onPressIn={() => {
        clearHoldTimer();
        didHold.current = false;
        holdTimer.current = setTimeout(() => {
          didHold.current = true;
          if (inCartNow) {
            onHoldRemove();
          } else {
            onHoldView();
          }
        }, 500);
      }}
      onPressOut={clearHoldTimer}
      onPress={() => {
        if (didHold.current) {
          didHold.current = false;
          return;
        }
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={
        inCartNow
          ? `${product.name}, hold to remove from cart`
          : `${product.name}, hold for details`
      }
      style={({ pressed }) => [
        styles.card,
        {
          flex: 1,
          minHeight: minHeight ?? (compact ? 96 : 112),
          padding,
          justifyContent: "space-between",
          // A tile already in the cart is filled, not just outlined — the state
          // has to survive a glance across a counter.
          borderColor: inCartNow ? color.primary : color.border,
          borderWidth: inCartNow ? 2 : 1,
          backgroundColor: pressed
            ? color.primarySoft
            : inCartNow
              ? color.primaryTint
              : color.surface,
          opacity: outOfStock ? 0.7 : 1,
        },
      ]}
    >
      <View style={{ gap: space.xs }}>
        {/* On a phone the tile is too narrow to carry the icon and still leave
            room for a readable product name, so the icon is dropped there. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
          {compact ? (
            product.photoUrl ? (
              <Image
                source={{ uri: product.photoUrl }}
                style={{ width: 22, height: 22, borderRadius: radius.sm }}
                contentFit="cover"
                cachePolicy="disk"
              />
            ) : null
          ) : product.photoUrl ? (
            <Image
              source={{ uri: product.photoUrl }}
              style={{ width: 30, height: 30, borderRadius: radius.sm }}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            <View style={[styles.iconWell, { width: 30, height: 30 }]}>
              <Package size={15} color={color.primary} strokeWidth={2} />
            </View>
          )}
          <Text
            numberOfLines={2}
            style={{
              flex: 1,
              fontSize: compact ? fontSize.body : fontSize.bodyLg,
              fontWeight: "600",
              color: color.ink,
              lineHeight: compact ? 18 : 22,
            }}
          >
            {product.name}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.price,
              { fontSize: compact ? fontSize.bodyLg : fontSize.headingSm },
            ]}
          >
            {formatMoney(product.price)}
          </Text>
          {/* Wire sells by the metre and cement by the bag, so the unit belongs
              beside the price. A piece needs no saying. */}
          {product.unit === "pc" ? null : (
            <Text
              numberOfLines={1}
              style={{ fontSize: fontSize.caption, color: color.inkMuted }}
            >
              /{product.unit}
            </Text>
          )}
        </View>

        {/* The contractor price, where there is room to say it. */}
        {!compact && product.bulkPrice !== null && product.bulkMinQuantity !== null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Tag size={12} color={color.accentInk} strokeWidth={2.5} />
            <Text
              numberOfLines={1}
              style={[
                styles.numeric,
                { fontSize: fontSize.caption, color: color.accentInk },
              ]}
            >
              {formatMoney(product.bulkPrice)} from {product.bulkMinQuantity}{" "}
              {product.unit}
            </Text>
          </View>
        ) : null}
      </View>

      {/*
        No flexWrap here on purpose — with it, adding the last item's "N in
        cart" pill on the right could push this row past the tile's width
        and wrap onto a second line, growing the tile's height and shoving
        every tile after it in the grid. The stock indicator on the left
        shrinks/truncates instead, so this row is always exactly one line
        and the tile's height never changes between empty-cart and in-cart.
      */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          marginTop: space.xs,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {level === "out" ? (
            <Badge tone="danger" label="Out of stock" />
          ) : level === "low" ? (
            <Badge tone="warning" label={`${product.estimatedStock}${unitSuffix} left`} />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: color.success,
                }}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.numeric,
                  { flexShrink: 1, fontSize: fontSize.caption, color: color.inkMuted },
                ]}
              >
                {product.estimatedStock}
                {unitSuffix} in stock
              </Text>
            </View>
          )}
        </View>

        {/* The count doubles as the take-one-off control: the whole tile adds,
            this corner of it subtracts. Nested Pressable, so a hit here never
            reaches the tile underneath and turns a removal into an addition. */}
        {inCartNow ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={
              inCart === 1
                ? `Remove ${product.name} from cart`
                : `Take one ${product.name} off the cart, ${inCart} on it`
            }
            hitSlop={space.sm}
            style={({ pressed }) => ({
              marginLeft: "auto",
              flexDirection: "row",
              alignItems: "center",
              gap: space.xs,
              minHeight: 32,
              backgroundColor: pressed ? color.primaryDark : color.primary,
              borderRadius: radius.sm,
              paddingHorizontal: space.sm,
              paddingVertical: space.xs,
            })}
          >
            <RemoveIcon size={14} color={color.onPrimary} strokeWidth={2.5} />
            <Text
              style={{
                color: color.onPrimary,
                fontSize: fontSize.caption,
                fontWeight: "700",
              }}
            >
              {compact ? inCart : `${inCart} in cart`}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Holding a tile that isn't in the cart opens this — the tile itself
 * truncates the name to two lines and never shows a description at all.
 */
export function ProductDetailSheet({
  product,
  onClose,
}: {
  product: ProductWithEstimatedStock | null;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={product !== null} onClose={onClose} scroll={false}>
      {product ? (
        <View style={{ gap: space.md }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: space.sm,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm, flex: 1 }}>
              {product.photoUrl ? (
                <Image
                  source={{ uri: product.photoUrl }}
                  style={{ width: 44, height: 44, borderRadius: radius.sm }}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={[styles.iconWell, { width: 44, height: 44 }]}>
                  <Package size={20} color={color.primary} strokeWidth={2} />
                </View>
              )}
              <Text
                style={{
                  flex: 1,
                  fontSize: fontSize.headingSm,
                  fontWeight: "700",
                  color: color.ink,
                }}
              >
                {product.name}
              </Text>
            </View>
            <IconButton icon={X} label="Close" onPress={onClose} />
          </View>

          {product.sku ? (
            <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
              SKU: {product.sku}
            </Text>
          ) : null}

          {product.isBundle ? <Badge tone="neutral" label="Bundle" /> : null}

          <Text
            style={[
              styles.price,
              { fontSize: fontSize.headingSm },
            ]}
          >
            {formatMoney(product.price)}
            {product.unit === "pc" ? "" : ` / ${product.unit}`}
          </Text>

          {product.description ? (
            <View style={{ gap: space.xs }}>
              <Text
                style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.inkMuted }}
              >
                Description
              </Text>
              <Text style={{ fontSize: fontSize.body, color: color.ink, lineHeight: 20 }}>
                {product.description}
              </Text>
            </View>
          ) : null}

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.xs,
              paddingTop: space.xs,
              borderTopWidth: 1,
              borderTopColor: color.border,
            }}
          >
            <Truck size={14} color={color.inkMuted} strokeWidth={2} />
            <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, flex: 1 }}>
              {product.supplierNames || "No supplier on file"}
            </Text>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}
