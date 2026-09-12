import { useEffect, useState, type ReactNode } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, space, radius } from "@/theme";
import { useLayout } from "@/lib/layout";

/** Live keyboard height — Modals on Android ignore activity adjustResize. */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

/**
 * Bottom drawer that rises with the keyboard so inputs stay visible on a real
 * device. Scrim tap dismisses; sheet content stays above the keys.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  contentStyle,
  scroll = true,
  maxWidth = 560,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Wrap children in a ScrollView so tall forms stay reachable. */
  scroll?: boolean;
  maxWidth?: number;
}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { compact, landscape } = useLayout();
  // Tablet held sideways has room to spare — dock only cramps a phone or a
  // tablet stood upright. Landscape phones stay docked too (compact wins).
  const centered = !compact && landscape;

  if (!open) return null;

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[{ gap: space.md }, contentStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ gap: space.md }, contentStyle]}>{children}</View>
  );

  return (
    <Modal visible transparent animationType={centered ? "fade" : "slide"} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: `${color.ink}99` }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={StyleSheet.absoluteFill}
        />

        <View
          pointerEvents="box-none"
          style={{
            flex: 1,
            justifyContent: centered ? "center" : "flex-end",
            alignItems: centered ? "center" : undefined,
            // Push the sheet/dialog above the soft keyboard either way.
            paddingBottom: centered ? 0 : keyboardHeight,
            paddingHorizontal: centered ? space.lg : 0,
          }}
        >
          <View
            style={{
              backgroundColor: color.surface,
              borderTopLeftRadius: centered ? radius.lg : 24,
              borderTopRightRadius: centered ? radius.lg : 24,
              borderBottomLeftRadius: centered ? radius.lg : 0,
              borderBottomRightRadius: centered ? radius.lg : 0,
              padding: space.lg,
              paddingBottom: centered ? space.lg : Math.max(insets.bottom, space.lg),
              width: "100%",
              maxWidth,
              alignSelf: "center",
              // Leave room for the field + actions when the keyboard is up.
              maxHeight: centered ? "88%" : keyboardHeight > 0 ? "88%" : "92%",
              // Floats up from the scrim now, same treatment as setup/unlock's cards.
              shadowColor: "#000",
              shadowOpacity: centered ? 0.22 : 0.18,
              shadowRadius: centered ? 28 : 24,
              shadowOffset: { width: 0, height: centered ? 12 : -10 },
              elevation: centered ? 20 : 16,
            }}
          >
            {body}
          </View>
        </View>
      </View>
    </Modal>
  );
}
