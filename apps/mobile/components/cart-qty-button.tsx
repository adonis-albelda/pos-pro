import { Pressable } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { color, radius } from "@/theme";

/**
 * Standalone cart qty hit target — theme soft fill, no chrome border.
 * Plus and minus share the same primary wash so the pair reads as one control.
 * `radius.sm` tracks Theme → Corners (flat / reduced / rounded).
 */
export function CartQtyButton({
  icon: Icon,
  label,
  disabled = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.sm,
        opacity: disabled ? 0.4 : 1,
        backgroundColor: pressed && !disabled ? color.primaryTint : color.primarySoft,
      })}
    >
      <Icon size={18} color={color.primary} strokeWidth={2.25} />
    </Pressable>
  );
}
