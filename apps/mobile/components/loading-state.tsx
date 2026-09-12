import { ActivityIndicator, Image, Text, View } from "react-native";
import { color, fontSize, space } from "@/theme";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- same asset-require pattern as setup.tsx; no *.png module declaration in this project
const LOGO = require("../assets/logo.webp");

/**
 * The one full-screen loading state, everywhere a screen is waiting on its
 * first data before it has anything else to show — a page transition, a
 * pull, a query still pending. Not for an inline busy spinner inside an
 * already-visible screen (a button's own busy state, a pull-to-refresh
 * indicator) — those stay a plain ActivityIndicator; swapping every spinner
 * for a full logo screen would make quick, already-in-context waits feel
 * heavier than they are.
 */
export function LoadingState({ text = "Loading…" }: { text?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.md }}>
      <Image source={LOGO} style={{ width: 56, height: 56 }} resizeMode="contain" />
      <ActivityIndicator color={color.primary} />
      <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.inkMuted }}>
        {text}
      </Text>
    </View>
  );
}
