import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PIN_LENGTH_MAX, PIN_LENGTH_MIN } from "@double-a/shared-types";
import { Check, Delete } from "lucide-react-native";
import { useSession } from "@/lib/session";
import { Button, ErrorNote } from "@/components/ui";
import { circleRadius, color, fontSize, radius, space } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as app/unlock.tsx; no *.png module declaration in this project
const PIN_ICON = require("../assets/password-protection.webp");

/**
 * Re-lock, not first unlock — idle timeout / backgrounding (lib/idle-lock.ts)
 * sets `locked` without touching `cashier` (lib/session.tsx), so this
 * re-prompts the SAME person's PIN in place over whatever screen was already
 * showing, instead of bouncing the whole app back to /unlock's full cashier
 * picker (a jarring "auto exit" for something that isn't a new shift).
 * "Switch account" is the escape hatch to that picker for the rare case a
 * different cashier is actually taking over.
 *
 * Renders nothing when not locked — mount unconditionally in a layout
 * (app/pos/_layout.tsx, app/admin/_layout.tsx) right after the screen
 * content it should sit on top of.
 */
export function PinRelockOverlay() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cashier, locked, unlock } = useSession();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!locked || !cashier) return null;

  async function submit() {
    if (!cashier) return;

    setBusy(true);
    setError(null);
    try {
      const result = await unlock(cashier, pin);

      if (result === "wrong-pin") {
        setPin("");
        setError("That PIN does not match. Try again.");
        return;
      }

      if (result === "terminal-not-authorized") {
        setPin("");
        setError(
          "This terminal's sign-in is no longer accepted. Set it up again from the admin account.",
        );
        return;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the server.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          justifyContent: "center",
          paddingHorizontal: space.lg,
          paddingTop: insets.top + space.md,
          paddingBottom: insets.bottom + space.md,
          backgroundColor: `${color.ink}99`,
          zIndex: 1000,
        },
      ]}
    >
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
        <View style={{ alignItems: "center", gap: space.sm }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: circleRadius(72),
              backgroundColor: color.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Image source={PIN_ICON} style={{ width: 44, height: 44 }} resizeMode="contain" />
          </View>
          <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
            Locked — {cashier.name}
          </Text>
          <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
            Enter your PIN to keep going.
          </Text>
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
                    disabled={busy}
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
                      <Text style={{ fontSize: fontSize.headingMd, fontWeight: "600", color: color.ink }}>
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
          label={busy ? "Checking..." : "Unlock"}
          large
          icon={Check}
          busy={busy}
          disabled={pin.length < PIN_LENGTH_MIN}
          onPress={() => void submit()}
        />

        <Pressable onPress={() => router.replace("/unlock")} disabled={busy}>
          <Text style={{ fontSize: fontSize.caption, color: color.primary, textAlign: "center" }}>
            Not you? Switch account
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
