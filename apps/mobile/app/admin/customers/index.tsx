import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Pencil, Trash2, UserPlus, UserRound } from "lucide-react-native";
import type { Customer } from "@double-a/shared-types";
import { CUSTOMER_FIELD_MAX_LENGTH, normaliseCustomerDetails } from "@double-a/shared-types";
import { createCustomer, deleteCustomer, updateCustomer } from "@double-a/api-client/queries";
import { getAdminApiClient, getApiClient } from "@/lib/api/session";
import { useCustomers, useInvalidateCustomers } from "@/lib/query/customers";
import { useCustomerBalances } from "@/lib/query/customer-payments";
import { Button, EmptyState, ErrorNote, IconButton, Money } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space } from "@/theme";

export default function AdminCustomersScreen() {
  const router = useRouter();
  const customersQuery = useCustomers();
  const balancesQuery = useCustomerBalances();
  const invalidate = useInvalidateCustomers();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Customer | "new" | null>(null);

  const filtered = useMemo(() => {
    const rows = customersQuery.data ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((c) =>
      [c.name, c.contact, c.address].some((field) => field?.toLowerCase().includes(needle)),
    );
  }, [customersQuery.data, query]);

  const remove = useMutation({
    mutationFn: (id: string) => deleteCustomer(getAdminApiClient(), id),
    onSuccess: invalidate,
  });

  if (customersQuery.isPending) {
    return <LoadingState text="Loading customers…" />;
  }

  if (customersQuery.isError) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>
          {customersQuery.error instanceof Error
            ? customersQuery.error.message
            : "Could not load customers."}
        </ErrorNote>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <WaveBackdrop />
      <View style={{ flexDirection: "row", gap: space.sm, padding: space.md }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, contact, or address…"
          placeholderTextColor={color.inkMuted}
          style={{
            flex: 1,
            minHeight: 44,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: radius.sm,
            paddingHorizontal: space.md,
            color: color.ink,
            backgroundColor: color.surface,
          }}
        />
        <Button label="Add" icon={UserPlus} onPress={() => setEditing("new")} />
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={query ? "Nothing matches" : "No customers yet"}
          instruction={query ? "Try a different name." : "Add a customer to start."}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.md, gap: space.xs }}
          renderItem={({ item }) => {
            const balance = balancesQuery.data?.[item.id] ?? 0;

            return (
              <Pressable
                onPress={() => router.push(`/admin/customers/${item.id}`)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  padding: space.md,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: color.border,
                  backgroundColor: color.surface,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    {[item.contact, item.address].filter(Boolean).join(" · ") || "No contact on file"}
                  </Text>
                  {balance > 0 ? (
                    <Money
                      value={balance}
                      style={{ fontSize: fontSize.caption, color: color.warningInk, fontWeight: "600" }}
                    />
                  ) : null}
                </View>
                <IconButton icon={Pencil} label="Edit" onPress={() => setEditing(item)} />
                <IconButton
                  icon={Trash2}
                  label="Delete"
                  tone="danger"
                  onPress={() => remove.mutate(item.id)}
                />
                <ChevronRight size={18} color={color.inkMuted} />
              </Pressable>
            );
          }}
        />
      )}

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)}>
        {editing ? (
          <CustomerForm
            customer={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </BottomSheet>
    </View>
  );
}

function CustomerForm({
  customer,
  onDone,
}: {
  customer: Customer | null;
  onDone: () => void;
}) {
  const invalidate = useInvalidateCustomers();
  const [name, setName] = useState(customer?.name ?? "");
  const [contact, setContact] = useState(customer?.contact ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const details = normaliseCustomerDetails({ name, contact, address });
      if (!details.name) throw new Error("Give the customer a name.");
      const row = {
        name: details.name.slice(0, CUSTOMER_FIELD_MAX_LENGTH),
        contact: details.contact,
        address: details.address,
      };
      const client = getApiClient();
      // No client-generated id here: unlike a POS terminal creating a walk-in
      // customer offline (CLAUDE.md rule 11), this screen is online-only and
      // mirrors apps/admin's saveCustomer action, which also omits `id` on
      // create and lets the server mint it.
      if (customer) return updateCustomer(client, customer.id, row);
      return createCustomer(client, row);
    },
    onSuccess: () => {
      invalidate();
      onDone();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save."),
  });

  return (
    <View style={{ gap: space.md }}>
      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
        {customer ? `Edit ${customer.name}` : "New customer"}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name"
        maxLength={CUSTOMER_FIELD_MAX_LENGTH}
        placeholderTextColor={color.inkMuted}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: color.border,
          borderRadius: radius.sm,
          paddingHorizontal: space.md,
          color: color.ink,
        }}
      />
      <TextInput
        value={contact}
        onChangeText={setContact}
        placeholder="Contact number"
        keyboardType="phone-pad"
        maxLength={CUSTOMER_FIELD_MAX_LENGTH}
        placeholderTextColor={color.inkMuted}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: color.border,
          borderRadius: radius.sm,
          paddingHorizontal: space.md,
          color: color.ink,
        }}
      />
      <TextInput
        value={address}
        onChangeText={setAddress}
        placeholder="Address"
        maxLength={CUSTOMER_FIELD_MAX_LENGTH}
        placeholderTextColor={color.inkMuted}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: color.border,
          borderRadius: radius.sm,
          paddingHorizontal: space.md,
          color: color.ink,
        }}
      />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        label={save.isPending ? "Saving…" : "Save"}
        busy={save.isPending}
        onPress={() => save.mutate()}
      />
    </View>
  );
}
