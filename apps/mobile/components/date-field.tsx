import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { CalendarDays, type LucideIcon } from "lucide-react-native";
import { parseIsoDateString, toIsoDateString } from "@/lib/date";
import { Button } from "@/components/ui";
import { color, fontSize, radius, space } from "@/theme";

/**
 * Native date picker, controlled by a plain YYYY-MM-DD string in and out —
 * same contract the rest of a form (and the server) already use, so nothing
 * downstream has to know this isn't a typed field.
 *
 * Android's picker is its own OS dialog (DateTimePickerAndroid.open), fired
 * imperatively on tap — nothing stays mounted. iOS has no equivalent
 * imperative API, so `open`/`onOpen`/`onClose` toggle an inline spinner
 * under the trigger instead.
 */
export function DateField({
  label,
  value,
  onChange,
  open,
  onOpen,
  onClose,
  icon: Icon = CalendarDays,
  minimumDate,
  maximumDate,
  required = false,
}: {
  label: string;
  /** YYYY-MM-DD, or "" for unset. */
  value: string;
  onChange: (next: string) => void;
  /** iOS only — see comment above. Android ignores this. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  icon?: LucideIcon;
  minimumDate?: Date;
  maximumDate?: Date;
  required?: boolean;
}) {
  const selected = parseIsoDateString(value);

  function handlePress() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: selected ?? new Date(),
        mode: "date",
        minimumDate,
        maximumDate,
        onChange: (_event, next) => {
          if (next) onChange(toIsoDateString(next));
        },
      });
      return;
    }
    onOpen();
  }

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Icon size={14} color={color.inkMuted} strokeWidth={2} />
        <Text style={{ fontSize: fontSize.body, fontWeight: "600" }}>{label}</Text>
      </View>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${label}${required ? "" : ", optional"}${selected ? `, ${value}` : ""}`}
        style={{
          minHeight: 52,
          justifyContent: "center",
          borderWidth: 1,
          borderColor: value.trim() ? color.primary : color.border,
          borderRadius: radius.sm,
          backgroundColor: value.trim() ? color.primaryTint : color.surface,
          paddingHorizontal: space.md,
        }}
      >
        <Text style={{ fontSize: fontSize.bodyLg, color: value ? color.ink : color.inkMuted }}>
          {value || "Select a date"}
        </Text>
      </Pressable>
      {Platform.OS === "ios" && open ? (
        <DateTimePicker
          value={selected ?? new Date()}
          mode="date"
          display="spinner"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_event, next) => {
            if (next) onChange(toIsoDateString(next));
          }}
        />
      ) : null}
      {Platform.OS === "ios" && open ? (
        <Button label="Done" variant="secondary" onPress={onClose} />
      ) : null}
    </View>
  );
}
