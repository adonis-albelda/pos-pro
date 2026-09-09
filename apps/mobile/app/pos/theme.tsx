import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Check,
  Cloud,
  Droplets,
  Flame,
  Grid3x3,
  Image as ImageIcon,
  Layers,
  Palette,
  Square,
  SquareStack,
  Type,
} from "lucide-react-native";
import { useLayout } from "@/lib/layout";
import {
  THEME_COLOR_PRESETS,
  resolvePrimaryPalette,
  setBackgroundEffect,
  setCardDisplayStyle,
  setProductViewMode,
  setRadiusStyle,
  setThemeColorId,
  useThemePreferences,
  type BackgroundEffect,
  type CardDisplayStyle,
  type ProductViewMode,
  type RadiusStyle,
  type ThemeColorId,
} from "@/lib/theme-preferences";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { Card, SectionTitle } from "@/components/ui";
import { color, fontSize, radius, space, styles } from "@/theme";

const RADIUS_OPTIONS: { id: RadiusStyle; label: string; hint: string }[] = [
  { id: "flat", label: "Flat", hint: "No rounding" },
  { id: "reduced", label: "Reduced", hint: "Subtle rounding" },
  { id: "full", label: "Rounded", hint: "Today's look" },
];

const BACKGROUND_OPTIONS: { id: BackgroundEffect; label: string; icon: typeof Cloud }[] = [
  { id: "none", label: "None", icon: Square },
  { id: "bubbles", label: "Bubbles", icon: Cloud },
  { id: "rain", label: "Rain", icon: Droplets },
  { id: "fire", label: "Fire", icon: Flame },
];

const CARD_DISPLAY_OPTIONS: {
  id: CardDisplayStyle;
  label: string;
  description: string;
  icon: typeof Type;
}[] = [
  { id: "text", label: "Text only", description: "Name, price, and stock — no thumbnail.", icon: Type },
  {
    id: "image-text",
    label: "Image + text",
    description: "Today's look: a small thumbnail beside the name.",
    icon: ImageIcon,
  },
  {
    id: "image-dominant",
    label: "Image dominant",
    description: "The photo fills the card; only the name overlays it.",
    icon: ImageIcon,
  },
];

/**
 * The Theme menu (item 4) — appearance and a couple of behavior choices,
 * all persisted on-device (lib/theme-preferences.ts) and applied live via
 * theme.ts's color/radius/styles Proxies plus the root-remount effect in
 * app/_layout.tsx. Nothing here touches Supabase; this is purely local to
 * this terminal, same spirit as the Bluetooth printer pairing on
 * pos/settings.tsx.
 */
export default function ThemeScreen() {
  const layout = useLayout();
  const prefs = useThemePreferences();

  return (
    <View style={styles.screen}>
      <WaveBackdrop />
      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          gap: space.lg,
          width: "100%",
          maxWidth: layout.readableMaxWidth,
          alignSelf: "center",
        }}
      >
        <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
          <SectionTitle icon={SquareStack} title="Corners" hint="Applies across buttons, tiles, and cards." />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {RADIUS_OPTIONS.map((option) => (
              <RadiusOptionCard
                key={option.id}
                option={option}
                active={prefs.radiusStyle === option.id}
                onPress={() => void setRadiusStyle(option.id)}
              />
            ))}
          </View>
        </Card>

        <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
          <SectionTitle icon={Palette} title="Color" hint="The brand color used across headers, buttons, and highlights." />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {(Object.keys(THEME_COLOR_PRESETS) as ThemeColorId[]).map((id) => (
              <ColorSwatch
                key={id}
                id={id}
                active={prefs.colorId === id}
                onPress={() => void setThemeColorId(id)}
              />
            ))}
          </View>
        </Card>

        <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
          <SectionTitle
            icon={Grid3x3}
            title="Sell grid"
            hint="How products with variants (size, color, etc.) appear in the grid."
          />
          <ViewModeOption
            id="product"
            label="By product"
            description="One tile per product. Picking one with 2+ variants asks which; a single variant is added straight away."
            icon={Layers}
            active={prefs.productViewMode === "product"}
            onPress={() => void setProductViewMode("product")}
          />
          <ViewModeOption
            id="variant"
            label="By variant"
            description="Every variant gets its own tile (e.g. Shirt — Red, M and Shirt — Red, L side by side) — one tap adds it, no picker."
            icon={Grid3x3}
            active={prefs.productViewMode === "variant"}
            onPress={() => void setProductViewMode("variant")}
          />
        </Card>

        <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
          <SectionTitle
            icon={ImageIcon}
            title="Product cards"
            hint="How each tile in the sell grid presents a product."
          />
          {CARD_DISPLAY_OPTIONS.map((option) => (
            <ViewModeOption
              key={option.id}
              id={option.id}
              label={option.label}
              description={option.description}
              icon={option.icon}
              active={prefs.cardDisplayStyle === option.id}
              onPress={() => void setCardDisplayStyle(option.id)}
            />
          ))}
        </Card>

        <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
          <SectionTitle
            icon={Cloud}
            title="Background effect"
            hint="A subtle looping decoration behind every screen. Purely visual."
          />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {BACKGROUND_OPTIONS.map((option) => (
              <BackgroundOptionCard
                key={option.id}
                option={option}
                active={prefs.backgroundEffect === option.id}
                onPress={() => void setBackgroundEffect(option.id)}
              />
            ))}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function RadiusOptionCard({
  option,
  active,
  onPress,
}: {
  option: { id: RadiusStyle; label: string; hint: string };
  active: boolean;
  onPress: () => void;
}) {
  const previewRadius = { flat: 0, reduced: 6, full: 14 }[option.id];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${option.label} corners${active ? ", selected" : ""}`}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: "center",
        gap: space.xs,
        paddingVertical: space.md,
        borderRadius: radius.sm,
        borderWidth: active ? 2 : 1,
        borderColor: active ? color.primary : color.border,
        backgroundColor: active ? color.primaryTint : color.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: previewRadius,
          backgroundColor: color.primary,
        }}
      />
      <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>
        {option.label}
      </Text>
      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>{option.hint}</Text>
    </Pressable>
  );
}

function ColorSwatch({
  id,
  active,
  onPress,
}: {
  id: ThemeColorId;
  active: boolean;
  onPress: () => void;
}) {
  const preset = THEME_COLOR_PRESETS[id];
  const palette = resolvePrimaryPalette(id);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${preset.label}${active ? ", selected" : ""}`}
      style={({ pressed }) => ({ alignItems: "center", gap: space.xs, width: 68, opacity: pressed ? 0.85 : 1 })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: palette.primary,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: active ? 3 : 0,
          borderColor: color.ink,
        }}
      >
        {active ? <Check size={18} color={palette.onPrimary} strokeWidth={3} /> : null}
      </View>
      <Text numberOfLines={1} style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
        {preset.label}
      </Text>
    </Pressable>
  );
}

/** Shared by the Sell grid and Product cards sections — an id-labeled row with a description, used generically enough that `id` itself is never read here (each call site's own onPress already knows what to set). */
function ViewModeOption({
  label,
  description,
  icon: Icon,
  active,
  onPress,
}: {
  id: ProductViewMode | CardDisplayStyle;
  label: string;
  description: string;
  icon: typeof Grid3x3;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}${active ? ", selected" : ""}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: space.md,
        padding: space.md,
        borderRadius: radius.sm,
        borderWidth: active ? 2 : 1,
        borderColor: active ? color.primary : color.border,
        backgroundColor: active ? color.primaryTint : color.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={[styles.iconWell, { width: 36, height: 36 }]}>
        <Icon size={18} color={color.primary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>
          {label}
        </Text>
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>{description}</Text>
      </View>
      {active ? <Check size={18} color={color.primary} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

function BackgroundOptionCard({
  option,
  active,
  onPress,
}: {
  option: { id: BackgroundEffect; label: string; icon: typeof Cloud };
  active: boolean;
  onPress: () => void;
}) {
  const Icon = option.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${option.label}${active ? ", selected" : ""}`}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: "center",
        gap: space.xs,
        paddingVertical: space.md,
        borderRadius: radius.sm,
        borderWidth: active ? 2 : 1,
        borderColor: active ? color.primary : color.border,
        backgroundColor: active ? color.primaryTint : color.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon size={20} color={active ? color.primary : color.inkMuted} strokeWidth={2} />
      <Text
        style={{
          fontSize: fontSize.caption,
          fontWeight: "700",
          color: active ? color.primary : color.ink,
        }}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}
