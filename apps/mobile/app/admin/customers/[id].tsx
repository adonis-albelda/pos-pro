import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, HandCoins } from "lucide-react-native";
import { recordCustomerPayment } from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { useCustomer } from "@/lib/query/customers";
import {
  useCustomerBalance,
  useCustomerOpenSales,
  useCustomerPayments,
  useInvalidateCustomerCredit,
} from "@/lib/query/customer-payments";
import { Badge, Button, Card, EmptyState, ErrorNote, LedgerLine, Money } from "@/components/ui";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space, styles } from "@/theme";

export default function AdminCustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const customerQuery = useCustomer(id);
  const balanceQuery = useCustomerBalance(id);
  const openSalesQuery = useCustomerOpenSales(id);
  const paymentsQuery = useCustomerPayments(id);
  const invalidate = useInvalidateCustomerCredit(id);

  if (customerQuery.isPending || balanceQuery.isPending) {
    return <LoadingState text="Loading this customer…" />;
  }

  if (customerQuery.isError || !customerQuery.data) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>This customer could not be found.</ErrorNote>
      </View>
    );
  }

  const customer = customerQuery.data;
  const balance = balanceQuery.data ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <WaveBackdrop />
      <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
        <BackRow onPress={() => router.back()} />

        <View style={{ gap: space.xs }}>
          <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
            {customer.name}
          </Text>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            {[customer.contact, customer.address].filter(Boolean).join(" · ") || "No contact on file"}
          </Text>
        </View>

        <Card style={[styles.floatShadow, { borderRadius: radius.sm }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm }}>
            <HandCoins size={16} color={color.primary} strokeWidth={2} />
            <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>
              Utang balance
            </Text>
          </View>
          <Money
            value={balance}
            style={[styles.total, { color: balance > 0 ? color.warningInk : color.ink }]}
          />
          {balance > 0 ? (
            <View style={{ marginTop: space.xs, alignSelf: "flex-start" }}>
              <Badge tone="warning" label="Outstanding" />
            </View>
          ) : null}
        </Card>

        <RecordPaymentCard customerId={id} onRecorded={invalidate} />

        <Card style={[styles.floatShadow, { borderRadius: radius.sm }]}>
          <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink, marginBottom: space.sm }}>
            Open credit sales
          </Text>
          {(openSalesQuery.data ?? []).length === 0 ? (
            <EmptyState title="Nothing open" instruction="No unpaid credit sales for this customer." />
          ) : (
            openSalesQuery.data?.map((sale) => (
              <View
                key={sale.saleId}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: space.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: color.border,
                }}
              >
                <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                  {new Date(sale.createdAt).toLocaleDateString()}
                </Text>
                <Money value={sale.amountOpen} style={{ fontWeight: "600" }} />
              </View>
            ))
          )}
        </Card>

        <Card style={[styles.floatShadow, { borderRadius: radius.sm }]}>
          <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink, marginBottom: space.sm }}>
            Payment history
          </Text>
          {(paymentsQuery.data ?? []).length === 0 ? (
            <EmptyState title="No payments yet" instruction="Payments recorded against this customer show up here." />
          ) : (
            <>
              {paymentsQuery.data?.map((payment) => (
                <View
                  key={payment.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: space.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: color.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                      {new Date(payment.paidAt).toLocaleString()}
                    </Text>
                    {payment.note ? (
                      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>{payment.note}</Text>
                    ) : null}
                  </View>
                  <Money value={payment.amount} style={{ fontWeight: "600" }} />
                </View>
              ))}
              <LedgerLine />
            </>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

function RecordPaymentCard({ customerId, onRecorded }: { customerId: string; onRecorded: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: () => {
      const parsed = Number(amount);
      if (!parsed || parsed <= 0) throw new Error("Enter an amount greater than zero.");
      return recordCustomerPayment(getAdminApiClient(), customerId, {
        amount: parsed,
        note: note.trim() ? note.trim() : null,
      });
    },
    onSuccess: () => {
      setAmount("");
      setNote("");
      setError(null);
      onRecorded();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not record this payment."),
  });

  return (
    <Card style={[styles.floatShadow, { borderRadius: radius.sm }]}>
      <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink, marginBottom: space.sm }}>
        Record a payment
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Amount"
          placeholderTextColor={color.inkMuted}
          style={{
            flex: 1,
            minHeight: 44,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: radius.sm,
            paddingHorizontal: space.md,
            color: color.ink,
          }}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Note (optional)"
          placeholderTextColor={color.inkMuted}
          style={{
            flex: 1,
            minHeight: 44,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: radius.sm,
            paddingHorizontal: space.md,
            color: color.ink,
          }}
        />
      </View>
      {error ? (
        <View style={{ marginTop: space.sm }}>
          <ErrorNote>{error}</ErrorNote>
        </View>
      ) : null}
      <Button
        label={record.isPending ? "Recording…" : "Record payment"}
        busy={record.isPending}
        style={{ marginTop: space.sm }}
        onPress={() => record.mutate()}
      />
    </Card>
  );
}

function BackRow({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back to customers"
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" }}
    >
      <ArrowLeft size={18} color={color.ink} strokeWidth={2} />
      <Text style={{ fontSize: fontSize.body, color: color.ink, fontWeight: "600" }}>Customers</Text>
    </Pressable>
  );
}
