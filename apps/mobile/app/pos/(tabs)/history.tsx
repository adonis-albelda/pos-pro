import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Package,
  Receipt,
  Tag,
  TrendingUp,
  X,
} from "lucide-react-native";
import { formatMoney, type LocalSaleWithItems } from "@double-a/shared-types";
import { listLocalSalesByRange, summariseRange, type LocalDaySummary } from "@/db/sales";
import { shiftIsoDate, startOfIsoWeek, toIsoDateString } from "@/lib/date";
import { useLayout } from "@/lib/layout";
import { useSync } from "@/sync/sync-provider";
import { DateField } from "@/components/date-field";
import {
  Badge,
  Button,
  EmptyState,
  LedgerLine,
  Money,
  SectionTitle,
  Stat,
  WarningNote,
} from "@/components/ui";
import { color, fontSize, radius, space, styles } from "@/theme";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * This device's own sales, read straight from SQLite. Deeper reporting lives in
 * the admin dashboard, which sees every terminal.
 */
export default function HistoryScreen() {
  const router = useRouter();
  const layout = useLayout();
  const { dataVersion } = useSync();
  const todayIso = toIsoDateString(new Date());

  const [sales, setSales] = useState<LocalSaleWithItems[]>([]);
  const [summary, setSummary] = useState<LocalDaySummary | null>(null);

  // The week strip's own scroll position — independent of which day is
  // actually selected, so browsing to a past week doesn't require the
  // selection to follow along.
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(todayIso));
  // The active filter — a single day (from === to) picked off the strip, or
  // a custom span picked from the range dialog below.
  const [range, setRange] = useState({ from: todayIso, to: todayIso });

  const [rangeDialogOpen, setRangeDialogOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(todayIso);
  const [draftTo, setDraftTo] = useState(todayIso);
  const [openField, setOpenField] = useState<"from" | "to" | null>(null);

  const load = useCallback(async () => {
    const [localSales, periodSummary] = await Promise.all([
      listLocalSalesByRange(range.from, range.to),
      summariseRange(range.from, range.to),
    ]);

    setSales(localSales);
    setSummary(periodSummary);
  }, [range.from, range.to]);

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

  function selectDay(day: string) {
    setRange({ from: day, to: day });
  }

  function shiftWeek(byWeeks: number) {
    setWeekStart((current) => shiftIsoDate(current, byWeeks * 7));
  }

  function openRangeDialog() {
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setRangeDialogOpen(true);
  }

  function applyRange() {
    const from = draftFrom > draftTo ? draftTo : draftFrom;
    const to = draftFrom > draftTo ? draftFrom : draftTo;
    setRange({ from, to });
    setWeekStart(startOfIsoWeek(from));
    setRangeDialogOpen(false);
    setOpenField(null);
  }

  const isSingleDay = range.from === range.to;
  const isToday = isSingleDay && range.from === todayIso;
  const periodLabel = isSingleDay
    ? range.from === todayIso
      ? "Today"
      : formatDayLabel(range.from)
    : `${formatDayLabel(range.from)} – ${formatDayLabel(range.to)}`;
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftIsoDate(weekStart, i));

  // Pending sales sort first, with the ledger line marking where sent ones begin.
  const pending = sales.filter((sale) => sale.syncStatus === "pending");
  const sent = sales.filter((sale) => sale.syncStatus !== "pending");
  const ordered = [...pending, ...sent];
  const boundaryIndex = pending.length > 0 && sent.length > 0 ? pending.length : -1;

  return (
    <View style={{ flex: 1 }}>
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

      <View style={{ gap: space.md }}>
      <View
        style={{
          gap: space.sm,
          // Bleeds past the screen's own padding on every side that touches
          // it — top and sides — to reach the true edge instead of floating
          // as an inset card with a gap above and around it.
          marginTop: -layout.gutter,
          marginHorizontal: -layout.gutter,
          paddingHorizontal: layout.gutter,
          paddingTop: layout.gutter,
          paddingBottom: space.md,
          backgroundColor: color.primarySoft,
          borderBottomWidth: 1,
          borderBottomColor: color.border,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>
            {periodLabel}
          </Text>
          <Pressable onPress={openRangeDialog} hitSlop={8}>
            <Text style={{ fontSize: fontSize.caption, fontWeight: "700", color: color.primary }}>
              View all
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <Pressable
            onPress={() => shiftWeek(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous week"
            hitSlop={8}
            style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
          >
            <ChevronLeft size={18} color={color.inkMuted} strokeWidth={2.25} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
            {weekDays.map((day, index) => {
              const selected = isSingleDay && day === range.from;
              const isTodayCell = day === todayIso;
              return (
                <Pressable
                  key={day}
                  onPress={() => selectDay(day)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    gap: 2,
                    paddingVertical: space.xs,
                    borderRadius: radius.sm,
                    borderWidth: isTodayCell && !selected ? 1 : 0,
                    borderColor: color.primarySoft,
                    backgroundColor: selected ? color.primary : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.caption,
                      fontWeight: "600",
                      color: selected ? color.onPrimary : color.inkMuted,
                    }}
                  >
                    {WEEKDAY_LABELS[index]}
                  </Text>
                  <Text
                    style={[
                      styles.numeric,
                      {
                        fontSize: fontSize.body,
                        fontWeight: "700",
                        color: selected ? color.onPrimary : color.ink,
                      },
                    ]}
                  >
                    {Number(day.slice(8, 10))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => shiftWeek(1)}
            accessibilityRole="button"
            accessibilityLabel="Next week"
            hitSlop={8}
            style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
          >
            <ChevronRight size={18} color={color.inkMuted} strokeWidth={2.25} />
          </Pressable>
        </View>
      </View>

      <View style={{ gap: space.md }}>
        <SectionTitle
          icon={TrendingUp}
          title={isToday ? "Today on this terminal" : `Sales on ${periodLabel}`}
          hint="This device only — the office sees every terminal."
        />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Stat icon={Receipt} label="Sales" tone="primary" value={String(summary?.salesCount ?? 0)} />
          <Stat
            icon={TrendingUp}
            label="Revenue"
            tone="primary"
            value={formatMoney(summary?.revenue ?? 0)}
          />
          <Stat icon={Package} label="Items" tone="primary" value={String(summary?.itemsSold ?? 0)} />
        </View>
        {summary && summary.pendingCount > 0 ? (
          <WarningNote>
            {`${summary.pendingCount} of these have not reached the office yet.`}
          </WarningNote>
        ) : null}
      </View>
      </View>

      {ordered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={isToday ? "No sales on this terminal yet" : "No sales in this period"}
          instruction="Complete a sale and it shows up here straight away, connection or not."
        />
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
                    {isSingleDay
                      ? new Date(item.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : new Date(item.createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
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

      <Modal
        visible={rangeDialogOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRangeDialogOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            alignItems: "center",
            justifyContent: "center",
            padding: space.lg,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 400,
              borderRadius: radius.md,
              backgroundColor: color.surface,
              padding: space.lg,
              gap: space.md,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <CalendarRange size={18} color={color.primary} strokeWidth={2} />
                <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
                  Choose dates
                </Text>
              </View>
              <Pressable
                onPress={() => setRangeDialogOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <X size={20} color={color.inkMuted} strokeWidth={2} />
              </Pressable>
            </View>

            <DateField
              label="Start date"
              value={draftFrom}
              onChange={setDraftFrom}
              open={openField === "from"}
              onOpen={() => setOpenField("from")}
              onClose={() => setOpenField(null)}
              maximumDate={new Date()}
              required
            />
            <DateField
              label="End date"
              value={draftTo}
              onChange={setDraftTo}
              open={openField === "to"}
              onOpen={() => setOpenField("to")}
              onClose={() => setOpenField(null)}
              maximumDate={new Date()}
              required
            />

            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => setRangeDialogOpen(false)}
                style={{ flex: 1 }}
              />
              <Button label="Apply" onPress={applyRange} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}
