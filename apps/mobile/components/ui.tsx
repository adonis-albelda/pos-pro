import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  Dot,
  type LucideIcon,
} from "lucide-react-native";
import { formatMoney } from "@double-a/shared-types";
import { circleRadius, color, fontSize, MIN_TAP_TARGET, radius, space, styles } from "@/theme";

type ButtonVariant = "primary" | "secondary" | "accent" | "danger";

/**
 * Functions, not module-level `Record<...>` constants — a plain object built
 * at import time would read `color.primary` etc. exactly once, before the
 * Theme menu's pick has necessarily loaded, and then never again: `color` is
 * a live Proxy (theme.ts) meant to be read fresh on every use, and a
 * module-level object can't do that. Same bug class theme.ts's own `styles`
 * had before it stopped using `StyleSheet.create` at the module top level.
 */
function buttonFill(variant: ButtonVariant): string {
  const fills: Record<ButtonVariant, string> = {
    primary: color.primary,
    secondary: color.primaryTint,
    accent: color.accent,
    danger: color.danger,
  };
  return fills[variant];
}

function buttonText(variant: ButtonVariant): string {
  const texts: Record<ButtonVariant, string> = {
    primary: color.onPrimary,
    secondary: color.primary,
    accent: color.ink,
    danger: color.onPrimary,
  };
  return texts[variant];
}

/** Secondary is the only variant that carries a border, tinted to match its ink. */
function buttonBorder(variant: ButtonVariant): string {
  const borders: Record<ButtonVariant, string> = {
    primary: "transparent",
    secondary: color.primarySoft,
    accent: "transparent",
    danger: "transparent",
  };
  return borders[variant];
}

/**
 * Tap targets are 48dp minimum, 56 for primary actions — cashiers move fast and
 * often one-handed. Pressed state dims the fill rather than animating, so the
 * feedback lands on the first frame.
 */
export function Button({
  label,
  variant = "primary",
  large,
  icon: Icon,
  busy,
  style,
  disabled,
  ...props
}: PressableProps & {
  label: string;
  variant?: ButtonVariant;
  large?: boolean;
  icon?: LucideIcon;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tint = buttonText(variant);
  const iconSize = large ? 20 : 18;

  return (
    <Pressable
      {...props}
      disabled={disabled ?? busy}
      style={({ pressed }) => [
        {
          minHeight: large ? 56 : MIN_TAP_TARGET,
          flexDirection: "row",
          gap: space.sm,
          paddingHorizontal: space.lg,
          borderRadius: radius.sm,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: buttonFill(variant),
          borderWidth: variant === "secondary" ? 1 : 0,
          borderColor: buttonBorder(variant),
          opacity: (disabled ?? busy) ? 0.5 : pressed ? 0.82 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tint} />
      ) : Icon ? (
        <Icon size={iconSize} color={tint} strokeWidth={2} />
      ) : null}
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          color: tint,
          fontSize: large ? fontSize.bodyLg : fontSize.body,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Square icon-only control, for steppers and toolbar-style actions. */
export function IconButton({
  icon: Icon,
  label,
  tone = "neutral",
  size = MIN_TAP_TARGET,
  style,
  disabled,
  ...props
}: PressableProps & {
  icon: LucideIcon;
  label: string;
  tone?: "neutral" | "primary" | "danger";
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const tint =
    tone === "primary" ? color.primary : tone === "danger" ? color.dangerInk : color.ink;

  // The fill carries the same meaning as the icon, so a glance at the control is
  // enough on a bright shop floor.
  const fill =
    tone === "primary"
      ? color.primarySoft
      : tone === "danger"
        ? color.dangerSoft
        : color.paper;

  return (
    <Pressable
      {...props}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: tone === "neutral" ? color.border : "transparent",
          backgroundColor: pressed ? color.border : fill,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <Icon size={20} color={tint} strokeWidth={2.25} />
    </Pressable>
  );
}

export function Card({
  children,
  style,
  tinted,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tinted?: boolean;
}) {
  return (
    <View style={[tinted ? styles.cardTinted : styles.card, { padding: space.lg }, style]}>
      {children}
    </View>
  );
}

/** Card and screen titles carry an icon so a glance is enough to place them. */
export function SectionTitle({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={[styles.iconWell, { width: 34, height: 34 }]}>
        <Icon size={18} color={color.primary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.subheading}>{title}</Text>
        {hint ? (
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            {hint}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

type BadgeTone = "success" | "warning" | "danger" | "neutral";

// Functions, not module-level constants — see buttonFill's own comment
// above for why: "neutral" reads color.primary/primarySoft, which the Theme
// menu can change, and a plain object built at import time would freeze
// whatever that was on first load.
function badgeFill(tone: BadgeTone): string {
  const fills: Record<BadgeTone, string> = {
    success: color.successSoft,
    warning: color.warningSoft,
    danger: color.dangerSoft,
    neutral: color.primarySoft,
  };
  return fills[tone];
}

function badgeInk(tone: BadgeTone): string {
  const inks: Record<BadgeTone, string> = {
    success: color.successInk,
    warning: color.warningInk,
    danger: color.dangerInk,
    neutral: color.primary,
  };
  return inks[tone];
}

/** Colour is never the only signal: every badge carries an icon and a label. */
const BADGE_ICON: Record<BadgeTone, LucideIcon> = {
  success: Check,
  warning: AlertTriangle,
  danger: CircleAlert,
  neutral: Dot,
};

export function Badge({
  tone = "neutral",
  label,
  icon,
}: {
  tone?: BadgeTone;
  label: string;
  icon?: LucideIcon;
}) {
  const Icon = icon ?? BADGE_ICON[tone];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        alignSelf: "flex-start",
        paddingHorizontal: space.sm,
        paddingVertical: 3,
        borderRadius: radius.sm,
        backgroundColor: badgeFill(tone),
      }}
    >
      <Icon size={13} color={badgeInk(tone)} strokeWidth={2.5} />
      <Text
        style={{ color: badgeInk(tone), fontSize: fontSize.caption, fontWeight: "600" }}
      >
        {label}
      </Text>
    </View>
  );
}

/** The signature divider. Only at real boundaries in the data. */
export function LedgerLine({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.ledgerLine, { marginVertical: space.md }, style]} />;
}

export function Money({
  value,
  style,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.numeric, style]}>{formatMoney(value)}</Text>;
}

export function EmptyState({
  icon: Icon,
  title,
  instruction,
}: {
  icon?: LucideIcon;
  title: string;
  instruction: string;
}) {
  return (
    <View style={{ padding: space["2xl"], alignItems: "center", gap: space.sm }}>
      {Icon ? (
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: circleRadius(60),
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: color.primarySoft,
            backgroundColor: color.primaryTint,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: space.xs,
          }}
        >
          <Icon size={24} color={color.primary} strokeWidth={1.75} />
        </View>
      ) : null}
      <Text style={styles.subheading}>{title}</Text>
      <Text style={[styles.muted, { textAlign: "center" }]}>{instruction}</Text>
    </View>
  );
}

function Note({
  icon: Icon,
  tint,
  background,
  children,
}: {
  icon: LucideIcon;
  tint: string;
  background: string;
  children: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: space.sm,
        borderWidth: 1,
        borderColor: tint,
        backgroundColor: background,
        borderRadius: radius.sm,
        padding: space.md,
      }}
    >
      <Icon size={18} color={tint} strokeWidth={2} />
      <Text style={{ color: tint, fontSize: fontSize.body, flex: 1 }}>{children}</Text>
    </View>
  );
}

export function ErrorNote({ children }: { children: string }) {
  return (
    <Note icon={CircleAlert} tint={color.dangerInk} background={color.dangerSoft}>
      {children}
    </Note>
  );
}

export function SuccessNote({ children }: { children: string }) {
  return (
    <Note icon={Check} tint={color.successInk} background={color.successSoft}>
      {children}
    </Note>
  );
}

/**
 * An amber-tinted aside. Used where a sale still goes through but the office
 * needs to know — never for anything the cashier has to act on now.
 */
export function WarningNote({ children }: { children: string }) {
  return (
    <Note icon={AlertTriangle} tint={color.warningInk} background={color.warningSoft}>
      {children}
    </Note>
  );
}

/**
 * A labelled figure — today's revenue, an item count. Tinted well plus tabular
 * figures so a row of them scans like a column on a receipt.
 */
export function Stat({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "neutral" | "primary" | "accent";
}) {
  const tint =
    tone === "primary" ? color.primary : tone === "accent" ? color.accentInk : color.ink;
  const fill =
    tone === "primary"
      ? color.primaryTint
      : tone === "accent"
        ? color.accentSoft
        : color.paper;

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        gap: space.xs,
        padding: space.md,
        borderRadius: radius.sm,
        backgroundColor: fill,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Icon size={13} color={tint} strokeWidth={2.5} />
        <Text numberOfLines={1} style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
          {label}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          styles.numeric,
          { fontSize: fontSize.headingSm, fontWeight: "700", color: tint },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
