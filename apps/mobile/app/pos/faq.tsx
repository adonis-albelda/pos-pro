import { ScrollView, Text, View } from "react-native";
import { HelpCircle } from "lucide-react-native";
import { useLayout } from "@/lib/layout";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { Card, SectionTitle } from "@/components/ui";
import { color, fontSize, radius, space, styles } from "@/theme";

/** Placeholder — content to follow. Reachable from the account drawer. */
export default function FaqScreen() {
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
        <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
          <SectionTitle icon={HelpCircle} title="FAQ" />
          <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>
            Nothing here yet — check back soon.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}
