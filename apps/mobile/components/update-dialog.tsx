import { Linking, Modal, Pressable, Text, View } from "react-native";
import { DownloadCloud, Sparkles, X } from "lucide-react-native";
import type { AppVersion } from "@double-a/api-client/queries";
import type { UpdateStatus } from "@/lib/version-check";
import { Button } from "@/components/ui";
import { color, fontSize, radius, space, styles } from "@/theme";

/**
 * Force (status "force"): no dismiss, no scrim tap-out — the only way
 * forward is the download link. Optional ("optional"): dismissible, "Later"
 * queues nothing, it just checks again next boot.
 */
export function UpdateDialog({
  status,
  version,
  onDismiss,
}: {
  status: UpdateStatus;
  version: AppVersion | null;
  onDismiss: () => void;
}) {
  if (status === "none" || !version) return null;

  const forced = status === "force";

  function openDownload() {
    if (version?.downloadUrl) {
      void Linking.openURL(version.downloadUrl);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={forced ? undefined : onDismiss}>
      <View style={{ flex: 1, backgroundColor: "rgba(27, 31, 29, 0.55)", justifyContent: "center" }}>
        {forced ? null : (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
        )}

        <View
          style={{
            marginHorizontal: space.lg,
            padding: space.lg,
            borderRadius: radius.lg,
            backgroundColor: color.surface,
            gap: space.md,
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 16,
          }}
        >
          {forced ? null : (
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Later"
              style={[styles.tapTarget, { position: "absolute", top: space.xs, right: space.xs }]}
            >
              <X size={20} color={color.inkMuted} strokeWidth={2} />
            </Pressable>
          )}

          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: forced ? color.dangerSoft : color.primarySoft,
            }}
          >
            {forced ? (
              <DownloadCloud size={24} color={color.dangerInk} strokeWidth={2} />
            ) : (
              <Sparkles size={24} color={color.primary} strokeWidth={2} />
            )}
          </View>

          <View style={{ gap: space.xs }}>
            <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
              {forced ? "Update required" : "A new version is available"}
            </Text>
            <Text style={{ fontSize: fontSize.body, color: color.inkMuted, lineHeight: 20 }}>
              {forced
                ? `This terminal is on an unsupported build. Update to ${version.latestVersion} to keep using the app.`
                : `Version ${version.latestVersion} is out — this terminal is still on an older build.`}
            </Text>
            {version.releaseNotes ? (
              <Text style={{ fontSize: fontSize.caption, color: color.inkMuted, marginTop: space.xs }}>
                {version.releaseNotes}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: space.sm }}>
            <Button
              label="Open app tester to download"
              icon={DownloadCloud}
              large
              disabled={!version.downloadUrl}
              onPress={openDownload}
            />
            {forced ? null : (
              <Button label="Later" variant="secondary" onPress={onDismiss} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
