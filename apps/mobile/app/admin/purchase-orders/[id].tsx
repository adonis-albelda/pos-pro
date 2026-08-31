import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Ban, Copy, PackageCheck, Send, Wallet } from "lucide-react-native";
import type { PurchaseOrderItem } from "@double-a/shared-types";
import {
  PURCHASE_ORDER_STATUS_LABELS,
  formatMoney,
  formatQuantity,
  poItemReceiveState,
  purchaseOrderBalance,
} from "@double-a/shared-types";
import {
  markPaymentPaid,
  markPaymentUnpaid,
  receivePurchaseOrderItem,
  setPurchaseOrderStatus,
} from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { useSuppliers } from "@/lib/query/suppliers";
import { PO_STATUS_TONE, useInvalidatePurchaseOrders, usePurchaseOrder } from "@/lib/query/purchase-orders";
import { Badge, Button, Card, EmptyState, ErrorNote, LedgerLine, Money } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space, styles } from "@/theme";

const RECEIVE_STATE_BADGE = {
  pending: { tone: "neutral" as const, label: "Not received" },
  partial: { tone: "warning" as const, label: "Partially received" },
  received: { tone: "success" as const, label: "Received" },
};

export default function AdminPurchaseOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const orderQuery = usePurchaseOrder(id);
  const suppliersQuery = useSuppliers({ includeInactive: true });
  const invalidate = useInvalidatePurchaseOrders();

  const supplierNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const supplier of suppliersQuery.data ?? []) map.set(supplier.id, supplier.name);
    return map;
  }, [suppliersQuery.data]);

  const statusMutation = useMutation({
    mutationFn: (status: "ordered" | "cancelled") => setPurchaseOrderStatus(getAdminApiClient(), id, status),
    onSuccess: invalidate,
  });

  if (orderQuery.isPending || suppliersQuery.isPending) {
    return <LoadingState text="Loading this order…" />;
  }

  if (orderQuery.isError) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>
          {orderQuery.error instanceof Error
            ? orderQuery.error.message
            : "Could not load this purchase order."}
        </ErrorNote>
      </View>
    );
  }

  const order = orderQuery.data;
  if (!order) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>This purchase order could not be found.</ErrorNote>
      </View>
    );
  }

  const balance = purchaseOrderBalance(order.payments);
  const canReceive = order.status === "ordered" || order.status === "partially_received";

  return (
    <View style={{ flex: 1 }}>
      <WaveBackdrop />
      <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
      <BackRow onPress={() => router.back()} />

      <View style={{ gap: space.xs }}>
        <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
          {supplierNameById.get(order.supplierId) ?? "Unknown supplier"}
        </Text>
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
          Ordered {order.orderDate}
          {order.expectedDate ? ` · Expected ${order.expectedDate}` : ""}
          {order.referenceNo ? ` · Ref ${order.referenceNo}` : ""}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap", alignItems: "center" }}>
        <Badge tone={PO_STATUS_TONE[order.status]} label={PURCHASE_ORDER_STATUS_LABELS[order.status]} />
      </View>

      {canReceive ? (
        <Button
          label="Receive delivery"
          icon={PackageCheck}
          onPress={() => router.push(`/admin/receiving?purchase_order_id=${order.id}`)}
        />
      ) : null}

      {order.status === "draft" || order.status === "ordered" ? (
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {order.status === "draft" ? (
            <Button
              label="Mark as ordered"
              icon={Send}
              busy={statusMutation.isPending}
              onPress={() => statusMutation.mutate("ordered")}
            />
          ) : null}
          <Button
            label="Cancel order"
            variant="secondary"
            icon={Ban}
            busy={statusMutation.isPending}
            onPress={() => statusMutation.mutate("cancelled")}
          />
        </View>
      ) : null}

      {statusMutation.isError ? (
        <ErrorNote>
          {statusMutation.error instanceof Error
            ? statusMutation.error.message
            : "Could not update this order's status."}
        </ErrorNote>
      ) : null}

      {order.notes ? (
        <Card style={[styles.floatShadow, { borderRadius: radius.sm }]}>
          <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink, marginBottom: space.xs }}>
            Notes
          </Text>
          <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>{order.notes}</Text>
        </Card>
      ) : null}

      <Card style={[styles.floatShadow, { borderRadius: radius.sm }]}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: space.sm,
          }}
        >
          <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>
            Line items
          </Text>
          {order.items.length > 0 ? (
            <CopyItemsButton
              supplierName={supplierNameById.get(order.supplierId) ?? "Unknown supplier"}
              items={order.items}
            />
          ) : null}
        </View>
        {order.items.length === 0 ? (
          <EmptyState title="No line items" instruction="This order has no products on it." />
        ) : (
          order.items.map((item) => (
            <PurchaseOrderLineRow
              key={item.id}
              item={item}
              purchaseOrderId={order.id}
              canReceive={canReceive}
              onReceived={invalidate}
            />
          ))
        )}
        <LedgerLine />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>Total</Text>
          <Money value={order.totalAmount} style={styles.total} />
        </View>
      </Card>

      <Card style={[styles.floatShadow, { borderRadius: radius.sm }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm }}>
          <Wallet size={16} color={color.primary} strokeWidth={2} />
          <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>Payment terms</Text>
        </View>
        {order.payments.length === 0 ? (
          <EmptyState
            title="No payment terms"
            instruction="No installment schedule — mark the whole order paid whenever it settles."
          />
        ) : (
          <>
            {order.payments
              .slice()
              .sort((a, b) => a.termNumber - b.termNumber)
              .map((term) => (
                <PaymentTermRow key={term.id} term={term} purchaseOrderId={order.id} onChanged={invalidate} />
              ))}
            <LedgerLine />
            <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
              {formatMoney(balance)} still owed across unpaid terms.
            </Text>
          </>
        )}
      </Card>
      </ScrollView>
    </View>
  );
}

/**
 * Plain text, not a formatted table — this is meant to be pasted straight
 * into a chat with the supplier, not read on-device. Ordered quantity, not
 * received: what the supplier still needs to know is what was asked for.
 */
function buildItemsText(supplierName: string, items: PurchaseOrderItem[]): string {
  const lines = items.map(
    (item, index) => `${index + 1}. ${item.productName} x ${formatQuantity(item.quantityOrdered)}`,
  );
  return [`Order for ${supplierName}:`, ...lines].join("\n");
}

function CopyItemsButton({
  supplierName,
  items,
}: {
  supplierName: string;
  items: PurchaseOrderItem[];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await Clipboard.setStringAsync(buildItemsText(supplierName, items));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      label={copied ? "Copied!" : "Copy items"}
      variant="secondary"
      icon={Copy}
      onPress={() => void copy()}
    />
  );
}

function PurchaseOrderLineRow({
  item,
  purchaseOrderId,
  canReceive,
  onReceived,
}: {
  item: PurchaseOrderItem;
  purchaseOrderId: string;
  canReceive: boolean;
  onReceived: () => void;
}) {
  const remaining = item.quantityOrdered - item.quantityReceived;
  const state = poItemReceiveState(item);
  const badge = RECEIVE_STATE_BADGE[state];
  const [quantity, setQuantity] = useState(String(remaining));
  const [error, setError] = useState<string | null>(null);

  const receive = useMutation({
    mutationFn: () => {
      const parsed = Number(quantity);
      if (!parsed || parsed <= 0) throw new Error("Enter a quantity greater than zero.");
      return receivePurchaseOrderItem(getAdminApiClient(), {
        itemId: item.id,
        purchaseOrderId,
        currentQuantityReceived: item.quantityReceived,
        quantity: parsed,
      });
    },
    onSuccess: () => {
      setError(null);
      onReceived();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not receive this line."),
  });

  return (
    <View
      style={{
        paddingVertical: space.sm,
        borderBottomWidth: 1,
        borderBottomColor: color.border,
        gap: space.xs,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: fontSize.body, color: color.ink, fontWeight: "600" }}>
            {item.productName}
          </Text>
          <Text style={[styles.numeric, { fontSize: fontSize.caption, color: color.inkMuted }]}>
            {formatQuantity(item.quantityReceived)}/{formatQuantity(item.quantityOrdered)} @{" "}
            {formatMoney(item.unitCost)}
          </Text>
          <Badge tone={badge.tone} label={badge.label} />
        </View>
        <Money value={item.lineTotal} style={{ fontWeight: "600" }} />
      </View>

      {canReceive && remaining > 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="Qty"
            placeholderTextColor={color.inkMuted}
            style={{
              width: 80,
              minHeight: 40,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: radius.sm,
              paddingHorizontal: space.sm,
              color: color.ink,
              textAlign: "right",
            }}
          />
          <Button
            label={receive.isPending ? "Receiving…" : "Receive"}
            icon={PackageCheck}
            variant="secondary"
            busy={receive.isPending}
            onPress={() => receive.mutate()}
          />
        </View>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </View>
  );
}

function PaymentTermRow({
  term,
  purchaseOrderId,
  onChanged,
}: {
  term: { id: string; termNumber: number; dueDate: string | null; amount: number; isPaid: boolean };
  purchaseOrderId: string;
  onChanged: () => void;
}) {
  const toggle = useMutation({
    mutationFn: () =>
      term.isPaid
        ? markPaymentUnpaid(getAdminApiClient(), term.id, purchaseOrderId)
        : markPaymentPaid(getAdminApiClient(), term.id, purchaseOrderId),
    onSuccess: onChanged,
  });

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingVertical: space.sm,
        borderBottomWidth: 1,
        borderBottomColor: color.border,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: fontSize.body, color: color.ink, fontWeight: "600" }}>
          Term #{term.termNumber}
        </Text>
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
          {term.dueDate ?? "No due date"}
        </Text>
      </View>
      <Money value={term.amount} style={{ fontWeight: "600" }} />
      <Badge tone={term.isPaid ? "success" : "warning"} label={term.isPaid ? "Paid" : "Unpaid"} />
      <Button
        label={term.isPaid ? "Mark unpaid" : "Mark paid"}
        variant="secondary"
        busy={toggle.isPending}
        onPress={() => toggle.mutate()}
      />
    </View>
  );
}

function BackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back to purchase orders"
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" }}
    >
      <ArrowLeft size={18} color={color.ink} strokeWidth={2} />
      <Text style={{ fontSize: fontSize.body, color: color.ink, fontWeight: "600" }}>Purchase orders</Text>
    </Pressable>
  );
}
