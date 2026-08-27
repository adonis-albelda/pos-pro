import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  History,
  Package,
  PackageSearch,
  TriangleAlert,
  Warehouse,
  X,
} from "lucide-react-native";
import type { InventoryMovement, InventoryReason, Product } from "@double-a/shared-types";
import { UNIT_LABELS } from "@double-a/shared-types";
import { adjustStock, type AdjustStockReason } from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { useProducts, useInvalidateProducts } from "@/lib/query/products";
import {
  useBelowReorderProducts,
  useInvalidateInventory,
  useMovements,
  useOversoldProducts,
} from "@/lib/query/inventory";
import { useLocationScope } from "@/lib/location-scope";
import { Badge, Button, EmptyState, ErrorNote, IconButton } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space, styles } from "@/theme";

type Tab = "movements" | "oversold" | "below-reorder";

const TABS: { key: Tab; label: string; icon: typeof History }[] = [
  { key: "movements", label: "Movements", icon: History },
  { key: "oversold", label: "Oversold", icon: TriangleAlert },
  { key: "below-reorder", label: "Below reorder", icon: PackageSearch },
];

const REASON_LABELS: Record<InventoryReason, string> = {
  sale: "Sale",
  restock: "Restock",
  adjustment: "Adjustment",
  oversell_correction: "Oversell correction",
  void_restore: "Void restore",
  replace_restore: "Item replaced",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};

const ADJUST_REASONS: AdjustStockReason[] = ["restock", "adjustment", "oversell_correction"];

const REASON_OPTION_LABELS: Record<AdjustStockReason, string> = {
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

export default function AdminInventoryScreen() {
  const { locationId } = useLocationScope();
  const [tab, setTab] = useState<Tab>("movements");
  const [productFilter, setProductFilter] = useState<Product | null>(null);
  const [pickingFilter, setPickingFilter] = useState(false);
  const [pickingAdjust, setPickingAdjust] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  // Whole catalogue — used to resolve product names on movement rows and to
  // power the pickers. Stock column scoped to active location when set.
  const productsQuery = useProducts({
    pageSize: 200,
    includeInactive: true,
    locationId: locationId ?? undefined,
  });
  const products = useMemo(() => productsQuery.data?.products ?? [], [productsQuery.data]);
  const productNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const product of products) map[product.id] = product.name;
    return map;
  }, [products]);

  const movementsQuery = useMovements({ productId: productFilter?.id, pageSize: 50 });
  const oversoldQuery = useOversoldProducts();
  const belowReorderQuery = useBelowReorderProducts();

  const invalidateInventory = useInvalidateInventory();
  const invalidateProducts = useInvalidateProducts();

  function afterAdjust() {
    invalidateInventory();
    invalidateProducts();
    setAdjusting(null);
  }

  return (
    <View style={{ flex: 1 }}>
      <WaveBackdrop />
      <View style={{ padding: space.md, gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Text style={{ flex: 1, fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
            Inventory
          </Text>
          <Button label="Adjust stock" icon={Warehouse} onPress={() => setPickingAdjust(true)} />
        </View>
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
          Stock only ever moves through a recorded movement — restocks, adjustments, and
          oversell corrections all go through this button.
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.sm }}>
        {TABS.map((option) => (
          <Pressable
            key={option.key}
            onPress={() => setTab(option.key)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: space.xs,
              paddingVertical: space.sm,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: tab === option.key ? color.primary : color.border,
              backgroundColor: tab === option.key ? color.primaryTint : color.surface,
            }}
          >
            <option.icon size={14} color={tab === option.key ? color.primary : color.inkMuted} />
            <Text
              style={{
                fontSize: fontSize.caption,
                fontWeight: "600",
                color: tab === option.key ? color.primary : color.ink,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "movements" ? (
        <MovementsSection
          productFilter={productFilter}
          onPickFilter={() => setPickingFilter(true)}
          onClearFilter={() => setProductFilter(null)}
          movementsQuery={movementsQuery}
          productNameById={productNameById}
        />
      ) : tab === "oversold" ? (
        <ProductFlagSection
          query={oversoldQuery}
          emptyTitle="Nothing oversold"
          emptyInstruction="Every product's stock is at or above zero."
          badgeTone="danger"
          badgeLabel={(product) => `${product.stockQuantity} on hand`}
          onAdjust={(product) => setAdjusting(product)}
        />
      ) : (
        <ProductFlagSection
          query={belowReorderQuery}
          emptyTitle="Nothing needs reordering"
          emptyInstruction="Every product is above its reorder point."
          badgeTone="warning"
          badgeLabel={(product) => `${product.stockQuantity} on hand · reorder at ${product.reorderPoint}`}
          onAdjust={(product) => setAdjusting(product)}
        />
      )}

      <BottomSheet open={pickingFilter} onClose={() => setPickingFilter(false)}>
        <ProductPicker
          products={products}
          onPick={(product) => {
            setProductFilter(product);
            setPickingFilter(false);
          }}
          title="Filter movements by product"
        />
      </BottomSheet>

      <BottomSheet open={pickingAdjust} onClose={() => setPickingAdjust(false)}>
        <ProductPicker
          products={products}
          onPick={(product) => {
            setPickingAdjust(false);
            setAdjusting(product);
          }}
          title="Pick a product to adjust"
        />
      </BottomSheet>

      <BottomSheet open={adjusting !== null} onClose={() => setAdjusting(null)}>
        {adjusting ? <AdjustStockForm product={adjusting} onDone={afterAdjust} /> : null}
      </BottomSheet>
    </View>
  );
}

function MovementsSection({
  productFilter,
  onPickFilter,
  onClearFilter,
  movementsQuery,
  productNameById,
}: {
  productFilter: Product | null;
  onPickFilter: () => void;
  onClearFilter: () => void;
  movementsQuery: ReturnType<typeof useMovements>;
  productNameById: Record<string, string>;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.sm }}>
        <Pressable
          onPress={onPickFilter}
          style={[inputStyle, { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: color.surface }]}
        >
          <Text
            numberOfLines={1}
            style={{ color: productFilter ? color.ink : color.inkMuted, fontSize: fontSize.body }}
          >
            {productFilter ? productFilter.name : "All products"}
          </Text>
        </Pressable>
        {productFilter ? (
          <IconButton icon={X} label="Clear filter" onPress={onClearFilter} />
        ) : null}
      </View>

      {movementsQuery.isPending ? (
        <View style={{ padding: space.xl, alignItems: "center" }}>
          <ActivityIndicator color={color.primary} />
        </View>
      ) : movementsQuery.isError ? (
        <View style={{ padding: space.md }}>
          <ErrorNote>
            {movementsQuery.error instanceof Error
              ? movementsQuery.error.message
              : "Could not load movements."}
          </ErrorNote>
        </View>
      ) : (movementsQuery.data?.movements.length ?? 0) === 0 ? (
        <EmptyState
          icon={History}
          title="No movements yet"
          instruction={
            productFilter
              ? "Nothing recorded for this product."
              : "Restocks, adjustments, and sales will show up here once recorded."
          }
        />
      ) : (
        <FlatList
          data={movementsQuery.data?.movements ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: space.md, gap: space.xs }}
          renderItem={({ item }) => <MovementRow movement={item} productName={productNameById[item.productId]} />}
        />
      )}
    </View>
  );
}

function MovementRow({ movement, productName }: { movement: InventoryMovement; productName?: string }) {
  const positive = movement.changeQuantity > 0;
  return (
    <View
      style={{
        gap: space.xs,
        padding: space.md,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.surface,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
            {productName ?? "Deleted product"}
          </Text>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            {REASON_LABELS[movement.reason]} · {new Date(movement.createdAt).toLocaleString()}
          </Text>
        </View>
        <Text
          style={[
            styles.numeric,
            { fontSize: fontSize.body, fontWeight: "700", color: positive ? color.successInk : color.dangerInk },
          ]}
        >
          {positive ? "+" : ""}
          {movement.changeQuantity}
        </Text>
      </View>
      {movement.note ? (
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>{movement.note}</Text>
      ) : null}
    </View>
  );
}

function ProductFlagSection({
  query,
  emptyTitle,
  emptyInstruction,
  badgeTone,
  badgeLabel,
  onAdjust,
}: {
  query: { data?: Product[]; isPending: boolean; isError: boolean; error: unknown };
  emptyTitle: string;
  emptyInstruction: string;
  badgeTone: "danger" | "warning";
  badgeLabel: (product: Product) => string;
  onAdjust: (product: Product) => void;
}) {
  if (query.isPending) {
    return (
      <View style={{ padding: space.xl, alignItems: "center" }}>
        <ActivityIndicator color={color.primary} />
      </View>
    );
  }

  if (query.isError) {
    return (
      <View style={{ padding: space.md }}>
        <ErrorNote>
          {query.error instanceof Error ? query.error.message : "Could not load products."}
        </ErrorNote>
      </View>
    );
  }

  const items = query.data ?? [];

  if (items.length === 0) {
    return <EmptyState icon={AlertTriangle} title={emptyTitle} instruction={emptyInstruction} />;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: space.md, gap: space.xs }}
      renderItem={({ item }) => (
        <View
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
            <Badge tone={badgeTone} label={badgeLabel(item)} />
          </View>
          <IconButton icon={Warehouse} label="Adjust stock" onPress={() => onAdjust(item)} />
        </View>
      )}
    />
  );
}

function ProductPicker({
  products,
  onPick,
  title,
}: {
  products: Product[];
  onPick: (product: Product) => void;
  title: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(needle) ||
        (product.sku ?? "").toLowerCase().includes(needle),
    );
  }, [products, query]);

  return (
    <View style={{ gap: space.md, maxHeight: 480 }}>
      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>{title}</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name or SKU…"
        placeholderTextColor={color.inkMuted}
        style={inputStyle}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        style={{ maxHeight: 340 }}
        contentContainerStyle={{ gap: space.xs }}
        ListEmptyComponent={
          <Text style={{ color: color.inkMuted, fontSize: fontSize.body, padding: space.md }}>
            No products match.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onPick(item)}
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
            <Package size={16} color={color.inkMuted} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                {item.name}
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                {item.sku ?? "No SKU"} · {item.stockQuantity} {UNIT_LABELS[item.unit] ?? item.unit} on hand
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function AdjustStockForm({ product, onDone }: { product: Product; onDone: () => void }) {
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
    onSuccess: onDone,
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
              {REASON_OPTION_LABELS[option]}
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
