import { useState, type ForwardRefExoticComponent, type RefAttributes } from "react";
import { Text, View } from "react-native";
import RNWebView from "react-native-webview";
import type {
  AndroidWebViewProps,
  IOSWebViewProps,
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WindowsWebViewProps,
} from "react-native-webview/lib/WebViewTypes";
import { Button } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { color, space, styles } from "@/theme";

const FAQ_URL = "https://www.doubleadigitalsolutions.store/pospro/faqs?embedded=1";

// Same untyped-component workaround as AdminWebView (components/admin-webview.tsx).
const WebView = RNWebView as unknown as ForwardRefExoticComponent<
  (IOSWebViewProps & AndroidWebViewProps & WindowsWebViewProps) & RefAttributes<unknown>
>;

/** Public FAQ page, embedded — no auth/cookie bootstrap needed (unlike AdminWebView). */
export default function FaqScreen() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  if (error) {
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md }}
      >
        <Text style={styles.subheading}>Could not load the FAQ page</Text>
        <Text style={[styles.muted, { textAlign: "center" }]}>{error}</Text>
        <Button
          label="Try again"
          onPress={() => {
            setReady(false);
            setError(null);
            setAttempt((value) => value + 1);
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.surface }}>
      {!ready ? <LoadingState text="Opening FAQs…" /> : null}
      <WebView
        key={attempt}
        source={{ uri: FAQ_URL }}
        onLoadEnd={() => setReady(true)}
        onHttpError={(event: WebViewHttpErrorEvent) => {
          const { statusCode } = event.nativeEvent;
          if (statusCode >= 400) setError(`Server returned ${statusCode}.`);
        }}
        onError={(event: WebViewErrorEvent) => {
          const { description } = event.nativeEvent;
          setError(description || "Could not reach the FAQ page.");
        }}
        style={{ flex: 1, opacity: ready ? 1 : 0 }}
      />
    </View>
  );
}
