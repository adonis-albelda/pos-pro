import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from "react-native-svg";
import { Minus, Package, Tag, Trash2, Truck, X } from "lucide-react-native";
import { formatMoney, stockLevel, type ProductWithEstimatedStock } from "@double-a/shared-types";
import { type FlyRect } from "@/lib/fly-to-cart";
import { useThemePreferences } from "@/lib/theme-preferences";
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
  /** Flagged by sync/sync-provider.tsx's justCreatedProductIds — a tile for a product that just arrived over realtime (as opposed to one loaded normally on mount/scroll) slides/fades in instead of just appearing. */
  justCreated = false,
  /**
   * Sell grid stagger index for the first screenful after a list reveal
   * (load / search / category). Omit / null = no enter (scroll recycle,
   * load-more rows). justCreated wins when both set.
   */
  enterIndex,
}: {
  product: ProductWithEstimatedStock;
  inCart: number;
  compact?: boolean;
  minHeight?: number;
  padding?: number;
  /** Passed this tile's own on-screen rect, measured at the moment of the tap — see lib/fly-to-cart.tsx. The caller decides whether an add actually happened and, if so, flies from it. */
  onPress: (sourceRect: FlyRect) => void;
  onRemove: () => void;
  /** Holding a tile already in the cart drops the whole line, with confirmation. */
  onHoldRemove: () => void;
  /** Holding a tile not yet in the cart opens the full name/description/supplier detail sheet. */
  onHoldView: () => void;
  justCreated?: boolean;
  enterIndex?: number | null;
}) {
  // Per product, not one shop-wide number: a box of screws and a length of GI
  // pipe run out at very different counts.
  const level = stockLevel(product.estimatedStock, product.reorderPoint);
  const outOfStock = product.estimatedStock <= 0;
  const inCartNow = inCart > 0;
  const unitSuffix = product.unit === "pc" ? "" : ` ${product.unit}`;
  // At one, taking one off drops the line entirely, so the control says so.
  const RemoveIcon = inCart === 1 ? Trash2 : Minus;
  // Theme menu (app/pos/theme.tsx) — "text" drops the thumbnail below,
  // "image-dominant" replaces this component's whole body with a full-bleed
  // photo, "image-text" is this file's original layout, untouched.
  // productLayout "row" (one per line) uses its own horizontal body instead.
  const { cardDisplayStyle, productLayout } = useThemePreferences();
  const rowLayout = productLayout === "row";
  const imageDominant = !rowLayout && cardDisplayStyle === "image-dominant";
  const showThumbnail = cardDisplayStyle !== "text";
  const tileMinHeight = minHeight ?? (compact ? 96 : 112);
  // Unique per mount — variant mode can show many tiles for one product.id,
  // and SVG gradient ids must not collide across the FlatList.
  const instanceId = useId().replace(/:/g, "");
  const gradId = `tile-${instanceId}`;

  // Manual hold timer, same reason as the cart row: Pressable's built-in
  // onLongPress can misfire as a child of a FlatList row. didHold suppresses
  // the trailing onPress (add-to-cart) once the hold has already removed it.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didHold = useRef(false);
  const tileRef = useRef<View>(null);

  function clearHoldTimer() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  const tile = (
    <Pressable
      ref={tileRef}
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
        tileRef.current?.measureInWindow((x, y, width, height) => {
          onPress({ x, y, width, height });
        });
      }}
      accessibilityRole="button"
      accessibilityLabel={
        inCartNow
          ? `${product.name}, hold to remove from cart`
          : `${product.name}, hold for details`
      }
      style={[
        styles.card,
        {
          flex: 1,
          minHeight: tileMinHeight,
          // Image-dominant still bleeds edge-to-edge. Row keeps card padding so
          // the thumb sits inset (left/top), not full-bleed height.
          padding: imageDominant ? 0 : padding,
          // Clip the theme gradient to the card radius.
          overflow: "hidden",
          flexDirection: rowLayout ? "row" : undefined,
          alignItems: rowLayout ? "center" : undefined,
          justifyContent: imageDominant || rowLayout ? undefined : "space-between",
          // A tile already in the cart is filled, not just outlined — the state
          // has to survive a glance across a counter.
          borderColor: inCartNow ? color.primary : color.border,
          borderWidth: inCartNow ? 2 : 1,
          // Gradient paints the fill; keep transparent so it shows through.
          backgroundColor: "transparent",
          opacity: outOfStock ? 0.7 : 1,
        },
      ]}
    >
      {({ pressed }) => (
        <>
          {/* Image-dominant is the photo itself — skip wash so it stays true. */}
          {imageDominant ? null : (
            <CardThemeGradient
              gradId={gradId}
              inCart={inCartNow}
              pressed={pressed}
            />
          )}
      {rowLayout ? (
        <RowLayoutBody
          product={product}
          level={level}
          unitSuffix={unitSuffix}
          showThumbnail={showThumbnail}
          compact={compact}
          imageSize={Math.max(64, tileMinHeight - padding * 2)}
          inCart={inCart}
          inCartNow={inCartNow}
          RemoveIcon={RemoveIcon}
          onRemove={onRemove}
        />
      ) : imageDominant ? (
        <ImageDominantBody
          product={product}
          inCartNow={inCartNow}
          inCart={inCart}
          RemoveIcon={RemoveIcon}
          onRemove={onRemove}
        />
      ) : (
        <>
      <View style={{ gap: space.xs }}>
        {/* On a phone the tile is too narrow to carry the icon and still leave
            room for a readable product name, so the icon is dropped there. */}
        {showThumbnail ? (
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
        ) : (
          // "Text only" (Theme menu) — no thumbnail, so the name needs its
          // own line instead of sharing a row with an icon.
          <Text
            numberOfLines={2}
            style={{
              fontSize: compact ? fontSize.body : fontSize.bodyLg,
              fontWeight: "600",
              color: color.ink,
              lineHeight: compact ? 18 : 22,
            }}
          >
            {product.name}
          </Text>
        )}
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
        No flexWrap here on purpose — with the pill gone from this row, the
        stock indicator is free to run the row's full width and simply
        truncate on a very long name/unit combination instead of wrapping
        the tile onto a second line.
      */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
          marginTop: space.xs,
          // Room for the qty pill pinned at the bottom-right corner below,
          // so a long "N in stock" line never runs underneath it.
          paddingRight: inCartNow ? 84 : 0,
        }}
      >
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
        </>
      )}
      {/* Pinned to the card's own bottom-right corner rather than sharing a
          row with the stock indicator — the count doubles as the
          take-one-off control: the whole tile adds, this corner subtracts.
          Nested Pressable, so a hit here never reaches the tile underneath
          and turns a removal into an addition. */}
      {!rowLayout && !imageDominant && inCartNow ? (
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
            position: "absolute",
            bottom: space.sm,
            right: space.sm,
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
        </>
      )}
    </Pressable>
  );

  // entering fires once on this Animated.View's mount. FlatList recycle /
  // scroll must not wrap, or every reused row replays the slide.
  //
  // Soft shade over the bottom half of the card face (not a full box shadow).
  // Overlay sits above the tile; pointerEvents none so taps still hit the
  // Pressable underneath.
  const floating = (
    <View
      style={{
        flex: 1,
        borderRadius: radius.lg,
        backgroundColor: color.surface,
        overflow: "hidden",
      }}
    >
      {tile}
      <BottomShade />
    </View>
  );

  if (justCreated) {
    return (
      <Animated.View entering={FadeInDown.springify().damping(16)} style={{ flex: 1 }}>
        {floating}
      </Animated.View>
    );
  }

  if (enterIndex != null) {
    return <TileEnter index={enterIndex}>{floating}</TileEnter>;
  }

  return floating;
}

/**
 * Alternate L→R / R→L slide on mount. Outer View owns flex layout so the cell
 * is always full width; presets like FadeInLeft left translateX stuck at -25
 * (~10% of a tile) when FlatList interrupted the entering animation.
 */
function TileEnter({ index, children }: { index: number; children: ReactNode }) {
  const slideMs = 100;
  const delay = Math.min(index, 11) * slideMs;
  const fromX = index % 2 === 0 ? -16 : 16;
  const tx = useSharedValue(fromX);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: slideMs }));
    tx.value = withDelay(delay, withTiming(0, { duration: slideMs }));
  }, [delay, opacity, tx]);

  const animStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: opacity.value,
    transform: [{ translateX: tx.value }],
  }));

  return (
    <View style={{ flex: 1, overflow: "hidden" }}>
      <Animated.View style={animStyle}>{children}</Animated.View>
    </View>
  );
}

/**
 * Soft dark wash dominant on the bottom half of a product tile — top stays
 * clean, bottom reads slightly lifted/shadowed. SVG same as CardThemeGradient
 * so we skip an extra native gradient module.
 */
function BottomShade() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const gradId = `tile-bottom-shade-${useId().replace(/:/g, "")}`;

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) {
          setSize({ w: width, h: height });
        }
      }}
      style={StyleSheet.absoluteFill}
    >
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <SvgLinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#000" stopOpacity="0" />
              <Stop offset="0.55" stopColor="#000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000" stopOpacity="0.07" />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${gradId})`} />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * Soft diagonal wash from the Theme menu primary — primarySoft/Tint into
 * surface. SVG, not expo-linear-gradient: keeps the native module set stable
 * (same reason as sage-backdrop.tsx).
 */
function CardThemeGradient({
  gradId,
  inCart,
  pressed,
}: {
  gradId: string;
  inCart: boolean;
  pressed: boolean;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const start = pressed || inCart ? color.primarySoft : color.primaryTint;
  const mid = inCart ? color.primarySoft : color.primaryTint;
  const end = color.surface;

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) {
          setSize({ w: width, h: height });
        }
      }}
      style={StyleSheet.absoluteFill}
    >
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <SvgLinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={start} />
              <Stop offset="0.55" stopColor={mid} />
              <Stop offset="1" stopColor={end} />
            </SvgLinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${gradId})`} />
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * Theme "Row" layout — inset square photo on the left (card padding keeps
 * left/top gap), details on the right, stock status pinned top-right.
 */
function RowLayoutBody({
  product,
  level,
  unitSuffix,
  showThumbnail,
  compact,
  imageSize,
  inCart,
  inCartNow,
  RemoveIcon,
  onRemove,
}: {
  product: ProductWithEstimatedStock;
  level: ReturnType<typeof stockLevel>;
  unitSuffix: string;
  showThumbnail: boolean;
  compact: boolean;
  imageSize: number;
  inCart: number;
  inCartNow: boolean;
  RemoveIcon: typeof Minus;
  onRemove: () => void;
}) {
  return (
    <>
      {showThumbnail ? (
        <View
          style={{
            width: imageSize,
            height: imageSize,
            marginRight: space.sm,
            borderRadius: radius.sm,
            overflow: "hidden",
            backgroundColor: color.primaryTint,
          }}
        >
          {product.photoUrl ? (
            <Image
              source={{ uri: product.photoUrl }}
              style={{ width: imageSize, height: imageSize }}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Package size={28} color={color.primary} strokeWidth={2} />
            </View>
          )}
        </View>
      ) : null}

      <View
        style={{
          flex: 1,
          minWidth: 0,
          // Room for top-right stock chip so name/price never collide with it.
          paddingRight: 96,
          justifyContent: "space-between",
          gap: space.xs,
          alignSelf: "stretch",
        }}
      >
        <View style={{ gap: space.xs }}>
          <Text
            numberOfLines={2}
            style={{
              fontSize: compact ? fontSize.body : fontSize.bodyLg,
              fontWeight: "600",
              color: color.ink,
              lineHeight: compact ? 18 : 22,
            }}
          >
            {product.name}
          </Text>
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
            {product.unit === "pc" ? null : (
              <Text
                numberOfLines={1}
                style={{ fontSize: fontSize.caption, color: color.inkMuted }}
              >
                /{product.unit}
              </Text>
            )}
          </View>
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
      </View>

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
            // Sibling of the text column — bottom-right corner of the row card.
            flexShrink: 0,
            alignSelf: "flex-end",
            marginLeft: space.xs,
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

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: space.sm,
          right: space.sm,
          zIndex: 1,
          maxWidth: "45%",
        }}
      >
        {level === "out" ? (
          <Badge tone="danger" label="Out of stock" />
        ) : level === "low" ? (
          <Text
            numberOfLines={1}
            style={[
              styles.numeric,
              {
                fontSize: fontSize.bodyLg,
                fontWeight: "700",
                color: color.warning,
              },
            ]}
          >
            {product.estimatedStock}
            {unitSuffix} left
          </Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: color.success,
              }}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.numeric,
                {
                  fontSize: fontSize.bodyLg,
                  fontWeight: "600",
                  color: color.inkMuted,
                },
              ]}
            >
              {product.estimatedStock}
              {unitSuffix} in stock
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

/**
 * "Image dominant" (Theme menu — lib/theme-preferences.ts's cardDisplayStyle):
 * the whole tile is the product photo, with only its name overlaid — no
 * price, no stock line, by explicit design. The in-cart "-" control stays
 * (dropping it would leave no way to correct a cart from the grid at all),
 * rendered as a plain icon button instead of the pill-with-count the other
 * two display styles use, since there is no room here to spell out
 * "N in cart" over a photo without crowding the name. A product with no
 * photo falls back to a solid brand-tint plate so the mode still reads as
 * "cards," not a broken image icon.
 */
function ImageDominantBody({
  product,
  inCartNow,
  inCart,
  RemoveIcon,
  onRemove,
}: {
  product: ProductWithEstimatedStock;
  inCartNow: boolean;
  inCart: number;
  RemoveIcon: typeof Minus;
  onRemove: () => void;
}) {
  const overlay = (
    <>
      {/* Flat scrim, not a gradient — no linear-gradient dependency in this
          app; solid + the name's own text shadow below keeps it legible over
          a bright photo without needing one. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: space.sm,
          paddingVertical: space.sm,
          backgroundColor: "rgba(0,0,0,0.45)",
          flexDirection: "row",
          alignItems: "center",
          gap: space.xs,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            flex: 1,
            fontSize: fontSize.body,
            fontWeight: "700",
            color: "#FFFFFF",
          }}
        >
          {product.name}
        </Text>
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
              width: 28,
              height: 28,
              borderRadius: radius.sm,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? color.primaryDark : color.primary,
            })}
          >
            <RemoveIcon size={14} color={color.onPrimary} strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </View>
      {inCartNow ? (
        <View
          style={{
            position: "absolute",
            top: space.xs,
            right: space.xs,
            minWidth: 22,
            height: 22,
            paddingHorizontal: 6,
            borderRadius: radius.sm,
            backgroundColor: color.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: color.onPrimary, fontSize: fontSize.caption, fontWeight: "700" }}>
            {inCart}
          </Text>
        </View>
      ) : null}
    </>
  );

  if (!product.photoUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: color.primarySoft, justifyContent: "flex-end" }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Package size={32} color={color.primary} strokeWidth={1.5} />
        </View>
        {overlay}
      </View>
    );
  }

  return (
    <ImageBackground
      source={{ uri: product.photoUrl }}
      resizeMode="cover"
      style={{ flex: 1, justifyContent: "flex-end" }}
    >
      {overlay}
    </ImageBackground>
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
