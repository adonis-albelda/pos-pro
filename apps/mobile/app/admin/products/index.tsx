import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation } from "@tanstack/react-query";
import { Package, PackagePlus, PackageSearch, Pencil, Warehouse } from "lucide-react-native";
import type { Product } from "@double-a/shared-types";
import { PRODUCT_UNITS, UNIT_LABELS, defaultAllowDecimal, stockLevel } from "@double-a/shared-types";
import {
  createProduct,
  updateProduct,
  adjustStock,
  type AdjustStockReason,
  type ProductInput,
} from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { useProducts, useInvalidateProducts } from "@/lib/query/products";
import { useCategories } from "@/lib/query/categories";
import { useLocationScope } from "@/lib/location-scope";
import { Badge, Button, EmptyState, ErrorNote, IconButton, Money } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { LoadingState } from "@/components/loading-state";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space } from "@/theme";

type ActiveFilter = "all" | "active" | "inactive";

const ADJUST_REASONS: AdjustStockReason[] = ["restock", "adjustment", "oversell_correction"];

const REASON_LABELS: Record<AdjustStockReason, string> = {
  restock: "Restock",
  adjustment: "Adjustment",
  oversell_correction: "Oversell correction",
};

const inputStyle = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: color.border,
  borderRadius: radius.sm,
  paddingHorizontal: space.md,
  color: color.ink,
};

export default function AdminProductsScreen() {
  const { locationId } = useLocationScope();
  const productsQuery = useProducts({
    pageSize: 100,
    includeInactive: true,
    locationId: locationId ?? undefined,
  });
  const invalidate = useInvalidateProducts();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActiveFilter>("all");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    const all = productsQuery.data?.products ?? [];
    const needle = query.trim().toLowerCase();
    return all.filter((product) => {
      if (filter === "active" && !product.isActive) return false;
      if (filter === "inactive" && product.isActive) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        (product.sku ?? "").toLowerCase().includes(needle)
      );
    });
  }, [productsQuery.data, query, filter]);

  const toggleActive = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) =>
      updateProduct(getAdminApiClient(), input.id, { isActive: input.isActive }),
    onSuccess: invalidate,
  });

  if (productsQuery.isPending) {
    return <LoadingState text="Loading products…" />;
  }

  if (productsQuery.isError) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>
          {productsQuery.error instanceof Error
            ? productsQuery.error.message
            : "Could not load products."}
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
          placeholder="Search name or SKU…"
          placeholderTextColor={color.inkMuted}
          style={[inputStyle, { flex: 1, backgroundColor: color.surface }]}
        />
        <Button label="Add" icon={PackagePlus} onPress={() => setEditing("new")} />
      </View>

      <View style={{ flexDirection: "row", gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm }}>
        {(["all", "active", "inactive"] as ActiveFilter[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => setFilter(option)}
            style={{
              paddingHorizontal: space.md,
              paddingVertical: space.xs,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: filter === option ? color.primary : color.border,
              backgroundColor: filter === option ? color.primaryTint : color.surface,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.caption,
                fontWeight: "600",
                color: filter === option ? color.primary : color.inkMuted,
                textTransform: "capitalize",
              }}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={query || filter !== "all" ? "Nothing matches" : "No products yet"}
          instruction={
            query || filter !== "all" ? "Try a different search or filter." : "Add a product to start."
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.md, gap: space.xs }}
          renderItem={({ item }) => {
            const level = stockLevel(item.stockQuantity, item.reorderPoint);
            return (
              <View
                style={{
                  gap: space.sm,
                  padding: space.md,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: color.border,
                  backgroundColor: color.surface,
                  opacity: item.isActive ? 1 : 0.55,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                      {item.sku ?? "No SKU"} · {item.category ?? "Uncategorized"}
                    </Text>
                  </View>
                  <Money value={item.price} />
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  {!item.isActive ? (
                    <Badge tone="neutral" label="Hidden" />
                  ) : level === "out" ? (
                    <Badge tone="danger" label="Out of stock" />
                  ) : level === "low" ? (
                    <Badge tone="warning" label="Low stock" />
                  ) : (
                    <Badge tone="success" label="In stock" />
                  )}
                  <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    {item.stockQuantity} {UNIT_LABELS[item.unit] ?? item.unit} on hand
                  </Text>
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Switch
                    value={item.isActive}
                    onValueChange={(value) => toggleActive.mutate({ id: item.id, isActive: value })}
                  />
                  <View style={{ flex: 1 }} />
                  <IconButton icon={Warehouse} label="Adjust stock" onPress={() => setAdjusting(item)} />
                  <IconButton icon={Pencil} label="Edit" onPress={() => setEditing(item)} />
                </View>
              </View>
            );
          }}
        />
      )}

      <BottomSheet open={editing !== null} onClose={() => setEditing(null)}>
        {editing ? (
          <ProductForm product={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        ) : null}
      </BottomSheet>

      <BottomSheet open={adjusting !== null} onClose={() => setAdjusting(null)}>
        {adjusting ? (
          <AdjustStockForm product={adjusting} onDone={() => setAdjusting(null)} />
        ) : null}
      </BottomSheet>
    </View>
  );
}

function ProductForm({ product, onDone }: { product: Product | null; onDone: () => void }) {
  const invalidate = useInvalidateProducts();
  const categoriesQuery = useCategories({ includeInactive: false });

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [costPrice, setCostPrice] = useState(product ? String(product.costPrice) : "");
  const [unit, setUnit] = useState(product?.unit ?? "pc");
  const [allowDecimal, setAllowDecimal] = useState(
    product?.allowDecimal ?? defaultAllowDecimal("pc"),
  );
  const [categoryId, setCategoryId] = useState<string | null>(product?.categoryId ?? null);
  const [reorderPoint, setReorderPoint] = useState(String(product?.reorderPoint ?? 5));
  const [bulkPrice, setBulkPrice] = useState(
    product?.bulkPrice !== null && product?.bulkPrice !== undefined ? String(product.bulkPrice) : "",
  );
  const [bulkMinQuantity, setBulkMinQuantity] = useState(
    product?.bulkMinQuantity !== null && product?.bulkMinQuantity !== undefined
      ? String(product.bulkMinQuantity)
      : "",
  );
  const [error, setError] = useState<string | null>(null);

  const categories = categoriesQuery.data ?? [];

  const save = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("Give the product a name.");
      const priceValue = Number(price);
      const costValue = Number(costPrice);
      if (!Number.isFinite(priceValue) || priceValue < 0) throw new Error("Enter a valid shelf price.");
      if (!Number.isFinite(costValue) || costValue < 0) throw new Error("Enter a valid supplier price.");

      const input: ProductInput = {
        name: trimmedName,
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        price: priceValue,
        costPrice: costValue,
        categoryId,
        unit,
        allowDecimal,
        reorderPoint: Number(reorderPoint) || 0,
        bulkPrice: bulkPrice.trim() ? Number(bulkPrice) : null,
        bulkMinQuantity: bulkMinQuantity.trim() ? Number(bulkMinQuantity) : null,
      };

      const client = getAdminApiClient();
      if (product) return updateProduct(client, product.id, input);
      return createProduct(client, input);
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
        {product ? `Edit ${product.name}` : "New product"}
      </Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name"
        placeholderTextColor={color.inkMuted}
        style={inputStyle}
      />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <TextInput
          value={sku}
          onChangeText={setSku}
          placeholder="SKU (optional)"
          placeholderTextColor={color.inkMuted}
          style={[inputStyle, { flex: 1 }]}
        />
        <TextInput
          value={barcode}
          onChangeText={setBarcode}
          placeholder="Barcode (optional)"
          placeholderTextColor={color.inkMuted}
          style={[inputStyle, { flex: 1 }]}
        />
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <TextInput
          value={costPrice}
          onChangeText={setCostPrice}
          placeholder="Supplier price"
          keyboardType="decimal-pad"
          placeholderTextColor={color.inkMuted}
          style={[inputStyle, { flex: 1 }]}
        />
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder="Shelf price"
          keyboardType="decimal-pad"
          placeholderTextColor={color.inkMuted}
          style={[inputStyle, { flex: 1 }]}
        />
      </View>

      <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.inkMuted }}>
        Sold by
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: space.xs }}>
          {PRODUCT_UNITS.map((option) => (
            <Pressable
              key={option}
              onPress={() => {
                setUnit(option);
                setAllowDecimal(defaultAllowDecimal(option));
              }}
              style={{
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: unit === option ? color.primary : color.border,
                backgroundColor: unit === option ? color.primaryTint : color.surface,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.caption,
                  fontWeight: "600",
                  color: unit === option ? color.primary : color.ink,
                }}
              >
                {UNIT_LABELS[option] ?? option}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {categories.length > 0 ? (
        <>
          <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.inkMuted }}>
            Category
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: space.xs }}>
              <Pressable
                onPress={() => setCategoryId(null)}
                style={{
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: categoryId === null ? color.primary : color.border,
                  backgroundColor: categoryId === null ? color.primaryTint : color.surface,
                }}
              >
                <Text
                  style={{
                    fontSize: fontSize.caption,
                    fontWeight: "600",
                    color: categoryId === null ? color.primary : color.ink,
                  }}
                >
                  None
                </Text>
              </Pressable>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  style={{
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: categoryId === category.id ? color.primary : color.border,
                    backgroundColor: categoryId === category.id ? color.primaryTint : color.surface,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.caption,
                      fontWeight: "600",
                      color: categoryId === category.id ? color.primary : color.ink,
                    }}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </>
      ) : null}

      <Pressable
        onPress={() => setAllowDecimal((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
      >
        <Switch value={allowDecimal} onValueChange={setAllowDecimal} />
        <Text style={{ color: color.ink }}>Allow decimal quantities</Text>
      </Pressable>

      <TextInput
        value={reorderPoint}
        onChangeText={setReorderPoint}
        placeholder="Reorder point"
        keyboardType="number-pad"
        placeholderTextColor={color.inkMuted}
        style={inputStyle}
      />

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <TextInput
          value={bulkPrice}
          onChangeText={setBulkPrice}
          placeholder="Bulk price (optional)"
          keyboardType="decimal-pad"
          placeholderTextColor={color.inkMuted}
          style={[inputStyle, { flex: 1 }]}
        />
        <TextInput
          value={bulkMinQuantity}
          onChangeText={setBulkMinQuantity}
          placeholder="Bulk starts at (qty)"
          keyboardType="number-pad"
          placeholderTextColor={color.inkMuted}
          style={[inputStyle, { flex: 1 }]}
        />
      </View>

      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
        Stock is not edited here. Use "Adjust stock" so every change is recorded as a movement.
      </Text>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        label={save.isPending ? "Saving…" : "Save"}
        icon={Package}
        busy={save.isPending}
        onPress={() => save.mutate()}
      />
    </View>
  );
}

function AdjustStockForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const invalidate = useInvalidateProducts();
  const { locationId } = useLocationScope();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<AdjustStockReason>("restock");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => {
      const magnitude = Number(quantity);
      if (!Number.isFinite(magnitude) || magnitude <= 0) {
        throw new Error("Enter a quantity greater than zero.");
      }
      const changeQuantity = direction === "remove" ? -magnitude : magnitude;
      return adjustStock(getAdminApiClient(), product.id, {
        changeQuantity,
        reason,
        note: note.trim() || null,
        locationId,
      });
    },
    onSuccess: () => {
      invalidate();
      onDone();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not adjust stock."),
  });

  return (
    <View style={{ gap: space.md }}>
      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
        Adjust stock — {product.name}
      </Text>
      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
        Currently {product.stockQuantity} {UNIT_LABELS[product.unit] ?? product.unit} on hand.
      </Text>

      <View style={{ flexDirection: "row", gap: space.xs }}>
        {(["add", "remove"] as const).map((option) => (
          <Pressable
            key={option}
            onPress={() => setDirection(option)}
            style={{
              flex: 1,
              paddingVertical: space.sm,
              borderRadius: radius.sm,
              borderWidth: 1,
              alignItems: "center",
              borderColor: direction === option ? color.primary : color.border,
              backgroundColor: direction === option ? color.primaryTint : color.surface,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.body,
                fontWeight: "600",
                color: direction === option ? color.primary : color.ink,
                textTransform: "capitalize",
              }}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={quantity}
        onChangeText={setQuantity}
        placeholder="Quantity"
        keyboardType="decimal-pad"
        placeholderTextColor={color.inkMuted}
        style={inputStyle}
      />

      <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.inkMuted }}>
        Reason
      </Text>
      <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
        {ADJUST_REASONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setReason(option)}
            style={{
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: reason === option ? color.primary : color.border,
              backgroundColor: reason === option ? color.primaryTint : color.surface,
            }}
          >
            <Text
              style={{
                fontSize: fontSize.caption,
                fontWeight: "600",
                color: reason === option ? color.primary : color.ink,
              }}
            >
              {REASON_LABELS[option]}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={color.inkMuted}
        style={inputStyle}
      />

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        label={submit.isPending ? "Saving…" : "Save adjustment"}
        icon={Warehouse}
        busy={submit.isPending}
        onPress={() => submit.mutate()}
      />
    </View>
  );
}
