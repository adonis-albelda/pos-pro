import { Modal, Text, View } from "react-native";
import { CloudDownload } from "lucide-react-native";
import { useSync } from "@/sync/sync-provider";
import { circleRadius, color, fontSize, radius, space } from "@/theme";

/**
 * Mounted once at the app root (app/_layout.tsx) so it shows over whichever
 * screen actually triggered the pull — the Sync tab's three actions, the
 * unlock screen's Refresh, the store header's sync chip, all funnel through
 * the same `pullProgress` state in sync-provider.tsx.
 *
 * The percentage is real, not simulated: sync/pull.ts weights the network
 * fetch as a flat slice (there is no byte-level signal for one HTTP round
 * trip) and the rest proportional to rows actually written to SQLite.
 */
export function PullProgressModal() {
  const { pullProgress, message } = useSync();

  if (pullProgress === null) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: `${color.ink}99`,
          padding: space.xl,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 340,
            backgroundColor: color.surface,
            borderRadius: radius.lg,
            padding: space.xl,
            gap: space.md,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: circleRadius(56),
              backgroundColor: color.primarySoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CloudDownload size={26} color={color.primary} strokeWidth={2} />
          </View>

          <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
            {message || "Fetching latest data..."}
          </Text>

          <View
            style={{
              width: "100%",
              height: 10,
              borderRadius: 5,
              backgroundColor: color.primarySoft,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${pullProgress}%`,
                height: "100%",
                borderRadius: 5,
                backgroundColor: color.primary,
              }}
            />
          </View>

          <Text
            style={{
              fontSize: fontSize.headingSm,
              fontWeight: "700",
              color: color.primary,
              fontVariant: ["tabular-nums"],
            }}
          >
            {pullProgress}%
          </Text>
        </View>
      </View>
    </Modal>
  );
}
