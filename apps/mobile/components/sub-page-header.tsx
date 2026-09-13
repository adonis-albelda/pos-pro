import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { AccountDrawer } from "@/components/account-drawer";
import { useAccountDrawer } from "@/lib/account-drawer";
import { useLayout } from "@/lib/layout";
import { color, fontSize, space, styles } from "@/theme";

/**
 * Chrome for a drawer-reached detail screen (Theme/Settings/Sync/FAQ/About —
 * see DRAWER_SUBPAGE_TITLES in app/pos/_layout.tsx) — swapped in for
 * StoreHeader on those routes only. These are dead-end screens pushed (not
 * replaced) from AccountDrawer, so "back" always has somewhere real to go —
 * and reopens the drawer on arrival, since that's where this screen was
 * reached from, not just "whatever tab happened to be underneath."
 * Mounts its own AccountDrawer instance (shared open state via
 * useAccountDrawer) since StoreHeader — the only other place that mounts
 * one — isn't rendered on these routes.
 */
export function SubPageHeader({ title }: { title: string }) {
  const router = useRouter();
  const { compact } = useLayout();
  const { open, openDrawer, closeDrawer } = useAccountDrawer();

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/pos");
    openDrawer();
  }

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          paddingHorizontal: compact ? space.sm : space.md,
          paddingVertical: compact ? space.xs : space.sm,
          backgroundColor: color.primary,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.15)",
        }}
      >
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Go back and open menu"
          style={styles.tapTarget}
        >
          <ArrowLeft size={20} color={color.onPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.onPrimary }}>
          {title}
        </Text>
      </View>
      <AccountDrawer open={open} onClose={closeDrawer} />
    </>
  );
}
