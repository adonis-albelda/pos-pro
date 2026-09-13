import { useEffect, useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PIN_LENGTH_MAX, PIN_LENGTH_MIN, type User } from "@double-a/shared-types";
import { Check, Delete, X } from "lucide-react-native";
import { verifyPin } from "@/lib/pin";
import { Button, ErrorNote } from "@/components/ui";
import { circleRadius, color, fontSize, radius, space } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as pin-relock-overlay; no *.png module declaration
const PIN_ICON = require("../assets/password-protection.webp");

/**
 * Confirms the selected employee's own PIN before clock-in / clock-out.
 * Does not call session.unlock — the on-shift cashier stays whoever unlocked
 * the terminal. verifyPin is identity proof for the punch only.
 */
export function AttendancePinSheet({
  open,
  user,
  action,
  busy,
  onClose,
  onConfirmed,
}: {
  open: boolean;
  user: User | null;
  /** Button label — "Time in" or "Time out". */
  action: "in" | "out";
  busy: boolean;
  onClose: () => void;
  onConfirmed: () => void | Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin("");
      setError(null);
      setChecking(false);
    }
  }, [open]);

  if (!open || !user) return null;

  const actionLabel = action === "in" ? "Time in" : "Time out";
  const submitting = checking || busy;

  async function submit() {
    if (!user) return;
    setChecking(true);
    setError(null);
    try {
      const outcome = await verifyPin(user.id, pin);
      if (outcome.result === "wrong-pin") {
        setPin("");
        setError("That PIN does not match. Try again.");
        return;
      }
      if (outcome.result === "terminal-not-authorized") {
        setPin("");
        setError(
          "This terminal's sign-in is no longer accepted. Set it up again from the admin account.",
        );
        return;
      }
      await onConfirmed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the server.");
      setPin("");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            justifyContent: "center",
            paddingHorizontal: space.lg,
            paddingTop: insets.top + space.md,
            paddingBottom: insets.bottom + space.md,
            backgroundColor: `${color.ink}99`,
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={submitting ? undefined : onClose} />
        <View
          style={{
            width: "100%",
            maxWidth: 400,
            alignSelf: "center",
            backgroundColor: color.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: color.borderSoft,
            padding: space.lg,
            gap: space.lg,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
            <View style={{ flex: 1, alignItems: "center", gap: space.sm }}>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: circleRadius(72),
                  backgroundColor: color.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {user.avatarUrl ? (
                  <Image
                    source={{ uri: user.avatarUrl }}
                    style={{ width: 72, height: 72 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Image source={PIN_ICON} style={{ width: 44, height: 44 }} resizeMode="contain" />
                )}
              </View>
              <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                {actionLabel} — {user.name}
              </Text>
              <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
                Enter their PIN to confirm.
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              disabled={submitting}
              accessibilityLabel="Close"
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
            >
              <X size={22} color={color.inkMuted} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: space.sm, justifyContent: "center" }}>
            {Array.from({ length: PIN_LENGTH_MAX }).map((_, index) => {
              const filled = index < pin.length;
              return (
                <View
                  key={index}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: radius.sm,
                    borderWidth: filled ? 0 : 1,
                    borderColor: index < PIN_LENGTH_MIN ? color.primarySoft : color.borderSoft,
                    backgroundColor: filled ? color.primary : "transparent",
                  }}
                />
              );
            })}
          </View>

          <View style={{ gap: space.sm }}>
            {[
              ["1", "2", "3"],
              ["4", "5", "6"],
              ["7", "8", "9"],
              ["", "0", "clear"],
            ].map((row) => (
              <View
                key={row.join()}
                style={{ flexDirection: "row", gap: space.lg, justifyContent: "center" }}
              >
                {row.map((key, i) => {
                  if (key === "") {
                    return <View key={`spacer-${i}`} style={{ width: 64, height: 64 }} />;
                  }
                  const isClear = key === "clear";
                  return (
                    <Pressable
                      key={key}
                      onPress={() => {
                        if (isClear) {
                          setPin("");
                          return;
                        }
                        if (pin.length < PIN_LENGTH_MAX) setPin(pin + key);
                      }}
                      disabled={submitting}
                      accessibilityLabel={isClear ? "Clear PIN" : key}
                      style={({ pressed }) => ({
                        width: 64,
                        height: 64,
                        borderRadius: circleRadius(64),
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: isClear ? color.dangerSoft : color.primarySoft,
                        backgroundColor: pressed
                          ? color.primarySoft
                          : isClear
                            ? color.dangerSoft
                            : color.paper,
                      })}
                    >
                      {isClear ? (
                        <Delete size={22} color={color.dangerInk} strokeWidth={2} />
                      ) : (
                        <Text
                          style={{
                            fontSize: fontSize.headingMd,
                            fontWeight: "600",
                            color: color.ink,
                          }}
                        >
                          {key}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button
            label={submitting ? "Working…" : actionLabel}
            large
            icon={Check}
            busy={submitting}
            disabled={pin.length < PIN_LENGTH_MIN || submitting}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </Modal>
  );
}
