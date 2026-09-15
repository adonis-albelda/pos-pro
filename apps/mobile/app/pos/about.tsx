import { ScrollView, Text, View } from "react-native";
import { Info } from "lucide-react-native";
import { useLayout } from "@/lib/layout";
import { APP_VERSION } from "@/lib/api/client";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { Card, SectionTitle } from "@/components/ui";
import { color, fontSize, radius, space, styles } from "@/theme";

export default function AboutScreen() {
  const layout = useLayout();

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
        <Card style={[{ gap: space.sm }, styles.floatShadow, { borderRadius: radius.sm }]}>
          <SectionTitle icon={Info} title="About" />
          <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
            Version {APP_VERSION}
          </Text>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            Copyright © 2026 POSPro One - All Rights Reserved.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
