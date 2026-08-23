import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Banknote,
  CreditCard,
  Smartphone,
  TriangleAlert,
  UserRound,
} from "lucide-react-native";
import { formatMoney, hasCustomerDetails, saleCustomer } from "@double-a/shared-types";
import { patchSaleFlags, voidSale } from "@double-a/api-client/queries";
import { getAdminApiClient, getApiClient } from "@/lib/api/session";
import { useSale, useInvalidateSales } from "@/lib/query/sales";
import { useUsers } from "@/lib/query/users";
import { Badge, Button, Card, ErrorNote, LedgerLine, Money } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space, styles } from "@/theme";

export default function AdminSaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const saleQuery = useSale(id);
  const usersQuery = useUsers({ includeInactive: true });
  const invalidate = useInvalidateSales();

  const [confirmingVoid, setConfirmingVoid] = useState(false);

  const cashierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of usersQuery.data ?? []) map.set(user.id, user.name);
    return map;
  }, [usersQuery.data]);

  const voidMutation = useMutation({
    mutationFn: () => voidSale(getAdminApiClient(), id),
    onSuccess: () => {
      invalidate();
      setConfirmingVoid(false);
    },
  });

  const flagsMutation = useMutation({
    mutationFn: (flags: { isPaid: boolean; deliveryCompleted: boolean }) =>
      patchSaleFlags(getApiClient(), id, flags),
    onSuccess: invalidate,
  });

  if (saleQuery.isPending || usersQuery.isPending) {
    return <LoadingState text="Loading this sale…" />;
  }

  if (saleQuery.isError) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>
          {saleQuery.error instanceof Error ? saleQuery.error.message : "Could not load this sale."}
        </ErrorNote>
      </View>
    );
  }

  const sale = saleQuery.data;
  if (!sale) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>This sale could not be found.</ErrorNote>
      </View>
    );
  }

  const cashier = sale.userId ? cashierNameById.get(sale.userId) : null;
  const customer = saleCustomer(sale);
  const soldAt = new Date(sale.createdAt).toLocaleString("en-PH", {
    dateStyle: "full",
    timeStyle: "short",
  });

  return (
    <View style={{ flex: 1 }}>
      <WaveBackdrop />
      <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
      <BackRow onPress={() => router.back()} />

      <View style={{ gap: space.xs }}>
        <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
          Sale <Text style={styles.numeric}>{sale.invoiceNumber ?? id.slice(0, 8)}</Text>
        </Text>
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>{soldAt}</Text>
        {sale.deviceId ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Smartphone size={13} color={color.inkMuted} />
            <Text style={[styles.numeric, { fontSize: fontSize.caption, color: color.inkMuted }]}>
              {sale.deviceId}
            </Text>
          </View>
        ) : null}
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
          Rung up by {cashier ?? "an unknown cashier"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
        {sale.status === "completed" ? (
          <Badge tone="success" label="Completed" />
        ) : sale.status === "voided" ? (
          <Badge tone="danger" label="Voided" />
        ) : (
          <Badge tone="warning" label="Refunded" />
        )}
        <Badge
          tone="neutral"
          icon={sale.paymentMethod === "cash" ? Banknote : CreditCard}
          label={sale.paymentMethod ?? "payment not recorded"}
        />
        {sale.isPaid ? (
          <Badge tone="success" label="Paid" />
        ) : (
          <Badge tone="warning" label="Unpaid" />
        )}
        <Badge
          tone={sale.fulfillment === "delivery" ? "warning" : "neutral"}
          label={
            sale.fulfillment === "delivery"
              ? sale.deliveryCompleted
                ? "Delivery done"
                : "Delivery open"
              : "Pickup"
          }
        />
      </View>

      {sale.status === "completed" ? (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Button
            label={sale.isPaid ? "Mark unpaid" : "Mark paid"}
            variant="secondary"
            busy={flagsMutation.isPending}
            onPress={() =>
              flagsMutation.mutate({
                isPaid: !sale.isPaid,
                deliveryCompleted: sale.deliveryCompleted,
              })
            }
          />
          {sale.fulfillment === "delivery" ? (
            <Button
              label={sale.deliveryCompleted ? "Reopen delivery" : "Mark delivered"}
              variant="secondary"
              busy={flagsMutation.isPending}
              onPress={() =>
                flagsMutation.mutate({
                  isPaid: sale.isPaid,
                  deliveryCompleted: !sale.deliveryCompleted,
                })
              }
            />
          ) : null}
        </View>
      ) : null}

      {flagsMutation.isError ? (
        <ErrorNote>
          {flagsMutation.error instanceof Error
            ? flagsMutation.error.message
            : "Could not update this sale."}
        </ErrorNote>
      ) : null}

      {hasCustomerDetails(customer) ? (
        <Card style={[{ gap: space.sm }, styles.floatShadow, { borderRadius: radius.sm }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <UserRound size={16} color={color.primary} strokeWidth={2} />
            <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>
              {customer.name ?? "Customer"}
            </Text>
          </View>
          {customer.contact ? (
            <Text style={[styles.numeric, { fontSize: fontSize.body, color: color.ink }]}>
              {customer.contact}
            </Text>
          ) : null}
          {customer.address ? (
            <Text style={{ fontSize: fontSize.body, color: color.ink }}>{customer.address}</Text>
          ) : null}
        </Card>
      ) : null}

      <Card style={[styles.floatShadow, { borderRadius: radius.sm }]}>
        <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink, marginBottom: space.sm }}>
          Line items
        </Text>
        {sale.items.map((item) => {
          const belowCost = item.unitPrice < item.unitCost;
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
                <Text style={{ fontSize: fontSize.body, color: color.ink }}>{item.productName}</Text>
                <Text style={[styles.numeric, { fontSize: fontSize.caption, color: color.inkMuted }]}>
                  {item.quantity} @ {formatMoney(item.unitPrice)}
                  {discounted ? ` (was ${formatMoney(item.listPrice)})` : ""}
                </Text>
                {belowCost ? (
                  <Text style={{ fontSize: fontSize.caption, color: color.dangerInk }}>
                    Below cost ({formatMoney(item.unitCost)})
                  </Text>
                ) : null}
              </View>
              <Money value={item.subtotal} style={{ fontWeight: "600" }} />
            </View>
          );
        })}

        <LedgerLine />

        {sale.discountAmount > 0 ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: space.xs,
            }}
          >
            <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>Discount given</Text>
            <Money value={sale.discountAmount} style={{ color: color.warningInk }} />
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>Total</Text>
          <Money value={sale.totalAmount} style={styles.total} />
        </View>
      </Card>

      {sale.status === "completed" ? (
        confirmingVoid ? (
          <Card
            style={[
              { gap: space.md, borderColor: color.danger, backgroundColor: color.dangerSoft },
              styles.floatShadow,
              { borderRadius: radius.sm },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
              <TriangleAlert size={20} color={color.dangerInk} strokeWidth={2} />
              <Text style={[styles.body, { flex: 1 }]}>
                Void this sale? Stock for every line will be restored. This cannot be undone.
              </Text>
            </View>
            {voidMutation.isError ? (
              <ErrorNote>
                {voidMutation.error instanceof Error
                  ? voidMutation.error.message
                  : "Could not void this sale."}
              </ErrorNote>
            ) : null}
            <Button
              label="Yes, void it"
              variant="danger"
              icon={Ban}
              busy={voidMutation.isPending}
              onPress={() => voidMutation.mutate()}
            />
            <Button
              label="Keep sale"
              variant="secondary"
              disabled={voidMutation.isPending}
              onPress={() => setConfirmingVoid(false)}
            />
          </Card>
        ) : (
          <Button label="Void sale" variant="danger" icon={Ban} onPress={() => setConfirmingVoid(true)} />
        )
      ) : null}
      </ScrollView>
    </View>
  );
}

function BackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back to sales"
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" }}
    >
      <ArrowLeft size={18} color={color.ink} strokeWidth={2} />
      <Text style={{ fontSize: fontSize.body, color: color.ink, fontWeight: "600" }}>Sales</Text>
    </Pressable>
  );
}
