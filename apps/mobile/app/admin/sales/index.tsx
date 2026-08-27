import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Receipt, UserRound } from "lucide-react-native";
import type { SaleStatus } from "@double-a/shared-types";
import { useSalesList } from "@/lib/query/sales";
import { useUsers } from "@/lib/query/users";
import { useLocationScope } from "@/lib/location-scope";
import { Badge, EmptyState, ErrorNote, Money } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space } from "@/theme";

const STATUS_TABS: { value: SaleStatus | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "completed", label: "Completed" },
  { value: "voided", label: "Voided" },
  { value: "refunded", label: "Refunded" },
];

function statusTone(status: SaleStatus): "success" | "danger" | "warning" {
  if (status === "completed") return "success";
  if (status === "voided") return "danger";
  return "warning";
}

/**
 * Most-recent sales, newest first (server order). Scoped to the active
 * location when one is selected (admin switcher / device enrolled branch).
 */
export default function AdminSalesScreen() {
  const router = useRouter();
  const { locationId } = useLocationScope();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SaleStatus | undefined>(undefined);

  const salesQuery = useSalesList({
    status,
    pageSize: 50,
    locationId: locationId ?? undefined,
  });
  const usersQuery = useUsers({ includeInactive: true });

  const cashierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of usersQuery.data ?? []) map.set(user.id, user.name);
    return map;
  }, [usersQuery.data]);

  const filtered = useMemo(() => {
    const sales = salesQuery.data?.sales ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return sales;
    return sales.filter((sale) => {
      const cashier = sale.userId ? cashierNameById.get(sale.userId) : null;
      return [cashier, sale.customerName, sale.paymentMethod, sale.status, sale.id]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [salesQuery.data, query, cashierNameById]);

  if (salesQuery.isPending || usersQuery.isPending) {
    return <LoadingState text="Loading sales…" />;
  }

  if (salesQuery.isError) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>
          {salesQuery.error instanceof Error ? salesQuery.error.message : "Could not load sales."}
        </ErrorNote>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <WaveBackdrop />
      <View style={{ padding: space.md, gap: space.sm }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search cashier, customer, sale ID…"
          placeholderTextColor={color.inkMuted}
          style={{
            minHeight: 44,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: radius.sm,
            paddingHorizontal: space.md,
            color: color.ink,
            backgroundColor: color.surface,
          }}
        />
        <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
          {STATUS_TABS.map((tab) => {
            const active = tab.value === status;
            return (
              <Pressable
                key={tab.label}
                onPress={() => setStatus(tab.value)}
                style={{
                  paddingHorizontal: space.md,
                  paddingVertical: space.xs,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: active ? color.primary : color.border,
                  backgroundColor: active ? color.primaryTint : color.surface,
                }}
              >
                <Text
                  style={{
                    fontSize: fontSize.caption,
                    fontWeight: "600",
                    color: active ? color.primary : color.inkMuted,
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={query ? "Nothing matches" : "No sales yet"}
          instruction={
            query
              ? "Try a different cashier, customer or sale ID."
              : "Sales appear here once a terminal syncs."
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.md, gap: space.xs, paddingTop: 0 }}
          renderItem={({ item }) => {
            const cashier = item.userId ? cashierNameById.get(item.userId) : null;
            const soldAt = new Date(item.createdAt).toLocaleString("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
            });

            return (
              <Pressable
                onPress={() => router.push(`/admin/sales/${item.id}`)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  padding: space.md,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: color.border,
                  backgroundColor: pressed ? color.surfacePressed : color.surface,
                })}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                    {soldAt}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.xs,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                      {cashier ?? "Unknown cashier"}
                    </Text>
                    {item.customerName ? (
                      <>
                        <UserRound size={11} color={color.inkMuted} />
                        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                          {item.customerName}
                        </Text>
                      </>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: "row", gap: space.xs, marginTop: 2 }}>
                    <Badge tone={statusTone(item.status)} label={item.status} />
                    {item.status === "completed" ? (
                      item.isPaid ? (
                        <Badge tone="success" label="Paid" />
                      ) : (
                        <Badge tone="warning" label="Unpaid" />
                      )
                    ) : null}
                    {item.fulfillment === "delivery" ? (
                      <Badge
                        tone={item.deliveryCompleted ? "success" : "warning"}
                        label={item.deliveryCompleted ? "Delivered" : "Delivery"}
                      />
                    ) : null}
                  </View>
                </View>
                <Money value={item.totalAmount} style={{ fontWeight: "700" }} />
                <ChevronRight size={18} color={color.inkMuted} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
