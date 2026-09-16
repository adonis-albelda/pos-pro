import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  ChevronRight,
  CloudUpload,
  Package,
  Receipt,
  Tag,
  TrendingUp,
} from "lucide-react-native";
import { formatMoney, type LocalSaleWithItems } from "@double-a/shared-types";
import { listLocalSales, summariseToday, type LocalDaySummary } from "@/db/sales";
import { useLayout } from "@/lib/layout";
import { useSync } from "@/sync/sync-provider";
import { WaveBackdrop } from "@/components/wave-backdrop";
import {
  Badge,
  Card,
  EmptyState,
  LedgerLine,
  Money,
  SectionTitle,
  Stat,
  WarningNote,
} from "@/components/ui";
import { color, fontSize, radius, space, styles } from "@/theme";

/**
 * This device's own sales, read straight from SQLite. Deeper reporting lives in
 * the admin dashboard, which sees every terminal.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const layout = useLayout();
  const { dataVersion } = useSync();
  const [sales, setSales] = useState<LocalSaleWithItems[]>([]);
  const [summary, setSummary] = useState<LocalDaySummary | null>(null);

  const load = useCallback(async () => {
    const [localSales, today] = await Promise.all([
      listLocalSales(),
      summariseToday(),
    ]);

    setSales(localSales);
    setSummary(today);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // A sync marks sales as sent while this screen is open, so the badges have to
  // be re-read rather than left as they were when it mounted.
  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  // Pending sales sort first, with the ledger line marking where sent ones begin.
  const pending = sales.filter((sale) => sale.syncStatus === "pending");
  const sent = sales.filter((sale) => sale.syncStatus !== "pending");
  const ordered = [...pending, ...sent];
  const boundaryIndex = pending.length > 0 && sent.length > 0 ? pending.length : -1;

  return (
    <View style={{ flex: 1 }}>
      {/* Full screen width on purpose — WaveBackdrop draws itself at the
          real window width/height, so it must sit outside the
          maxWidth+centered content box below or it gets squeezed into that
          narrower box instead of reaching both edges (visible as a
          not-full-width wave in landscape, where readableMaxWidth caps well
          under the screen width). */}
      <WaveBackdrop />

      <View
        style={{
          flex: 1,
          padding: layout.gutter,
          gap: layout.compact ? space.lg : space.xl,
          width: "100%",
          maxWidth: layout.readableMaxWidth,
          alignSelf: "center",
        }}
      >

      <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
        <SectionTitle
          icon={TrendingUp}
          title="Today on this terminal"
          hint="This device only — the office sees every terminal."
        />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Stat icon={Receipt} label="Sales" value={String(summary?.salesCount ?? 0)} />
          <Stat
            icon={TrendingUp}
            label="Revenue"
            tone="primary"
            value={formatMoney(summary?.revenue ?? 0)}
          />
          <Stat icon={Package} label="Items" value={String(summary?.itemsSold ?? 0)} />
        </View>
        {summary && summary.pendingCount > 0 ? (
          <WarningNote>
            {`${summary.pendingCount} of these have not reached the office yet.`}
          </WarningNote>
        ) : null}
      </Card>

      {ordered.length === 0 ? (
        <Card style={[styles.floatShadow, { borderRadius: radius.sm }]}>
          <EmptyState
            icon={Receipt}
            title="No sales on this terminal yet"
            instruction="Complete a sale and it shows up here straight away, connection or not."
          />
        </Card>
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(sale) => sale.id}
          contentContainerStyle={{ gap: space.sm }}
          renderItem={({ item, index }) => (
            <View>
              {index === boundaryIndex ? <LedgerLine /> : null}
              <Pressable
                onPress={() => router.push(`/pos/sale/${item.id}`)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    padding: space.lg,
                    gap: space.sm,
                    // A pending sale carries an amber edge as well as its badge,
                    // so a column of them is countable at a glance.
                    borderColor:
                      item.syncStatus === "pending" ? color.warning : color.border,
                    backgroundColor: pressed ? color.primarySoft : color.surface,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: space.sm,
                  }}
                >
                  <Text
                    style={[
                      styles.numeric,
                      {
                        fontSize: fontSize.bodyLg,
                        fontWeight: "600",
                        color: color.inkMuted,
                      },
                    ]}
                  >
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Money
                    value={item.totalAmount}
                    style={[
                      styles.price,
                      { marginLeft: "auto", fontSize: fontSize.headingSm },
                    ]}
                  />
                  <ChevronRight size={18} color={color.inkMuted} strokeWidth={2} />
                </View>

                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
                >
                  <Badge
                    tone={item.syncStatus === "pending" ? "warning" : "success"}
                    icon={item.syncStatus === "pending" ? CloudUpload : undefined}
                    label={item.syncStatus === "pending" ? "Waiting to send" : "Sent"}
                  />
                  <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    {item.items.reduce((count, line) => count + line.quantity, 0)} items ·{" "}
                    {item.paymentMethod ?? "unrecorded"}
                  </Text>
                  {item.discountAmount > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.xs,
                      }}
                    >
                      <Tag size={13} color={color.accentInk} strokeWidth={2.5} />
                      <Text
                        style={[
                          styles.numeric,
                          { fontSize: fontSize.caption, color: color.accentInk },
                        ]}
                      >
                        {formatMoney(item.discountAmount)} off
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            </View>
          )}
        />
      )}
      </View>
    </View>
  );
}