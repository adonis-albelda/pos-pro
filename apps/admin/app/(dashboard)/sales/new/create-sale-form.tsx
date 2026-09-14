"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crop,
  FolderOpen,
  Maximize2,
  Mic,
  Minimize2,
  PackageSearch,
  Pencil,
  Save,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type {
  CartLine,
  ComplexDiscountRule,
  Customer,
  DiscountRule,
  LoyaltyEarningRule,
  LoyaltyReward,
  Product,
} from "@double-a/shared-types";
import {
  cartDiscount,
  cartTotal,
  DEFAULT_TAX_SETTINGS,
  formatMoney,
  formatPercent,
  lineProfit,
  lineSubtotal,
  marginPercent,
  matchingEarningRule,
  priceForQuantity,
  QUANTITY_DECIMALS,
  roundMoney,
} from "@double-a/shared-types";
import {
  extractProductsFromPhoto,
  listProductsByIds,
  listProductsPage,
  listProductVariants,
  type AddonGroup,
  type ProductVariant,
  type ProductVariantListRow,
} from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Combobox,
  EmptyState,
  ErrorNote,
  Field,
  FileInput,
  Input,
  Money,
  MoneyInput,
} from "@/components/ui";
import { toast } from "sonner";
import { AiProcessingOverlay, ConfirmDialog, Dialog, Sheet } from "@/components/overlay";
import { visionProcessingHint } from "@/lib/ai-processing-hint";
import { useCurrentUser } from "@/lib/query/session";
import { AiSearchModal } from "@/components/ai-search-modal";
import { ProductGridTile } from "@/components/product-grid-tile";
import { ProductVariantGridTile } from "@/components/product-variant-grid-tile";
import { CropPhoto } from "../../products/from-photo/crop-photo";
import { VoiceSearchModal, voiceSearchSupported } from "@/components/voice-search-modal";
import { isImageFile, NOT_AN_IMAGE_MESSAGE } from "@/lib/is-image-file";
import { useAddonGroups } from "@/lib/query/addon-groups";
import { useCategories } from "@/lib/query/categories";
import { useCustomers } from "@/lib/query/customers";
import { useComplexDiscountRules, useDiscountRules, useTaxSettings } from "@/lib/query/discounts";
import { useFeatureFlags } from "@/lib/query/features";
import { useAwardLoyaltyPoints, useLoyaltyEarningRules, useLoyaltyRewards } from "@/lib/query/loyalty";
import { useProducts, useProductVariantsList } from "@/lib/query/products";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import {
  eligibleLoyaltyRewards,
  orderDiscountImpact,
  qualifyingComplexRules,
  qualifyingSimpleRules,
  type AppliedOrderDiscount,
} from "@/lib/order-discounts";
import {
  deleteSaleDraft,
  listSaleDrafts,
  saveSaleDraft,
  type SaleDraft,
  type SaleDraftItem,
} from "@/lib/sale-drafts";
import {
  SaleVariantAddonPicker,
  variantLabel,
  type SaleVariantAddonSelection,
} from "./sale-variant-addon-picker";
import { SaleReviewDialog, type PaymentMethod } from "./sale-review-dialog";
import { DiscountRulesDialog } from "./discount-rules-dialog";
import { createSaleAction } from "./actions";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "ewallet", label: "E-Wallet" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit" },
] as const;

/**
 * Which e-wallet the customer actually paid with — display-only, so the
 * owner can match a sale against their own bank/wallet records. Same list
 * as the mobile POS's own confirm flow (apps/mobile/app/pos/index.tsx).
 */
const EWALLET_PROVIDERS = ["GCash", "Maya", "MariBank", "GrabPay", "ShopeePay"] as const;

// A backordered line has no real ceiling — the sale is confirmed with nothing
// on the shelf, so there's nothing left to cap against (mirrors mobile POS).
const BACKORDER_CAP = 9999;

function stockCapFor(stock: number, allowDecimal: boolean): number {
  if (stock <= 0) return BACKORDER_CAP;
  return allowDecimal ? Number(stock.toFixed(QUANTITY_DECIMALS)) : Math.floor(stock);
}

/**
 * Two variants of the same product are separate cart lines — a plain
 * productId key would conflate a price draft (or a quantity/remove action)
 * meant for one variant with its sibling. variantId disambiguates the same
 * way mobile's own cart matches on (productId, variantId) pairs.
 */
function lineKey(line: { productId: string; variantId?: string | null }): string {
  return line.variantId ? `${line.productId}:${line.variantId}` : line.productId;
}

const GRID_PAGE_SIZE = 24;

// Stable references so useMemo deps below don't see a "new" empty array
// every render while a query is still loading.
const EMPTY_DISCOUNT_RULES: DiscountRule[] = [];
const EMPTY_COMPLEX_DISCOUNT_RULES: ComplexDiscountRule[] = [];
const EMPTY_LOYALTY_REWARDS: LoyaltyReward[] = [];
const EMPTY_LOYALTY_EARNING_RULES: LoyaltyEarningRule[] = [];

export function CreateSaleForm() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const customersQuery = useCustomers();
  const categoriesQuery = useCategories();
  const addonGroupsQuery = useAddonGroups();
  const discountRulesQuery = useDiscountRules();
  const complexDiscountRulesQuery = useComplexDiscountRules();
  const loyaltyRewardsQuery = useLoyaltyRewards();
  const loyaltyEarningRulesQuery = useLoyaltyEarningRules();
  const awardLoyaltyPoints = useAwardLoyaltyPoints();
  const taxSettingsQuery = useTaxSettings();
  const { isEnabled } = useFeatureFlags();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Cart state — the exact CartLine shape the mobile POS uses, so the same
  // shared-types money math (cartTotal, priceForQuantity, ...) applies as-is.
  const [lines, setLines] = useState<CartLine[]>([]);
  // Raw typed override text per productId — empty/absent means "shelf price".
  // Kept separate from CartLine.unitPrice so bulk repricing can keep moving
  // line.unitPrice on quantity changes right up until the cashier actually
  // types something, same split the old form had (unitPrice: string).
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  // Order-level picks — Senior/PWD or another simple rule, a qualifying
  // promo, or a loyalty reward redemption. Separate from priceDrafts'
  // per-line counter discount; same split as the mobile POS's own
  // lineDiscount/orderDiscount (see order-discounts.ts).
  const [orderDiscounts, setOrderDiscounts] = useState<AppliedOrderDiscount[]>([]);
  const [discountRulesOpen, setDiscountRulesOpen] = useState(false);
  // Every product this session has ever added to the cart — CartLine itself
  // doesn't carry bulk-price/cost fields, so repricing and drafts need the
  // full Product back even after it's paged or filtered out of the grid.
  const [heldProducts, setHeldProducts] = useState<Map<string, Product>>(new Map());

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  // Product-level (one tile per product) vs "By variant" (one tile per SKU) —
  // same split as the Products page's own view toggle.
  const [gridViewMode, setGridViewMode] = useState<"product" | "variant">("product");

  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [aiResultIds, setAiResultIds] = useState<string[] | null>(null);
  const [aiResultLabel, setAiResultLabel] = useState("");
  const [aiProducts, setAiProducts] = useState<Product[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const [voiceSearchOpen, setVoiceSearchOpen] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const [expandOpen, setExpandOpen] = useState(false);

  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  // What was actually picked, shown back so the cashier knows exactly which
  // photo is about to be read — and can crop it first, same as Products ›
  // From photo (crop-photo.tsx).
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoShowCropper, setPhotoShowCropper] = useState(false);
  const [photoReading, setPhotoReading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [outOfStockConfirm, setOutOfStockConfirm] = useState<{
    product: Product;
    selection?: SaleVariantAddonSelection;
  } | null>(null);
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  // Set only for a product with >1 variant and/or attached add-on groups —
  // addToCart decides whether this ever opens; a plain product never does.
  // See apps/mobile/app/pos/index.tsx's own pickerState for the mobile
  // equivalent this mirrors.
  const [pickerState, setPickerState] = useState<{
    product: Product;
    variants: ProductVariant[];
    addonGroups: AddonGroup[];
  } | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [ewalletProvider, setEwalletProvider] = useState<string | null>(null);
  const [ewalletProviderOther, setEwalletProviderOther] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [saleSucceeded, setSaleSucceeded] = useState(false);
  const [createdSaleId, setCreatedSaleId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<SaleDraft[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);

  const [discountDraft, setDiscountDraft] = useState("");

  useEffect(() => {
    setDrafts(listSaleDrafts());
  }, []);

  useEffect(() => {
    setVoiceSupported(voiceSearchSupported());
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setQuery(search.trim()), 200);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [query, categoryId, gridViewMode]);

  // Clear the typed amount each time the dialog opens — no per-line id to key
  // it on, so a re-open must never show the last discount typed.
  useEffect(() => {
    if (discountRulesOpen) setDiscountDraft("");
  }, [discountRulesOpen]);

  const customers = customersQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const productsQuery = useProducts(
    {
      q: query || undefined,
      categoryId: categoryId || undefined,
      page,
      pageSize: GRID_PAGE_SIZE,
    },
    { enabled: "product" === gridViewMode },
  );
  const variantsQuery = useProductVariantsList(
    {
      q: query || undefined,
      categoryId: categoryId || undefined,
      page,
      pageSize: GRID_PAGE_SIZE,
    },
    { enabled: "variant" === gridViewMode },
  );

  // AI results replace the normal browse query entirely — fetched by id, in
  // ranked order, same branch mobile's pos/index.tsx uses for its own
  // aiResultIds.
  useEffect(() => {
    if (!aiResultIds) {
      setAiProducts([]);
      return;
    }
    let alive = true;
    setAiLoading(true);
    void listProductsByIds(getBrowserApiClient(), aiResultIds)
      .then((products) => {
        if (!alive) return;
        const byId = new Map(products.map((p) => [p.id, p]));
        setAiProducts(
          aiResultIds
            .map((id) => byId.get(id))
            .filter((p): p is Product => p !== undefined),
        );
      })
      .finally(() => {
        if (alive) setAiLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [aiResultIds]);

  const queriedProducts = productsQuery.data?.products;
  const displayedProducts = useMemo(
    () => (aiResultIds ? aiProducts : (queriedProducts ?? [])),
    [aiResultIds, aiProducts, queriedProducts],
  );
  const displayedVariants = variantsQuery.data?.variants ?? [];
  const gridLoading =
    "variant" === gridViewMode ? variantsQuery.isLoading : aiResultIds ? aiLoading : productsQuery.isLoading;
  const pageCount =
    "variant" === gridViewMode
      ? (variantsQuery.data?.pageCount ?? 1)
      : aiResultIds
        ? 1
        : (productsQuery.data?.pageCount ?? 1);

  function rememberProducts(products: Product[]) {
    setHeldProducts((current) => {
      const next = new Map(current);
      for (const product of products) next.set(product.id, product);
      return next;
    });
  }

  useEffect(() => {
    if (displayedProducts.length > 0) rememberProducts(displayedProducts);
  }, [displayedProducts]);

  const byId = useMemo(() => heldProducts, [heldProducts]);

  function isOverridden(line: CartLine): boolean {
    return Boolean(priceDrafts[lineKey(line)]?.trim());
  }

  function effectiveUnitPrice(line: CartLine): number {
    const draft = priceDrafts[lineKey(line)]?.trim();
    if (draft) {
      const typed = Number(draft);
      return Number.isFinite(typed) ? typed : line.unitPrice;
    }
    return line.unitPrice;
  }

  const pricedLines = useMemo(
    () => lines.map((line) => ({ ...line, unitPrice: effectiveUnitPrice(line) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectiveUnitPrice reads priceDrafts/lines already in deps
    [lines, priceDrafts],
  );

  const lineDiscount = cartDiscount(pricedLines);
  const orderDiscount = orderDiscountImpact(orderDiscounts);
  const total = roundMoney(Math.max(cartTotal(pricedLines) - orderDiscount, 0));
  const shelfTotal = roundMoney(
    lines.reduce((sum, line) => sum + line.listPrice * line.quantity, 0),
  );
  const discount = roundMoney(lineDiscount + orderDiscount);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const taxSettings = taxSettingsQuery.data ?? DEFAULT_TAX_SETTINGS;
  const discountRules = discountRulesQuery.data ?? EMPTY_DISCOUNT_RULES;
  const complexDiscountRules = complexDiscountRulesQuery.data ?? EMPTY_COMPLEX_DISCOUNT_RULES;
  const loyaltyRewards = loyaltyRewardsQuery.data ?? EMPTY_LOYALTY_REWARDS;
  const loyaltyEarningRules = loyaltyEarningRulesQuery.data ?? EMPTY_LOYALTY_EARNING_RULES;
  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  // Whether this sale's total lands on a manual-only earning tier — surfaced
  // on the review dialog's success screen so the cashier can confirm it
  // without leaving the flow (AwardLoyaltyPointsController).
  const pendingManualAwardRule = selectedCustomer
    ? matchingEarningRule(loyaltyEarningRules, total)
    : null;
  const showAwardPointsButton = null !== pendingManualAwardRule && !pendingManualAwardRule.isAuto;

  const qualifyingSimple = useMemo(
    () => qualifyingSimpleRules(discountRules, lines),
    [discountRules, lines],
  );
  const qualifyingLoyalty = useMemo(
    () =>
      eligibleLoyaltyRewards({
        rewards: loyaltyRewards,
        discountRules,
        pointsBalance: selectedCustomer?.loyaltyPointsBalance ?? 0,
        lines,
      }),
    [loyaltyRewards, discountRules, selectedCustomer, lines],
  );
  // Auto-detected promos not yet applied — same "suggestion" idea as the
  // mobile POS's own promoSuggestion banner, just surfaced as a list here
  // rather than a single dismissible pick, since a web session isn't racing
  // a physical queue.
  const qualifyingComplex = useMemo(
    () => qualifyingComplexRules(complexDiscountRules, lines, orderDiscounts),
    [complexDiscountRules, lines, orderDiscounts],
  );

  function addOrderDiscount(applied: AppliedOrderDiscount) {
    setOrderDiscounts((current) => [...current, applied]);
  }

  function removeOrderDiscount(id: string) {
    setOrderDiscounts((current) => current.filter((entry) => entry.id !== id));
  }

  function clearAiSearch() {
    setAiResultIds(null);
    setAiResultLabel("");
  }

  function applyManualSearch(text: string) {
    if (aiResultIds) clearAiSearch();
    setSearch(text);
  }

  function repricedFor(line: CartLine, quantity: number, product?: Product): CartLine {
    if (isOverridden(line)) return { ...line, quantity };
    // A variant/add-on line's price is fixed at add time (the picker's own
    // resolved total), not re-derived from the product's bulk-pricing math —
    // same split as mobile's own repricedFor.
    if (line.naturalPrice !== undefined) return { ...line, quantity, unitPrice: line.naturalPrice };
    const p = product ?? byId.get(line.productId);
    if (!p) return { ...line, quantity };
    return { ...line, quantity, unitPrice: priceForQuantity(p, quantity) };
  }

  /**
   * Product-level mode never creates more than one line per product (the
   * variant/add-on picker only ever runs on the first click), so a repeat
   * click always has exactly one existing line to bump.
   */
  function commitAddToCart(product: Product, selection?: SaleVariantAddonSelection) {
    rememberProducts([product]);

    setLines((current) => {
      // Matches on variantId too, not just productId — a different variant
      // of the same product picked a second time must land as its own line,
      // never bump whatever variant happened to be added first.
      const targetVariantId = selection?.variant.id ?? null;
      const isTarget = (line: CartLine) =>
        line.productId === product.id && (line.variantId ?? null) === targetVariantId;
      const existing = current.find(isTarget);
      if (existing) {
        const cap = existing.variantId
          ? stockCapFor(existing.availableStock, existing.allowDecimal)
          : stockCapFor(product.stockQuantity, product.allowDecimal);
        if (existing.quantity >= cap) return current;
        return current.map((line) =>
          isTarget(line) ? repricedFor(line, Math.min(line.quantity + 1, cap), product) : line,
        );
      }

      if (selection) {
        const addonsTotal = roundMoney(selection.addons.reduce((sum, addon) => sum + addon.price, 0));
        const naturalPrice = roundMoney(selection.variant.price + addonsTotal);
        const cap = stockCapFor(selection.variant.stockQuantity ?? 0, product.allowDecimal);

        return [
          ...current,
          {
            productId: product.id,
            variantId: selection.variant.id,
            variantLabel: variantLabel(selection.variant) || null,
            productName: product.name,
            unitPrice: naturalPrice,
            listPrice: naturalPrice,
            naturalPrice,
            unitCost: selection.variant.costPrice,
            unit: product.unit,
            allowDecimal: product.allowDecimal,
            quantity: 1,
            availableStock: cap,
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

      const cap = stockCapFor(product.stockQuantity, product.allowDecimal);
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: priceForQuantity(product, 1),
          listPrice: product.price,
          unitCost: product.costPrice,
          unit: product.unit,
          allowDecimal: product.allowDecimal,
          quantity: 1,
          availableStock: cap,
          categoryId: product.categoryId ?? null,
        },
      ];
    });
  }

  /**
   * A photo line adds/increments by the quantity OCR/vision actually read,
   * not always +1 — and skips the out-of-stock confirm dialog, since a batch
   * of lines from one photo shouldn't mean a popup per line.
   */
  function addPhotoLineToCart(product: Product, quantity: number) {
    rememberProducts([product]);
    const cap = stockCapFor(product.stockQuantity, product.allowDecimal);

    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        const next = Math.min(existing.quantity + quantity, cap);
        return current.map((line) =>
          line.productId === product.id ? repricedFor(line, next, product) : line,
        );
      }

      const initial = Math.min(quantity, cap);
      return [
        ...current,
        {
          productId: product.id,
          productName: product.name,
          unitPrice: priceForQuantity(product, initial),
          listPrice: product.price,
          unitCost: product.costPrice,
          unit: product.unit,
          allowDecimal: product.allowDecimal,
          quantity: initial,
          availableStock: cap,
        },
      ];
    });
  }

  function clearPhotoPreview() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
  }

  function onPhotoPicked(file: File | null) {
    clearPhotoPreview();
    setPhotoError(null);
    setPhotoFile(file);
    setPhotoShowCropper(file !== null);
    if (!file) return;
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  function onPhotoCropped(cropped: File) {
    clearPhotoPreview();
    setPhotoFile(cropped);
    setPhotoPreviewUrl(URL.createObjectURL(cropped));
    setPhotoShowCropper(false);
  }

  function closePhotoModal() {
    setPhotoModalOpen(false);
    setPhotoFile(null);
    setPhotoError(null);
    setPhotoShowCropper(false);
    clearPhotoPreview();
  }

  /**
   * A photo of a customer's order (or notebook list) — matched existing
   * products go straight into the cart with the quantity read from the
   * photo. Deliberately `applyStock: false`: this is filling a cart for a
   * sale, not a restock, so it must never write an inventory movement (see
   * ExtractProductsFromPhotoAction's $applyStock param). Quota/usage for
   * product_photo_ai is still recorded server-side on every call, same as
   * the Products › From photo page.
   */
  async function runPhotoExtract() {
    if (!photoFile) {
      setPhotoError("Choose a photo first.");
      return;
    }

    setPhotoError(null);
    setPhotoReading(true);

    try {
      const client = getBrowserApiClient();
      const extractedLines = await extractProductsFromPhoto(client, photoFile, { applyStock: false });

      const matchedIds = [
        ...new Set(
          extractedLines
            .map((line) => line.existingProductId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const matchedProducts = matchedIds.length > 0 ? await listProductsByIds(client, matchedIds) : [];
      const productById = new Map(matchedProducts.map((product) => [product.id, product]));

      let added = 0;
      const skipped: string[] = [];
      for (const line of extractedLines) {
        const product = line.existingProductId ? productById.get(line.existingProductId) : undefined;
        if (!product) {
          skipped.push(line.name);
          continue;
        }
        addPhotoLineToCart(product, line.quantity && line.quantity > 0 ? line.quantity : 1);
        added += 1;
      }

      closePhotoModal();

      if (added > 0) {
        toast.success(`Added ${added} item${added === 1 ? "" : "s"} to the cart from the photo.`);
      }
      if (skipped.length > 0) {
        toast.error(`Not in the catalogue, skipped: ${skipped.join(", ")}`);
      }
    } catch (cause) {
      setPhotoError(cause instanceof Error ? cause.message : "Could not read the photo.");
    } finally {
      setPhotoReading(false);
    }
  }

  /** No confirmation for a normal add — the one exception is the first tap on a zero-stock product, a backorder decision. */
  function addonGroupsFor(product: Product): AddonGroup[] {
    const ids = new Set(product.addonGroupIds);
    return (addonGroupsQuery.data ?? []).filter((group) => ids.has(group.id));
  }

  /**
   * A product with more than one variant, and/or one or more attached
   * add-on groups, opens the picker instead of adding directly — mirrors
   * apps/mobile/app/pos/index.tsx's own addToCart.
   */
  async function addToCart(product: Product) {
    const existing = lines.find((line) => line.productId === product.id);
    // A plain line (no variant picked at all) has nothing to reconsider —
    // bump it straight away. A line that DOES carry a variantId came out of
    // the picker/auto-resolve below, and this product may have more than
    // one variant to choose from — re-open the picker instead of blindly
    // bumping whatever was picked first, so a second click can choose a
    // different variant. See below: once fetched, a single-variant/no-addon
    // product with nothing to reconsider still just bumps.
    if (existing && !existing.variantId) {
      changeQuantity(product.id, 1);
      return;
    }

    const variants = await listProductVariants(getBrowserApiClient(), product.id);
    const addonGroups = addonGroupsFor(product);

    if (variants.length > 1 || addonGroups.length > 0) {
      setPickerState({ product, variants, addonGroups });
      return;
    }

    if (existing) {
      changeQuantity(product.id, 1, existing.variantId);
      return;
    }

    const [onlyVariant] = variants;
    if (onlyVariant) {
      commitVariantSelection(product, { variant: onlyVariant, addons: [] });
      return;
    }

    if (product.stockQuantity <= 0) {
      setOutOfStockConfirm({ product });
      return;
    }
    commitAddToCart(product);
  }

  /** Shared by the picker's own confirm and the "exactly one variant" auto-resolve path above. */
  function commitVariantSelection(product: Product, selection: SaleVariantAddonSelection) {
    if ((selection.variant.stockQuantity ?? 0) <= 0) {
      setOutOfStockConfirm({ product, selection });
      return;
    }
    commitAddToCart(product, selection);
  }

  function onPickerConfirm(selection: SaleVariantAddonSelection) {
    if (!pickerState) return;
    const { product } = pickerState;
    setPickerState(null);
    commitVariantSelection(product, selection);
  }

  /**
   * A "By variant" grid tile's own tap handler — the tile already names one
   * specific variant, so there is nothing for the usual variant picker to
   * ask; add-on groups (if the product has any) still get their own step,
   * same picker component, just pre-scoped to this one variant instead of
   * every one. Mirrors apps/mobile/app/pos/index.tsx's handleTilePress.
   */
  async function addVariantToCart(row: ProductVariantListRow) {
    const existing = lines.find((line) => line.productId === row.productId && line.variantId === row.id);
    if (existing) {
      changeQuantity(row.productId, 1, row.id);
      return;
    }

    const variants = await listProductVariants(getBrowserApiClient(), row.productId);
    const product = byId.get(row.productId) ?? (await listProductsByIds(getBrowserApiClient(), [row.productId]))[0];
    const variant = variants.find((v) => v.id === row.id);
    if (!product || !variant) return;
    rememberProducts([product]);

    const addonGroups = addonGroupsFor(product);
    if (addonGroups.length > 0) {
      setPickerState({ product, variants: [variant], addonGroups });
      return;
    }

    commitVariantSelection(product, { variant, addons: [] });
  }

  /** variantId disambiguates two lines that share a product — omitted, this matches the line with no variant (a plain product). */
  function changeQuantity(productId: string, delta: number, variantId?: string | null) {
    const isTarget = (line: CartLine) => line.productId === productId && (line.variantId ?? null) === (variantId ?? null);
    setLines((current) =>
      current
        .map((line) => {
          if (!isTarget(line)) return line;
          const cap = stockCapFor(line.availableStock, line.allowDecimal);
          const next = line.quantity + delta;
          if (delta > 0 && next > cap) return line;
          return repricedFor(line, next);
        })
        .filter((line) => line.quantity > 0),
    );
  }

  /** Typed quantity — never auto-removes the line; use the remove button for that. */
  function updateQuantity(productId: string, raw: string, variantId?: string | null) {
    const isTarget = (line: CartLine) => line.productId === productId && (line.variantId ?? null) === (variantId ?? null);
    setLines((current) =>
      current.map((line) => {
        if (!isTarget(line)) return line;
        const typed = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(typed) || typed < 0) {
          return { ...line, quantity: 0 };
        }
        const cap = stockCapFor(line.availableStock, line.allowDecimal);
        const asked = line.allowDecimal ? typed : Math.floor(typed);
        return repricedFor(line, Math.min(asked, cap));
      }),
    );
  }

  function removeLine(productId: string, variantId?: string | null) {
    const isTarget = (line: CartLine) => line.productId === productId && (line.variantId ?? null) === (variantId ?? null);
    setLines((current) => current.filter((line) => !isTarget(line)));
    setPriceDrafts(({ [lineKey({ productId, variantId })]: _drop, ...rest }) => rest);
  }

  function updatePriceDraft(productId: string, raw: string, variantId?: string | null) {
    const key = lineKey({ productId, variantId });
    const isTarget = (line: CartLine) => line.productId === productId && (line.variantId ?? null) === (variantId ?? null);
    setPriceDrafts((current) => ({ ...current, [key]: raw }));
    if (raw.trim() === "") {
      setLines((current) =>
        current.map((line) => {
          if (!isTarget(line)) return line;
          if (line.naturalPrice !== undefined) return { ...line, unitPrice: line.naturalPrice };
          const product = byId.get(productId);
          return product ? { ...line, unitPrice: priceForQuantity(product, line.quantity) } : line;
        }),
      );
    }
  }

  function resetLinePrice(productId: string, variantId?: string | null) {
    const key = lineKey({ productId, variantId });
    const isTarget = (line: CartLine) => line.productId === productId && (line.variantId ?? null) === (variantId ?? null);
    setPriceDrafts(({ [key]: _drop, ...rest }) => rest);
    setLines((current) =>
      current.map((line) => {
        if (!isTarget(line)) return line;
        if (line.naturalPrice !== undefined) return { ...line, unitPrice: line.naturalPrice };
        const product = byId.get(productId);
        return product ? { ...line, unitPrice: priceForQuantity(product, line.quantity) } : line;
      }),
    );
  }

  /** A flat peso amount off the whole cart, split by each line's share of the total — same mechanism as a per-line counter discount. */
  function applyGlobalDiscount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0 || total <= 0) return;
    const capped = Math.min(amount, total);

    setPriceDrafts((current) => {
      const next = { ...current };
      for (const line of pricedLines) {
        if (line.quantity <= 0) continue;
        const lineTotal = line.unitPrice * line.quantity;
        const share = roundMoney((lineTotal / total) * capped);
        const nextPrice = Math.max(0, roundMoney(line.unitPrice - share / line.quantity));
        next[lineKey(line)] = String(nextPrice);
      }
      return next;
    });
    setDiscountDraft("");
  }

  function clearAllDiscounts() {
    setPriceDrafts({});
    setLines((current) =>
      current.map((line) => {
        if (line.naturalPrice !== undefined) return { ...line, unitPrice: line.naturalPrice };
        const product = byId.get(line.productId);
        return product ? { ...line, unitPrice: priceForQuantity(product, line.quantity) } : line;
      }),
    );
    setDiscountDraft("");
  }

  /**
   * A hardware barcode scanner is a keyboard: it types the code and presses
   * enter. An exact barcode/SKU match goes straight into the cart; anything
   * else is left as a normal (already live-filtering) search.
   */
  async function submitSearchEnter() {
    const code = search.trim();
    if (!code) return;

    const { products } = await listProductsPage(getBrowserApiClient(), {
      q: code,
      page: 1,
      pageSize: 1,
    });
    const top = products[0];
    if (top && (top.barcode === code || top.sku === code)) {
      void addToCart(top);
      applyManualSearch("");
    }
  }

  const effectiveEwalletProvider =
    "Other" === ewalletProvider ? ewalletProviderOther.trim() || null : ewalletProvider;

  function requestSubmit() {
    const hasQuantity = lines.some((line) => line.quantity > 0);
    if (!hasQuantity) {
      setError("Add at least one product with a quantity.");
      return;
    }
    if ("credit" === paymentMethod && !customerId) {
      setError("A credit sale must have a customer attached.");
      return;
    }
    setError(null);
    setSaleSucceeded(false);
    setCreatedSaleId(null);
    setCreateConfirmOpen(true);
  }

  function submit() {
    const cleanItems = lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({
        productId: line.productId,
        variantId: line.variantId ?? undefined,
        quantity: line.quantity,
        unitPrice: isOverridden(line) ? effectiveUnitPrice(line) : undefined,
        addons: line.addons?.map((addon) => ({ addonGroupItemId: addon.addonGroupItemId, quantity: addon.quantity })),
      }));

    if (cleanItems.length === 0) {
      setError("Add at least one product with a quantity.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const sale = await createSaleAction({
          items: cleanItems,
          paymentMethod,
          customerId: customerId || undefined,
          fulfillment,
          ewalletProvider: effectiveEwalletProvider,
          discounts: orderDiscounts.map((entry) => ({
            discountRuleId: entry.discountRuleId,
            complexDiscountRuleId: entry.complexDiscountRuleId,
            loyaltyRewardId: entry.loyaltyRewardId,
            idNumber: entry.idNumber,
            idHolderName: entry.idHolderName,
            discountAmount: entry.discountAmount,
            vatRemoved: entry.vatRemoved,
            isVatExempt: entry.isVatExempt,
          })),
        });
        setCreatedSaleId(sale.id);
        setSaleSucceeded(true);
      } catch (cause) {
        setCreateConfirmOpen(false);
        setError(cause instanceof Error ? cause.message : "Could not create this sale.");
      }
    });
  }

  function startNewSale() {
    setCreateConfirmOpen(false);
    setSaleSucceeded(false);
    setCreatedSaleId(null);
    resetForm();
    toast.success("Sale created.");
  }

  function viewCreatedSale() {
    if (createdSaleId) router.push(`/sales/${createdSaleId}` as Route);
  }

  function resetForm() {
    setLines([]);
    setPriceDrafts({});
    setOrderDiscounts([]);
    setPaymentMethod("cash");
    setEwalletProvider(null);
    setEwalletProviderOther("");
    setCustomerId("");
    setFulfillment("pickup");
    setError(null);
    clearAiSearch();
    applyManualSearch("");
  }

  function saveDraft() {
    const withQuantity = lines.filter((line) => line.quantity > 0);
    if (withQuantity.length === 0) {
      setError("Add at least one product before saving as draft.");
      return;
    }

    const items: SaleDraftItem[] = withQuantity.map((line) => ({
      key: lineKey(line),
      product: byId.get(line.productId) ?? null,
      quantity: String(line.quantity),
      unitPrice: priceDrafts[lineKey(line)] ?? "",
      variantId: line.variantId ?? null,
      variantLabel: line.variantLabel ?? null,
      naturalPrice: line.naturalPrice ?? null,
      unitCost: line.variantId ? line.unitCost : null,
      availableStock: line.variantId ? line.availableStock : null,
      addons: line.addons ?? [],
    }));
    saveSaleDraft({ items, paymentMethod, customerId, fulfillment });
    setDrafts(listSaleDrafts());
    resetForm();
    toast.success("Sale held as draft. Load it later from Drafts.");
  }

  function loadDraft(draft: SaleDraft) {
    const nextLines: CartLine[] = [];
    const nextDrafts: Record<string, string> = {};
    const nextHeld = new Map(heldProducts);

    for (const item of draft.items) {
      if (!item.product) continue;
      const product = item.product;
      nextHeld.set(product.id, product);
      const quantity = Number(item.quantity) || 0;
      if (quantity <= 0) continue;

      if (item.variantId) {
        const naturalPrice = item.naturalPrice ?? product.price;
        nextLines.push({
          productId: product.id,
          variantId: item.variantId,
          variantLabel: item.variantLabel,
          productName: product.name,
          unitPrice: naturalPrice,
          listPrice: naturalPrice,
          naturalPrice,
          unitCost: item.unitCost ?? product.costPrice,
          unit: product.unit,
          allowDecimal: product.allowDecimal,
          quantity,
          availableStock: item.availableStock ?? stockCapFor(product.stockQuantity, product.allowDecimal),
          categoryId: product.categoryId ?? null,
          addons: item.addons,
        });
      } else {
        nextLines.push({
          productId: product.id,
          productName: product.name,
          unitPrice: priceForQuantity(product, quantity),
          listPrice: product.price,
          unitCost: product.costPrice,
          unit: product.unit,
          allowDecimal: product.allowDecimal,
          quantity,
          availableStock: stockCapFor(product.stockQuantity, product.allowDecimal),
        });
      }
      if (item.unitPrice.trim()) nextDrafts[lineKey({ productId: product.id, variantId: item.variantId })] = item.unitPrice;
    }

    setHeldProducts(nextHeld);
    setLines(nextLines);
    setPriceDrafts(nextDrafts);
    setPaymentMethod(draft.paymentMethod as PaymentMethod);
    setCustomerId(draft.customerId);
    setFulfillment(draft.fulfillment);
    deleteSaleDraft(draft.id);
    setDrafts(listSaleDrafts());
    setDraftsOpen(false);
    setError(null);
  }

  function removeDraft(id: string) {
    deleteSaleDraft(id);
    setDrafts(listSaleDrafts());
  }

  const content = (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      {/* Grid + search — left column on desktop, on top on narrow widths. Scrolls on its own; the cart column never moves with it. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Card className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex shrink-0 items-center gap-2">
              <h1 className="text-heading-md font-semibold text-ink">New sale</h1>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={expandOpen ? Minimize2 : Maximize2}
                aria-label={expandOpen ? "Exit full-page view" : "Expand to a full-page, distraction-free view"}
                onClick={() => setExpandOpen((current) => !current)}
              />
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:justify-end">
              <Input
                icon={Search}
                value={search}
                onChange={(event) => applyManualSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submitSearchEnter();
                }}
                placeholder="Search by name or SKU, or scan a barcode"
                autoComplete="off"
                className="min-w-0 flex-1 sm:max-w-xs"
              />
              <div className="w-40">
                <Combobox
                  value={categoryId}
                  onChange={(next) => {
                    clearAiSearch();
                    setCategoryId(next);
                  }}
                  placeholder="All categories"
                  options={[
                    { value: "", label: "All categories" },
                    ...categories.map((category) => ({ value: category.id, label: category.name })),
                  ]}
                />
              </div>
              <div className="flex items-center rounded-sm border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setGridViewMode("product")}
                  className={`rounded-sm px-2.5 py-1 text-caption font-medium transition-colors ${
                    "product" === gridViewMode ? "bg-primary text-on-primary" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  Product
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearAiSearch();
                    setGridViewMode("variant");
                  }}
                  className={`rounded-sm px-2.5 py-1 text-caption font-medium transition-colors ${
                    "variant" === gridViewMode ? "bg-primary text-on-primary" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  By variant
                </button>
              </div>
              {isEnabled("voice_search") && voiceSupported ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={Mic}
                  aria-label="Search by voice"
                  onClick={() => setVoiceSearchOpen(true)}
                />
              ) : null}
              {"product" === gridViewMode && isEnabled("product_photo_ai") ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={Camera}
                  aria-label="Add items from a photo"
                  onClick={() => setPhotoModalOpen(true)}
                />
              ) : null}
              {"product" === gridViewMode && isEnabled("product_vector_search") ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={Sparkles}
                  aria-label="Smart search with AI"
                  onClick={() => setAiSearchOpen(true)}
                />
              ) : null}
            </div>
          </div>

          {"product" === gridViewMode && aiResultIds ? (
            <div className="flex items-center gap-2 border-b border-border bg-primary-tint px-4 py-2.5 sm:px-6">
              <Sparkles size={15} className="text-primary" strokeWidth={2} />
              <span className="flex-1 text-body font-medium text-primary-dark">
                Smart search: &ldquo;{aiResultLabel}&rdquo; ({aiResultIds.length})
              </span>
              <button
                type="button"
                onClick={clearAiSearch}
                aria-label="Clear smart search"
                className="text-primary-dark hover:opacity-70"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {"variant" === gridViewMode ? (
              gridLoading && displayedVariants.length === 0 ? (
                <div className="py-12 text-center text-body text-ink-muted">Loading variants…</div>
              ) : displayedVariants.length === 0 ? (
                <EmptyState
                  icon={PackageSearch}
                  title="Nothing matches that"
                  instruction="Check the spelling, or switch back to Product view."
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {displayedVariants.map((row) => (
                      <ProductVariantGridTile
                        key={row.id}
                        row={row}
                        quantityInCart={
                          lines.find((line) => line.productId === row.productId && line.variantId === row.id)
                            ?.quantity ?? 0
                        }
                        onAdd={() => void addVariantToCart(row)}
                        onRemove={() => changeQuantity(row.productId, -1, row.id)}
                      />
                    ))}
                  </div>

                  {pageCount > 1 ? (
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={ChevronLeft}
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      />
                      <span className="text-caption text-ink-muted">
                        Page {page} of {pageCount}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={ChevronRight}
                        disabled={page >= pageCount}
                        onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                        aria-label="Next page"
                      />
                    </div>
                  ) : null}
                </>
              )
            ) : gridLoading && displayedProducts.length === 0 ? (
              <div className="py-12 text-center text-body text-ink-muted">Loading products…</div>
            ) : displayedProducts.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="Nothing matches that"
                instruction="Check the spelling, or try a smart search for a rough description."
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {displayedProducts.map((product) => {
                    // A product can have more than one cart line now (a
                    // different variant picked each time) — the tile badge
                    // sums all of them, same as mobile's own inCart map;
                    // its quick decrement just targets whichever line was
                    // added first.
                    const productLines = lines.filter((line) => line.productId === product.id);
                    const quantityInCart = productLines.reduce((sum, line) => sum + line.quantity, 0);
                    return (
                      <ProductGridTile
                        key={product.id}
                        product={product}
                        quantityInCart={quantityInCart}
                        onAdd={() => void addToCart(product)}
                        onRemove={() => changeQuantity(product.id, -1, productLines[0]?.variantId)}
                      />
                    );
                  })}
                </div>

                {!aiResultIds && pageCount > 1 ? (
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={ChevronLeft}
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    />
                    <span className="text-caption text-ink-muted">
                      Page {page} of {pageCount}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={ChevronRight}
                      disabled={page >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      aria-label="Next page"
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Cart — right column on desktop, pinned full-height and never scrolls with the product grid. Stacked below on narrow widths. */}
      <div className="flex min-h-0 w-full flex-col gap-4 lg:h-full lg:w-[420px] lg:shrink-0">
        <Card className="flex min-h-0 flex-1 flex-col">
          <CardHeader
            icon={ShoppingCart}
            title="Cart"
            description={itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : "Click a product to add it"}
            action={
              lines.length > 0 || drafts.length > 0 ? (
                <div className="flex items-center gap-2">
                  {lines.length > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={Save}
                      onClick={saveDraft}
                    >
                      Save as draft
                    </Button>
                  ) : null}
                  {drafts.length > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={FolderOpen}
                      onClick={() => setDraftsOpen(true)}
                    >
                      Drafts <Badge tone="neutral">{drafts.length}</Badge>
                    </Button>
                  ) : null}
                </div>
              ) : undefined
            }
          />

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
            {lines.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                title="Nothing in the cart"
                instruction="Click a product on the left to start a sale."
              />
            ) : (
              pricedLines.map((line) => {
                const quantity = line.quantity;
                const belowCost = line.unitPrice < line.unitCost;
                const lineDiscount = roundMoney(
                  Math.max(line.listPrice - line.unitPrice, 0) * quantity,
                );
                const overridden = isOverridden(line);

                return (
                  <div
                    key={lineKey(line)}
                    className="rounded-sm border border-border bg-paper p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-body font-semibold text-ink">{line.productName}</p>
                        {line.variantLabel ? (
                          <p className="truncate text-caption text-ink-muted">{line.variantLabel}</p>
                        ) : null}
                        {line.addons && line.addons.length > 0 ? (
                          <p className="truncate text-caption text-ink-muted">
                            + {line.addons.map((addon) => addon.name).join(", ")}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        aria-label={`Remove ${line.productName} from cart`}
                        onClick={() => removeLine(line.productId, line.variantId)}
                      />
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Field label="Quantity" required={false}>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            aria-label={`One less ${line.productName}`}
                            onClick={() => changeQuantity(line.productId, -1, line.variantId)}
                          >
                            −
                          </Button>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={line.allowDecimal ? "0.001" : "1"}
                            value={quantity}
                            onChange={(event) => updateQuantity(line.productId, event.target.value, line.variantId)}
                            className="num text-center"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            aria-label={`One more ${line.productName}`}
                            onClick={() => changeQuantity(line.productId, 1, line.variantId)}
                          >
                            +
                          </Button>
                        </div>
                      </Field>
                      <Field
                        label="Unit price"
                        hint={`Shelf ${formatMoney(line.listPrice)}`}
                        required={false}
                      >
                        <MoneyInput
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          placeholder={String(line.listPrice)}
                          value={priceDrafts[lineKey(line)] ?? ""}
                          onChange={(event) => updatePriceDraft(line.productId, event.target.value, line.variantId)}
                        />
                      </Field>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
                      <span className="flex items-center gap-2">
                        Margin{" "}
                        <span className={`num font-semibold ${belowCost ? "text-danger" : "text-ink"}`}>
                          {formatPercent(marginPercent(line.unitPrice, line.unitCost))}
                        </span>
                        · {formatMoney(lineProfit(line.unitPrice, line.unitCost, quantity))} profit
                        {overridden ? (
                          <button
                            type="button"
                            className="text-primary underline decoration-dotted"
                            onClick={() => resetLinePrice(line.productId, line.variantId)}
                          >
                            Reset to shelf price
                          </button>
                        ) : null}
                      </span>
                      {lineDiscount > 0 ? (
                        <span className="num font-medium text-warning-ink">
                          -{formatMoney(lineDiscount)}
                        </span>
                      ) : null}
                    </div>

                    {belowCost ? (
                      <p className="mt-2 flex items-start gap-2 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-caption text-danger">
                        <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                        Below the {formatMoney(line.unitCost)} this cost us. Still sellable at
                        this price — it goes on the discount report.
                      </p>
                    ) : null}

                    <p className="mt-2 text-right text-body font-semibold text-ink">
                      {formatMoney(lineSubtotal(line.unitPrice, quantity))}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-4 border-t border-border px-4 py-4 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Payment method" required>
                <Combobox
                  value={paymentMethod}
                  onChange={(next) => {
                    setPaymentMethod(next as PaymentMethod);
                    if ("ewallet" !== next) {
                      setEwalletProvider(null);
                      setEwalletProviderOther("");
                    }
                  }}
                  options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
                />
                {"ewallet" === paymentMethod ? (
                  <div className="mt-2 space-y-2">
                    <Combobox
                      value={ewalletProvider ?? ""}
                      onChange={(next) => setEwalletProvider(next || null)}
                      placeholder="Which e-wallet?"
                      options={[
                        ...EWALLET_PROVIDERS.map((name) => ({ value: name, label: name })),
                        { value: "Other", label: "Other e-wallet" },
                      ]}
                    />
                    {"Other" === ewalletProvider ? (
                      <Input
                        value={ewalletProviderOther}
                        onChange={(event) => setEwalletProviderOther(event.target.value)}
                        placeholder="Name the e-wallet"
                      />
                    ) : null}
                  </div>
                ) : null}
              </Field>
              <Field label="Fulfillment" required>
                <Combobox
                  value={fulfillment}
                  onChange={(next) => setFulfillment(next as "pickup" | "delivery")}
                  options={[
                    { value: "pickup", label: "Pickup" },
                    { value: "delivery", label: "Delivery" },
                  ]}
                />
              </Field>
            </div>

            <Field
              label="Customer"
              hint={
                "credit" === paymentMethod
                  ? "Required for a credit sale."
                  : "Optional — a walk-in needs nothing here."
              }
              required={"credit" === paymentMethod}
            >
              <Combobox
                value={customerId}
                onChange={(next) => setCustomerId(next)}
                placeholder="Walk-in"
                options={[
                  { value: "", label: "Walk-in" },
                  ...customers.map((customer: Customer) => ({
                    value: customer.id,
                    label: customer.name,
                  })),
                ]}
              />
            </Field>

            <div className="space-y-2 rounded-sm bg-primary-tint px-3 py-3">
              {discount > 0 ? (
                <div className="flex items-baseline justify-between text-body text-ink-muted">
                  <span>Subtotal</span>
                  <Money value={shelfTotal} />
                </div>
              ) : null}

              {lines.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setDiscountRulesOpen(true)}
                      className="flex items-center gap-1.5 text-body text-primary-dark underline decoration-dotted"
                    >
                      <Tag size={14} strokeWidth={2.5} />
                      {discount > 0 ? "Discount applied" : "Add a discount"}
                      <Pencil size={11} />
                    </button>
                    <span className="flex items-center gap-2">
                      {qualifyingComplex.length > 0 ? (
                        <Badge tone="warning">{qualifyingComplex.length} promo qualifies</Badge>
                      ) : null}
                      {discount > 0 ? (
                        <span className="num text-body-lg font-semibold text-warning-ink">
                          -{formatMoney(discount)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {orderDiscounts.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {orderDiscounts.map((entry) => (
                        <span
                          key={entry.id}
                          className="inline-flex items-center gap-1.5 rounded-sm border border-warning/40 bg-warning/10 px-2 py-1 text-caption text-warning-ink"
                        >
                          {entry.name ?? "Discount"} · -{formatMoney(entry.discountAmount + (entry.vatRemoved ?? 0))}
                          <button
                            type="button"
                            onClick={() => removeOrderDiscount(entry.id)}
                            aria-label={`Remove ${entry.name ?? "discount"}`}
                            className="text-warning-ink/70 hover:text-warning-ink"
                          >
                            <X size={11} strokeWidth={2.5} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-baseline justify-between">
                <span className="text-body font-medium tracking-wide text-primary-dark uppercase">
                  Total
                </span>
                <Money value={total} className="text-heading-md font-semibold text-primary-dark" />
              </div>
            </div>

            {error ? <ErrorNote>{error}</ErrorNote> : null}

            {!expandOpen ? (
              <>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    icon={X}
                    className="w-full sm:flex-1"
                    onClick={() => router.push("/sales")}
                  >
                    Cancel
                  </Button>
                  <Button
                    icon={CheckCircle2}
                    loading={pending}
                    onClick={requestSubmit}
                    className="w-full sm:flex-1"
                  >
                    {pending ? "Creating..." : "Create sale"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </Card>
      </div>

      <SaleReviewDialog
        open={createConfirmOpen}
        succeeded={saleSucceeded}
        pending={pending}
        shelfTotal={shelfTotal}
        discount={discount}
        amountDue={total}
        itemCount={itemCount}
        paymentMethod={paymentMethod}
        ewalletProvider={effectiveEwalletProvider}
        fulfillment={fulfillment}
        customerName={customers.find((customer) => customer.id === customerId)?.name ?? null}
        customerContact={customers.find((customer) => customer.id === customerId)?.contact ?? null}
        customerAddress={customers.find((customer) => customer.id === customerId)?.address ?? null}
        onClose={() => setCreateConfirmOpen(false)}
        onConfirm={submit}
        onViewSale={viewCreatedSale}
        onNewSale={startNewSale}
        showAwardPointsButton={showAwardPointsButton}
        awardPointsPending={awardLoyaltyPoints.isPending}
        onAwardPoints={() => {
          if (!createdSaleId) return;
          awardLoyaltyPoints.mutate(createdSaleId, {
            onSuccess: ({ points }) => toast.success(`Awarded ${points} loyalty point${1 === points ? "" : "s"}.`),
            onError: (error) =>
              toast.error(error instanceof Error ? error.message : "Could not award points."),
          });
        }}
      />

      <DiscountRulesDialog
        open={discountRulesOpen}
        onClose={() => setDiscountRulesOpen(false)}
        simpleRules={qualifyingSimple}
        loyaltyMatches={qualifyingLoyalty}
        complexRules={qualifyingComplex}
        applied={orderDiscounts}
        lines={lines}
        tax={taxSettings}
        onApply={addOrderDiscount}
        onRemove={removeOrderDiscount}
        total={total}
        lineDiscount={lineDiscount}
        discountDraft={discountDraft}
        onDiscountDraftChange={setDiscountDraft}
        onApplyWholeDiscount={() => applyGlobalDiscount(Number(discountDraft))}
        onClearWholeDiscount={clearAllDiscounts}
      />

      <Dialog
        open={draftsOpen}
        onClose={() => setDraftsOpen(false)}
        title="Held drafts"
        description="Saved on this browser only — never synced. Loading a draft removes it from this list."
      >
        {drafts.length === 0 ? (
          <p className="text-body text-ink-muted">No drafts held.</p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((draft) => {
              const count = draft.items.filter((item) => item.product).length;
              return (
                <li
                  key={draft.id}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border bg-paper px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-ink">
                      {count} item{count === 1 ? "" : "s"}
                    </p>
                    <p className="text-caption text-ink-muted">
                      {new Date(draft.savedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="sm" onClick={() => loadDraft(draft)}>
                      Load
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={X}
                      aria-label="Delete draft"
                      onClick={() => removeDraft(draft.id)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>

      <ConfirmDialog
        open={outOfStockConfirm !== null}
        onClose={() => setOutOfStockConfirm(null)}
        onConfirm={() => {
          if (outOfStockConfirm) commitAddToCart(outOfStockConfirm.product, outOfStockConfirm.selection);
          setOutOfStockConfirm(null);
        }}
        title="Out of stock"
        description={
          outOfStockConfirm
            ? `${outOfStockConfirm.product.name}${
                outOfStockConfirm.selection ? ` (${variantLabel(outOfStockConfirm.selection.variant)})` : ""
              } shows none on hand. Sell it anyway? New stock added later settles this automatically.`
            : ""
        }
        confirmLabel="Sell anyway"
        confirmIcon={CheckCircle2}
      />

      <SaleVariantAddonPicker
        open={pickerState !== null}
        productName={pickerState?.product.name ?? ""}
        productBrandName={pickerState?.product.brandName ?? null}
        variants={pickerState?.variants ?? []}
        addonGroups={pickerState?.addonGroups ?? []}
        onCancel={() => setPickerState(null)}
        onConfirm={onPickerConfirm}
      />

      <AiSearchModal
        open={aiSearchOpen}
        onClose={() => setAiSearchOpen(false)}
        onResult={(productIds, label) => {
          applyManualSearch("");
          setCategoryId("");
          setAiResultIds(productIds);
          setAiResultLabel(label);
        }}
      />

      <VoiceSearchModal
        open={voiceSearchOpen}
        onClose={() => setVoiceSearchOpen(false)}
        onResult={applyManualSearch}
      />

      <Dialog
        open={photoModalOpen}
        onClose={closePhotoModal}
        title="Add items from a photo"
        description="A customer's order list or notebook photo — matched products go straight into the cart with the quantities read from it."
        className="!max-w-2xl !max-h-[min(92vh,900px)]"
      >
        <div className="space-y-4">
          <Field
            label="Photo"
            hint="Phone camera or an existing picture. This never changes stock — only the cart."
          >
            <FileInput
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && !isImageFile(file)) {
                  setPhotoError(NOT_AN_IMAGE_MESSAGE);
                  event.target.value = "";
                  return;
                }
                onPhotoPicked(file);
              }}
            />
          </Field>

          {photoPreviewUrl && photoShowCropper ? (
            <CropPhoto
              src={photoPreviewUrl}
              onCropped={onPhotoCropped}
              onCancel={() => setPhotoShowCropper(false)}
            />
          ) : photoPreviewUrl ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-sm border border-border bg-paper">
                <img
                  src={photoPreviewUrl}
                  alt="Selected photo"
                  className="max-h-96 w-full object-contain"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Crop}
                disabled={photoReading}
                onClick={() => setPhotoShowCropper(true)}
              >
                Crop this photo
              </Button>
            </div>
          ) : null}

          {photoError ? <ErrorNote>{photoError}</ErrorNote> : null}
          <Button
            type="button"
            icon={Camera}
            loading={photoReading}
            disabled={!photoFile || photoShowCropper}
            onClick={() => void runPhotoExtract()}
            className="w-full"
          >
            {photoReading ? "Reading…" : "Read photo & add to cart"}
          </Button>
        </div>
      </Dialog>

      <AiProcessingOverlay
        open={photoReading}
        message="AI is reading your photo"
        hint={visionProcessingHint(currentUser?.isDemo ?? false)}
      />
    </div>
  );

  return (
    <>
      <div className={expandOpen ? "hidden" : "lg:h-[calc(100vh-8rem)]"}>{content}</div>
      <Sheet
        open={expandOpen}
        onClose={() => setExpandOpen(false)}
        title="New sale — full view"
        className="w-full max-w-none"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              icon={X}
              onClick={() => router.push("/sales")}
            >
              Cancel
            </Button>
            <Button icon={CheckCircle2} loading={pending} onClick={requestSubmit}>
              {pending ? "Creating..." : "Create sale"}
            </Button>
          </div>
        }
      >
        {content}
      </Sheet>
    </>
  );
}
