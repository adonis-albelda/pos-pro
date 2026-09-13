import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Banknote,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FolderTree,
  HandCoins,
  Images,
  Info,
  MapPin,
  Mic,
  Minus,
  Package,
  PackageSearch,
  Pencil,
  Phone,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  ShoppingCart,
  Sparkles,
  Smartphone,
  Tag,
  Trash2,
  Truck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import {
  cartDiscount,
  cartTotal,
  computeSimpleDiscount,
  CUSTOMER_FIELD_MAX_LENGTH,
  formatMoney,
  formatQuantity,
  hasCustomerDetails,
  lineSubtotal,
  normaliseCustomerDetails,
  priceForQuantity,
  QUANTITY_DECIMALS,
  requiresCustomerForPayment,
  roundMoney,
  timeAgo,
  type AddonGroup,
  type CartLine,
  type ComplexDiscountRule,
  type CustomerDetails,
  type DiscountRule,
  type Fulfillment,
  type LoyaltyReward,
  type LocalSaleWithItems,
  type PaymentMethod,
  type ProductVariant,
  type ProductWithEstimatedStock,
  type TaxSettings,
  DEFAULT_TAX_SETTINGS,
} from "@double-a/shared-types";
import { listLocalAddonGroups } from "@/db/addon-groups";
import { listLocalCategories, type LocalCategory } from "@/db/categories";
import { getLocalCustomer, searchLocalCustomers, upsertLocalCustomer } from "@/db/customers";
import { getPendingRedeemedPoints, listLocalLoyaltyRewards } from "@/db/loyalty";
import {
  countActiveLocalProducts,
  findLocalProductByBarcode,
  listLocalProducts,
  listLocalProductsByIds,
  listLocalProductsPage,
  PRODUCT_PAGE_SIZE,
  type ProductBarcodeMatch,
} from "@/db/products";
import {
  getLocalVariant,
  getVariantPendingQuantity,
  listLocalVariantsForProduct,
  listLocalVariantsForProducts,
  variantAttributeLabel,
  type VariantWithEstimatedStock,
} from "@/db/product-variants";
import { completeSale } from "@/db/sales";
import {
  getLocalTaxSettings,
  listLocalComplexDiscountRules,
  listLocalDiscountRules,
} from "@/db/discounts";
import {
  applicableAmountForRule,
  applyComplexRuleToCart,
  applyLoyaltyRewardToCart,
  applySimpleRuleToCart,
  eligibleLoyaltyRewards,
  orderDiscountImpact,
  qualifyingComplexRules,
  qualifyingSimpleRules,
  type AppliedOrderDiscount,
} from "@/lib/order-discounts";
import {
  addCartDraft,
  listCartDrafts,
  removeCartDraft,
  type CartDraft,
} from "@/lib/cart-draft";
import { getApiClient } from "@/lib/api/session";
import { useCartSummary } from "@/lib/cart-summary";
import { getDeviceId } from "@/lib/device";
import { useFlyToCart, type FlyRect } from "@/lib/fly-to-cart";
import { useFeatureFlags } from "@/lib/features";
import { useLayout } from "@/lib/layout";
import { useSession } from "@/lib/session";
import { useThemePreferences } from "@/lib/theme-preferences";
import { printReceipt } from "@/printing/receipt";
import { useSync } from "@/sync/sync-provider";
import { BottomSheet, useKeyboardHeight } from "@/components/bottom-sheet";
import { StoreHeader } from "@/components/store-header";
import { AiSearchModal } from "@/components/ai-search-modal";
import { BarcodeScanModal } from "@/components/barcode-scan-modal";
import { FloatingBarcodeScanner } from "@/components/floating-barcode-scanner";
import { CartQtyButton } from "@/components/cart-qty-button";
import { CategoryDialog, type CategoryFilter } from "@/components/category-tabs";
import { LoadingState } from "@/components/loading-state";
import { ProductDetailSheet, ProductTile } from "@/components/product-tile";
import { SelectField } from "@/components/select-field";
import { ThemeBackgroundEffect } from "@/components/theme-background-effect";
import { useSaleCelebration } from "@/lib/sale-celebration";
import {
  VariantAddonPicker,
  type VariantAddonSelection,
} from "@/components/variant-addon-picker";
import { VoiceSearchModal } from "@/components/voice-search-modal";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  LedgerLine,
  Money,
  WarningNote,
} from "@/components/ui";
import { circleRadius, color, fontSize, radius, space, styles } from "@/theme";

/** What a cart with no customer attached looks like. Also the state after a sale. */
const NO_CUSTOMER: CustomerDetails = { customerId: null, name: null, address: null, contact: null };

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "ewallet", label: "E-Wallet", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "credit", label: "Credit", icon: HandCoins },
];

/**
 * Which e-wallet the customer actually paid with — display-only, so the
 * owner can match a sale against their own bank/wallet records. "Other
 * E-Wallet" reveals a text input instead of setting this label directly.
 */
const EWALLET_PROVIDERS = [
  "GCash",
  "Maya",
  "MariBank",
  "GrabPay",
  "ShopeePay",
  "Other E-Wallet",
] as const;

const FULFILLMENT_OPTIONS: { value: Fulfillment; label: string; icon?: LucideIcon }[] = [
  { value: "pickup", label: "Pickup" },
  { value: "delivery", label: "Delivery", icon: Truck },
];

/**
 * A backordered line has no real ceiling — the cashier already confirmed the
 * sale with nothing on the shelf, so there is nothing left to cap against.
 * Restocking later just adds to `stock_quantity` (apply_inventory_movement is
 * a plain sum), which settles the negative automatically — no separate
 * fulfillment step needed.
 */
const BACKORDER_CAP = 9999;

/**
 * The most a line may sell. A whole-number product floors its estimated stock
 * (you cannot sell half a box); a decimal one keeps the fraction (2.5 kg is a
 * real amount on the shelf). At zero or below, the product is out of stock —
 * see BACKORDER_CAP.
 */
function stockCapFor(estimatedStock: number, allowDecimal: boolean): number {
  if (estimatedStock <= 0) return BACKORDER_CAP;
  if (allowDecimal) return Number(estimatedStock.toFixed(QUANTITY_DECIMALS));
  return Math.floor(estimatedStock);
}

/** What the picker resolves before a line is actually added — see onPickerConfirm. */
interface ResolvedSelection extends VariantAddonSelection {
  estimatedStock: number;
}

/**
 * One grid tile. `display` is what the cashier sees and taps (in "By
 * variant" mode this carries the variant's own name/price/stock, not the
 * product's); `realProduct` is always the true product row underneath —
 * add-ons, category id, and the cart line's productId all key off it, never
 * off `display.id`, which is a variant id for a variant tile. `variant` is
 * set only when this tile already resolves to one specific variant.
 */
interface GridTile {
  display: ProductWithEstimatedStock;
  realProduct: ProductWithEstimatedStock;
  variant?: ProductVariant;
}

/** Builds a variant tile's display fields — the variant's own price/sku/stock layered onto its parent product's other fields (photo, unit, category, etc, which a variant has no copy of). */
function toVariantTileDisplay(
  product: ProductWithEstimatedStock,
  variant: ProductVariant,
  estimatedStock: number,
): ProductWithEstimatedStock {
  const label = variantAttributeLabel(variant);
  return {
    ...product,
    id: variant.id,
    name: label ? `${product.name} — ${label}` : product.name,
    sku: variant.sku ?? product.sku,
    barcode: variant.barcode ?? product.barcode,
    // Server already resolves this fallback (ProductVariantResource), but
    // a variant pulled before v27 or one this device hasn't re-synced yet
    // may still carry no photoUrl locally — fall back to the product's own.
    photoUrl: variant.photoUrl ?? product.photoUrl,
    price: variant.price,
    costPrice: variant.costPrice,
    stockQuantity: variant.stockQuantity,
    isBundle: variant.isBundle,
    estimatedStock,
  };
}

export default function SellScreen() {
  const { cashier } = useSession();
  const { refresh, autoPush, dataVersion, offlineModeEnabled, justCreatedProductIds } = useSync();
  const { isEnabled } = useFeatureFlags();

  // A phone cannot hold a grid and a cart side by side, so below the compact
  // breakpoint the cart moves behind a summary bar the cashier taps to pay.
  const layout = useLayout();
  const { compact, columns: layoutColumns } = layout;

  const [products, setProducts] = useState<ProductWithEstimatedStock[]>([]);
  const { productViewMode, backgroundEffect, productLayout } = useThemePreferences();
  // Theme "Row" = one product per line; "Grid" keeps the width-based column count.
  const columns = productLayout === "row" ? 1 : layoutColumns;
  const { celebrate, node: confettiNode } = useSaleCelebration();
  // Only populated in "By variant" mode (Theme menu — lib/theme-preferences.ts).
  // Keyed by product id; fetched for whatever page of `products` is currently
  // loaded, not paginated on its own — the product fetch/search/category
  // pipeline above is untouched, this only decides how each already-fetched
  // product's tile(s) render.
  const [variantsByProduct, setVariantsByProduct] = useState<
    Map<string, VariantWithEstimatedStock[]>
  >(new Map());

  useEffect(() => {
    if (productViewMode !== "variant") {
      setVariantsByProduct(new Map());
      return;
    }
    let cancelled = false;
    void listLocalVariantsForProducts(products.map((product) => product.id)).then((map) => {
      if (!cancelled) setVariantsByProduct(map);
    });
    return () => {
      cancelled = true;
    };
  }, [products, productViewMode]);

  // One tile per product in "By product" mode. In "By variant" mode, a
  // product with 2+ variants becomes one tile per variant; 0 or 1 variant
  // still renders as a single tile (that one variant's own price/stock,
  // once known — see toVariantTileDisplay). `realProduct` is always the
  // true product row (add-ons, category id, etc. all key off it); `variant`
  // is only set for a tile that resolves to one specific variant.
  const gridTiles = useMemo<GridTile[]>(() => {
    if (productViewMode !== "variant") {
      return products.map((product) => ({ display: product, realProduct: product }));
    }
    return products.flatMap((product) => {
      const variants = variantsByProduct.get(product.id);
      if (!variants || variants.length <= 1) {
        const only = variants?.[0];
        return [
          {
            display: only
              ? toVariantTileDisplay(product, only.variant, only.estimatedStock)
              : product,
            realProduct: product,
            variant: only?.variant,
          },
        ];
      }
      return variants.map(({ variant, estimatedStock }) => ({
        display: toVariantTileDisplay(product, variant, estimatedStock),
        realProduct: product,
        variant,
      }));
    });
  }, [products, variantsByProduct, productViewMode]);

  // Pads the last row up to a full `columns` width with invisible fillers —
  // otherwise a lone leftover tile's flex:1 stretches it across the whole
  // row instead of sitting at the same width as its row-mates above.
  const paddedTiles = useMemo<(GridTile | null)[]>(() => {
    const remainder = gridTiles.length % columns;
    if (remainder === 0) return gridTiles;
    return [...gridTiles, ...Array<null>(columns - remainder).fill(null)];
  }, [gridTiles, columns]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [focusEpoch, setFocusEpoch] = useState(0);
  const [heldTick, setHeldTick] = useState(0);
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);
  const heldById = useRef(new Map<string, ProductWithEstimatedStock>());
  const [lines, setLines] = useState<CartLine[]>([]);
  // Lines whose price the attendant typed in. A manual price is a decision, so
  // it outranks the bulk tier and survives every quantity change after it.
  const [overridden, setOverridden] = useState<string[]>([]);
  // Which of those overrides came from the global discount split rather than
  // a cashier typing a price on that one line — kept separate so CartRow can
  // stay quiet about it and let the cart-level Subtotal/Discount/Total say it
  // once, instead of every row repeating "discounted".
  const [globalDiscountIds, setGlobalDiscountIds] = useState<string[]>([]);
  // The per-line price as it stood right before the global split touched it —
  // CartRow shows this instead of the real (reduced) unit_price for those
  // lines, so the cashier reads the same per-item price throughout; only the
  // Subtotal/Discount/Total band at the bottom moves.
  const [preDiscountPrices, setPreDiscountPrices] = useState<Record<string, number>>({});
  const [discountSheetOpen, setDiscountSheetOpen] = useState(false);
  const [orderDiscounts, setOrderDiscounts] = useState<AppliedOrderDiscount[]>([]);
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([]);
  const [complexRules, setComplexRules] = useState<ComplexDiscountRule[]>([]);
  const [loyaltyRewards, setLoyaltyRewards] = useState<LoyaltyReward[]>([]);
  const [customerPoints, setCustomerPoints] = useState(0);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);
  const [promoSuggestion, setPromoSuggestion] = useState<ComplexDiscountRule | null>(null);
  const [qtyEditingId, setQtyEditingId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  // Optional e-wallet proof screenshot — local file uri, cleared whenever
  // the method isn't ewallet or the sale finishes.
  const [paymentProofUri, setPaymentProofUri] = useState<string | null>(null);
  // Which e-wallet, for matching against bank/wallet records later — same
  // lifetime as paymentProofUri (ewallet-only, cleared when not applicable).
  const [ewalletProvider, setEwalletProvider] = useState<string | null>(null);
  // Optional, and empty for most sales. Held on the cart rather than asked for
  // at the end, so a cashier can take a name while the order is still being
  // built and never has a dialog between them and completing the sale.
  const [customer, setCustomer] = useState<CustomerDetails>(NO_CUSTOMER);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [openField, setOpenField] = useState<"payment" | "fulfillment" | null>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSucceeded, setConfirmSucceeded] = useState(false);
  const [completedSale, setCompletedSale] = useState<LocalSaleWithItems | null>(null);
  const [saving, setSaving] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [drafts, setDrafts] = useState<CartDraft[]>([]);
  const [draftPickerOpen, setDraftPickerOpen] = useState(false);
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [category, setCategory] = useState<CategoryFilter>(null);
  const [totalProducts, setTotalProducts] = useState(0);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [voiceSearchOpen, setVoiceSearchOpen] = useState(false);
  const [voiceVocabulary, setVoiceVocabulary] = useState<string[]>([]);
  const [barcodeScanOpen, setBarcodeScanOpen] = useState(false);
  const [floatingScannerOpen, setFloatingScannerOpen] = useState(false);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<ProductWithEstimatedStock | null>(null);
  // Set only for a product with >1 variant and/or attached add-on groups —
  // addToCart decides whether this ever opens; a plain product never does.
  const [pickerState, setPickerState] = useState<{
    product: ProductWithEstimatedStock;
    variants: ProductVariant[];
    addonGroups: AddonGroup[];
  } | null>(null);
  // Ranked product ids from the last smart search — while set, the grid shows
  // exactly these (in this order) instead of the normal query/category list.
  const [aiResultIds, setAiResultIds] = useState<string[] | null>(null);
  const [aiResultLabel, setAiResultLabel] = useState("");

  // Remount + stagger enter when the *set* of tiles changes for the cashier
  // (search / category / AI / product-vs-variant). Not dataVersion — live stock
  // ticks would replay the whole grid every few seconds. Applied only after
  // the matching fetch lands (`loadingPage` false) so mid-fetch remounts
  // don't slide the previous page in again.
  const pendingListEnterKey = `${query}\0${category ?? ""}\0${aiResultIds?.join(",") ?? ""}\0${productViewMode}`;
  const [listEnterKey, setListEnterKey] = useState(pendingListEnterKey);
  // First ~screenful only. Higher indices are load-more / off-screen.
  const LIST_ENTER_MAX = Math.min(columns * 4, 12);

  useEffect(() => {
    if (!loadingPage) setListEnterKey(pendingListEnterKey);
  }, [loadingPage, pendingListEnterKey]);

  /** Product names, fetched fresh each time the mic opens — biases recognition toward this shop's actual catalogue. */
  function openVoiceSearch() {
    void listLocalProducts().then((rows) => setVoiceVocabulary(rows.map((row) => row.name)));
    setVoiceSearchOpen(true);
  }

  /** Typing, scanning, or picking a category all mean "back to the normal list". */
  function clearAiSearch() {
    setAiResultIds(null);
    setAiResultLabel("");
  }

  function applyManualSearch(text: string) {
    if (aiResultIds) clearAiSearch();
    setSearch(text);
  }

  const refreshDrafts = useCallback(async () => {
    const next = await listCartDrafts();
    setDrafts(next);
    setHasDraft(next.length > 0);
  }, []);

  const rememberProducts = useCallback((rows: ProductWithEstimatedStock[]) => {
    for (const product of rows) {
      heldById.current.set(product.id, product);
    }
    setHeldTick((tick) => tick + 1);
  }, []);

  const loadCategories = useCallback(async () => {
    const [nextCategories, nextTotal] = await Promise.all([
      listLocalCategories(),
      countActiveLocalProducts(),
    ]);
    setCategories(nextCategories);
    setTotalProducts(nextTotal);
    // A pull can retire the shelf the cashier is standing on. Falling back to
    // everything is the honest thing: a lit tab for a category that no longer
    // exists, filtering nothing, would read as an empty catalogue.
    setCategory((current) =>
      current && nextCategories.some((entry) => entry.id === current) ? current : null,
    );
  }, []);

  // Reload on focus so a sync or a finished sale is reflected in estimated stock.
  useFocusEffect(
    useCallback(() => {
      void loadCategories();
      void refreshDrafts();
      setFocusEpoch((epoch) => epoch + 1);
    }, [loadCategories, refreshDrafts]),
  );

  /**
   * `dataVersion` changes when a pull has written to SQLite. The sync bar is on
   * this screen, so a Refresh happens with the grid already mounted and on
   * focus — without this, a new price or name would sit in the database unread
   * until the cashier navigated away and back.
   */
  useEffect(() => {
    void loadCategories();
  }, [loadCategories, dataVersion]);

  useEffect(() => {
    void (async () => {
      const [simple, complex, tax, rewards] = await Promise.all([
        listLocalDiscountRules(),
        listLocalComplexDiscountRules(),
        getLocalTaxSettings(),
        listLocalLoyaltyRewards(),
      ]);
      setDiscountRules(simple);
      setComplexRules(complex);
      setTaxSettings(tax);
      setLoyaltyRewards(rewards);
    })();
  }, [dataVersion]);

  // The synced balance only reflects what the last pull saw — subtract
  // points this device has already spent on sales still waiting to push, so
  // a second redemption before syncing doesn't read as still-eligible.
  useEffect(() => {
    const customerId = customer.customerId;
    if (!customerId) {
      setCustomerPoints(0);
      return;
    }
    void (async () => {
      const [record, pending] = await Promise.all([
        getLocalCustomer(customerId),
        getPendingRedeemedPoints(customerId),
      ]);
      setCustomerPoints(Math.max((record?.loyaltyPointsBalance ?? 0) - pending, 0));
    })();
  }, [customer.customerId, dataVersion, orderDiscounts]);

  // Re-evaluate complex promos whenever the cart changes.
  useEffect(() => {
    const alreadyApplied = new Set(
      orderDiscounts.map((d) => d.complexDiscountRuleId).filter(Boolean),
    );
    const qualifying = qualifyingComplexRules(complexRules, lines, orderDiscounts).filter(
      (rule) => !alreadyApplied.has(rule.id),
    );
    if (qualifying.length === 0) {
      setPromoSuggestion(null);
      return;
    }
    const next = qualifying[0];
    if (taxSettings.autoApplyComplexDiscounts) {
      setOrderDiscounts((current) => [
        ...current.filter((d) => d.complexDiscountRuleId !== next.id),
        applyComplexRuleToCart({ rule: next, lines, appliedBy: cashier?.id }),
      ]);
      setPromoSuggestion(null);
    } else {
      setPromoSuggestion(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on cart/rules/tax; orderDiscounts read for filter
  }, [lines, complexRules, taxSettings.autoApplyComplexDiscounts, cashier?.id]);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(search.trim()), 150);
    return () => clearTimeout(handle);
  }, [search]);

  /**
   * Search reaches the whole catalogue on purpose: a cashier typing a name
   * wants the product, not an explanation of which tab it is filed under.
   */
  const categoryIds = useMemo(() => {
    if (query) return null;
    const selected = categories.find((entry) => entry.id === category);
    return selected ? selected.subtreeIds : null;
  }, [categories, category, query]);

  useEffect(() => {
    const id = ++requestId.current;
    loadingMoreRef.current = false;
    setLoadingPage(true);
    setLoadingMore(false);
    setHasMore(false);

    // Fetched alongside whichever product list lands below (same .then, same
    // tick) rather than in the separate effect further down that watches
    // `products` — that effect still exists for a bare productViewMode
    // toggle, but reacting to a *changed* products array after the fact
    // means one render shows the new products with the still-stale variant
    // map. A realtime signal (dataVersion bump) hits this path constantly —
    // that gap is exactly what showed a plain product-level tile right
    // after a create/update, in "By variant" mode, until the next render.
    async function withVariants<T extends { id: string }>(rows: T[]): Promise<void> {
      if (productViewMode !== "variant") return;
      const map = await listLocalVariantsForProducts(rows.map((row) => row.id));
      if (id === requestId.current) setVariantsByProduct(map);
    }

    if (aiResultIds) {
      void listLocalProductsByIds(aiResultIds)
        .then(async (rows) => {
          if (id !== requestId.current) return;
          const byIdRow = new Map(rows.map((row) => [row.id, row]));
          const ordered = aiResultIds
            .map((productId) => byIdRow.get(productId))
            .filter((row): row is ProductWithEstimatedStock => row !== undefined);
          await withVariants(ordered);
          if (id !== requestId.current) return;
          setProducts(ordered);
          setLoadingPage(false);
          setReady(true);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setLoadingPage(false);
          setReady(true);
        });

      return () => {
        requestId.current += 1;
      };
    }

    setHasMore(true);

    void listLocalProductsPage({
      limit: PRODUCT_PAGE_SIZE,
      offset: 0,
      search: query,
      categoryIds,
    })
      .then(async (next) => {
        if (id !== requestId.current) return;
        await withVariants(next);
        if (id !== requestId.current) return;
        setProducts(next);
        setHasMore(next.length === PRODUCT_PAGE_SIZE);
        setLoadingPage(false);
        setReady(true);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setLoadingPage(false);
        setReady(true);
      });

    return () => {
      requestId.current += 1;
    };
    // productViewMode deliberately excluded — withVariants() above only
    // needs its current value at the moment THIS effect's own trigger
    // (search/category/dataVersion/etc.) fires; adding it here would force
    // a full product-list reload on every Theme menu toggle instead of the
    // separate effect below's much cheaper variants-only refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryIds, dataVersion, focusEpoch, aiResultIds]);

  useEffect(() => {
    const ids = [...heldById.current.keys()];
    if (ids.length === 0) return;
    void listLocalProductsByIds(ids).then((rows) => {
      heldById.current = new Map(rows.map((row) => [row.id, row]));
      setHeldTick((tick) => tick + 1);
    });
  }, [dataVersion, focusEpoch]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || loadingPage || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const id = requestId.current;
    const offset = products.length;

    void listLocalProductsPage({
      limit: PRODUCT_PAGE_SIZE,
      offset,
      search: query,
      categoryIds,
    })
      .then((next) => {
        if (id !== requestId.current) return;
        setProducts((current) => [...current, ...next]);
        setHasMore(next.length === PRODUCT_PAGE_SIZE);
        loadingMoreRef.current = false;
        setLoadingMore(false);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [loadingPage, hasMore, products.length, query, categoryIds]);

  const byId = useMemo(() => {
    const map = new Map(heldById.current);
    for (const product of products) {
      map.set(product.id, product);
    }
    return map;
  }, [products, heldTick]);

  const total = roundMoney(Math.max(cartTotal(lines) - orderDiscountImpact(orderDiscounts), 0));
  const lineDiscount = cartDiscount(lines);
  const orderDiscount = orderDiscountImpact(orderDiscounts);
  const discount = roundMoney(lineDiscount + orderDiscount);
  const shelfTotal = roundMoney(
    lines.reduce((sum, line) => sum + line.listPrice * line.quantity, 0),
  );
  // A product can only ever have one cart line (variant/add-ons picked once
  // per product — see addToCart), so this is a 1:1 map today, but summing
  // rather than overwriting keeps the tile badge correct if that changes.
  const inCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity);
    }
    return map;
  }, [lines]);

  /** Same idea as `inCart`, keyed by variantId instead — a "By variant" grid
   * tile's badge must reflect only its own variant's quantity, not every
   * line the parent product has (two variants of one product are separate
   * lines; see changeQuantity/confirmRemoveLine's variantId parameter). */
  const inCartByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      if (!line.variantId) continue;
      map.set(line.variantId, (map.get(line.variantId) ?? 0) + line.quantity);
    }
    return map;
  }, [lines]);

  /**
   * The price a line should carry at a given quantity. Bulk pricing applies
   * itself as the quantity crosses the contractor threshold — unless the
   * attendant has typed a price, which nothing here may overwrite. A line
   * with a `naturalPrice` (a picked variant, with or without add-ons) keeps
   * that price instead: bulk pricing is product-level shelf pricing and has
   * no defined meaning against a specific variant/add-on combination yet.
   */
  function repricedFor(line: CartLine, quantity: number): CartLine {
    if (overridden.includes(line.productId)) {
      return { ...line, quantity };
    }
    if (line.naturalPrice !== undefined) {
      return { ...line, quantity, unitPrice: line.naturalPrice };
    }

    const product = byId.get(line.productId);
    if (!product) return { ...line, quantity };

    return { ...line, quantity, unitPrice: priceForQuantity(product, quantity) };
  }

  /**
   * No confirmation once a line exists — adding to a cart is speed critical.
   * The one exception is the first tap on a product sitting at zero: that's a
   * backorder decision, not a speed-critical tap, so it gets asked once.
   *
   * A product with more than one variant, and/or one or more attached
   * add-on groups, opens the picker instead of adding directly — but only
   * on the FIRST tap. Once a line exists, its variant/add-ons are already
   * resolved, so a repeat tap just bumps quantity, same speed-critical path
   * as a plain product always had.
   */
  async function addToCart(product: ProductWithEstimatedStock, sourceRect?: FlyRect) {
    rememberProducts([product]);

    // Product-level mode never creates more than one line per product (the
    // variant/add-on picker below only ever runs on the first tap), so a
    // repeat tap always has exactly one existing line to bump — its own
    // variantId included, whether that's unset (a plain product) or a
    // single auto-resolved/picked variant (see changeQuantity's variantId
    // parameter for why that distinction matters once a product has more
    // than one variant line, which "By variant" grid tiles can produce).
    const existing = lines.find((line) => line.productId === product.id);
    if (existing) {
      changeQuantity(product.id, 1, existing.variantId);
      if (sourceRect) flyToCart(sourceRect, product.photoUrl);
      return;
    }

    const [variants, addonGroups] = await Promise.all([
      listLocalVariantsForProduct(product.id),
      listLocalAddonGroups(product.addonGroupIds),
    ]);

    if (variants.length > 1 || addonGroups.length > 0) {
      // Opens the picker instead — nothing has been added yet, so no flight.
      setPickerState({ product, variants, addonGroups });
      return;
    }

    // Exactly one variant and no add-ons: nothing for a picker to ask, but
    // the sale should still snapshot that variant's own price/cost/id rather
    // than the parent product's — a variant is free to differ from it. Skips
    // straight to the same out-of-stock/commit path the picker itself uses.
    const [onlyVariant] = variants;
    if (variants.length === 1 && onlyVariant) {
      void commitVariantSelection(product, onlyVariant, [], sourceRect);
      return;
    }

    if (product.estimatedStock <= 0) {
      Alert.alert(
        "Out of stock",
        `${product.name} shows none on hand. Sell it anyway? New stock added later settles this automatically.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sell anyway",
            onPress: () => {
              commitAddToCart(product);
              if (sourceRect) flyToCart(sourceRect, product.photoUrl);
            },
          },
        ],
      );
      return;
    }

    commitAddToCart(product);
    if (sourceRect) flyToCart(sourceRect, product.photoUrl);
  }

  /**
   * Shared by the picker's own confirm (onPickerConfirm — no `sourceRect`,
   * since that add happens from a sheet, not the tile itself, so no flight
   * plays there) and the "exactly one variant" auto-resolve path above (and,
   * in variant-level grid view, a tile that's already scoped to one specific
   * variant) — same estimate-then-alert-then-commit shape either way.
   */
  async function commitVariantSelection(
    product: ProductWithEstimatedStock,
    variant: ProductVariant,
    addons: VariantAddonSelection["addons"],
    sourceRect?: FlyRect,
  ): Promise<void> {
    const pending = await getVariantPendingQuantity(variant.id);
    const estimatedStock = variant.stockQuantity - pending;
    const resolved: ResolvedSelection = { variant, addons, estimatedStock };

    if (estimatedStock <= 0) {
      const label = variantAttributeLabel(variant) || variant.sku || "this option";
      Alert.alert(
        "Out of stock",
        `${product.name} (${label}) shows none on hand. Sell it anyway? New stock added later settles this automatically.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sell anyway",
            onPress: () => {
              commitAddToCart(product, resolved);
              if (sourceRect) flyToCart(sourceRect, product.photoUrl);
            },
          },
        ],
      );
      return;
    }

    commitAddToCart(product, resolved);
    if (sourceRect) flyToCart(sourceRect, product.photoUrl);
  }

  /**
   * A "By variant" grid tile's own tap handler (lib/theme-preferences.ts's
   * productViewMode) — the tile already names one specific variant, so
   * there is nothing for the usual variant picker to ask; add-on groups
   * (if the product has any) still get their own step, same picker
   * component, just pre-scoped to this one variant instead of every one.
   */
  async function handleTilePress(tile: GridTile, sourceRect?: FlyRect) {
    if (!tile.variant) {
      await addToCart(tile.realProduct, sourceRect);
      return;
    }

    rememberProducts([tile.realProduct]);
    const existing = lines.find(
      (line) => line.productId === tile.realProduct.id && line.variantId === tile.variant?.id,
    );
    if (existing) {
      changeQuantity(tile.realProduct.id, 1, tile.variant.id);
      if (sourceRect) flyToCart(sourceRect, tile.display.photoUrl);
      return;
    }

    const addonGroups = await listLocalAddonGroups(tile.realProduct.addonGroupIds);
    if (addonGroups.length > 0) {
      setPickerState({ product: tile.realProduct, variants: [tile.variant], addonGroups });
      return;
    }

    await commitVariantSelection(tile.realProduct, tile.variant, [], sourceRect);
  }

  function commitAddToCart(product: ProductWithEstimatedStock, selection?: ResolvedSelection) {
    setLines((current) => {
      // Matches on variantId too, not just productId — two variants of the
      // same product (picked twice, or two "By variant" grid tiles) are
      // separate lines, and re-tapping one must only ever bump that one.
      const targetVariantId = selection?.variant.id ?? null;
      const isTarget = (line: CartLine) =>
        line.productId === product.id && (line.variantId ?? null) === targetVariantId;
      const existing = current.find(isTarget);
      if (existing) {
        // A variant/add-on line's cap was fixed at add time rather than
        // re-derived from live stock on every tap — see ResolvedSelection.
        const stockCap = existing.variantId
          ? stockCapFor(existing.availableStock, existing.allowDecimal)
          : stockCapFor(product.estimatedStock, product.allowDecimal);
        if (existing.quantity >= stockCap) return current;
        return current.map((line) =>
          isTarget(line) ? repricedFor(line, Math.min(line.quantity + 1, stockCap)) : line,
        );
      }

      if (selection) {
        const addonsTotal = roundMoney(
          selection.addons.reduce((sum, addon) => sum + addon.price, 0),
        );
        const naturalPrice = roundMoney(selection.variant.price + addonsTotal);
        const stockCap = stockCapFor(selection.estimatedStock, product.allowDecimal);

        return [
          ...current,
          {
            productId: product.id,
            variantId: selection.variant.id,
            variantLabel: variantAttributeLabel(selection.variant) || null,
            productName: product.name,
            unitPrice: naturalPrice,
            listPrice: naturalPrice,
            naturalPrice,
            unitCost: selection.variant.costPrice,
            unit: product.unit,
            allowDecimal: product.allowDecimal,
            quantity: 1,
            availableStock: stockCap,
            categoryId: product.categoryId ?? null,
            addons: selection.addons.map((addon) => ({
              addonGroupItemId: addon.addonGroupItemId,
              name: addon.name,
              price: addon.price,
              quantity: 1,
            })),
          },
        ];
      }

      const stockCap = stockCapFor(product.estimatedStock, product.allowDecimal);
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: priceForQuantity(product, 1),
          // The shelf price, kept whatever the line ends up selling at, so the
          // office can see exactly what was given away.
          listPrice: product.price,
          unitCost: product.costPrice,
          unit: product.unit,
          allowDecimal: product.allowDecimal,
          quantity: 1,
          availableStock: stockCap,
          categoryId: product.categoryId ?? null,
        },
      ];
    });
  }

  /**
   * Live variant stock, not the product-level estimate — the picker just
   * resolved which exact variant is being sold, so its own last-synced
   * quantity minus its own pending local sales is the number that matters
   * (CLAUDE.md §2, scoped to the variant).
   */
  async function onPickerConfirm(selection: VariantAddonSelection) {
    if (!pickerState) return;
    const { product } = pickerState;
    setPickerState(null);
    void commitVariantSelection(product, selection.variant, selection.addons);
  }

  /**
   * `variantId` disambiguates two lines that share the same product (a
   * multi-variant product added twice via the picker, or the "By variant"
   * grid mode — lib/theme-preferences.ts's productViewMode, where every
   * variant is its own tile). Omitted, this matches on productId alone —
   * every pre-existing call site keeps its old behavior unchanged.
   */
  function changeQuantity(productId: string, delta: number, variantId?: string | null) {
    const matches = (line: CartLine) =>
      line.productId === productId && (line.variantId ?? null) === (variantId ?? null);

    setLines((current) =>
      current
        .map((line) => {
          if (!matches(line)) return line;
          const stockCap = stockCapFor(line.availableStock, line.allowDecimal);
          const next = line.quantity + delta;
          if (delta > 0 && next > stockCap) return line;
          return repricedFor(line, next);
        })
        .filter((line) => line.quantity > 0),
    );

    const line = lines.find(matches);
    if (line && line.quantity + delta <= 0) forgetOverride(productId);
  }

  /** Holding a cart row asks once, then drops the whole line regardless of quantity. */
  function confirmRemoveLine(productId: string, productName: string, variantId?: string | null) {
    Alert.alert(`Remove ${productName}?`, "This takes it off the cart entirely.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setLines((current) =>
            current.filter(
              (line) => !(line.productId === productId && (line.variantId ?? null) === (variantId ?? null)),
            ),
          );
          forgetOverride(productId);
        },
      },
    ]);
  }

  /** Absolute qty — type a number instead of tapping +/− one at a time. */
  function setQuantity(productId: string, quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setLines((current) => current.filter((line) => line.productId !== productId));
      forgetOverride(productId);
      setQtyEditingId(null);
      return;
    }

    setLines((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          const stockCap = stockCapFor(line.availableStock, line.allowDecimal);
          const asked = line.allowDecimal
            ? Number(quantity.toFixed(QUANTITY_DECIMALS))
            : Math.floor(quantity);
          const next = Math.min(asked, stockCap);
          if (next <= 0) return { ...line, quantity: 0 };
          return repricedFor(line, next);
        })
        .filter((line) => line.quantity > 0),
    );
    setQtyEditingId(null);
  }

  function forgetOverride(productId: string) {
    setOverridden((current) => current.filter((id) => id !== productId));
    setGlobalDiscountIds((current) => current.filter((id) => id !== productId));
    setPreDiscountPrices(({ [productId]: _drop, ...rest }) => rest);
  }

  /**
   * A flat peso amount off the whole cart, not a separate field anywhere —
   * split across every line's unit_price by its share of the total, same
   * mechanism as a per-line counter discount (CLAUDE.md §7), so it lands on
   * the receipt and the discount report exactly the same way.
   */
  function applyGlobalDiscount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0 || lines.length === 0) return;
    const cartSubtotal = cartTotal(lines);
    const capped = Math.min(amount, cartSubtotal);

    // Snapshot each line's price before this split touches it — only the
    // first time a line is caught by a global discount, so stacking a second
    // one still shows the original per-item price, not the halfway point.
    setPreDiscountPrices((current) => {
      const next = { ...current };
      for (const line of lines) {
        if (!(line.productId in next)) next[line.productId] = line.unitPrice;
      }
      return next;
    });

    setLines((current) =>
      current.map((line) => {
        const lineTotal = lineSubtotal(line.unitPrice, line.quantity);
        const share = roundMoney((lineTotal / cartSubtotal) * capped);
        return { ...line, unitPrice: Math.max(0, roundMoney(line.unitPrice - share / line.quantity)) };
      }),
    );
    setOverridden((current) => [
      ...current,
      ...lines.map((line) => line.productId).filter((id) => !current.includes(id)),
    ]);
    setGlobalDiscountIds((current) => [
      ...current,
      ...lines.map((line) => line.productId).filter((id) => !current.includes(id)),
    ]);
    setDiscountSheetOpen(false);
  }

  /** Drops every price override at once, discount included — back to shelf price across the board. */
  function clearAllDiscounts() {
    setLines((current) =>
      current.map((line) => {
        if (line.naturalPrice !== undefined) return { ...line, unitPrice: line.naturalPrice };
        const product = byId.get(line.productId);
        return product ? { ...line, unitPrice: priceForQuantity(product, line.quantity) } : line;
      }),
    );
    setOverridden([]);
    setGlobalDiscountIds([]);
    setPreDiscountPrices({});
    setOrderDiscounts([]);
    setPromoSuggestion(null);
    setDiscountSheetOpen(false);
  }

  /**
   * A scanned code can match at the product level (a plain product, or one
   * whose default variant mirrors its barcode/sku) or at a specific
   * non-default variant's own barcode/sku (findLocalProductByBarcode's
   * variantId) — the latter must add straight to that exact variant's
   * line, not open the picker or land on the default one. Shared by the
   * hardware keyboard-wedge path (submitSearch) and the camera scanner
   * (handleFloatingScan).
   */
  async function addScannedMatchToCart(match: ProductBarcodeMatch): Promise<void> {
    if (match.variantId) {
      const variant = await getLocalVariant(match.variantId);
      if (variant) {
        await commitVariantSelection(match.product, variant, []);
        return;
      }
    }
    await addToCart(match.product);
  }

  /**
   * A hardware barcode scanner is a keyboard: it types the code and presses
   * enter. An exact match goes straight into the cart and the field clears,
   * ready for the next scan. Anything else stays put as an ordinary search.
   */
  async function submitSearch() {
    const code = search.trim();
    if (!code) return;

    const scanned = await findLocalProductByBarcode(code);
    if (!scanned) return;

    await addScannedMatchToCart(scanned);
    setSearch("");
  }

  /**
   * FloatingBarcodeScanner's continuous scan-to-cart — same exact-match
   * lookup and add as the hardware-scanner path above (submitSearch), just
   * triggered by the camera instead of a keyboard-wedge Enter. Existing
   * line bumps by 1; a first match adds at quantity 1. Returns whether it
   * matched so the scanner knows which sound to play.
   */
  async function handleFloatingScan(code: string): Promise<boolean> {
    const scanned = await findLocalProductByBarcode(code);
    if (!scanned) return false;
    await addScannedMatchToCart(scanned);
    return true;
  }

  function confirmClearCart() {
    Alert.alert("Empty the cart?", "Every item on this sale is removed.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Empty cart",
        style: "destructive",
        onPress: () => {
          setLines([]);
          setOverridden([]);
          setOrderDiscounts([]);
          setPromoSuggestion(null);
          setCustomer(NO_CUSTOMER);
          setFulfillment("pickup");
        },
      },
    ]);
  }

  /** Park this cart so the cashier can help someone else, then come back. */
  async function saveDraft() {
    if (lines.length === 0) return;

    await addCartDraft({
      lines,
      overridden,
      payment,
      customer,
      fulfillment,
    });
    setLines([]);
    setOverridden([]);
    setCustomer(NO_CUSTOMER);
    setFulfillment("pickup");
    setPayment("cash");
    setPaymentProofUri(null);
    setEwalletProvider(null);
    await refreshDrafts();
  }

  function openDraftPicker() {
    void refreshDrafts().then(() => setDraftPickerOpen(true));
  }

  function applyDraft(draft: CartDraft) {
    setLines(draft.lines);
    setOverridden(draft.overridden);
    setPayment(draft.payment);
    setPaymentProofUri(null);
    setEwalletProvider(null);
    setCustomer(draft.customer);
    setFulfillment(draft.fulfillment);
    void listLocalProductsByIds(draft.lines.map((line) => line.productId)).then(
      rememberProducts,
    );
    void removeCartDraft(draft.id).then(() => refreshDrafts());
    setDraftPickerOpen(false);
  }

  function resumeDraft(draft: CartDraft) {
    if (lines.length > 0) {
      Alert.alert(
        "Replace the open cart?",
        "Loading this draft clears what is in the cart now.",
        [
          { text: "Keep cart", style: "cancel" },
          { text: "Load draft", onPress: () => applyDraft(draft) },
        ],
      );
      return;
    }
    applyDraft(draft);
  }

  function discardDraft(draft: CartDraft) {
    Alert.alert("Delete this draft?", "The parked cart is removed from this terminal.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete draft",
        style: "destructive",
        onPress: () => void removeCartDraft(draft.id).then(() => refreshDrafts()),
      },
    ]);
  }

  /**
   * Writes the sale locally, fires the receipt, and moves on. Nothing here waits
   * on the network, so this behaves identically offline and online.
   */
  async function finishSale() {
    if (!cashier || lines.length === 0) return;

    if (!cashier.canSell) {
      Alert.alert(
        "Sales disabled",
        "Your account cannot complete sales. Ask an admin to turn sales back on.",
      );
      return;
    }

    if (requiresCustomerForPayment(payment, customer)) {
      Alert.alert("Customer needed", "Credit needs a customer — add one below.");
      return;
    }

    setSaving(true);
    try {
      let saleCustomer = normaliseCustomerDetails(customer);
      if (hasCustomerDetails(saleCustomer)) {
        const name =
          saleCustomer.name ??
          saleCustomer.contact ??
          saleCustomer.address ??
          "Customer";
        const customerId = saleCustomer.customerId ?? Crypto.randomUUID();
        await upsertLocalCustomer({
          id: customerId,
          name,
          address: saleCustomer.address,
          contact: saleCustomer.contact,
          pending: true,
        });
        saleCustomer = { ...saleCustomer, customerId, name };
      }

      const sale = await completeSale({
        lines,
        userId: cashier.id,
        deviceId: await getDeviceId(),
        paymentMethod: payment,
        customer: saleCustomer,
        fulfillment,
        orderDiscounts,
        paymentProofLocalUri: payment === "ewallet" ? paymentProofUri : null,
        ewalletProvider: payment === "ewallet" ? ewalletProvider : null,
      });

      // "confetti" is the one background option that isn't a continuous
      // decoration (lib/theme-preferences.ts) — it only ever fires here, on
      // an actual completed sale, never on its own.
      if (backgroundEffect === "confetti") celebrate();

      setLines([]);
      setOverridden([]);
      setOrderDiscounts([]);
      setPromoSuggestion(null);
      // The next customer is a different customer. Carrying details over would
      // put a stranger's name and address on the following receipt.
      setCustomer(NO_CUSTOMER);
      setFulfillment("pickup");
      setPaymentProofUri(null);
      setEwalletProvider(null);
      // Keep the confirm dialog up — it flips to a success state. Cart stays
      // open underneath so the phone CartShell Modal doesn't unmount this
      // dialog with it. Print / Skip close both; print is opt-in (never auto).
      setCompletedSale(sale);
      setConfirmSucceeded(true);
      setFocusEpoch((epoch) => epoch + 1);
      void refresh();

      // Deliberately not awaited: if this device happens to be online it
      // quietly leaves early instead of waiting for the next manual Sync;
      // offline, it just fails silently and the sale stays pending.
      void autoPush();
    } finally {
      setSaving(false);
    }
  }

  function closeAfterSale() {
    setConfirmOpen(false);
    setConfirmSucceeded(false);
    setCompletedSale(null);
    setCartOpen(false);
  }

  function printCompletedSale() {
    const sale = completedSale;
    const name = cashier?.name;
    closeAfterSale();
    if (!sale || !name) return;
    void printReceipt(sale, name).catch((error: unknown) => {
      console.warn("Receipt did not print", error);
    });
  }

  const oversellRisk = lines.some((line) => line.quantity > line.availableStock);
  const itemCount = lines.reduce((count, line) => count + line.quantity, 0);
  const qtyEditingLine =
    lines.find((line) => line.productId === qtyEditingId) ?? null;

  // Publishes into StoreHeader's cart chip (item 7 — the header shows the
  // cart instead of the shop name; the old bottom CartSummaryBar is gone).
  // `open` is only wired on phone: on tablet the cart panel (CartShell) is
  // already always on-screen, so the header chip there is a plain summary,
  // not a second way to reach it.
  const { setCartSummary, clearCartSummary } = useCartSummary();
  const { flyToCart } = useFlyToCart();
  useEffect(() => {
    setCartSummary({
      itemCount,
      total,
      open: compact ? () => setCartOpen(true) : undefined,
    });
  }, [itemCount, total, compact, setCartSummary]);
  useEffect(() => clearCartSummary, [clearCartSummary]);

  return (
    <View style={{ flex: 1, flexDirection: compact ? "column" : "row" }}>
      {/* Tablet: header lives in this column only — cart is a full-height
          sibling (pos/_layout hides the shared StoreHeader on /pos). */}
      <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        {compact ? null : <StoreHeader />}
        {/* On a wide tablet the grid is capped and centred rather than letting
            tiles grow to billboard size. */}
        <View
          style={{
            flex: 1,
            padding: layout.gutter,
            gap: space.md,
            width: "100%",
            maxWidth: compact ? undefined : layout.gridMaxWidth,
            alignSelf: "center",
            minHeight: 0,
          }}
        >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            minHeight: compact ? 48 : 56,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.25)",
            borderRadius: radius.sm,
            backgroundColor: color.primary,
            paddingHorizontal: space.md,
          }}
        >
          <Search size={18} color={color.onPrimary} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={applyManualSearch}
            onSubmitEditing={() => void submitSearch()}
            // Focus stays put so a scanner can fire code after code.
            submitBehavior="submit"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={compact ? "Search or scan" : "Search by name or SKU, or scan a barcode"}
            placeholderTextColor="rgba(255,255,255,0.7)"
            numberOfLines={1}
            style={{
              flex: 1,
              minHeight: compact ? 48 : 56,
              fontSize: fontSize.bodyLg,
              color: color.onPrimary,
            }}
          />
          {search ? (
            <Pressable
              onPress={() => applyManualSearch("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={4}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <X size={20} color={color.onPrimary} strokeWidth={2} />
            </Pressable>
          ) : null}
          {isEnabled("product_vector_search") ? (
            <Pressable
              onPress={() => setAiSearchOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Smart search with AI"
              hitSlop={4}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <Sparkles size={20} color={color.onPrimary} strokeWidth={2} />
            </Pressable>
          ) : null}
          {isEnabled("voice_search") ? (
            <Pressable
              onPress={openVoiceSearch}
              accessibilityRole="button"
              accessibilityLabel="Search by voice"
              hitSlop={4}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <Mic size={20} color={color.onPrimary} strokeWidth={2} />
            </Pressable>
          ) : null}
          {isEnabled("barcode_scan") ? (
            <Pressable
              onPress={() => setBarcodeScanOpen(true)}
              onLongPress={() => setFloatingScannerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Scan a barcode or QR code. Hold for continuous scanning"
              hitSlop={4}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <ScanBarcode size={20} color={color.onPrimary} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {aiResultIds ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: radius.sm,
              backgroundColor: color.primarySoft,
            }}
          >
            <Sparkles size={16} color={color.primary} strokeWidth={2} />
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontSize: fontSize.body, fontWeight: "600", color: color.primaryDark }}
            >
              Smart search: “{aiResultLabel}” ({aiResultIds.length})
            </Text>
            <Pressable
              onPress={clearAiSearch}
              accessibilityRole="button"
              accessibilityLabel="Clear smart search"
              hitSlop={4}
              style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center" }}
            >
              <X size={18} color={color.primaryDark} strokeWidth={2} />
            </Pressable>
          </View>
        ) : /* Hidden while searching: the results already ignore the filter, so a
               lit-up button beside them would be a lie. */
        search.trim() ? null : (
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button
              label={
                category
                  ? (() => {
                      const selected = categories.find((entry) => entry.id === category);
                      return selected
                        ? `${selected.name} (${selected.productCount} items)`
                        : "Filter by category";
                    })()
                  : `All products (${totalProducts} items)`
              }
              icon={FolderTree}
              variant={category ? "primary" : "secondary"}
              style={{ flex: 1 }}
              onPress={() => setCategoryDialogOpen(true)}
            />
            <Button
              label={hasDraft ? `Drafts (${drafts.length})` : "Draft sales"}
              icon={BookmarkCheck}
              variant={hasDraft ? "primary" : "secondary"}
              style={{ flex: 1 }}
              onPress={openDraftPicker}
            />
          </View>
        )}

        <View style={{ flex: 1, minHeight: 0, gap: space.sm }}>
          {!ready || (loadingPage && products.length === 0) ? (
            <LoadingState text="Loading products…" />
          ) : products.length === 0 && !query && category === null && !aiResultIds ? (
            <EmptyState
              icon={PackageSearch}
              title="No products on this terminal"
              instruction="Press Refresh to bring the product list down from the office."
            />
          ) : (
            <FlatList
              data={paddedTiles}
              style={{ flex: 1 }}
              keyExtractor={(item, index) =>
                item
                  ? item.variant
                    ? `${item.display.id}:${item.variant.id}`
                    : item.display.id
                  : `filler-${index}`
              }
              // numColumns cannot change on a mounted list, so the column count is
              // part of the key and a rotation remounts the grid. listEnterKey
              // remounts on search/category so alternate SlideIn entering can fire once.
              key={`grid-${columns}-${listEnterKey}`}
              numColumns={columns}
              // Floating tile shadows eat into space between rows but sit open
              // at the top edge. Half-gap on every cell handles between + sides;
              // no content paddingTop — that double-counted and made the first
              // row look extra tall.
              contentContainerStyle={{
                paddingHorizontal: layout.gap / 2,
                paddingBottom: layout.gap / 2,
                paddingTop: 0,
                flexGrow: 1,
              }}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={PRODUCT_PAGE_SIZE}
              maxToRenderPerBatch={PRODUCT_PAGE_SIZE}
              windowSize={5}
              // Entering slides travel off-cell; clipping mid-animation leaves
              // the first tile stuck partially off-screen on Android.
              removeClippedSubviews={false}
              onEndReached={loadMore}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                loadingMore ? (
                  <View style={{ paddingVertical: space.md, alignItems: "center" }}>
                    <ActivityIndicator color={color.primary} />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <EmptyState
                  icon={PackageSearch}
                  title="Nothing matches that"
                  instruction="Check the spelling, or scan the barcode on the item itself."
                />
              }
              renderItem={({ item, index }) =>
                item ? (
                  <View
                    style={{
                      flex: 1,
                      paddingHorizontal: layout.gap / 2,
                      paddingBottom: layout.gap / 2,
                      // First row: no paddingTop so top inset matches between
                      // (shadow already softens the gap above).
                      paddingTop: index < columns ? 0 : layout.gap / 2,
                    }}
                  >
                    <ProductTile
                      product={item.display}
                      inCart={
                        item.variant
                          ? (inCartByVariant.get(item.variant.id) ?? 0)
                          : (inCart.get(item.display.id) ?? 0)
                      }
                      compact={compact}
                      minHeight={layout.tileMinHeight}
                      padding={space.md}
                      justCreated={justCreatedProductIds.has(item.display.id)}
                      enterIndex={index < LIST_ENTER_MAX ? index : null}
                      onPress={(sourceRect) => void handleTilePress(item, sourceRect)}
                      onRemove={() => changeQuantity(item.realProduct.id, -1, item.variant?.id)}
                      onHoldRemove={() =>
                        confirmRemoveLine(item.realProduct.id, item.display.name, item.variant?.id)
                      }
                      onHoldView={() => setViewingProduct(item.realProduct)}
                    />
                  </View>
                ) : (
                  // Invisible filler so an incomplete last row keeps every
                  // real tile at the same column width instead of the lone
                  // survivor stretching flex:1 across the whole row.
                  <View
                    style={{
                      flex: 1,
                      paddingHorizontal: layout.gap / 2,
                      paddingBottom: layout.gap / 2,
                      paddingTop: index < columns ? 0 : layout.gap / 2,
                    }}
                  />
                )
              }
            />
          )}

          {offlineModeEnabled ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                gap: space.xs,
                paddingHorizontal: space.sm,
                paddingVertical: space.xs,
                borderRadius: radius.sm,
                backgroundColor: color.primarySoft,
              }}
            >
              <Info size={13} color={color.primary} strokeWidth={2.5} />
              <Text style={{ fontSize: fontSize.caption, color: color.primary }}>
                Stock counts are an estimate until you sync.
              </Text>
            </View>
          ) : null}
        </View>
        </View>
      </View>

      <CartShell
        compact={compact}
        width={layout.cartWidth}
        padding={layout.gutter}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
      >
        {/* Column fills the panel: lines grow, checkout stays docked bottom. */}
        <View style={{ flex: 1, minHeight: 0 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              // Bleed into CartShell padding so the wash reads as a real header bar.
              marginHorizontal: -layout.gutter,
              marginTop: -layout.gutter,
              paddingHorizontal: layout.gutter,
              paddingTop: layout.gutter,
              paddingBottom: space.sm,
              backgroundColor: color.primaryTint,
              borderBottomWidth: 1,
              borderBottomColor: color.borderSoft,
            }}
          >
            <View style={[styles.iconWell, { width: 34, height: 34 }]}>
              <ShoppingCart size={18} color={color.primary} strokeWidth={2} />
            </View>
            <Text style={styles.subheading}>Cart</Text>
            {itemCount > 0 ? (
              <View
                style={{
                  backgroundColor: color.primary,
                  borderRadius: radius.sm,
                  paddingHorizontal: space.sm,
                  paddingVertical: 2,
                }}
              >
                <Text
                  style={{
                    color: color.onPrimary,
                    fontSize: fontSize.caption,
                    fontWeight: "700",
                  }}
                >
                  {itemCount} items
                </Text>
              </View>
            ) : null}

            <View
              style={{
                marginLeft: "auto",
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
              }}
            >
              {lines.length > 0 ? (
                <IconButton
                  icon={Bookmark}
                  label="Save as draft"
                  onPress={() => void saveDraft()}
                />
              ) : null}
              {hasDraft ? (
                <IconButton
                  icon={BookmarkCheck}
                  label={
                    drafts.length === 1
                      ? "Open drafts"
                      : `Open drafts, ${drafts.length} saved`
                  }
                  onPress={openDraftPicker}
                />
              ) : null}
              {lines.length > 0 ? (
                <IconButton
                  icon={Trash2}
                  label="Empty the cart"
                  tone="danger"
                  onPress={confirmClearCart}
                />
              ) : null}
              {compact ? (
                <IconButton icon={X} label="Close cart" onPress={() => setCartOpen(false)} />
              ) : null}
            </View>
          </View>

          <View style={{ flex: 1, minHeight: 0, marginTop: space.sm }}>
            {lines.length === 0 ? (
              <View style={{ flex: 1, justifyContent: "center" }}>
                <EmptyState
                  icon={ShoppingCart}
                  title="Nothing in the cart"
                  instruction={
                    hasDraft
                      ? `${drafts.length} draft${drafts.length === 1 ? "" : "s"} saved — tap the bookmark to open one, or tap a product.`
                      : "Tap a product to start a sale."
                  }
                />
              </View>
            ) : (
              <FlatList
                style={{ flex: 1 }}
                data={lines}
                // A product with 2+ variants can have one cart line per
                // variant — productId alone collides across them.
                keyExtractor={(line) => (line.variantId ? `${line.productId}:${line.variantId}` : line.productId)}
                keyboardShouldPersistTaps="handled"
                ItemSeparatorComponent={() => (
                  <View
                    style={{
                      borderBottomWidth: 1,
                      borderStyle: "dashed",
                      borderColor: color.border,
                    }}
                  />
                )}
                renderItem={({ item }) => (
                  <CartRow
                    line={item}
                    product={byId.get(item.productId)}
                    priceLocked={overridden.includes(item.productId)}
                    displayUnitPrice={
                      globalDiscountIds.includes(item.productId)
                        ? (preDiscountPrices[item.productId] ?? item.unitPrice)
                        : item.unitPrice
                    }
                    onChange={(delta) => changeQuantity(item.productId, delta, item.variantId)}
                    onEditQuantity={() => setQtyEditingId(item.productId)}
                    onRemove={() => confirmRemoveLine(item.productId, item.productName, item.variantId)}
                  />
                )}
              />
            )}
          </View>

          {/* Docked checkout — stays visible while the line list scrolls above. */}
          <View style={{ flexShrink: 0, paddingTop: space.sm }}>
            <LedgerLine />

            {/* Only surfaces once there's a discount to explain — otherwise
                subtotal and total are the same number twice. */}
            {discount > 0 ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: space.xs,
                }}
              >
                <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>Subtotal</Text>
                <Text style={[styles.numeric, { fontSize: fontSize.body, color: color.inkMuted }]}>
                  {formatMoney(shelfTotal)}
                </Text>
              </View>
            ) : null}

            {lines.length > 0 ? (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: space.sm,
                  marginBottom: space.sm,
                }}
              >
                <Pressable
                  onPress={() => setDiscountSheetOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    discount > 0
                      ? `Discount given, ${formatMoney(discount)}. Edit.`
                      : "Add a discount"
                  }
                  style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}
                >
                  <Tag size={14} color={color.accentInk} strokeWidth={2.5} />
                  <Text
                    style={{
                      fontSize: fontSize.body,
                      color: color.accentInk,
                      textDecorationLine: "underline",
                      textDecorationStyle: "dotted",
                    }}
                  >
                    {discount > 0 ? "Discount" : "Add discount"}
                  </Text>
                  <Pencil size={11} color={color.accentInk} strokeWidth={2} />
                </Pressable>
                {discount > 0 ? (
                  <Text
                    style={[
                      styles.numeric,
                      { fontSize: fontSize.bodyLg, fontWeight: "700", color: color.accentInk },
                    ]}
                  >
                    -{formatMoney(discount)}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {promoSuggestion ? (
              <Pressable
                onPress={() => {
                  setOrderDiscounts((current) => [
                    ...current,
                    applyComplexRuleToCart({
                      rule: promoSuggestion,
                      lines,
                      appliedBy: cashier?.id,
                    }),
                  ]);
                  setPromoSuggestion(null);
                }}
                style={{
                  marginBottom: space.sm,
                  padding: space.sm,
                  borderRadius: radius.sm,
                  backgroundColor: color.primaryTint,
                }}
              >
                <Text style={{ fontSize: fontSize.body, color: color.primary, fontWeight: "600" }}>
                  You've unlocked: {promoSuggestion.name}! Tap to apply
                </Text>
              </Pressable>
            ) : null}

            {/* The one number the cashier reads out loud, so it sits on its own
                tinted band rather than blending into the line items. */}
            <View
              style={[
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: space.sm,
                  padding: space.md,
                  borderRadius: radius.sm,
                  backgroundColor: color.primaryTint,
                },
                styles.floatShadow,
              ]}
            >
              <View>
                <Text
                  style={{
                    fontSize: fontSize.bodyLg,
                    fontWeight: "700",
                    color: color.primaryDark,
                  }}
                >
                  TOTAL
                </Text>
                {itemCount > 0 ? (
                  <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                    {itemCount} item{itemCount === 1 ? "" : "s"}
                  </Text>
                ) : null}
              </View>
              <Money
                value={total}
                style={[
                  styles.total,
                  {
                    fontSize: compact ? fontSize.headingMd : fontSize.headingLg,
                    color: color.primaryDark,
                  },
                ]}
              />
            </View>

            <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
              <PaymentMethodTrigger
                value={payment}
                hasProof={Boolean(paymentProofUri)}
                provider={ewalletProvider}
                onPress={() => setOpenField("payment")}
              />
              <SelectField
                label="Fulfillment"
                value={fulfillment}
                options={FULFILLMENT_OPTIONS}
                open={openField === "fulfillment"}
                onOpen={() => setOpenField("fulfillment")}
                onClose={() => setOpenField(null)}
                onChange={setFulfillment}
              />
            </View>

            <PaymentMethodDialog
              open={openField === "payment"}
              value={payment}
              proofUri={paymentProofUri}
              provider={ewalletProvider}
              onClose={() => setOpenField(null)}
              onConfirm={(method, proofUri, provider) => {
                setPayment(method);
                setPaymentProofUri(method === "ewallet" ? proofUri : null);
                setEwalletProvider(method === "ewallet" ? provider : null);
                setOpenField(null);
              }}
            />

            {/* Optional, and it looks optional: one quiet row, never a required
                step between the cashier and the total. */}
            <CustomerButton
              customer={customer}
              onPress={() => setEditingCustomer(true)}
              onClear={() => {
                setCustomer(NO_CUSTOMER);
                // No customer left to owe utang to — fall back to cash
                // rather than leaving Credit selected with nothing behind it.
                if (payment === "credit") setPayment("cash");
              }}
            />

            {requiresCustomerForPayment(payment, customer) ? (
              <View style={{ marginTop: space.sm }}>
                <WarningNote>Credit needs a customer — add one below.</WarningNote>
              </View>
            ) : null}

            {oversellRisk ? (
              <View style={{ marginTop: space.sm }}>
                <WarningNote>
                  This sells more than the last counted stock. It still goes through — the
                  office will see it after you sync.
                </WarningNote>
              </View>
            ) : null}

            <Button
              label="Complete sale"
              large
              icon={CheckCircle2}
              disabled={lines.length === 0 || saving}
              style={{ marginTop: space.md }}
              onPress={() => {
                if (!cashier?.canSell) {
                  Alert.alert(
                    "Sales disabled",
                    "Your account cannot complete sales. Ask an admin to turn sales back on.",
                  );
                  return;
                }
                setConfirmSucceeded(false);
                setConfirmOpen(true);
              }}
            />
          </View>
        </View>

        {/* Inside the cart on purpose: on a phone the cart is itself a modal,
            and a sheet presented from outside it would open underneath. */}
        <DiscountSheet
          open={discountSheetOpen}
          total={cartTotal(lines)}
          lines={lines}
          rules={discountRules}
          loyaltyRewards={loyaltyRewards}
          customerPoints={customerPoints}
          hasCustomer={Boolean(customer.customerId)}
          applied={orderDiscounts}
          tax={taxSettings}
          hasDiscount={discount > 0}
          onClose={() => setDiscountSheetOpen(false)}
          onApplyAmount={applyGlobalDiscount}
          onApplyRule={(discountRow) => {
            setOrderDiscounts((current) => {
              const withoutSimple = current.filter((d) => d.discountRuleId == null);
              if (discountRow.isVatExempt) {
                return [discountRow];
              }
              return [...withoutSimple.filter((d) => !d.isVatExempt), discountRow];
            });
            setPromoSuggestion(null);
            setDiscountSheetOpen(false);
          }}
          onClear={clearAllDiscounts}
        />

        <QuantitySheet
          key={qtyEditingId ?? "qty-closed"}
          line={qtyEditingLine}
          onClose={() => setQtyEditingId(null)}
          onApply={setQuantity}
        />

        <CustomerSheet
          key={editingCustomer ? "customer-open" : "customer-closed"}
          open={editingCustomer}
          customer={customer}
          onClose={() => setEditingCustomer(false)}
          onApply={(next) => {
            setCustomer(next);
            setEditingCustomer(false);
          }}
        />

        <ConfirmSaleSheet
          key={confirmOpen ? "confirm-open" : "confirm-closed"}
          open={confirmOpen}
          succeeded={confirmSucceeded}
          shelfTotal={shelfTotal}
          discount={discount}
          amountDue={total}
          payment={payment}
          ewalletProvider={payment === "ewallet" ? ewalletProvider : null}
          fulfillment={fulfillment}
          customer={customer}
          itemCount={itemCount}
          busy={saving}
          onClose={() => {
            if (confirmSucceeded) {
              closeAfterSale();
              return;
            }
            setConfirmOpen(false);
          }}
          onConfirm={() => void finishSale()}
          onPrintReceipt={printCompletedSale}
          onSkip={closeAfterSale}
        />

      </CartShell>

      {/* Moved out of CartShell — the "Draft sales" toolbar button triggers this
          directly from the main screen, not from inside the cart modal. */}
      <DraftPickerSheet
        open={draftPickerOpen}
        drafts={drafts}
        onClose={() => setDraftPickerOpen(false)}
        onPick={resumeDraft}
        onDiscard={discardDraft}
      />

      <CategoryDialog
        open={categoryDialogOpen}
        categories={categories}
        totalProducts={totalProducts}
        value={category}
        onClose={() => setCategoryDialogOpen(false)}
        onPick={(next) => {
          clearAiSearch();
          setCategory(next);
          setCategoryDialogOpen(false);
        }}
      />

      <VoiceSearchModal
        open={voiceSearchOpen}
        onClose={() => setVoiceSearchOpen(false)}
        onResult={applyManualSearch}
        contextualStrings={voiceVocabulary}
      />

      <BarcodeScanModal
        open={barcodeScanOpen}
        onClose={() => setBarcodeScanOpen(false)}
        onResult={applyManualSearch}
      />

      <FloatingBarcodeScanner
        open={floatingScannerOpen}
        onClose={() => setFloatingScannerOpen(false)}
        onScan={handleFloatingScan}
      />

      <AiSearchModal
        open={aiSearchOpen}
        onClose={() => setAiSearchOpen(false)}
        client={getApiClient()}
        onResult={(productIds, label) => {
          setSearch("");
          setCategory(null);
          setAiResultIds(productIds);
          setAiResultLabel(label);
        }}
      />

      <ProductDetailSheet product={viewingProduct} onClose={() => setViewingProduct(null)} />

      <VariantAddonPicker
        open={pickerState !== null}
        productName={pickerState?.product.name ?? ""}
        productPhotoUrl={pickerState?.product.photoUrl}
        variants={pickerState?.variants ?? []}
        addonGroups={pickerState?.addonGroups ?? []}
        onCancel={() => setPickerState(null)}
        onConfirm={(selection) => void onPickerConfirm(selection)}
      />

      {/*
        Rendered here, inside this screen's own tree, rather than up in
        app/_layout.tsx or app/pos/_layout.tsx — expo-router's Stack is a
        native-stack (react-native-screens) navigator, and each of its
        screens is its own native Screen surface. A plain overlay View
        sitting as a sibling of a <Stack> outside this component does not
        reliably paint above what a Screen renders, which is why the effect
        was invisible over the product grid despite sitting later in the
        JSX. Placed last here — same screen, same view tree as the grid
        above — so it always draws on top of it.
      */}
      <ThemeBackgroundEffect />
      {confettiNode}
    </View>
  );
}

function CartRow({
  line,
  product,
  priceLocked,
  displayUnitPrice,
  onChange,
  onEditQuantity,
  onRemove,
}: {
  line: CartLine;
  product: ProductWithEstimatedStock | undefined;
  /** True when a global discount (or draft override) froze bulk reprice on this line. */
  priceLocked: boolean;
  /** Frozen pre-discount unit price when a global discount touched this line. */
  displayUnitPrice: number;
  onChange: (delta: number) => void;
  onEditQuantity: () => void;
  onRemove: () => void;
}) {
  const stockCap = stockCapFor(line.availableStock, line.allowDecimal);
  const remaining = Math.max(0, stockCap - line.quantity);
  const atMax = line.quantity >= stockCap;
  // A line added while its product showed none on hand gets its cap fixed
  // at BACKORDER_CAP (see commitAddToCart) so the stepper still has room to
  // count up a backorder — that's the sell-anyway allowance, not real
  // stock, so "9998 left" (BACKORDER_CAP minus quantity) would tell the
  // cashier the opposite of what's true.
  const backordered = line.availableStock === BACKORDER_CAP;
  const oversell = !backordered && line.quantity > stockCap;
  const bulkMin = product?.bulkMinQuantity ?? null;
  const bulkApplied = !priceLocked && bulkMin !== null && line.quantity >= bulkMin;
  // At one, decrementing drops the line entirely, so the control says so.
  const RemoveIcon = line.quantity === 1 ? Trash2 : Minus;
  const showFlags = bulkApplied || oversell;
  const photoUrl = product?.photoUrl ?? null;
  const lineTotal = lineSubtotal(displayUnitPrice, line.quantity);
  const stockLabel = backordered
    ? "Out of stock"
    : oversell
      ? `${stockCap} in stock`
      : remaining === 0
        ? "At limit"
        : `${remaining} left`;

  const swipeRef = useRef<SwipeableMethods>(null);

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            swipeRef.current?.close();
            onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${line.productName} from the cart`}
          style={({ pressed }) => ({
            width: 76,
            marginVertical: 2,
            marginLeft: space.sm,
            borderRadius: radius.sm,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? color.dangerInk : color.danger,
          })}
        >
          <Trash2 size={18} color={color.onPrimary} strokeWidth={2.25} />
          <Text
            style={{
              marginTop: 2,
              color: color.onPrimary,
              fontSize: fontSize.caption,
              fontWeight: "700",
            }}
          >
            Remove
          </Text>
        </Pressable>
      )}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: space.sm,
          paddingVertical: space.sm,
          backgroundColor: color.surface,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.sm,
            overflow: "hidden",
            backgroundColor: color.surfacePressed,
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <Package size={20} color={color.inkMuted} strokeWidth={2} />
          )}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {/* Full name, wrapped rather than cut short with an ellipsis — a long
              SKU description staying readable outranks the row staying compact. */}
          <Text
            style={{
              fontSize: fontSize.body,
              fontWeight: "700",
              color: color.ink,
            }}
          >
            {line.productName}
          </Text>
          {line.variantLabel ? (
            <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.primary }}>
              {line.variantLabel}
            </Text>
          ) : null}
          {(line.addons ?? []).map((addon, index) => (
            <Text
              key={`${addon.addonGroupItemId}-${index}`}
              style={{ fontSize: fontSize.caption, color: color.inkMuted }}
            >
              + {addon.name}
            </Text>
          ))}
          <Text
            style={{
              alignSelf: "flex-start",
              fontSize: fontSize.caption,
              fontWeight: "600",
              color: backordered || oversell || remaining === 0 ? color.warningInk : color.inkMuted,
            }}
          >
            {stockLabel}
            <Text style={{ color: color.inkMuted }}> | </Text>
            <Text style={{ color: color.ink, fontWeight: "700" }}>{formatMoney(lineTotal)}</Text>
          </Text>

          {showFlags ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: space.xs,
                marginTop: 2,
              }}
            >
              {bulkApplied ? (
                <Badge tone="success" icon={Tag} label={`Bulk from ${bulkMin}`} />
              ) : null}
              {oversell ? <Badge tone="warning" label="Over stock" /> : null}
            </View>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.xs,
            flexShrink: 0,
            paddingTop: 2,
          }}
        >
          <CartQtyButton
            icon={RemoveIcon}
            label={
              line.quantity === 1
                ? `Remove ${line.productName} from the cart`
                : `One less ${line.productName}`
            }
            onPress={() => onChange(-1)}
          />
          <Pressable
            onPress={onEditQuantity}
            accessibilityRole="button"
            accessibilityLabel={`Type quantity for ${line.productName}`}
            hitSlop={8}
            style={{
              minWidth: 32,
              minHeight: 40,
              paddingHorizontal: space.xs,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={[
                styles.numeric,
                {
                  textAlign: "center",
                  fontSize: fontSize.body,
                  fontWeight: "700",
                  color: color.ink,
                },
              ]}
            >
              {formatQuantity(line.quantity)}
            </Text>
          </Pressable>
          <CartQtyButton
            icon={Plus}
            label={
              atMax
                ? `${line.productName} is at stock limit`
                : `One more ${line.productName}`
            }
            disabled={atMax}
            onPress={() => onChange(1)}
          />
        </View>
      </View>
    </Swipeable>
  );
}

/**
 * Type the quantity instead of tapping +/− for every unit. Caps at estimated
 * stock. Zero removes the line.
 */
function QuantitySheet({
  line,
  onClose,
  onApply,
}: {
  line: CartLine | null;
  onClose: () => void;
  onApply: (productId: string, quantity: number) => void;
}) {
  const [draft, setDraft] = useState(() =>
    line ? formatQuantity(line.quantity) : "",
  );

  if (!line) return null;

  const allowDecimal = line.allowDecimal;
  const stockCap = stockCapFor(line.availableStock, allowDecimal);
  // See CartRow — a line added while its product showed none on hand gets
  // its cap fixed at BACKORDER_CAP as sell-anyway room, not real stock.
  const backordered = line.availableStock === BACKORDER_CAP;
  const typed = Number(draft);
  const value = allowDecimal
    ? Number(typed.toFixed(QUANTITY_DECIMALS))
    : Math.floor(typed);
  const empty = draft.trim() === "";
  const valid =
    !empty &&
    Number.isFinite(typed) &&
    (allowDecimal || Number.isInteger(typed)) &&
    value >= 0;
  const overStock = valid && value > stockCap;
  const willRemove = valid && value === 0;

  return (
    <BottomSheet open={line !== null} onClose={onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={[styles.iconWell, { width: 34, height: 34 }]}>
          <ShoppingCart size={18} color={color.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.subheading}>
            {line.productName}
          </Text>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            Sold by {line.unit} · {backordered ? "out of stock" : `${formatQuantity(stockCap)} in stock`}
          </Text>
        </View>
        <IconButton icon={X} label="Close" onPress={onClose} />
      </View>

      <Text style={{ fontSize: fontSize.body, fontWeight: "600" }}>Quantity</Text>

      <TextInput
        value={draft}
        onChangeText={(next) =>
          setDraft(
            allowDecimal
              ? next.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
              : next.replace(/[^0-9]/g, ""),
          )
        }
        keyboardType={allowDecimal ? "decimal-pad" : "number-pad"}
        autoFocus
        selectTextOnFocus
        accessibilityLabel={`Quantity of ${line.productName}`}
        style={[
          styles.numeric,
          {
            minHeight: 64,
            borderWidth: 2,
            borderColor: overStock || (!valid && !empty) ? color.danger : color.primary,
            borderRadius: radius.sm,
            backgroundColor:
              overStock || (!valid && !empty) ? color.dangerSoft : color.primaryTint,
            color:
              overStock || (!valid && !empty) ? color.dangerInk : color.primaryDark,
            paddingHorizontal: space.md,
            fontSize: fontSize.headingMd,
            fontWeight: "700",
          },
        ]}
      />

      {overStock ? (
        <Text style={{ fontSize: fontSize.body, color: color.dangerInk }}>
          Only {formatQuantity(stockCap)} in stock. Tap Set to use{" "}
          {formatQuantity(stockCap)}, or type a lower number.
        </Text>
      ) : willRemove ? (
        <Text style={{ fontSize: fontSize.body, color: color.warningInk }}>
          Zero removes this line from the cart.
        </Text>
      ) : (
        <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>
          Type the count. No need to tap + one by one.
        </Text>
      )}

      <Button
        label={willRemove ? "Remove from cart" : "Set quantity"}
        large
        icon={willRemove ? Trash2 : CheckCircle2}
        variant={willRemove ? "danger" : "primary"}
        disabled={!valid}
        onPress={() => onApply(line.productId, overStock ? stockCap : value)}
      />
      <Button label="Cancel" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}

/**
 * Catalog rules that match the current cart, plus a free-typed peso amount.
 * Rules come from the local discounts table (synced); scoped rules only
 * appear when a cart line hits their product/category/variant.
 */
function DiscountSheet({
  open,
  total,
  lines,
  rules,
  loyaltyRewards,
  customerPoints,
  hasCustomer,
  applied,
  tax,
  hasDiscount,
  onClose,
  onApplyAmount,
  onApplyRule,
  onClear,
}: {
  open: boolean;
  total: number;
  lines: CartLine[];
  rules: DiscountRule[];
  loyaltyRewards: LoyaltyReward[];
  customerPoints: number;
  hasCustomer: boolean;
  applied: AppliedOrderDiscount[];
  tax: TaxSettings;
  hasDiscount: boolean;
  onClose: () => void;
  onApplyAmount: (amount: number) => void;
  onApplyRule: (discount: AppliedOrderDiscount) => void;
  onClear: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { compact, landscape } = useLayout();
  // Phone or upright tablet: dock at the bottom, same as BottomSheet. Tablet
  // held sideways: keep the centered dialog box — there's width to spare.
  const centered = !compact && landscape;
  const [draft, setDraft] = useState("");
  const [pendingRule, setPendingRule] = useState<DiscountRule | null>(null);
  const [idNumber, setIdNumber] = useState("");
  const [idHolderName, setIdHolderName] = useState("");
  const typed = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(typed) && typed > 0;
  const applicable = qualifyingSimpleRules(rules, lines);
  const eligibleRewardEntries = hasCustomer
    ? eligibleLoyaltyRewards({ rewards: loyaltyRewards, discountRules: rules, pointsBalance: customerPoints, lines })
    : [];
  const appliedTotal = orderDiscountImpact(applied);

  useEffect(() => {
    if (!open) {
      setDraft("");
      setPendingRule(null);
      setIdNumber("");
      setIdHolderName("");
    }
  }, [open]);

  if (!open) return null;

  function pickRule(rule: DiscountRule) {
    if (rule.requiresIdNumber) {
      setPendingRule(rule);
      return;
    }
    onApplyRule(applySimpleRuleToCart({ rule, lines, tax }));
  }

  function confirmId() {
    if (!pendingRule) return;
    if (!idNumber.trim() || !idHolderName.trim()) {
      Alert.alert("ID required", "Enter the ID number and the cardholder's name.");
      return;
    }
    onApplyRule(
      applySimpleRuleToCart({
        rule: pendingRule,
        lines,
        tax,
        idNumber: idNumber.trim(),
        idHolderName: idHolderName.trim(),
      }),
    );
  }

  const usableHeight = height - keyboardHeight - insets.top - insets.bottom;
  const dialogWidth = centered ? width * 0.8 : width;
  const dialogHeight = centered
    ? Math.min(height * 0.8, usableHeight * 0.95)
    : Math.min(height * 0.85, usableHeight * 0.92);

  return (
    <Modal
      visible={open}
      transparent
      animationType={centered ? "fade" : "slide"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: `${color.ink}99`,
          alignItems: centered ? "center" : undefined,
          justifyContent: centered ? "center" : "flex-end",
          paddingBottom: centered ? keyboardHeight : 0,
          paddingHorizontal: centered ? space.sm : 0,
        }}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View
          style={{
            width: dialogWidth,
            height: dialogHeight,
            maxWidth: 720,
            backgroundColor: color.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderBottomLeftRadius: centered ? radius.lg : 0,
            borderBottomRightRadius: centered ? radius.lg : 0,
            padding: space.lg,
            paddingBottom: centered ? space.lg : Math.max(insets.bottom, space.lg),
            gap: space.md,
            shadowColor: "#000",
            shadowOpacity: 0.22,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 12 },
            elevation: 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={[styles.iconWell, { width: 44, height: 44 }]}>
              <Tag size={24} color={color.primary} strokeWidth={2} />
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: fontSize.headingMd,
                fontWeight: "700",
                color: color.ink,
              }}
            >
              {pendingRule ? "ID required" : "Apply discount"}
            </Text>
            <IconButton icon={X} label="Close" onPress={onClose} />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm }}
            style={{ flex: 1 }}
          >
            {pendingRule ? (
              <View style={{ gap: space.md }}>
                <View
                  style={{
                    alignItems: "center",
                    gap: space.xs,
                    paddingVertical: space.md,
                    paddingHorizontal: space.md,
                    borderRadius: radius.md,
                    backgroundColor: color.primaryTint,
                    borderWidth: 1,
                    borderColor: color.primarySoft,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.bodyLg,
                      fontWeight: "600",
                      color: color.primaryDark,
                    }}
                  >
                    Discount rule
                  </Text>
                  <Text
                    style={{
                      fontSize: fontSize.headingSm,
                      fontWeight: "700",
                      color: color.primaryDark,
                      textAlign: "center",
                    }}
                  >
                    {pendingRule.name}
                  </Text>
                  <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.ink }}>
                    Enter ID number and cardholder name
                  </Text>
                </View>

                <View style={{ gap: space.sm }}>
                  <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                    ID number
                  </Text>
                  <TextInput
                    value={idNumber}
                    onChangeText={setIdNumber}
                    placeholder="ID number"
                    autoFocus
                    accessibilityLabel="ID number"
                    style={[
                      styles.numeric,
                      {
                        minHeight: 64,
                        borderWidth: 2,
                        borderColor: color.primary,
                        borderRadius: radius.sm,
                        backgroundColor: color.primaryTint,
                        paddingHorizontal: space.md,
                        fontSize: fontSize.headingSm,
                        fontWeight: "700",
                        color: color.primaryDark,
                      },
                    ]}
                  />
                  <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                    Cardholder name
                  </Text>
                  <TextInput
                    value={idHolderName}
                    onChangeText={setIdHolderName}
                    placeholder="Cardholder name"
                    accessibilityLabel="Cardholder name"
                    style={[
                      styles.numeric,
                      {
                        minHeight: 64,
                        borderWidth: 2,
                        borderColor: color.primary,
                        borderRadius: radius.sm,
                        backgroundColor: color.primaryTint,
                        paddingHorizontal: space.md,
                        fontSize: fontSize.headingSm,
                        fontWeight: "700",
                        color: color.primaryDark,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : (
              <View style={{ gap: space.lg }}>
                {/* Cart total first — cashier sees what discount cuts against. */}
                <View
                  style={{
                    alignItems: "center",
                    gap: space.xs,
                    paddingVertical: space.md,
                    paddingHorizontal: space.md,
                    borderRadius: radius.md,
                    backgroundColor: color.primaryTint,
                    borderWidth: 1,
                    borderColor: color.primarySoft,
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.bodyLg,
                      fontWeight: "600",
                      color: color.primaryDark,
                      letterSpacing: 0.4,
                    }}
                  >
                    Cart total
                  </Text>
                  <Text
                    style={[
                      styles.numeric,
                      {
                        fontSize: fontSize.display,
                        fontWeight: "700",
                        color: color.primaryDark,
                      },
                    ]}
                  >
                    {formatMoney(total)}
                  </Text>
                  {hasDiscount ? (
                    <Text
                      style={{
                        fontSize: fontSize.bodyLg,
                        fontWeight: "700",
                        color: color.successInk,
                        marginTop: space.xs,
                      }}
                    >
                      Discount applied −{formatMoney(appliedTotal)}
                    </Text>
                  ) : (
                    <Text
                      style={{
                        fontSize: fontSize.bodyLg,
                        fontWeight: "600",
                        color: color.ink,
                        marginTop: space.xs,
                      }}
                    >
                      Pick a rule or type a custom amount
                    </Text>
                  )}
                </View>

                {eligibleRewardEntries.length > 0 ? (
                  <View style={{ gap: space.sm }}>
                    <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                      Loyalty rewards
                    </Text>
                    {eligibleRewardEntries.map(({ reward, rule }) => {
                      const active = applied.some((d) => d.loyaltyRewardId === reward.id);
                      const base = applicableAmountForRule(rule, lines);
                      const preview = computeSimpleDiscount(rule, base, tax);
                      return (
                        <Pressable
                          key={reward.id}
                          onPress={() =>
                            onApplyRule(applyLoyaltyRewardToCart({ reward, rule, lines, tax }))
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Redeem ${reward.name}`}
                          style={{
                            padding: space.md,
                            minHeight: 64,
                            borderRadius: radius.sm,
                            borderWidth: 1,
                            borderColor: active ? color.primary : color.border,
                            backgroundColor: active ? color.primaryTint : color.surface,
                            gap: space.xs,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: fontSize.bodyLg,
                              fontWeight: "700",
                              color: color.ink,
                            }}
                          >
                            {reward.name}
                          </Text>
                          <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.inkMuted }}>
                            {reward.pointsRequired.toLocaleString()} pts
                            {" · "}
                            {active ? "applied" : `about −${formatMoney(preview.discountAmount)}`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                <View style={{ gap: space.sm }}>
                  <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                    Available for this cart
                  </Text>
                  {applicable.length === 0 ? (
                    <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.inkMuted }}>
                      No catalog discounts match these items. Type a custom amount below.
                    </Text>
                  ) : (
                    applicable.map((rule) => {
                      const active = applied.some((d) => d.discountRuleId === rule.id);
                      const base = applicableAmountForRule(rule, lines);
                      const preview = computeSimpleDiscount(rule, base, tax);
                      const scopeHint =
                        rule.appliesTo === "total"
                          ? "Whole cart"
                          : rule.appliesTo === "specific_products"
                            ? "Matching products"
                            : "Matching categories";
                      return (
                        <Pressable
                          key={rule.id}
                          onPress={() => pickRule(rule)}
                          accessibilityRole="button"
                          accessibilityLabel={`Apply ${rule.name}`}
                          style={{
                            padding: space.md,
                            minHeight: 64,
                            borderRadius: radius.sm,
                            borderWidth: 1,
                            borderColor: active ? color.primary : color.border,
                            backgroundColor: active ? color.primaryTint : color.surface,
                            gap: space.xs,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: fontSize.bodyLg,
                              fontWeight: "700",
                              color: color.ink,
                            }}
                          >
                            {rule.name}
                          </Text>
                          <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.inkMuted }}>
                            {rule.type === "percentage" ? `${rule.value}%` : formatMoney(rule.value)}
                            {" · "}
                            {scopeHint}
                            {rule.isVatExempt ? " · VAT exempt" : ""}
                            {rule.requiresIdNumber ? " · ID required" : ""}
                          </Text>
                          <Text
                            style={{
                              fontSize: fontSize.bodyLg,
                              fontWeight: "700",
                              color: active ? color.primaryDark : color.ink,
                            }}
                          >
                            {active ? "Applied" : `About −${formatMoney(preview.discountAmount)}`}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>

                <View style={{ gap: space.sm }}>
                  <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                    Custom amount
                  </Text>
                  <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.inkMuted }}>
                    Free-typed peso off, split across every line on the receipt.
                  </Text>
                  <TextInput
                    value={draft}
                    onChangeText={(next) => setDraft(next.replace(/[^0-9.]/g, ""))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    accessibilityLabel="Custom discount amount in pesos"
                    style={[
                      styles.numeric,
                      {
                        minHeight: 72,
                        borderWidth: 2,
                        borderColor: color.primary,
                        borderRadius: radius.sm,
                        backgroundColor: color.primaryTint,
                        color: color.primaryDark,
                        paddingHorizontal: space.md,
                        fontSize: fontSize.headingLg,
                        fontWeight: "700",
                      },
                    ]}
                  />
                  {typed > total ? (
                    <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.inkMuted }}>
                      Capped at {formatMoney(total)} — the cart&apos;s current total.
                    </Text>
                  ) : null}
                </View>
              </View>
            )}
          </ScrollView>

          <View style={{ gap: space.sm }}>
            {pendingRule ? (
              <>
                <Button label="Apply with ID" large icon={CheckCircle2} onPress={confirmId} />
                <Button label="Back" variant="secondary" onPress={() => setPendingRule(null)} />
              </>
            ) : (
              <>
                <Button
                  label="Apply custom amount"
                  large
                  icon={CheckCircle2}
                  disabled={!valid}
                  onPress={() => onApplyAmount(typed)}
                />
                {hasDiscount ? (
                  <Button label="Clear all discounts" variant="secondary" onPress={onClear} />
                ) : (
                  <Button label="Back to cart" variant="secondary" onPress={onClose} />
                )}
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Same trigger shape as SelectField, plus a small dot once a proof photo is attached. */
function PaymentMethodTrigger({
  value,
  hasProof,
  provider,
  onPress,
}: {
  value: PaymentMethod;
  hasProof: boolean;
  provider: string | null;
  onPress: () => void;
}) {
  const selected = PAYMENT_METHODS.find((option) => option.value === value);
  const Icon = selected?.icon;
  const label = provider ? `${selected?.label ?? value} · ${provider}` : (selected?.label ?? value);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Payment method: ${selected?.label ?? value}`}
      style={{
        flex: 1,
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingHorizontal: space.sm,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: color.border,
        backgroundColor: color.surface,
      }}
    >
      {Icon ? <Icon size={16} color={color.primary} strokeWidth={2} /> : null}
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontSize: fontSize.body, fontWeight: "600", color: color.ink }}
      >
        {label}
      </Text>
      {hasProof ? <Camera size={14} color={color.primary} strokeWidth={2} /> : null}
      <ChevronRight size={16} color={color.inkMuted} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * Payment method picker — a centered dialog rather than a bottom drawer, so
 * it reads as a deliberate choice the cashier is making rather than
 * something to swipe away. E-Wallet has a second, still-optional step: a
 * proof screenshot the cashier may attach, never required to move on.
 */
function PaymentMethodDialog({
  open,
  value,
  proofUri,
  provider,
  onClose,
  onConfirm,
}: {
  open: boolean;
  value: PaymentMethod;
  proofUri: string | null;
  provider: string | null;
  onClose: () => void;
  onConfirm: (method: PaymentMethod, proofUri: string | null, provider: string | null) => void;
}) {
  const [step, setStep] = useState<"method" | "provider" | "proof">("method");
  const [draftMethod, setDraftMethod] = useState<PaymentMethod>(value);
  const [draftProofUri, setDraftProofUri] = useState<string | null>(proofUri);
  const [draftProvider, setDraftProvider] = useState<string | null>(provider);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherProvider, setOtherProvider] = useState("");
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const isPreset = provider ? (EWALLET_PROVIDERS as readonly string[]).includes(provider) : true;
      setStep("method");
      setDraftMethod(value);
      setDraftProofUri(proofUri);
      setDraftProvider(provider);
      setShowOtherInput(Boolean(provider) && !isPreset);
      setOtherProvider(provider && !isPreset ? provider : "");
      setPhotoError(null);
    }
  }, [open, value, proofUri, provider]);

  function pickMethod(method: PaymentMethod) {
    setDraftMethod(method);
    if (method === "ewallet") {
      setStep("provider");
    } else {
      onConfirm(method, null, null);
    }
  }

  function pickProvider(name: string) {
    if (name === "Other E-Wallet") {
      setShowOtherInput(true);
      return;
    }
    setDraftProvider(name);
    setStep("proof");
  }

  function confirmOtherProvider() {
    const trimmed = otherProvider.trim();
    if (!trimmed) return;
    setDraftProvider(trimmed);
    setStep("proof");
  }

  async function takePhoto() {
    setPhotoError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(
        permission.canAskAgain
          ? "Needs camera access to take a photo."
          : "Camera access is off for this app. Turn it on in Settings.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) setDraftProofUri(uri);
  }

  async function pickFromLibrary() {
    setPhotoError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError(
        permission.canAskAgain
          ? "Needs access to photos to pick an existing one."
          : "Photo access is off for this app. Turn it on in Settings.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) setDraftProofUri(uri);
  }

  const paymentDialogInsets = useSafeAreaInsets();
  const paymentDialogLayout = useLayout();
  // Same phone-drawer / tablet-landscape-modal split as BottomSheet — this
  // dialog predates that component, so it grows its own scrim/box here.
  const paymentDialogCentered = !paymentDialogLayout.compact && paymentDialogLayout.landscape;

  return (
    <Modal
      visible={open}
      transparent
      animationType={paymentDialogCentered ? "fade" : "slide"}
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(27, 31, 29, 0.55)",
          justifyContent: paymentDialogCentered ? "center" : "flex-end",
        }}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View
          style={{
            marginHorizontal: paymentDialogCentered ? space.lg : 0,
            padding: space.lg,
            paddingBottom: paymentDialogCentered
              ? space.lg
              : Math.max(paymentDialogInsets.bottom, space.lg),
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderBottomLeftRadius: paymentDialogCentered ? radius.lg : 0,
            borderBottomRightRadius: paymentDialogCentered ? radius.lg : 0,
            backgroundColor: color.surface,
            gap: space.md,
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {step === "provider" ? (
              <IconButton icon={ArrowLeft} label="Back" onPress={() => setStep("method")} />
            ) : null}
            {step === "proof" ? (
              <IconButton
                icon={ArrowLeft}
                label="Back"
                onPress={() => (draftMethod === "ewallet" ? setStep("provider") : setStep("method"))}
              />
            ) : null}
            <Text style={{ flex: 1, fontSize: fontSize.headingMd, fontWeight: "700", color: color.ink }}>
              {step === "method" ? "Payment method" : step === "provider" ? "Which e-wallet?" : "Add proof photo?"}
            </Text>
            <IconButton icon={X} label="Close" onPress={onClose} />
          </View>

          {step === "method" ? (
            <View style={{ gap: space.sm }}>
              {PAYMENT_METHODS.map((option) => {
                const isSelected = option.value === draftMethod;
                const OptionIcon = option.icon;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => pickMethod(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.md,
                      minHeight: 56,
                      paddingHorizontal: space.md,
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      borderColor: isSelected ? color.primary : color.border,
                      backgroundColor: isSelected ? color.primaryTint : color.surface,
                    }}
                  >
                    <OptionIcon
                      size={22}
                      color={isSelected ? color.primary : color.inkMuted}
                      strokeWidth={2}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontSize: fontSize.bodyLg,
                        fontWeight: isSelected ? "700" : "500",
                        color: isSelected ? color.primaryDark : color.ink,
                      }}
                    >
                      {option.label}
                    </Text>
                    {isSelected ? (
                      <Check size={20} color={color.primary} strokeWidth={2.5} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : step === "provider" ? (
            <View style={{ gap: space.sm }}>
              {EWALLET_PROVIDERS.map((name) => {
                const isSelected = showOtherInput ? name === "Other E-Wallet" : name === draftProvider;
                return (
                  <Pressable
                    key={name}
                    onPress={() => pickProvider(name)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={{
                      minHeight: 56,
                      justifyContent: "center",
                      paddingHorizontal: space.md,
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      borderColor: isSelected ? color.primary : color.border,
                      backgroundColor: isSelected ? color.primaryTint : color.surface,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: fontSize.bodyLg,
                        fontWeight: isSelected ? "700" : "500",
                        color: isSelected ? color.primaryDark : color.ink,
                      }}
                    >
                      {name}
                    </Text>
                  </Pressable>
                );
              })}

              {showOtherInput ? (
                <View style={{ gap: space.sm }}>
                  <TextInput
                    value={otherProvider}
                    onChangeText={setOtherProvider}
                    placeholder="Wallet name"
                    autoFocus
                    accessibilityLabel="Wallet name"
                    style={{
                      minHeight: 56,
                      borderWidth: 1,
                      borderColor: color.border,
                      borderRadius: radius.sm,
                      paddingHorizontal: space.md,
                      fontSize: fontSize.bodyLg,
                      color: color.ink,
                    }}
                  />
                  <Button
                    label="Continue"
                    large
                    icon={CheckCircle2}
                    disabled={!otherProvider.trim()}
                    onPress={confirmOtherProvider}
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              <Text style={{ fontSize: fontSize.bodyLg, color: color.inkMuted, lineHeight: 22 }}>
                A screenshot of the transfer, for your records. Optional — the sale is the same
                either way.
              </Text>

              {draftProofUri ? (
                <View style={{ gap: space.sm }}>
                  <Image
                    source={{ uri: draftProofUri }}
                    style={{ width: "100%", height: 220, borderRadius: radius.sm }}
                    resizeMode="contain"
                  />
                  <Button
                    label="Remove photo"
                    variant="secondary"
                    icon={Trash2}
                    onPress={() => setDraftProofUri(null)}
                  />
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <Button label="Take photo" icon={Camera} style={{ flex: 1 }} onPress={takePhoto} />
                  <Button
                    label="Choose photo"
                    variant="secondary"
                    icon={Images}
                    style={{ flex: 1 }}
                    onPress={pickFromLibrary}
                  />
                </View>
              )}

              {photoError ? <WarningNote>{photoError}</WarningNote> : null}

              <Button
                label={draftProofUri ? "Done" : "Skip — no photo"}
                large
                icon={CheckCircle2}
                onPress={() => onConfirm("ewallet", draftProofUri, draftProvider)}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * The row that opens the customer sheet, and the summary once something is
 * filled in.
 *
 * Deliberately understated: most sales are a walk-in paying cash, and a loud
 * empty field above the Complete sale button would read as something that has
 * to be dealt with. Once there are details it becomes a filled row, because at
 * that point the cashier does want to see what will be on the receipt.
 */
function CustomerButton({
  customer,
  onPress,
  onClear,
}: {
  customer: CustomerDetails;
  onPress: () => void;
  onClear: () => void;
}) {
  const filled = hasCustomerDetails(customer);
  // Address last: it is the longest and the least useful for confirming out loud
  // which customer this is.
  const summary = [customer.contact, customer.address].filter(Boolean).join(" · ");

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          filled ? "Edit customer details" : "Add customer details, optional"
        }
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          paddingHorizontal: space.md,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: filled ? color.primarySoft : color.border,
          backgroundColor: pressed
            ? color.surfacePressed
            : filled
              ? color.primaryTint
              : color.surface,
        })}
      >
        <UserRound
          size={16}
          color={filled ? color.primary : color.inkMuted}
          strokeWidth={2}
        />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: fontSize.body,
              fontWeight: filled ? "700" : "500",
              color: filled ? color.primaryDark : color.ink,
            }}
          >
            {customer.name ?? (filled ? "Customer" : "Add customer details")}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            {filled ? summary || "No contact number" : "Optional — for a delivery or an account"}
          </Text>
        </View>
        {filled ? (
          <Pencil size={15} color={color.primary} strokeWidth={2} />
        ) : (
          <ChevronRight size={16} color={color.inkMuted} strokeWidth={2} />
        )}
      </Pressable>

      {filled ? (
        <IconButton icon={X} label="Remove customer details" onPress={onClear} />
      ) : null}
    </View>
  );
}

/**
 * Pick an existing customer or type a new one. Saving with details creates or
 * updates a local customer row (client UUID) so later sales can reuse them and
 * the office can see every order under one person after sync.
 */
function CustomerSheet({
  open,
  customer,
  onClose,
  onApply,
}: {
  open: boolean;
  customer: CustomerDetails;
  onClose: () => void;
  onApply: (next: CustomerDetails) => void;
}) {
  const [name, setName] = useState(customer.name ?? "");
  const [contact, setContact] = useState(customer.contact ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [customerId, setCustomerId] = useState<string | null>(customer.customerId);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<
    Awaited<ReturnType<typeof searchLocalCustomers>>
  >([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSearching(true);
    void searchLocalCustomers(query)
      .then((rows) => {
        if (!cancelled) setMatches(rows);
      })
      .catch((error: unknown) => {
        console.warn("Customer search failed", error);
        if (!cancelled) setMatches([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  if (!open) return null;

  const draft = normaliseCustomerDetails({
    customerId,
    name,
    contact,
    address,
  });
  const needle = query.trim();
  const shown = matches.slice(0, 8);

  return (
    <BottomSheet open={open} onClose={onClose}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={[styles.iconWell, { width: 34, height: 34 }]}>
                <UserRound size={18} color={color.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.subheading}>Customer</Text>
                <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                  Reuse an existing account, or type a new one.
                </Text>
              </View>
              <IconButton icon={X} label="Close" onPress={onClose} />
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                minHeight: 48,
                borderWidth: 1,
                borderColor: color.border,
                borderRadius: radius.sm,
                paddingHorizontal: space.md,
                backgroundColor: color.paper,
              }}
            >
              <Search size={16} color={color.inkMuted} strokeWidth={2} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by name, contact, or address"
                placeholderTextColor={color.inkMuted}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                style={{
                  flex: 1,
                  fontSize: fontSize.body,
                  color: color.ink,
                  paddingVertical: space.sm,
                }}
              />
              {query ? (
                <Pressable
                  onPress={() => setQuery("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  hitSlop={8}
                >
                  <X size={16} color={color.inkMuted} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>

            {searching && shown.length === 0 ? (
              <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                Searching…
              </Text>
            ) : shown.length > 0 ? (
              <View style={{ gap: space.xs }}>
                <Text
                  style={{
                    fontSize: fontSize.caption,
                    fontWeight: "600",
                    color: color.inkMuted,
                  }}
                >
                  {needle ? "Matches" : "Saved customers"}
                </Text>
                {shown.map((match) => (
                  <Pressable
                    key={match.id}
                    onPress={() => {
                      setCustomerId(match.id);
                      setName(match.name);
                      setContact(match.contact ?? "");
                      setAddress(match.address ?? "");
                      setQuery("");
                    }}
                    style={({ pressed }) => ({
                      paddingVertical: space.sm,
                      paddingHorizontal: space.md,
                      borderRadius: radius.sm,
                      backgroundColor: pressed
                        ? color.surfacePressed
                        : customerId === match.id
                          ? color.primaryTint
                          : color.paper,
                      borderWidth: 1,
                      borderColor:
                        customerId === match.id ? color.primarySoft : color.border,
                    })}
                  >
                    <Text
                      style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}
                    >
                      {match.name}
                    </Text>
                    <Text
                      style={{ fontSize: fontSize.caption, color: color.inkMuted }}
                      numberOfLines={1}
                    >
                      {[match.contact, match.address].filter(Boolean).join(" · ") ||
                        "No contact"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                {needle
                  ? "No saved customer matches that. Type a new one below."
                  : "No saved customers yet. Sync, or type a new one below."}
              </Text>
            )}

            <CustomerField
              icon={UserRound}
              label="Name"
              value={name}
              onChangeText={(next) => {
                setName(next);
                // Typing a different name means this is no longer the picked row.
                if (customerId) setCustomerId(null);
              }}
              placeholder="Who the sale is for"
              autoCapitalize="words"
            />
            <CustomerField
              icon={Phone}
              label="Contact number"
              value={contact}
              onChangeText={setContact}
              placeholder="09XX XXX XXXX"
              keyboardType="phone-pad"
            />
            <CustomerField
              icon={MapPin}
              label="Address"
              value={address}
              onChangeText={setAddress}
              placeholder="Where the delivery goes"
              autoCapitalize="words"
              multiline
            />

            <Button
              label="Save customer"
              large
              icon={CheckCircle2}
              onPress={() => onApply(draft)}
            />
            {hasCustomerDetails(draft) ? (
              <Button
                label="Leave blank"
                variant="secondary"
                onPress={() => onApply(NO_CUSTOMER)}
              />
            ) : null}
    </BottomSheet>
  );
}

function CustomerField({
  icon: Icon,
  label,
  value,
  onChangeText,
  placeholder,
  autoFocus = false,
  autoCapitalize = "none",
  keyboardType = "default",
  multiline = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  autoCapitalize?: "none" | "words";
  keyboardType?: "default" | "phone-pad";
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Icon size={14} color={color.inkMuted} strokeWidth={2} />
        <Text style={{ fontSize: fontSize.body, fontWeight: "600" }}>{label}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.inkMuted}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        multiline={multiline}
        // The same cap the sale is stored with, so nothing is silently lost
        // between the field and the receipt.
        maxLength={CUSTOMER_FIELD_MAX_LENGTH}
        accessibilityLabel={`${label}, optional`}
        style={{
          minHeight: multiline ? 72 : 52,
          borderWidth: 1,
          borderColor: value.trim() ? color.primary : color.border,
          borderRadius: radius.sm,
          backgroundColor: value.trim() ? color.primaryTint : color.surface,
          paddingHorizontal: space.md,
          paddingTop: multiline ? space.sm : 0,
          textAlignVertical: multiline ? "top" : "center",
          fontSize: fontSize.bodyLg,
          color: color.ink,
        }}
      />
    </View>
  );
}


/**
 * Pick which parked cart to bring back. Many drafts can sit on one terminal.
 */
function DraftPickerSheet({
  open,
  drafts,
  onClose,
  onPick,
  onDiscard,
}: {
  open: boolean;
  drafts: CartDraft[];
  onClose: () => void;
  onPick: (draft: CartDraft) => void;
  onDiscard: (draft: CartDraft) => void;
}) {
  if (!open) return null;

  return (
    <BottomSheet open={open} onClose={onClose} scroll={false}>
        <View
          style={{
            gap: space.md,
            maxHeight: 520,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={[styles.iconWell, { width: 34, height: 34 }]}>
              <BookmarkCheck size={18} color={color.primary} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.subheading}>Saved drafts</Text>
              <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                {drafts.length} parked cart{drafts.length === 1 ? "" : "s"} on this terminal
              </Text>
            </View>
            <IconButton icon={X} label="Close" onPress={onClose} />
          </View>

          {drafts.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No drafts left"
              instruction="Save a cart with the bookmark while it still has items."
            />
          ) : (
            <FlatList
              data={drafts}
              keyExtractor={(draft) => draft.id}
              style={{ maxHeight: 420 }}
              ItemSeparatorComponent={() => (
                <View style={{ height: 1, backgroundColor: color.border }} />
              )}
              renderItem={({ item: draft }) => {
                const items = draft.lines.reduce((sum, line) => sum + line.quantity, 0);
                const amount = cartTotal(draft.lines);
                const who = draft.customer.name?.trim() || null;

                return (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.sm,
                      paddingVertical: space.md,
                    }}
                  >
                    <Pressable
                      onPress={() => onPick(draft)}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: 56,
                        justifyContent: "center",
                        gap: space.xs,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
                        {who ?? `${items} item${items === 1 ? "" : "s"}`}
                      </Text>
                      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                        {who
                          ? `${items} item${items === 1 ? "" : "s"} · ${formatMoney(amount)}`
                          : formatMoney(amount)}
                        {" · "}
                        {timeAgo(draft.savedAt)}
                      </Text>
                    </Pressable>
                    <IconButton
                      icon={Trash2}
                      label="Delete draft"
                      tone="danger"
                      onPress={() => onDiscard(draft)}
                    />
                  </View>
                );
              }}
            />
          )}
        </View>
    </BottomSheet>
  );
}

/**
 * Last look before the sale is written. Cash needs the notes in hand so change
 * is clear; E-Wallet/card only need the amount due confirmed. After completeSale
 * succeeds the same dialog flips to a success state — cart stays mounted under
 * it until Print Receipt or Skip closes both. Print is opt-in (never auto).
 */
function ConfirmSaleSheet({
  open,
  succeeded,
  shelfTotal,
  discount,
  amountDue,
  payment,
  ewalletProvider,
  fulfillment,
  customer,
  itemCount,
  busy,
  onClose,
  onConfirm,
  onPrintReceipt,
  onSkip,
}: {
  open: boolean;
  succeeded: boolean;
  shelfTotal: number;
  discount: number;
  amountDue: number;
  payment: PaymentMethod;
  ewalletProvider: string | null;
  fulfillment: Fulfillment;
  customer: CustomerDetails;
  itemCount: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onPrintReceipt: () => void;
  onSkip: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { compact, landscape } = useLayout();
  // Phone or upright tablet: dock at the bottom, same as BottomSheet. Tablet
  // held sideways: keep the centered dialog box.
  const centered = !compact && landscape;
  const isCash = payment === "cash";
  const [cashDraft, setCashDraft] = useState(() => amountDue.toFixed(2));

  if (!open) return null;

  const cashOnHand = Number(cashDraft);
  const cashValid = Number.isFinite(cashOnHand) && cashOnHand >= amountDue;
  const change = cashValid ? roundMoney(cashOnHand - amountDue) : 0;
  const canConfirm = isCash ? cashValid : true;
  const selectedMethod = PAYMENT_METHODS.find((method) => method.value === payment);
  const methodLabel = selectedMethod?.label ?? payment;
  const methodIcon = selectedMethod?.icon ?? CreditCard;
  const isDelivery = fulfillment === "delivery";

  // Fixed 98% of the screen either way, capped by usableHeight so the soft
  // keyboard never pushes the confirm button off-screen. On tablet/landscape
  // this is big enough for both columns side by side with no scrolling; on
  // an upright phone the same content stacked can still run taller than
  // this, so ConfirmSaleBody scrolls it there instead of clipping.
  const usableHeight = height - keyboardHeight - insets.top - insets.bottom;
  const dialogWidth = width * 0.98;
  const dialogHeight = Math.min(height * 0.98, usableHeight * 0.99);

  return (
    <Modal
      visible={open}
      transparent
      animationType={centered ? "fade" : "slide"}
      statusBarTranslucent
      onRequestClose={busy ? undefined : onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: `${color.ink}99`,
          alignItems: centered ? "center" : undefined,
          justifyContent: centered ? "center" : "flex-end",
          paddingBottom: centered && !succeeded ? keyboardHeight : 0,
          paddingHorizontal: centered ? space.sm : 0,
        }}
      >
        <Pressable
          onPress={busy ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View
          style={{
            width: dialogWidth,
            height: dialogHeight,
            maxWidth: 900,
            backgroundColor: color.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderBottomLeftRadius: centered ? radius.lg : 0,
            borderBottomRightRadius: centered ? radius.lg : 0,
            padding: succeeded ? space.xl : space.lg,
            paddingBottom: centered
              ? (succeeded ? space.xl : space.lg)
              : Math.max(insets.bottom, succeeded ? space.xl : space.lg),
            gap: space.md,
            shadowColor: "#000",
            shadowOpacity: 0.22,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 12 },
            elevation: 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={[styles.iconWell, { width: 44, height: 44 }]}>
              <CheckCircle2 size={24} color={succeeded ? color.success : color.primary} strokeWidth={2} />
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: fontSize.headingMd,
                fontWeight: "700",
                color: color.ink,
              }}
            >
              {succeeded ? "Sale complete" : "Confirm sale"}
            </Text>
            <IconButton icon={X} label="Close" onPress={onClose} disabled={busy} />
          </View>

          <ConfirmSaleBody compact={compact}>
            {/* Left column — how this sale is being paid and fulfilled, and
                who it's for. Stays put across confirm → success; only the
                right column's content changes once the sale lands. On a
                phone this stacks above the right column and shrinks (see
                ConfirmDetailBlock's compact prop) — the two full-size
                columns plus a full cash keypad below never fit an upright
                phone's height without either shrinking or scrolling; this
                does both. */}
            <View style={{ flex: compact ? undefined : 1, gap: compact ? space.sm : space.md }}>
              <ConfirmDetailBlock
                compact={compact}
                icon={methodIcon}
                label="Payment method"
                value={ewalletProvider ? `${methodLabel} · ${ewalletProvider}` : methodLabel}
              />
              <ConfirmDetailBlock
                compact={compact}
                icon={isDelivery ? Truck : Package}
                label="Fulfillment"
                value={isDelivery ? "Delivery" : "Pickup"}
              />
              <ConfirmDetailBlock
                compact={compact}
                icon={UserRound}
                label="Customer"
                value={customer.name?.trim() || "Walk-in"}
                sub={[customer.contact, customer.address].filter(Boolean).join(" · ") || undefined}
              />
            </View>

            {/* Right column — the confirm step's own math and cash entry,
                replaced by the success state once the sale is saved. */}
            <View style={{ flex: compact ? undefined : 1, justifyContent: "space-between", gap: compact ? space.md : 0 }}>
              {succeeded ? (
                <>
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: space.lg,
                      paddingHorizontal: space.lg,
                    }}
                  >
                    <SaleSuccessCheck />
                    <Text
                      style={{
                        fontSize: fontSize.headingLg,
                        fontWeight: "700",
                        color: color.ink,
                        textAlign: "center",
                        lineHeight: fontSize.headingLg + 8,
                      }}
                    >
                      Sale created successfully
                    </Text>
                    <Text
                      style={{
                        fontSize: fontSize.bodyLg,
                        fontWeight: "600",
                        color: color.inkMuted,
                        textAlign: "center",
                        lineHeight: fontSize.bodyLg + 8,
                      }}
                    >
                      Print a receipt for this customer, or skip and start the next sale.
                    </Text>
                  </View>
                  <View style={{ gap: space.sm }}>
                    <Button
                      label="Print Receipt"
                      large
                      icon={Printer}
                      onPress={onPrintReceipt}
                    />
                    <Button
                      label="Skip"
                      large
                      variant="secondary"
                      onPress={onSkip}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={{ gap: space.md }}>
                    {/* Amount due first — cashier reads this before anything else. */}
                    <View
                      style={{
                        alignItems: "center",
                        gap: space.xs,
                        paddingVertical: space.sm,
                        paddingHorizontal: space.md,
                        borderRadius: radius.md,
                        backgroundColor: color.primaryTint,
                        borderWidth: 1,
                        borderColor: color.primarySoft,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.headingSm,
                          fontWeight: "600",
                          color: color.primaryDark,
                          letterSpacing: 0.4,
                        }}
                      >
                        Amount to pay
                      </Text>
                      <Text
                        style={[
                          styles.numeric,
                          {
                            fontSize: fontSize.display,
                            fontWeight: "700",
                            color: color.primaryDark,
                          },
                        ]}
                      >
                        {formatMoney(amountDue)}
                      </Text>
                      <Text
                        style={{
                          fontSize: fontSize.headingSm,
                          fontWeight: "600",
                          color: color.ink,
                        }}
                      >
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                      </Text>
                    </View>

                    {/* Shelf total, discount and (once cash covers it) change all
                        together in one strip — reading the math in one place
                        beats hunting for it split across the cash section. */}
                    <View
                      style={{
                        flexDirection: "row",
                        borderRadius: radius.md,
                        backgroundColor: color.paper,
                        borderWidth: 1,
                        borderColor: color.border,
                        overflow: "hidden",
                      }}
                    >
                      <SummaryStat label="Shelf total" value={shelfTotal} />
                      <View style={{ width: 1, backgroundColor: color.border }} />
                      <SummaryStat
                        label="Discount"
                        value={discount}
                        muted={discount === 0}
                        prefix={discount > 0 ? "-" : undefined}
                      />
                      {isCash && cashValid ? (
                        <>
                          <View style={{ width: 1, backgroundColor: color.border }} />
                          <SummaryStat label="Change" value={change} tone="success" />
                        </>
                      ) : null}
                    </View>

                    {isCash ? (
                      <View style={{ gap: space.sm }}>
                        <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                          Cash on hand
                        </Text>
                        <TextInput
                          value={cashDraft}
                          onChangeText={(next) => setCashDraft(next.replace(/[^0-9.]/g, ""))}
                          keyboardType="decimal-pad"
                          autoFocus
                          selectTextOnFocus
                          accessibilityLabel="Cash on hand from the customer"
                          style={[
                            styles.numeric,
                            {
                              minHeight: 72,
                              borderWidth: 2,
                              borderColor: cashValid ? color.primary : color.danger,
                              borderRadius: radius.sm,
                              backgroundColor: cashValid ? color.primaryTint : color.dangerSoft,
                              color: cashValid ? color.primaryDark : color.dangerInk,
                              paddingHorizontal: space.md,
                              fontSize: fontSize.headingLg,
                              fontWeight: "700",
                            },
                          ]}
                        />
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                          <Pressable
                            onPress={() => setCashDraft(amountDue.toFixed(2))}
                            style={({ pressed }) => ({
                              minHeight: 52,
                              paddingHorizontal: space.lg,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: radius.sm,
                              borderWidth: 1,
                              borderColor: color.primarySoft,
                              backgroundColor: pressed ? color.primarySoft : color.primaryTint,
                            })}
                          >
                            <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.primary }}>
                              Exact
                            </Text>
                          </Pressable>
                          {[50, 100, 200, 500, 1000]
                            .map((bill) => roundMoney(Math.ceil(amountDue / bill) * bill))
                            .filter((next, index, all) => next > amountDue && all.indexOf(next) === index)
                            .slice(0, 3)
                            .map((next) => (
                              <Pressable
                                key={next}
                                onPress={() => setCashDraft(next.toFixed(2))}
                                style={({ pressed }) => ({
                                  minHeight: 52,
                                  paddingHorizontal: space.lg,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: radius.sm,
                                  borderWidth: 1,
                                  borderColor: color.border,
                                  backgroundColor: pressed ? color.surfacePressed : color.surface,
                                })}
                              >
                                <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
                                  {formatMoney(next)}
                                </Text>
                              </Pressable>
                            ))}
                        </View>
                        {!cashValid ? (
                          <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.dangerInk }}>
                            Cash on hand must cover {formatMoney(amountDue)}.
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text
                        style={{
                          fontSize: fontSize.bodyLg,
                          fontWeight: "600",
                          color: color.inkMuted,
                          textAlign: "center",
                        }}
                      >
                        Customer pays by {methodLabel}. No cash change.
                      </Text>
                    )}
                  </View>

                  <View style={{ gap: space.sm }}>
                    <Button
                      label={busy ? "Saving..." : "Confirm and complete"}
                      large
                      icon={CheckCircle2}
                      busy={busy}
                      disabled={!canConfirm || busy}
                      onPress={onConfirm}
                    />
                    <Button label="Back to cart" variant="secondary" disabled={busy} onPress={onClose} />
                  </View>
                </>
              )}
            </View>
          </ConfirmSaleBody>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Tablet/landscape: fixed-height two-column row, exactly as before — both
 * columns fit without scrolling. Phone: the same two columns stacked can
 * still overflow an upright screen's height (3 detail blocks + the full
 * cash keypad), so this scrolls instead of clipping/squeezing them into a
 * fixed height.
 */
function ConfirmSaleBody({ compact, children }: { compact: boolean; children: ReactNode }) {
  if (!compact) {
    return <View style={{ flex: 1, flexDirection: "row", gap: space.lg }}>{children}</View>;
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: space.lg }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** Big check that pops in after a sale lands — spring scale + fade. */
function SaleSuccessCheck() {
  const scale = useRef(new Animated.Value(0.2)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View
      style={{
        width: 160,
        height: 160,
        borderRadius: circleRadius(160),
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: color.successSoft,
        opacity,
        transform: [{ scale }],
      }}
    >
      <CheckCircle2 size={96} color={color.successInk} strokeWidth={2.5} />
    </Animated.View>
  );
}

/** One column of the confirm sheet's shelf-total/discount/change strip. */
function SummaryStat({
  label,
  value,
  muted,
  prefix,
  tone,
}: {
  label: string;
  value: number;
  muted?: boolean;
  prefix?: string;
  tone?: "success";
}) {
  const valueColor = tone === "success" ? color.successInk : muted ? color.inkMuted : color.ink;
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        gap: 2,
        paddingVertical: space.sm,
        paddingHorizontal: space.xs,
        backgroundColor: tone === "success" ? color.successSoft : "transparent",
      }}
    >
      <Text
        style={{
          fontSize: fontSize.body,
          fontWeight: "600",
          color: tone === "success" ? color.successInk : color.inkMuted,
        }}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.numeric,
          {
            fontSize: fontSize.headingMd,
            fontWeight: "700",
            color: valueColor,
          },
        ]}
      >
        {prefix}
        {formatMoney(value)}
      </Text>
    </View>
  );
}

/** One row of the confirm sheet's left column — payment method, fulfillment, or customer. */
function ConfirmDetailBlock({
  compact = false,
  icon: Icon,
  label,
  value,
  sub,
}: {
  /** Phone confirm-sale layout — smaller well/icon/text so three of these plus the full cash keypad below can fit an upright screen without dominating it. */
  compact?: boolean;
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  const wellSize = compact ? 32 : 40;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        padding: compact ? space.sm : space.md,
        borderRadius: radius.md,
        backgroundColor: color.paper,
        borderWidth: 1,
        borderColor: color.border,
      }}
    >
      <View style={[styles.iconWell, { width: wellSize, height: wellSize }]}>
        <Icon size={compact ? 16 : 20} color={color.primary} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.inkMuted }}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: compact ? fontSize.body : fontSize.headingSm, fontWeight: "700", color: color.ink }}
        >
          {value}
        </Text>
        {sub ? (
          <Text numberOfLines={1} style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The cart is a fixed side panel on a tablet and a full-screen sheet on a phone,
 * where there is no room to show it next to the product grid.
 */
function CartShell({
  compact,
  width,
  padding,
  open,
  onClose,
  children,
}: {
  compact: boolean;
  width: number;
  padding: number;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  // On tablet this panel is always on screen, so it — not the header's
  // smaller cart chip — is where a flying product should land (see
  // components/store-header.tsx's own half of this). Registered/cleared
  // here rather than measured once: the panel's on-screen position can
  // change (rotation, the grid's own width recalculating).
  const { setTarget } = useFlyToCart();
  const shellRef = useRef<View>(null);
  useEffect(() => {
    if (compact) return;
    return () => setTarget(null);
  }, [compact, setTarget]);

  function measureShell() {
    if (compact) return;
    shellRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) setTarget({ x, y, width: w, height: h });
    });
  }

  const body = (
    <View
      ref={shellRef}
      onLayout={measureShell}
      style={{
        // Phone modal: fill the sheet. Tablet: fixed width, stretch tall so the
        // line list can grow — never flex along the row (that empties the grid).
        flex: compact ? 1 : undefined,
        width: compact ? undefined : width,
        alignSelf: compact ? undefined : "stretch",
        backgroundColor: color.surface,
        borderLeftWidth: compact ? 0 : 1,
        borderLeftColor: color.border,
        padding,
        minHeight: 0,
      }}
    >
      {children}
    </View>
  );

  if (!compact) return body;

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>{body}</SafeAreaView>
    </Modal>
  );
}
