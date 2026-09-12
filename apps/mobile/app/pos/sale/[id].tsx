import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Ban,
  CheckCircle2,
  CloudUpload,
  Info,
  MapPin,
  Phone,
  Printer,
  ShoppingCart,
  Tag,
  TriangleAlert,
  UserRound,
} from "lucide-react-native";
import {
  formatMoney,
  hasCustomerDetails,
  saleCustomer,
  type LocalSaleWithItems,
  type ProductUnit,
} from "@double-a/shared-types";
import { getProductUnits } from "@/db/products";
import { getLocalSale, updateLocalSaleFlags, voidPendingSale } from "@/db/sales";
import { useLayout } from "@/lib/layout";
import { useSession } from "@/lib/session";
import { printReceipt } from "@/printing/receipt";
import { useSync } from "@/sync/sync-provider";
import { Badge, Button, Card, ErrorNote, LedgerLine, Money } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { color, fontSize, radius, space, styles } from "@/theme";

export default function SaleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { cashier } = useSession();
  const { refresh } = useSync();
  const layout = useLayout();

  const [sale, setSale] = useState<LocalSaleWithItems | null>(null);
  const [units, setUnits] = useState<Map<string, ProductUnit>>(new Map());
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    void getLocalSale(id).then(async (found) => {
      setSale(found);
      if (!found) return;

      const productIds = found.items
        .map((item) => item.productId)
        .filter((productId): productId is string => productId !== null);
      setUnits(await getProductUnits(productIds));
    });
  }, [id]);

  async function voidSale() {
    if (!sale) return;

    try {
      await voidPendingSale(sale.id);
      void refresh();
      router.replace("/pos");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not void this sale.");
      setConfirmingVoid(false);
    }
  }

  if (!sale) {
    return <LoadingState text="Loading the sale…" />;
  }

  const customer = saleCustomer(sale);

  return (
    <ScrollView
      contentContainerStyle={{
        padding: layout.gutter,
        gap: space.lg,
        width: "100%",
        maxWidth: layout.readableMaxWidth,
        alignSelf: "center",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.lg,
            backgroundColor: color.successSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckCircle2 size={24} color={color.successInk} strokeWidth={2} />
        </View>
        <View style={{ gap: space.xs }}>
          <Text style={styles.heading}>Sale complete</Text>
          <Badge
            tone={sale.syncStatus === "synced" ? "success" : "warning"}
            icon={sale.syncStatus === "synced" ? undefined : CloudUpload}
            label={sale.syncStatus === "synced" ? "Sent to office" : "Waiting to send"}
          />
        </View>
      </View>

      <Card>
        {sale.items.map((item) => {
          const unit = (item.productId ? units.get(item.productId) : null) ?? "pc";
          const discounted = item.listPrice > item.unitPrice;

          return (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: space.sm,
                paddingVertical: space.xs,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: fontSize.bodyLg }}>{item.productName}</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    flexWrap: "wrap",
                    gap: space.xs,
                  }}
                >
                  <Text
                    style={[
                      styles.numeric,
                      { fontSize: fontSize.caption, color: color.inkMuted },
                    ]}
                  >
                    {item.quantity} {unit} @ {formatMoney(item.unitPrice)}
                  </Text>
                  {discounted ? (
                    <Text
                      style={[
                        styles.numeric,
                        {
                          fontSize: fontSize.caption,
                          color: color.inkMuted,
                          textDecorationLine: "line-through",
                        },
                      ]}
                    >
                      {formatMoney(item.listPrice)}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Money value={item.subtotal} />
            </View>
          );
        })}

        {/* Line items end, the total begins. */}
        <LedgerLine />

        {sale.discountAmount > 0 ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: space.sm,
              marginBottom: space.xs,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <Tag size={14} color={color.accentInk} strokeWidth={2.5} />
              <Text style={{ fontSize: fontSize.body, color: color.accentInk }}>
                Discount given
              </Text>
            </View>
            <Text
              style={[
                styles.numeric,
                { fontSize: fontSize.bodyLg, fontWeight: "700", color: color.accentInk },
              ]}
            >
              -{formatMoney(sale.discountAmount)}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: space.md,
            borderRadius: radius.sm,
            backgroundColor: color.primaryTint,
          }}
        >
          <Text
            style={{
              fontSize: fontSize.bodyLg,
              fontWeight: "700",
              color: color.primaryDark,
            }}
          >
            TOTAL
          </Text>
          <Money
            value={sale.totalAmount}
            style={[styles.total, { color: color.primaryDark }]}
          />
        </View>

        <Text style={[styles.muted, { marginTop: space.sm }]}>
          {sale.paymentMethod ?? "unrecorded"} ·{" "}
          {sale.isPaid ? "Paid" : "Unpaid"} ·{" "}
          {sale.fulfillment === "delivery"
            ? sale.deliveryCompleted
              ? "Delivered"
              : "Delivery open"
            : "Pickup"}{" "}
          · {new Date(sale.createdAt).toLocaleTimeString()}
        </Text>
      </Card>

      {!sale.isPaid ? (
        <Button
          label="Mark as paid"
          large
          icon={CheckCircle2}
          onPress={() => {
            void updateLocalSaleFlags(sale.id, { isPaid: true }).then(async () => {
              setSale(await getLocalSale(sale.id));
              void refresh();
            });
          }}
        />
      ) : null}

      {sale.fulfillment === "delivery" && !sale.deliveryCompleted ? (
        <Button
          label="Mark delivered"
          variant="secondary"
          icon={CheckCircle2}
          onPress={() => {
            void updateLocalSaleFlags(sale.id, { deliveryCompleted: true }).then(
              async () => {
                setSale(await getLocalSale(sale.id));
                void refresh();
              },
            );
          }}
        />
      ) : null}

      {/* Only when the counter took details — otherwise this card would be an
          empty promise on every walk-in sale. */}
      {hasCustomerDetails(customer) ? (
        <Card tinted style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <UserRound size={16} color={color.primary} strokeWidth={2} />
            <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.primaryDark }}>
              {customer.name ?? "Customer"}
            </Text>
          </View>
          {customer.contact ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Phone size={14} color={color.inkMuted} strokeWidth={2} />
              <Text style={{ fontSize: fontSize.body, color: color.ink }}>
                {customer.contact}
              </Text>
            </View>
          ) : null}
          {customer.address ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
              <MapPin size={14} color={color.inkMuted} strokeWidth={2} />
              <Text style={{ flex: 1, fontSize: fontSize.body, color: color.ink }}>
                {customer.address}
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Button
        label="New sale"
        large
        icon={ShoppingCart}
        onPress={() => router.replace("/pos")}
      />

      <Button
        label="Print receipt again"
        variant="secondary"
        icon={Printer}
        onPress={() => {
          void printReceipt(sale, cashier?.name).catch((cause: unknown) => {
            setError(
              cause instanceof Error
                ? `Receipt did not print: ${cause.message}`
                : "Receipt did not print.",
            );
          });
        }}
      />

      {sale.syncStatus === "pending" ? (
        confirmingVoid ? (
          <Card
            style={{
              gap: space.md,
              borderColor: color.danger,
              backgroundColor: color.dangerSoft,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}
            >
              <TriangleAlert size={20} color={color.dangerInk} strokeWidth={2} />
              <Text style={[styles.body, { flex: 1 }]}>
                Void this sale? It has not been sent yet, so it will be removed from
                this terminal completely. This cannot be undone.
              </Text>
            </View>
            <Button
              label="Yes, void it"
              variant="danger"
              icon={Ban}
              onPress={() => void voidSale()}
            />
            <Button
              label="Keep sale"
              variant="secondary"
              onPress={() => setConfirmingVoid(false)}
            />
          </Card>
        ) : (
          <Button
            label="Void sale"
            variant="danger"
            icon={Ban}
            onPress={() => setConfirmingVoid(true)}
          />
        )
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: space.sm,
            padding: space.md,
            borderRadius: radius.sm,
            backgroundColor: color.primarySoft,
          }}
        >
          <Info size={16} color={color.primary} strokeWidth={2} />
          <Text style={[styles.muted, { flex: 1 }]}>
            This sale has been sent. To void it, use the admin dashboard so the stock
            goes back.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
