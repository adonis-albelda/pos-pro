import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { storeInitial, timeAgo } from "@double-a/shared-types";
import {
  CloudUpload,
  ClipboardList,
  FolderTree,
  Package,
  PackageCheck,
  Printer,
  Receipt,
  RefreshCw,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  UserRound,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react-native";
import { useLiveFeatureFlags } from "@/lib/features";
import { useStoreSettings } from "@/lib/store";
import { useSync } from "@/sync/sync-provider";
import { color, fontSize, radius, space } from "@/theme";

interface Tile {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Matches a key in FeatureCatalog (Laravel) — hidden when off for this shop. Absent = always shown. */
  featureKey?: string;
}

const TILES: Tile[] = [
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/customers", label: "Customers", icon: UserRound },
  { href: "/admin/suppliers", label: "Suppliers", icon: Truck, featureKey: "suppliers" },
  {
    href: "/admin/purchase-orders",
    label: "Purchase orders",
    icon: ClipboardList,
    featureKey: "purchase_orders",
  },
  {
    href: "/admin/receiving",
    label: "Receive orders",
    icon: PackageCheck,
    featureKey: "purchase_orders",
  },
  { href: "/admin/inventory", label: "Inventory", icon: Warehouse },
  { href: "/admin/sales", label: "Sales", icon: Receipt },
  { href: "/admin/expenses", label: "Expenses", icon: Wallet, featureKey: "expenses" },
  { href: "/admin/reports", label: "Reports", icon: ShoppingBag },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/receipt", label: "Receipt layout", icon: Printer },
];

const HEADER_HEIGHT = 158;
const WAVE_AMPLITUDE = 20;

/**
 * Green banner scoped to this screen only — not WaveBackdrop, which is
 * reserved for splash/setup/unlock chrome where content floats as cards
 * over a full-bleed backdrop. This is a launcher/data screen, so the wave
 * stays contained to a header band instead of taking the whole page.
 *
 * Sits directly under admin/_layout.tsx's own bar, now also green, so the
 * two read as one continuous green block — the wave is its bottom edge,
 * not a seam partway up.
 */
function DashboardHeader() {
  const { width } = useWindowDimensions();
  const { lastSyncedAt, pendingSales } = useSync();
  const store = useStoreSettings();
  const svgHeight = HEADER_HEIGHT + WAVE_AMPLITUDE;

  return (
    <View style={{ height: svgHeight }}>
      <Svg width={width} height={svgHeight} style={{ position: "absolute", top: 0, left: 0 }}>
        <Path
          d={`M0,0 L${width},0 L${width},${HEADER_HEIGHT - WAVE_AMPLITUDE} Q${width / 2},${HEADER_HEIGHT + WAVE_AMPLITUDE} 0,${HEADER_HEIGHT - WAVE_AMPLITUDE} Z`}
          fill={color.primary}
        />
      </Svg>

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: store.logoUrl ? color.surface : "rgba(255,255,255,0.2)",
            }}
          >
            {store.logoUrl ? (
              <Image
                source={{ uri: store.logoUrl }}
                resizeMode="contain"
                style={{ width: "100%", height: "100%" }}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text style={{ color: color.onPrimary, fontWeight: "700", fontSize: fontSize.headingSm }}>
                {storeInitial(store.name)}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{ color: color.onPrimary, fontSize: fontSize.headingMd, fontWeight: "700" }}
            >
              {store.name}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: fontSize.caption, fontWeight: "600" }}>
              Admin Dashboard
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <RefreshCw size={14} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: fontSize.caption, fontWeight: "600" }}>
              Last synced {timeAgo(lastSyncedAt)}
            </Text>
          </View>
          {pendingSales > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <CloudUpload size={14} color={color.warning} strokeWidth={2} />
              <Text style={{ color: color.warning, fontSize: fontSize.caption, fontWeight: "700" }}>
                {pendingSales} sale{pendingSales === 1 ? "" : "s"} waiting to send
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** Launcher grid — same idea as apps/admin's classic-shell /menu launcher. */
export default function AdminHome() {
  const router = useRouter();
  const { isEnabled } = useLiveFeatureFlags();
  const tiles = TILES.filter((tile) => !tile.featureKey || isEnabled(tile.featureKey));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
      <DashboardHeader />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, padding: space.md }}>
        {tiles.map(({ href, label, icon: Icon }) => (
          <Pressable
            key={href}
            onPress={() => router.push(href)}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => ({
              width: "31%",
              minHeight: 96,
              alignItems: "center",
              justifyContent: "center",
              gap: space.xs,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: color.border,
              backgroundColor: pressed ? color.surfacePressed : color.surface,
              paddingVertical: space.md,
            })}
          >
            <Icon size={26} color={color.primary} strokeWidth={1.75} />
            <Text
              style={{
                fontSize: fontSize.caption,
                fontWeight: "600",
                color: color.ink,
                textAlign: "center",
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
