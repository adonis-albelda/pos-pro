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
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Swipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FolderTree,
  HandCoins,
  IdCard,
  Images,
  Info,
  MapPin,
  Mail,
  Cake,
  Users,
  StickyNote,
  Mic,
  Minus,
  Package,
  PackageSearch,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
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
  applyComplexDiscountReward,
  cartDiscount,
  cartTotal,
  computeSimpleDiscount,
  CUSTOMER_FIELD_MAX_LENGTH,
  CUSTOMER_GENDER_LABELS,
  formatMoney,
  formatQuantity,
  hasCustomerDetails,
  lineSubtotal,
  normaliseCustomerDetails,
  requiresCustomerForPayment,
  roundMoney,
  timeAgo,
  type AddonGroup,
  type CartLine,
  type ComplexDiscountRule,
  type CustomerDetails,
  type CustomerGender,
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
import {
  getLocalCustomer,
  listLocalCustomers,
  upsertLocalCustomer,
  type LocalCustomer,
} from "@/db/customers";
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
import { useDraftSummary } from "@/lib/draft-summary";
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
import { ProductGridSkeleton } from "@/components/product-grid-skeleton";
import { ProductDetailSheet, ProductTile } from "@/components/product-tile";
import { SelectField } from "@/components/select-field";
import { ThemeBackgroundEffect } from "@/components/theme-background-effect";
import { useSaleCelebration } from "@/lib/sale-celebration";
import {
  VariantAddonPicker,
  type VariantAddonSelection,
} from "@/components/variant-addon-picker";
import { VoiceSearchModal } from "@/components/voice-search-modal";
import { OpenPriceSheet } from "@/components/open-price-sheet";
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
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
 * The most a line may sell — floors the estimated stock (you cannot sell half
 * a box). At zero or below, the product is out of stock — see BACKORDER_CAP.
 */
function stockCapFor(estimatedStock: number): number {
  if (estimatedStock <= 0) return BACKORDER_CAP;
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

/**
 * Field-by-field equality, not a reference check — every SQLite requery
 * builds brand-new row objects even for products nothing actually changed
 * about. Array/object fields (supplierLinks, bundleItems, tags,
 * addonGroupIds) are tiny, so a JSON.stringify compare on those specifically
 * is cheap; everything else is a plain primitive.
 */
function productRowEqual(a: ProductWithEstimatedStock, b: ProductWithEstimatedStock): boolean {
  if (a === b) return true;
  for (const key of Object.keys(a) as (keyof ProductWithEstimatedStock)[]) {
    const av = a[key];
    const bv = b[key];
    if (av === bv) continue;
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (JSON.stringify(av) === JSON.stringify(bv)) continue;
    }
    return false;
  }
  return true;
}

/**
 * A realtime/focus refetch (see the product-fetch effect below) re-queries
 * the whole currently-loaded window every time, not a delta — but the vast
 * majority of those rows are unchanged between ticks. Keeping the OLD object
 * reference for anything unchanged is what lets gridTiles' own cache below,
 * and the FlatList itself, skip re-rendering that row entirely instead of
 * re-rendering every mounted tile on every stock tick.
 */
function mergeProducts(
  previous: ProductWithEstimatedStock[],
  next: ProductWithEstimatedStock[],
): ProductWithEstimatedStock[] {
  if (previous.length === 0) return next;
  const byId = new Map(previous.map((row) => [row.id, row]));
  return next.map((row) => {
    const old = byId.get(row.id);
    return old && productRowEqual(old, row) ? old : row;
  });
}

export default function SellScreen() {
  const { cashier } = useSession();
  const {
    refresh,
    autoPush,
    dataVersion,
    offlineModeEnabled,
    justCreatedProductIds,
    pullOnly,
    phase: syncPhase,
    error: syncError,
  } = useSync();
  const { isEnabled } = useFeatureFlags();

  // A phone cannot hold a grid and a cart side by side, so below the compact
  // breakpoint the cart moves behind a summary bar the cashier taps to pay.
  const layout = useLayout();
  const { compact, columns: layoutColumns } = layout;

  const [products, setProducts] = useState<ProductWithEstimatedStock[]>([]);
  const { productViewMode, backgroundEffect, productLayout, gridColumns } = useThemePreferences();
  // Theme "Row" = one product per line. "Grid" keeps the width-based column
  // count unless the cashier has dialed in their own (Theme → Product
  // layout → Grid, gridColumns 0 = automatic).
  const columns = productLayout === "row" ? 1 : gridColumns > 0 ? gridColumns : layoutColumns;
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

  // Per-product tile cache, keyed by product id — reused across renders
  // whenever that product's (and, in variant mode, its variants') object
  // reference is unchanged. `.map()`/`.flatMap()` alone would build brand-new
  // wrapper objects for every product on every call regardless of whether
  // anything about it actually changed, which is exactly what forces the
  // FlatList to re-render every mounted tile on every realtime/focus product
  // refetch (see mergeProducts above) — this cache is what lets an unchanged
  // row's tile object stay referentially identical instead, so the FlatList
  // skips re-rendering it entirely.
  const gridTileCache = useRef(
    new Map<string, { product: ProductWithEstimatedStock; variants: VariantWithEstimatedStock[] | undefined; tiles: GridTile[] }>(),
  );

  // One tile per product in "By product" mode. In "By variant" mode, a
  // product with 2+ variants becomes one tile per variant; 0 or 1 variant
  // still renders as a single tile (that one variant's own price/stock,
  // once known — see toVariantTileDisplay). `realProduct` is always the
  // true product row (add-ons, category id, etc. all key off it); `variant`
  // is only set for a tile that resolves to one specific variant.
  const gridTiles = useMemo<GridTile[]>(() => {
    const cache = gridTileCache.current;
    const seen = new Set<string>();

    function tilesFor(product: ProductWithEstimatedStock): GridTile[] {
      seen.add(product.id);
      const variants = productViewMode === "variant" ? variantsByProduct.get(product.id) : undefined;
      const cached = cache.get(product.id);
      if (cached && cached.product === product && cached.variants === variants) {
        return cached.tiles;
      }

      let tiles: GridTile[];
      if (productViewMode !== "variant") {
        tiles = [{ display: product, realProduct: product }];
      } else if (!variants || variants.length <= 1) {
        const only = variants?.[0];
        tiles = [
          {
            display: only
              ? toVariantTileDisplay(product, only.variant, only.estimatedStock)
              : product,
            realProduct: product,
            variant: only?.variant,
          },
        ];
      } else {
        tiles = variants.map(({ variant, estimatedStock }) => ({
          display: toVariantTileDisplay(product, variant, estimatedStock),
          realProduct: product,
          variant,
        }));
      }

      cache.set(product.id, { product, variants, tiles });
      return tiles;
    }

    const result = products.flatMap(tilesFor);

    // Evict products no longer in the loaded window so the cache doesn't
    // grow unbounded across a long shift's worth of searches/categories.
    for (const id of cache.keys()) {
      if (!seen.has(id)) cache.delete(id);
    }

    return result;
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
  // Phone only — the search pill collapses to just its icon until tapped, to
  // leave the category button real width on a narrow screen. Tablet always
  // shows the full field, same as before this existed.
  const [phoneSearchOpen, setPhoneSearchOpen] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  // Smart search / voice / scan collapse behind a chevron too — same "icon
  // until tapped" treatment as the search field itself, one less row of
  // buttons sitting there by default.
  const [searchActionsOpen, setSearchActionsOpen] = useState(false);
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
  // Out-of-stock Alert / zero-price sheet, both keyed so a rapid burst of
  // taps on the same variant (e.g. the variant picker replaying several
  // staged units in a row — see VariantAddonPicker's commitAndClose) only
  // ever surfaces one prompt, not one per unit. Cleared once the cashier
  // actually answers (either button/either sheet outcome), so a genuinely
  // separate later add still prompts fresh.
  const pendingPromptKeys = useRef(new Set<string>());
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
  // Full local customer list — DiscountSheet filters this client-side by
  // isPwdEligible/isSeniorEligible for its PWD/Senior picker, and reads a
  // picked/attached customer's own idNumber/cardholderName off it. Same
  // "small table, load it whole" assumption CLAUDE.md §11 already makes.
  const [allCustomers, setAllCustomers] = useState<LocalCustomer[]>([]);
  const [taxSettings, setTaxSettings] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);
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
  // Collapsed by default — cash + pickup + walk-in covers most sales, so
  // showing these expanded by default just ate cart space for the common case.
  const [saleDetailsOpen, setSaleDetailsOpen] = useState(false);
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
  /** Ready-catalog / zero-shelf-price lines — cashier types the charge before commit. */
  const [openPricePending, setOpenPricePending] = useState<{
    product: ProductWithEstimatedStock;
    selection?: ResolvedSelection;
    sourceRect?: FlyRect;
  } | null>(null);
  // Ranked product ids from the last smart search — while set, the grid shows
  // exactly these (in this order) instead of the normal query/category list.
  const [aiResultIds, setAiResultIds] = useState<string[] | null>(null);
  const [aiResultLabel, setAiResultLabel] = useState("");

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

  // The field only mounts once phoneSearchOpen flips true, so focusing it in
  // the same tap handler that sets the state would fire before it exists.
  useEffect(() => {
    if (phoneSearchOpen) searchInputRef.current?.focus();
  }, [phoneSearchOpen]);

  function collapsePhoneSearch() {
    applyManualSearch("");
    setPhoneSearchOpen(false);
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
      const [simple, complex, tax, rewards, customers] = await Promise.all([
        listLocalDiscountRules(),
        listLocalComplexDiscountRules(),
        getLocalTaxSettings(),
        listLocalLoyaltyRewards(),
        listLocalCustomers(),
      ]);
      setDiscountRules(simple);
      setComplexRules(complex);
      setTaxSettings(tax);
      setLoyaltyRewards(rewards);
      setAllCustomers(customers);
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

    // At least PRODUCT_PAGE_SIZE, but never fewer than whatever's already
    // on screen. This effect also reruns on a bare realtime/focus signal
    // (dataVersion, focusEpoch) with the same query/category — not just on
    // an actual new search or category pick. Refetching only page one every
    // time would silently drop every page a scrolled-down cashier had
    // already loaded via loadMore, snapping the FlatList's data back under
    // its own scroll offset — with nothing left to render way down where
    // they were scrolled to, that read as the whole grid going blank right
    // as a stock tick happened to land, not any actual bug in what they'd
    // just tapped.
    const limit = Math.max(products.length, PRODUCT_PAGE_SIZE);

    void listLocalProductsPage({
      limit,
      offset: 0,
      search: query,
      categoryIds,
    })
      .then(async (next) => {
        if (id !== requestId.current) return;
        await withVariants(next);
        if (id !== requestId.current) return;
        // Merge, don't replace — a realtime/focus tick re-fetches this whole
        // window every time (see the comment above), but almost none of it
        // actually changed. Keeping unchanged rows' object references is what
        // lets gridTiles' cache and the FlatList itself skip re-rendering
        // every mounted tile on every stock tick.
        setProducts((current) => mergeProducts(current, next));
        setHasMore(next.length === limit);
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
  // Same three lists DiscountSheet itself renders (rule/promo/loyalty) —
  // surfaced here as a plain count so the cashier sees something is on the
  // table before ever opening the dialog.
  const applicableDiscountCount = useMemo(() => {
    if (lines.length === 0) return 0;
    const simple = qualifyingSimpleRules(discountRules, lines).length;
    const promos = qualifyingComplexRules(complexRules, lines, orderDiscounts).length;
    const loyalty = customer.customerId
      ? eligibleLoyaltyRewards({
          rewards: loyaltyRewards,
          discountRules,
          pointsBalance: customerPoints,
          lines,
        }).length
      : 0;
    return simple + promos + loyalty;
  }, [lines, discountRules, complexRules, orderDiscounts, customer.customerId, loyaltyRewards, customerPoints]);
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

    return { ...line, quantity, unitPrice: product.price };
  }

  /**
   * No confirmation once a line exists — adding to a cart is speed critical.
   * The one exception is the first tap on a product sitting at zero: that's a
   * backorder decision, not a speed-critical tap, so it gets asked once.
   *
   * A product with more than one variant opens the picker on every tap, not
   * just the first — a second tap is not necessarily "one more of the same
   * variant," it might be a different variant of the same product, and only
   * the picker can ask that. A plain product, or one with exactly one
   * variant, has nothing to ask twice: those keep the old fast bump-existing
   * path. Add-on-only products (no variants) also keep the old first-tap-only
   * behavior — add-on combos aren't picked apart per repeat tap here.
   */
  async function addToCart(product: ProductWithEstimatedStock, sourceRect?: FlyRect) {
    rememberProducts([product]);

    const existing = lines.find((line) => line.productId === product.id);
    // A plain line (no variant ever resolved) never needed a choice and
    // never will — same fast path as before, skipping the variant fetch.
    if (existing && !existing.variantId) {
      changeQuantity(product.id, 1, null);
      if (sourceRect) flyToCart(sourceRect, product.photoUrl);
      return;
    }

    const [variants, addonGroups] = await Promise.all([
      listLocalVariantsForProduct(product.id),
      listLocalAddonGroups(product.addonGroupIds),
    ]);

    if (variants.length > 1) {
      // Opens the picker regardless of any existing line — could be a
      // different variant of this same product, not a repeat of the last one.
      setPickerState({ product, variants, addonGroups });
      return;
    }

    if (existing) {
      changeQuantity(product.id, 1, existing.variantId);
      if (sourceRect) flyToCart(sourceRect, product.photoUrl);
      return;
    }

    if (addonGroups.length > 0) {
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
      if (pendingPromptKeys.current.has(product.id)) return;
      pendingPromptKeys.current.add(product.id);

      Alert.alert(
        "Out of stock",
        `${product.name} shows none on hand. Sell it anyway? New stock added later settles this automatically.`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => pendingPromptKeys.current.delete(product.id),
          },
          {
            text: "Sell anyway",
            onPress: () => {
              pendingPromptKeys.current.delete(product.id);
              requestAddToCart(product, undefined, sourceRect);
            },
          },
        ],
      );
      return;
    }

    requestAddToCart(product, undefined, sourceRect);
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
      if (pendingPromptKeys.current.has(variant.id)) return;
      pendingPromptKeys.current.add(variant.id);

      const label = variantAttributeLabel(variant) || variant.sku || "this option";
      Alert.alert(
        "Out of stock",
        `${product.name} (${label}) shows none on hand. Sell it anyway? New stock added later settles this automatically.`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => pendingPromptKeys.current.delete(variant.id),
          },
          {
            text: "Sell anyway",
            onPress: () => {
              pendingPromptKeys.current.delete(variant.id);
              requestAddToCart(product, resolved, sourceRect);
            },
          },
        ],
      );
      return;
    }

    requestAddToCart(product, resolved, sourceRect);
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

  /**
   * Tile decrement (product-level "-") and hold-remove: a plain or
   * single-variant tile just decrements/removes its one line, same as
   * before. A "By variant" tile already names its own line. But a
   * product-level tile for a product with 2+ variants can't guess which
   * line to touch — it opens the same manager sheet as adding does, so the
   * cashier picks which variant to take one off of.
   */
  async function handleTileDecrement(tile: GridTile, action: "decrement" | "hold-remove") {
    if (tile.variant) {
      if (action === "decrement") {
        changeQuantity(tile.realProduct.id, -1, tile.variant.id);
      } else {
        confirmRemoveLine(tile.realProduct.id, tile.display.name, tile.variant.id);
      }
      return;
    }

    const [variants, addonGroups] = await Promise.all([
      listLocalVariantsForProduct(tile.realProduct.id),
      listLocalAddonGroups(tile.realProduct.addonGroupIds),
    ]);

    if (variants.length > 1) {
      setPickerState({ product: tile.realProduct, variants, addonGroups });
      return;
    }

    const existing = lines.find((line) => line.productId === tile.realProduct.id);
    const variantId = existing?.variantId ?? null;
    if (action === "decrement") {
      changeQuantity(tile.realProduct.id, -1, variantId);
    } else {
      confirmRemoveLine(tile.realProduct.id, tile.display.name, variantId);
    }
  }

  /**
   * Zero shelf price (ready-catalog imports) → ask cashier before commit.
   * Otherwise same as commitAddToCart + optional fly animation.
   */
  function requestAddToCart(
    product: ProductWithEstimatedStock,
    selection?: ResolvedSelection,
    sourceRect?: FlyRect,
  ) {
    const shelfPrice = selection
      ? roundMoney(
          selection.variant.price +
            selection.addons.reduce((sum, addon) => sum + addon.price, 0),
        )
      : product.price;

    if (shelfPrice <= 0) {
      const promptKey = `${product.id}:${selection?.variant.id ?? ""}`;
      if (pendingPromptKeys.current.has(promptKey)) return;
      pendingPromptKeys.current.add(promptKey);
      setOpenPricePending({ product, selection, sourceRect });
      return;
    }

    commitAddToCart(product, selection);
    if (sourceRect) flyToCart(sourceRect, product.photoUrl);
  }

  function commitAddToCart(
    product: ProductWithEstimatedStock,
    selection?: ResolvedSelection,
    priceOverride?: number,
  ) {
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
          ? stockCapFor(existing.availableStock)
          : stockCapFor(product.estimatedStock);
        if (existing.quantity >= stockCap) return current;
        return current.map((line) =>
          isTarget(line) ? repricedFor(line, Math.min(line.quantity + 1, stockCap)) : line,
        );
      }

      if (selection) {
        const addonsTotal = roundMoney(
          selection.addons.reduce((sum, addon) => sum + addon.price, 0),
        );
        const naturalPrice =
          priceOverride !== undefined
            ? priceOverride
            : roundMoney(selection.variant.price + addonsTotal);
        const stockCap = stockCapFor(selection.estimatedStock);

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

      const stockCap = stockCapFor(product.estimatedStock);
      const price = priceOverride !== undefined ? priceOverride : product.price;
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: price,
          // The shelf price, kept whatever the line ends up selling at, so the
          // office can see exactly what was given away.
          listPrice: price,
          naturalPrice: priceOverride !== undefined ? priceOverride : undefined,
          unitCost: product.costPrice,
          unit: product.unit,
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
    const { product, variants } = pickerState;
    // A tile-scoped single-variant + add-ons picker (handleTilePress) is a
    // one-shot action tied to that one tap, so it still closes on confirm.
    // The 2+ variant manager (addToCart / handleTileDecrement) stays open —
    // there may be another variant left to add.
    if (variants.length <= 1) setPickerState(null);
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
          const stockCap = stockCapFor(line.availableStock);
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
          const stockCap = stockCapFor(line.availableStock);
          const asked = Math.floor(quantity);
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
        return product ? { ...line, unitPrice: product.price } : line;
      }),
    );
    setOverridden([]);
    setGlobalDiscountIds([]);
    setPreDiscountPrices({});
    setOrderDiscounts([]);
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

  const openDraftPicker = useCallback(() => {
    void refreshDrafts().then(() => setDraftPickerOpen(true));
  }, [refreshDrafts]);

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
    // On phone, ConfirmSaleSheet's own Modal is nested inside CartShell's
    // Modal (finishSale keeps the cart open underneath so opening the confirm
    // sheet doesn't unmount it — see finishSale's own comment). Setting both
    // Modals' `visible` false in the same React commit — as a plain
    // setCartOpen(false) right here would — leaves the inner one stuck
    // on-screen instead of dismissing (a known RN nested-Modal quirk): tapping
    // Skip registered (state changed) but nothing visibly closed. Deferring
    // this one to the next tick splits it into a second, separate commit so
    // the inner Modal actually finishes closing first.
    setTimeout(() => setCartOpen(false), 0);
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

  // Publishes into StoreHeader's Draft sales button, same reasoning as the
  // cart chip above — drafts only exist on this screen, so the header only
  // shows the button while this effect is actually running.
  const { setDraftSummary, clearDraftSummary } = useDraftSummary();
  useEffect(() => {
    setDraftSummary({ count: drafts.length, open: openDraftPicker });
  }, [drafts.length, setDraftSummary, openDraftPicker]);
  useEffect(() => clearDraftSummary, [clearDraftSummary]);

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {compact && !phoneSearchOpen ? (
          // Phone, collapsed: just the icon — leaves the category button
          // real width on a narrow screen instead of two cramped pills.
          <Pressable
            onPress={() => setPhoneSearchOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Search products"
            style={{
              width: 48,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: color.primarySoft,
              borderRadius: radius.sm,
              backgroundColor: color.primarySoft,
            }}
          >
            <Search size={20} color={color.primary} strokeWidth={2} />
          </Pressable>
        ) : (
        <View
          style={{
            flex: compact ? 1 : 3,
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            minHeight: compact ? 48 : 56,
            borderWidth: 1,
            borderColor: color.primarySoft,
            borderRadius: radius.sm,
            // Light green field on the dark header bar, not a translucent
            // overlay of the header's own color — the overlay read as
            // "barely there." Same primarySoft/primary pairing badges and
            // chips already use elsewhere, just applied here too.
            backgroundColor: color.primarySoft,
            paddingHorizontal: space.md,
          }}
        >
          {compact ? (
            <Pressable
              onPress={collapsePhoneSearch}
              accessibilityRole="button"
              accessibilityLabel="Close search"
              hitSlop={4}
              style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}
            >
              <ChevronLeft size={20} color={color.primary} strokeWidth={2} />
            </Pressable>
          ) : (
            <Search size={18} color={color.primary} strokeWidth={2} />
          )}
          <TextInput
            ref={searchInputRef}
            value={search}
            onChangeText={applyManualSearch}
            onSubmitEditing={() => void submitSearch()}
            // Focus stays put so a scanner can fire code after code.
            submitBehavior="submit"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={compact ? "Search or scan" : "Search by name or SKU, or scan a barcode"}
            placeholderTextColor={color.inkMuted}
            numberOfLines={1}
            style={{
              flex: 1,
              minHeight: compact ? 48 : 56,
              fontSize: fontSize.bodyLg,
              color: color.ink,
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
              <X size={20} color={color.primary} strokeWidth={2} />
            </Pressable>
          ) : null}
          {/* Tablet only — plenty of width in the field itself, so these stay
              inside it same as before. Phone keeps them outside/collapsed
              below; there's no room to spare in the field there. */}
          {!compact ? (
            <>
              {isEnabled("product_vector_search") ? (
                <Pressable
                  onPress={() => setAiSearchOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Smart search with AI"
                  hitSlop={4}
                  style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
                >
                  <Sparkles size={20} color={color.primary} strokeWidth={2} />
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
                  <Mic size={20} color={color.primary} strokeWidth={2} />
                </Pressable>
              ) : null}
              {isEnabled("barcode_scan") ? (
                <Pressable
                  // Tap opens the small floating camera — stays docked over
                  // whatever screen is already showing, scans one item after
                  // another without closing. Hold for the old one-shot,
                  // full-screen scanner (fills the search box, then closes) —
                  // still there for the rare case that's actually wanted.
                  onPress={() => setFloatingScannerOpen(true)}
                  onLongPress={() => setBarcodeScanOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Scan a barcode or QR code with the floating camera. Hold for a one-time full-screen scan"
                  hitSlop={4}
                  style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
                >
                  <ScanBarcode size={20} color={color.primary} strokeWidth={2} />
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
        )}

        {/* Phone only: Voice/Smart search/Scan collapsed behind a chevron,
            same "icon until tapped" treatment as the search field itself.
            Same visibility as the category button beside them. Tablet
            renders these inside the field above instead — see there. */}
        {compact && !phoneSearchOpen ? (
          <>
            <IconButton
              icon={searchActionsOpen ? ChevronLeft : ChevronRight}
              label={searchActionsOpen ? "Hide search options" : "More search options"}
              tone="primary"
              onPress={() => setSearchActionsOpen((open) => !open)}
            />
            {searchActionsOpen ? (
              <>
                {isEnabled("product_vector_search") ? (
                  <IconButton
                    icon={Sparkles}
                    label="Smart search with AI"
                    tone="primary"
                    onPress={() => setAiSearchOpen(true)}
                  />
                ) : null}
                {isEnabled("voice_search") ? (
                  <IconButton icon={Mic} label="Search by voice" tone="primary" onPress={openVoiceSearch} />
                ) : null}
                {isEnabled("barcode_scan") ? (
                  <IconButton
                    icon={ScanBarcode}
                    label="Scan a barcode or QR code with the floating camera. Hold for a one-time full-screen scan"
                    tone="primary"
                    onPress={() => setFloatingScannerOpen(true)}
                    onLongPress={() => setBarcodeScanOpen(true)}
                  />
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {/* Hidden during Smart search or a typed search: the results
            already ignore this filter, so a lit-up button beside them
            would be a lie — same reason it hides while the phone search
            field is expanded and taking the whole row. */}
        {!aiResultIds && !search.trim() && !(compact && phoneSearchOpen) ? (
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
            // Button's own "secondary" variant already is the light-green
            // primarySoft fill + color.primary text/border this needs —
            // same look as the search box beside it. A category actually
            // picked just gets a bolder border instead of switching to a
            // solid dark fill (that blended into the header and read as
            // "nothing there").
            variant="secondary"
            style={{
              flex: 1,
              borderWidth: category ? 2 : 1,
              borderColor: category ? color.primary : color.primarySoft,
            }}
            large={!compact}
            onPress={() => setCategoryDialogOpen(true)}
          />
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
        ) : null}

        <View style={{ flex: 1, minHeight: 0, gap: space.sm }}>
          {!ready || (loadingPage && products.length === 0) ? (
            <ProductGridSkeleton columns={columns} gap={layout.gap} tileMinHeight={layout.tileMinHeight} />
          ) : products.length === 0 && !query && category === null && !aiResultIds ? (
            <EmptyState
              icon={PackageSearch}
              title="No products on this terminal"
              instruction="Pull the catalog down from the office — no need to go to the Sync tab."
              action={
                <View style={{ gap: space.sm, alignItems: "center" }}>
                  <Button
                    label={syncPhase === "pulling" ? "Pulling…" : "Pull products now"}
                    icon={RefreshCw}
                    busy={syncPhase === "pulling"}
                    disabled={syncPhase === "pulling"}
                    onPress={() => void pullOnly()}
                  />
                  {syncPhase === "failed" && syncError ? <ErrorNote>{syncError}</ErrorNote> : null}
                </View>
              }
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
              // part of the key and a rotation remounts the grid.
              key={`grid-${columns}`}
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
                      onPress={(sourceRect) => void handleTilePress(item, sourceRect)}
                      onRemove={() => void handleTileDecrement(item, "decrement")}
                      onHoldRemove={() => void handleTileDecrement(item, "hold-remove")}
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
                      : applicableDiscountCount > 0
                        ? `Add a discount. ${applicableDiscountCount} applicable to this cart.`
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  {applicableDiscountCount > 0 ? (
                    <Pressable
                      onPress={() => setDiscountSheetOpen(true)}
                      accessibilityRole="button"
                      accessibilityLabel={`${applicableDiscountCount} discounts available for this cart. Add a discount.`}
                    >
                      <Badge tone="success" label={`${applicableDiscountCount} available`} />
                    </Pressable>
                  ) : null}
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
              </View>
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

            {/* Collapsed by default — the toggle's own summary line always
                shows the current picks, so nothing here is hidden, just
                folded away until the cashier needs to change one. Forced
                open when Credit has no customer yet — that warning below is
                pointless if the customer picker it points at stays hidden. */}
            <Pressable
              onPress={() => setSaleDetailsOpen((was) => !was)}
              disabled={requiresCustomerForPayment(payment, customer)}
              accessibilityRole="button"
              accessibilityLabel={`Payment, fulfillment and customer. ${saleDetailsOpen ? "Collapse" : "Expand"}.`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.sm,
                marginTop: space.md,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.ink }}>
                  Payment, fulfillment &amp; customer
                </Text>
                <Text numberOfLines={1} style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                  {PAYMENT_METHODS.find((option) => option.value === payment)?.label ?? payment}
                  {" · "}
                  {FULFILLMENT_OPTIONS.find((option) => option.value === fulfillment)?.label ?? fulfillment}
                  {" · "}
                  {customer.name?.trim() || "Walk-in"}
                </Text>
              </View>
              <ChevronDown
                size={18}
                color={color.inkMuted}
                strokeWidth={2.25}
                style={{ transform: [{ rotate: saleDetailsOpen ? "180deg" : "0deg" }] }}
              />
            </Pressable>

            {saleDetailsOpen || requiresCustomerForPayment(payment, customer) ? (
              <>
                <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
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

                {/* Optional, and it looks optional: one quiet row, never a
                    required step between the cashier and the total. */}
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
              </>
            ) : null}

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
          complexRules={complexRules}
          loyaltyRewards={loyaltyRewards}
          customerPoints={customerPoints}
          hasCustomer={Boolean(customer.customerId)}
          applied={orderDiscounts}
          tax={taxSettings}
          hasDiscount={discount > 0}
          customers={allCustomers}
          linkedCustomer={customer}
          onAttachCustomer={(picked) =>
            setCustomer({
              customerId: picked.id,
              name: picked.name,
              address: picked.address,
              contact: picked.contact,
            })
          }
          onOpenCustomerForm={() => setEditingCustomer(true)}
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
          onApply={(next, full) => {
            setCustomer(next);
            if (full) {
              setAllCustomers((current) => [
                full,
                ...current.filter((row) => row.id !== full.id),
              ]);
            }
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
        productBrandName={pickerState?.product.brandName ?? null}
        productPhotoUrl={pickerState?.product.photoUrl}
        variants={pickerState?.variants ?? []}
        addonGroups={pickerState?.addonGroups ?? []}
        quantities={inCartByVariant}
        onCancel={() => setPickerState(null)}
        onAdjust={async (variant, delta) => {
          if (!pickerState) return;
          if (delta > 0) {
            await commitVariantSelection(pickerState.product, variant, []);
          } else {
            changeQuantity(pickerState.product.id, -1, variant.id);
          }
        }}
        onConfirm={(selection) => void onPickerConfirm(selection)}
      />

      <OpenPriceSheet
        open={openPricePending !== null}
        productName={openPricePending?.product.name ?? ""}
        variantLabel={
          openPricePending?.selection
            ? variantAttributeLabel(openPricePending.selection.variant) || null
            : null
        }
        onCancel={() => {
          if (openPricePending) {
            const { product, selection } = openPricePending;
            pendingPromptKeys.current.delete(`${product.id}:${selection?.variant.id ?? ""}`);
          }
          setOpenPricePending(null);
        }}
        onConfirm={(price) => {
          if (!openPricePending) return;
          const { product, selection, sourceRect } = openPricePending;
          pendingPromptKeys.current.delete(`${product.id}:${selection?.variant.id ?? ""}`);
          setOpenPricePending(null);
          commitAddToCart(product, selection, price);
          if (sourceRect) flyToCart(sourceRect, product.photoUrl);
        }}
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
  displayUnitPrice,
  onChange,
  onEditQuantity,
  onRemove,
}: {
  line: CartLine;
  product: ProductWithEstimatedStock | undefined;
  /** Frozen pre-discount unit price when a global discount touched this line. */
  displayUnitPrice: number;
  onChange: (delta: number) => void;
  onEditQuantity: () => void;
  onRemove: () => void;
}) {
  const stockCap = stockCapFor(line.availableStock);
  const remaining = Math.max(0, stockCap - line.quantity);
  const atMax = line.quantity >= stockCap;
  // A line added while its product showed none on hand gets its cap fixed
  // at BACKORDER_CAP (see commitAddToCart) so the stepper still has room to
  // count up a backorder — that's the sell-anyway allowance, not real
  // stock, so "9998 left" (BACKORDER_CAP minus quantity) would tell the
  // cashier the opposite of what's true.
  const backordered = line.availableStock === BACKORDER_CAP;
  const oversell = !backordered && line.quantity > stockCap;
  // At one, decrementing drops the line entirely, so the control says so.
  const RemoveIcon = line.quantity === 1 ? Trash2 : Minus;
  const showFlags = oversell;
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

  const stockCap = stockCapFor(line.availableStock);
  // See CartRow — a line added while its product showed none on hand gets
  // its cap fixed at BACKORDER_CAP as sell-anyway room, not real stock.
  const backordered = line.availableStock === BACKORDER_CAP;
  const typed = Number(draft);
  const value = Math.floor(typed);
  const empty = draft.trim() === "";
  const valid = !empty && Number.isFinite(typed) && Number.isInteger(typed) && value >= 0;
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
        onChangeText={(next) => setDraft(next.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
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
/**
 * DiscountRule has no PWD-vs-Senior distinction of its own — admin names/
 * configures it freely (requiresIdNumber + isVatExempt are the only
 * structured flags). This is the only signal available for which picker an
 * ID-required rule should show: match on the rule's own name text, falling
 * back to "either eligibility" when it names neither so an ID-required rule
 * with an unusual name still shows a real, non-empty picker instead of
 * nothing.
 */
function inferMandatoryDiscountEligibility(ruleName: string): "pwd" | "senior" | "either" {
  const lower = ruleName.toLowerCase();
  if (lower.includes("senior")) return "senior";
  if (lower.includes("pwd") || lower.includes("disab")) return "pwd";
  return "either";
}

function DiscountSheet({
  open,
  total,
  lines,
  rules,
  complexRules,
  loyaltyRewards,
  customerPoints,
  hasCustomer,
  applied,
  tax,
  hasDiscount,
  customers,
  linkedCustomer,
  onAttachCustomer,
  onOpenCustomerForm,
  onClose,
  onApplyAmount,
  onApplyRule,
  onClear,
}: {
  open: boolean;
  total: number;
  lines: CartLine[];
  rules: DiscountRule[];
  complexRules: ComplexDiscountRule[];
  loyaltyRewards: LoyaltyReward[];
  customerPoints: number;
  hasCustomer: boolean;
  applied: AppliedOrderDiscount[];
  tax: TaxSettings;
  hasDiscount: boolean;
  /** Full local customer list — filtered client-side for the PWD/Senior picker (see inferMandatoryDiscountEligibility). */
  customers: LocalCustomer[];
  /** The sale's own attached customer, if any — shown in the overview column, and watched below to auto-resolve a customer just created from "+ Create new customer". */
  linkedCustomer: CustomerDetails;
  onAttachCustomer: (customer: LocalCustomer) => void;
  /** Opens CustomerSheet on top of this one (same nested-Modal pattern ConfirmSaleSheet/CartShell already use) — this sheet stays open underneath. */
  onOpenCustomerForm: () => void;
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
  // held sideways: keep the centered dialog box, wide enough (90%) for a
  // two-column layout — every pickable discount left, cart/customer overview
  // right.
  const centered = !compact && landscape;
  const [draft, setDraft] = useState("");
  const [pendingRule, setPendingRule] = useState<DiscountRule | null>(null);
  const typed = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(typed) && typed > 0;
  const applicable = qualifyingSimpleRules(rules, lines);
  // Promos/complex rules are listed here like every other discount, never
  // applied on their own — the cashier taps one, same as a simple rule or a
  // loyalty reward (no more silent auto-apply from a store setting).
  const qualifyingPromos = qualifyingComplexRules(complexRules, lines, applied);
  const eligibleRewardEntries = hasCustomer
    ? eligibleLoyaltyRewards({ rewards: loyaltyRewards, discountRules: rules, pointsBalance: customerPoints, lines })
    : [];
  const appliedTotal = orderDiscountImpact(applied);

  const pendingEligibility = pendingRule ? inferMandatoryDiscountEligibility(pendingRule.name) : null;
  const eligibleCustomers = customers.filter(
    (c) =>
      (pendingEligibility === "pwd" && c.isPwdEligible) ||
      (pendingEligibility === "senior" && c.isSeniorEligible) ||
      (pendingEligibility === "either" && (c.isPwdEligible || c.isSeniorEligible)),
  );

  useEffect(() => {
    if (!open) {
      setDraft("");
      setPendingRule(null);
    }
  }, [open]);

  // "+ Create new customer" inside the picker below opens CustomerSheet on
  // top of this sheet (onOpenCustomerForm) rather than replacing this
  // screen — once it saves, the sale's own linkedCustomer changes, which is
  // the signal picked up here: resolve that same id against the fresh
  // `customers` list (CustomerSheet's own onApply already merged the just-
  // saved record into it) and finish the pending rule with it, same as
  // tapping an existing row below would.
  useEffect(() => {
    if (!pendingRule || !linkedCustomer.customerId) return;
    const created = customers.find((c) => c.id === linkedCustomer.customerId);
    if (created && created.idNumber && created.cardholderName) {
      pickMandatoryDiscountCustomer(created);
    }
    // Only re-run when the linked customer itself changes — re-matching on
    // every `customers`/`pendingRule` change would re-fire this the moment
    // any unrelated list refresh lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCustomer.customerId]);

  if (!open) return null;

  function pickRule(rule: DiscountRule) {
    if (rule.requiresIdNumber) {
      setPendingRule(rule);
      return;
    }
    onApplyRule(applySimpleRuleToCart({ rule, lines, tax }));
  }

  /** A picked (or just-created) PWD/Senior customer — their own idNumber/cardholderName stand in for what the cashier used to type by hand. */
  function pickMandatoryDiscountCustomer(picked: LocalCustomer) {
    if (!pendingRule) return;
    onAttachCustomer(picked);
    onApplyRule(
      applySimpleRuleToCart({
        rule: pendingRule,
        lines,
        tax,
        idNumber: picked.idNumber ?? "",
        idHolderName: picked.cardholderName || picked.name,
      }),
    );
  }

  const usableHeight = height - keyboardHeight - insets.top - insets.bottom;
  const dialogWidth = centered ? width * 0.9 : width;
  const dialogHeight = centered
    ? Math.min(height * 0.9, usableHeight * 0.95)
    : Math.min(height * 0.85, usableHeight * 0.92);
  // Wide enough for two real columns, not just a bigger single column.
  const dialogMaxWidth = centered ? 1100 : 720;
  const infoColumnWidth = Math.max(280, Math.min(dialogWidth, dialogMaxWidth) * 0.36);

  // Rendered once, placed in whichever of the two spots below is actually
  // mounted (centered's own scrollable column, or inline atop the single
  // stacked scroll on phone) — the two spots are mutually exclusive per render.
  const cartInfoBlock = (
    <>
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

      {linkedCustomer.customerId ? (
        <View
          style={{
            gap: 2,
            padding: space.md,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: color.border,
            backgroundColor: color.surface,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <UserRound size={14} color={color.inkMuted} strokeWidth={2} />
            <Text style={{ fontSize: fontSize.caption, fontWeight: "700", color: color.inkMuted }}>
              CUSTOMER
            </Text>
          </View>
          <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
            {linkedCustomer.name ?? "Customer"}
          </Text>
          {linkedCustomer.contact ? (
            <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>
              {linkedCustomer.contact}
            </Text>
          ) : null}
        </View>
      ) : null}

      {hasDiscount ? (
        <View style={{ gap: space.sm }}>
          <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
            Applied discounts
          </Text>
          {applied.map((d) => (
            <View
              key={d.id}
              style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}
            >
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontSize: fontSize.body, fontWeight: "600", color: color.ink }}
              >
                {d.name ?? "Discount"}
              </Text>
              <Text
                style={[
                  styles.numeric,
                  { fontSize: fontSize.body, fontWeight: "700", color: color.successInk },
                ]}
              >
                −{formatMoney(d.discountAmount + (d.vatRemoved ?? 0))}
              </Text>
            </View>
          ))}
          <View style={{ borderTopWidth: 1, borderTopColor: color.border, paddingTop: space.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>
                Total discount
              </Text>
              <Text
                style={[
                  styles.numeric,
                  { fontSize: fontSize.body, fontWeight: "700", color: color.successInk },
                ]}
              >
                −{formatMoney(appliedTotal)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </>
  );

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
            maxWidth: dialogMaxWidth,
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

          {pendingRule ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: space.md, paddingBottom: space.sm }}
              style={{ flex: 1 }}
            >
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
                <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.primaryDark }}>
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
                <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "600", color: color.ink, textAlign: "center" }}>
                  Pick who the ID belongs to
                </Text>
              </View>

              <Pressable
                onPress={onOpenCustomerForm}
                accessibilityRole="button"
                accessibilityLabel="Create new customer"
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  padding: space.md,
                  minHeight: 56,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: color.primary,
                  backgroundColor: pressed ? color.primaryTint : color.surface,
                })}
              >
                <Plus size={18} color={color.primary} strokeWidth={2.5} />
                <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.primary }}>
                  Create new customer
                </Text>
              </Pressable>

              {eligibleCustomers.length === 0 ? (
                <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.inkMuted }}>
                  No customer is flagged for this discount yet. Create one, or open an
                  existing customer's details and turn on the toggle for it.
                </Text>
              ) : (
                eligibleCustomers.map((c) => {
                  const missingId = !c.idNumber || !c.cardholderName;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        if (missingId) {
                          // Attach them first — CustomerSheet prefills from
                          // the sale's own linked customer id, so this
                          // customer (not whoever was linked before) is
                          // what opens for editing.
                          onAttachCustomer(c);
                          onOpenCustomerForm();
                          return;
                        }
                        pickMandatoryDiscountCustomer(c);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={missingId ? `${c.name}, missing ID, edit` : `Apply for ${c.name}`}
                      style={{
                        padding: space.md,
                        minHeight: 64,
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: color.border,
                        backgroundColor: color.surface,
                        gap: space.xs,
                      }}
                    >
                      <Text style={{ fontSize: fontSize.bodyLg, fontWeight: "700", color: color.ink }}>
                        {c.name}
                      </Text>
                      {missingId ? (
                        <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.warningInk }}>
                          No ID on file — tap to add
                        </Text>
                      ) : (
                        <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.inkMuted }}>
                          {c.cardholderName} · {c.idNumber}
                        </Text>
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          ) : (
            <View style={{ flex: 1, flexDirection: centered ? "row" : "column", gap: centered ? space.lg : 0 }}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm }}
                style={{ flex: 1 }}
              >
                {!centered ? cartInfoBlock : null}

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

                {qualifyingPromos.length > 0 ? (
                  <View style={{ gap: space.sm }}>
                    <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                      Promos
                    </Text>
                    {qualifyingPromos.map((rule) => {
                      const active = applied.some((d) => d.complexDiscountRuleId === rule.id);
                      const reward = applyComplexDiscountReward(rule, cartTotal(lines));
                      const rewardLabel =
                        rule.rewardType === "percentage"
                          ? `${rule.rewardValue ?? 0}% off`
                          : rule.rewardType === "fixed_amount"
                            ? `${formatMoney(rule.rewardValue ?? 0)} off`
                            : "Free item";
                      return (
                        <Pressable
                          key={rule.id}
                          onPress={() => onApplyRule(applyComplexRuleToCart({ rule, lines }))}
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
                            {rewardLabel}
                          </Text>
                          <Text
                            style={{
                              fontSize: fontSize.bodyLg,
                              fontWeight: "700",
                              color: active ? color.primaryDark : color.ink,
                            }}
                          >
                            {active
                              ? "Applied"
                              : rule.rewardType === "free_item"
                                ? "Free item included"
                                : `About −${formatMoney(reward.discountAmount)}`}
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
              </ScrollView>

              {centered ? <View style={{ width: 1, backgroundColor: color.border }} /> : null}

              {centered ? (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ gap: space.lg, paddingBottom: space.sm }}
                  style={{ width: infoColumnWidth, flexGrow: 0 }}
                >
                  {cartInfoBlock}
                </ScrollView>
              ) : null}
            </View>
          )}

          <View style={{ gap: space.sm }}>
            {pendingRule ? (
              <Button label="Back" variant="secondary" onPress={() => setPendingRule(null)} />
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

/** Local-timezone YYYY-MM-DD — Date#toISOString() is UTC and can shift the calendar day, wrong for a birthdate. */
function toIsoDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a YYYY-MM-DD string as a local date — `new Date("YYYY-MM-DD")` parses as UTC midnight, which can display as the previous day in a timezone behind UTC. */
function parseIsoDateString(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Pick an existing customer or type a new one. Field set mirrors admin
 * CustomerForm (name/contact/email/address/DOB/gender/notes) with icons.
 * Saving upserts a local customer row (client UUID) so later sales reuse them;
 * sale snapshot still only carries name/address/contact (CustomerDetails).
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
  /** `saved` is the full local record just written (null for "Leave blank") — DiscountSheet's PWD/Senior picker needs the fresh idNumber/cardholderName/eligibility without waiting for a re-fetch. */
  onApply: (next: CustomerDetails, saved: LocalCustomer | null) => void;
}) {
  const layout = useLayout();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [name, setName] = useState(customer.name ?? "");
  const [contact, setContact] = useState(customer.contact ?? "");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState(customer.address ?? "");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<CustomerGender | "">("");
  const [notes, setNotes] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [isPwdEligible, setIsPwdEligible] = useState(false);
  const [isSeniorEligible, setIsSeniorEligible] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(customer.customerId);
  const [genderOpen, setGenderOpen] = useState(false);
  // iOS only — the spinner renders inline once true (see DateField below).
  // Android's picker is its own imperative dialog (DateTimePickerAndroid),
  // no open state needed for it.
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Prefill profile fields when the sale already has a linked customer.
  useEffect(() => {
    if (!open || !customer.customerId) return;
    let cancelled = false;
    void getLocalCustomer(customer.customerId).then((row) => {
      if (cancelled || !row) return;
      setCustomerId(row.id);
      setName(row.name);
      setContact(row.contact ?? "");
      setEmail(row.email ?? "");
      setAddress(row.address ?? "");
      setDateOfBirth(row.dateOfBirth ?? "");
      setGender(row.gender ?? "");
      setNotes(row.notes ?? "");
      setIdNumber(row.idNumber ?? "");
      setCardholderName(row.cardholderName ?? "");
      setIsPwdEligible(row.isPwdEligible);
      setIsSeniorEligible(row.isSeniorEligible);
    });
    return () => {
      cancelled = true;
    };
  }, [open, customer.customerId]);

  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  if (!open) return null;

  const draft = normaliseCustomerDetails({
    customerId,
    name,
    contact,
    address,
  });
  const twoCol = !layout.compact;
  // BottomSheet's non-scroll body is auto-height, capped only by maxHeight —
  // nothing definite for this form's own flex:1 ScrollView + fixed button
  // below it to bound against. With every field (name through the PWD/
  // Senior toggles) that content routinely exceeds the cap on a phone with
  // no overflow:hidden anywhere to clip it, so the dialog visibly breaks —
  // fields run past the card, the Save button ends up unreachable. A raw
  // Modal with a real computed height (same fix as ConfirmSaleSheet) gives
  // the ScrollView something to actually scroll within instead.
  // Any tablet (portrait or landscape) gets the centered 70%-wide floating
  // dialog, matching `twoCol` above — only phone stays a full-width bottom
  // sheet.
  const centered = !layout.compact;
  const usableHeight = screenHeight - keyboardHeight - insets.top - insets.bottom;
  const dialogWidth = centered ? Math.min(screenWidth * 0.8, 640) : screenWidth;
  const dialogHeight = Math.min(screenHeight * 0.88, usableHeight * 0.95);

  async function save() {
    const next = normaliseCustomerDetails({
      customerId,
      name,
      contact,
      address,
    });
    if (!hasCustomerDetails(next)) {
      onApply(NO_CUSTOMER, null);
      return;
    }

    setSaving(true);
    try {
      const id = next.customerId ?? Crypto.randomUUID();
      const displayName =
        next.name ?? next.contact ?? next.address ?? "Customer";
      const saved = await upsertLocalCustomer({
        id,
        name: displayName,
        address: next.address,
        contact: next.contact,
        email: email.trim() || null,
        dateOfBirth: dateOfBirth.trim() || null,
        gender: gender || null,
        notes: notes.trim() || null,
        idNumber: idNumber.trim() || null,
        cardholderName: cardholderName.trim() || null,
        isPwdEligible,
        isSeniorEligible,
      });
      onApply({ ...next, customerId: id, name: displayName }, saved);
    } catch (error: unknown) {
      console.warn("Customer save failed", error);
      Alert.alert(
        "Could not save customer",
        error instanceof Error ? error.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

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
            // dialogWidth already caps itself (min(70%, 640) centered, full
            // screenWidth in sheet mode) — a separate maxWidth:640 here used
            // to re-clip the sheet-mode case below its true full width on
            // any phone 640-719dp wide (compact's own upper bound).
            width: dialogWidth,
            height: dialogHeight,
            backgroundColor: color.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            borderBottomLeftRadius: centered ? radius.lg : 0,
            borderBottomRightRadius: centered ? radius.lg : 0,
            padding: space.lg,
            paddingBottom: centered ? space.lg : Math.max(insets.bottom, space.lg),
            gap: space.md,
            shadowColor: "#000",
            shadowOpacity: centered ? 0.22 : 0.18,
            shadowRadius: centered ? 28 : 24,
            shadowOffset: { width: 0, height: centered ? 12 : -10 },
            elevation: centered ? 20 : 16,
          }}
        >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={[styles.iconWell, { width: 34, height: 34 }]}>
          <UserRound size={18} color={color.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.subheading}>Customer</Text>
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            Fill the form — same fields as admin.
          </Text>
        </View>
        <IconButton icon={X} label="Close" onPress={onClose} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: space.md }}
        style={{ flex: 1 }}
      >
      <Text
        style={{
          fontSize: fontSize.caption,
          fontWeight: "600",
          color: color.inkMuted,
        }}
      >
        {customerId ? "Edit details" : "New customer"}
      </Text>

      <View
        style={{
          flexDirection: twoCol ? "row" : "column",
          // Wrap only makes sense for the two-column row layout — on a
          // single-column phone this let Yoga wrap the column itself into
          // side-by-side tracks (each field basis reads as ~50% wide)
          // instead of a plain vertical stack.
          flexWrap: twoCol ? "wrap" : "nowrap",
          gap: space.md,
        }}
      >
        <View style={{ flexGrow: 1, flexBasis: twoCol ? "30%" : "100%", minWidth: twoCol ? 160 : undefined }}>
          <CustomerField
            icon={UserRound}
            label="Name"
            value={name}
            onChangeText={(next) => {
              setName(next);
              if (customerId) setCustomerId(null);
            }}
            placeholder="Who the sale is for"
            autoCapitalize="words"
            autoFocus={!customer.customerId}
            required
          />
        </View>
        <View style={{ flexGrow: 1, flexBasis: twoCol ? "30%" : "100%", minWidth: twoCol ? 160 : undefined }}>
          <CustomerField
            icon={Phone}
            label="Contact"
            value={contact}
            onChangeText={setContact}
            placeholder="09XX XXX XXXX"
            keyboardType="phone-pad"
          />
        </View>
        <View style={{ flexGrow: 1, flexBasis: twoCol ? "30%" : "100%", minWidth: twoCol ? 160 : undefined }}>
          <CustomerField
            icon={Mail}
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        <View style={{ flexGrow: 1, flexBasis: twoCol ? "30%" : "100%", minWidth: twoCol ? 160 : undefined }}>
          <CustomerField
            icon={MapPin}
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Where the delivery goes"
            autoCapitalize="words"
          />
        </View>
        <View style={{ flexGrow: 1, flexBasis: twoCol ? "30%" : "100%", minWidth: twoCol ? 160 : undefined }}>
          <DateField
            label="Date of birth"
            value={dateOfBirth}
            onChange={setDateOfBirth}
            open={dobPickerOpen}
            onOpen={() => setDobPickerOpen(true)}
            onClose={() => setDobPickerOpen(false)}
          />
        </View>
        <View style={{ flexGrow: 1, flexBasis: twoCol ? "30%" : "100%", minWidth: twoCol ? 160 : undefined, gap: space.xs }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Users size={14} color={color.inkMuted} strokeWidth={2} />
            <Text style={{ fontSize: fontSize.body, fontWeight: "600" }}>Gender</Text>
          </View>
          <SelectField<CustomerGender | "unspecified">
            label="Gender"
            icon={Users}
            value={gender || "unspecified"}
            options={[
              { value: "unspecified", label: "Not specified" },
              ...(Object.entries(CUSTOMER_GENDER_LABELS) as [CustomerGender, string][]).map(
                ([value, label]) => ({ value, label }),
              ),
            ]}
            open={genderOpen}
            onOpen={() => setGenderOpen(true)}
            onClose={() => setGenderOpen(false)}
            onChange={(value) => {
              setGender(value === "unspecified" ? "" : value);
              setGenderOpen(false);
            }}
          />
        </View>
      </View>

      <CustomerField
        icon={StickyNote}
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        placeholder="Staff-only — never shown to the customer"
        autoCapitalize="sentences"
        multiline
        maxLength={2000}
      />

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
          <IdCard size={14} color={color.inkMuted} strokeWidth={2} />
          <Text style={{ fontSize: fontSize.body, fontWeight: "700" }}>
            Senior / PWD discount
          </Text>
        </View>
        <View
          style={{
            flexDirection: twoCol ? "row" : "column",
            flexWrap: twoCol ? "wrap" : "nowrap",
            gap: space.md,
          }}
        >
          <View style={{ flexGrow: 1, flexBasis: twoCol ? "48%" : "100%", minWidth: twoCol ? 160 : undefined }}>
            <CustomerField
              icon={IdCard}
              label="ID number"
              value={idNumber}
              onChangeText={setIdNumber}
              placeholder="Senior/PWD card number"
              autoCapitalize="none"
            />
          </View>
          <View style={{ flexGrow: 1, flexBasis: twoCol ? "48%" : "100%", minWidth: twoCol ? 160 : undefined }}>
            <CustomerField
              icon={UserRound}
              label="Cardholder name"
              value={cardholderName}
              onChangeText={setCardholderName}
              placeholder="Name printed on the ID"
              autoCapitalize="words"
            />
          </View>
        </View>

        <MandatoryDiscountToggle
          label="PWD eligible"
          description="Shows in the discount dialog's PWD picker."
          value={isPwdEligible}
          onChange={setIsPwdEligible}
        />
        <MandatoryDiscountToggle
          label="Senior citizen eligible"
          description="Shows in the discount dialog's Senior picker."
          value={isSeniorEligible}
          onChange={setIsSeniorEligible}
        />
      </View>
      </ScrollView>

      <View style={{ gap: space.sm }}>
        <Button
          label={saving ? "Saving…" : "Save customer"}
          large
          icon={CheckCircle2}
          busy={saving}
          disabled={saving}
          onPress={() => void save()}
        />
        {hasCustomerDetails(draft) || customerId ? (
          <Button
            label="Leave blank"
            variant="secondary"
            onPress={() => onApply(NO_CUSTOMER, null)}
          />
        ) : null}
      </View>
        </View>
      </View>
    </Modal>
  );
}

/** Same row shape as account-drawer.tsx's Offline mode switch — label + description on the left, Switch on the right. */
function MandatoryDiscountToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        padding: space.sm,
        borderRadius: radius.sm,
        backgroundColor: color.primarySoft,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
          {label}
        </Text>
        <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: color.primary, false: color.border }}
      />
    </View>
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
  required = false,
  maxLength = CUSTOMER_FIELD_MAX_LENGTH,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  autoCapitalize?: "none" | "words" | "sentences";
  keyboardType?: "default" | "phone-pad" | "email-address" | "numbers-and-punctuation";
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
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
        maxLength={maxLength}
        accessibilityLabel={`${label}${required ? "" : ", optional"}`}
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
 * Same visual chrome as CustomerField, but a native date picker instead of
 * free text — a typed "YYYY-MM-DD" let a birthdate through malformed or in
 * the wrong order. `value`/`onChange` still carry the same YYYY-MM-DD string
 * contract the rest of this form (and the server) already use; only the
 * input mechanism changes.
 *
 * Android's picker is its own OS dialog (DateTimePickerAndroid.open), fired
 * imperatively on tap — nothing stays mounted. iOS has no equivalent
 * imperative API, so `open`/`onOpen`/`onClose` (same controlled shape
 * SelectField already uses for Gender, right beside this field) toggle an
 * inline spinner under the trigger instead.
 */
function DateField({
  label,
  value,
  onChange,
  open,
  onOpen,
  onClose,
  required = false,
}: {
  label: string;
  /** YYYY-MM-DD, or "" for unset. */
  value: string;
  onChange: (next: string) => void;
  /** iOS only — see comment above. Android ignores this. */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  required?: boolean;
}) {
  const selected = parseIsoDateString(value);

  function handlePress() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: selected ?? new Date(),
        mode: "date",
        maximumDate: new Date(),
        onChange: (_event, next) => {
          if (next) onChange(toIsoDateString(next));
        },
      });
      return;
    }
    onOpen();
  }

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <Cake size={14} color={color.inkMuted} strokeWidth={2} />
        <Text style={{ fontSize: fontSize.body, fontWeight: "600" }}>{label}</Text>
      </View>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${label}${required ? "" : ", optional"}${selected ? `, ${value}` : ""}`}
        style={{
          minHeight: 52,
          justifyContent: "center",
          borderWidth: 1,
          borderColor: value.trim() ? color.primary : color.border,
          borderRadius: radius.sm,
          backgroundColor: value.trim() ? color.primaryTint : color.surface,
          paddingHorizontal: space.md,
        }}
      >
        <Text style={{ fontSize: fontSize.bodyLg, color: value ? color.ink : color.inkMuted }}>
          {value || "Select a date"}
        </Text>
      </Pressable>
      {Platform.OS === "ios" && open ? (
        <DateTimePicker
          value={selected ?? new Date()}
          mode="date"
          display="spinner"
          maximumDate={new Date()}
          onChange={(_event, next) => {
            if (next) onChange(toIsoDateString(next));
          }}
        />
      ) : null}
      {Platform.OS === "ios" && open ? (
        <Button label="Done" variant="secondary" onPress={onClose} />
      ) : null}
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
                who it's for. Only during confirm: once the sale lands there's
                nothing left to confirm, so it's dropped entirely and the
                success message gets the full dialog to itself instead of
                sharing half with now-stale payment/fulfillment details. On a
                phone this stacks above the right column and shrinks (see
                ConfirmDetailBlock's compact prop) — the two full-size
                columns plus a full cash keypad below never fit an upright
                phone's height without either shrinking or scrolling; this
                does both. */}
            {succeeded ? null : (
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
            )}

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
