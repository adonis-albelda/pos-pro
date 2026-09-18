import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CheckCircle2, MapPin, Phone, Truck, UserRound } from "lucide-react-native";
import {
  hasCustomerDetails,
  saleCustomer,
  type LocalSaleWithItems,
} from "@double-a/shared-types";
import {
  listOpenDeliveries,
  updateLocalSaleFlags,
} from "@/db/sales";
import { useLayout } from "@/lib/layout";
import { useSync } from "@/sync/sync-provider";
import { Badge, Button, Card, EmptyState, Money, SectionTitle } from "@/components/ui";
import { color, fontSize, space, styles } from "@/theme";

/**
 * Open delivery orders on this terminal. Completing one is local + flagged for
 * the next Sync — it never waits on the network.
 */
export default function DeliveryScreen() {
  const router = useRouter();
  const layout = useLayout();
  const { dataVersion, refresh } = useSync();
  const [sales, setSales] = useState<LocalSaleWithItems[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSales(await listOpenDeliveries());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  async function markDelivered(saleId: string) {
    setBusyId(saleId);
    try {
      await updateLocalSaleFlags(saleId, { deliveryCompleted: true });
      void refresh();
      await load();
    } finally {
      setBusyId(null);
    }
  }

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

      <SectionTitle
        icon={Truck}
        title="Deliveries"
        hint="Orders marked for delivery on this terminal. Tap done when the drop is finished."
      />

      {sales.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No open deliveries"
          instruction="Mark a sale as Delivery on the Sell screen to see it here."
        />
      ) : (
        <FlatList
          data={sales}
          keyExtractor={(sale) => sale.id}
          contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}
          renderItem={({ item: sale }) => {
            const customer = saleCustomer(sale);
            return (
              <Card style={{ gap: space.md }}>
                <Pressable onPress={() => router.push(`/pos/sale/${sale.id}`)}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      gap: space.md,
                    }}
                  >
                    <View style={{ flex: 1, gap: space.xs }}>
                      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700" }}>
                        {customer.name ?? "Delivery"}
                      </Text>
                      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                        {new Date(sale.createdAt).toLocaleString("en-PH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </Text>
                      {hasCustomerDetails(customer) ? (
                        <View style={{ gap: space.xs, marginTop: space.xs }}>
                          {customer.contact ? (
                            <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
                              <Phone size={13} color={color.inkMuted} />
                              <Text style={styles.muted}>{customer.contact}</Text>
                            </View>
                          ) : null}
                          {customer.address ? (
                            <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
                              <MapPin size={13} color={color.inkMuted} />
                              <Text style={styles.muted}>{customer.address}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
                          <UserRound size={13} color={color.inkMuted} />
                          <Text style={styles.muted}>No customer details</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: space.xs }}>
                      <Money value={sale.totalAmount} />
                      {!sale.isPaid ? <Badge tone="warning" label="Unpaid" /> : null}
                    </View>
                  </View>
                </Pressable>

                <Button
                  label={busyId === sale.id ? "Saving..." : "Mark delivered"}
                  icon={CheckCircle2}
                  busy={busyId === sale.id}
                  onPress={() => void markDelivered(sale.id)}
                />
              </Card>
            );
          }}
        />
      )}
      </View>
    </View>
  );
}
