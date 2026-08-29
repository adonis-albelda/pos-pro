"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Mic,
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
import type { CartLine, Customer, Product } from "@double-a/shared-types";
import {
  cartDiscount,
  cartTotal,
  formatMoney,
  formatPercent,
  lineProfit,
  lineSubtotal,
  marginPercent,
  priceForQuantity,
  QUANTITY_DECIMALS,
  roundMoney,
} from "@double-a/shared-types";
import { listProductsByIds, listProductsPage } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Combobox,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Money,
  MoneyInput,
} from "@/components/ui";
import { toast } from "sonner";
import { ConfirmDialog, Dialog } from "@/components/overlay";
import { AiSearchModal } from "@/components/ai-search-modal";
import { ProductGridTile } from "@/components/product-grid-tile";
import { VoiceSearchModal, voiceSearchSupported } from "@/components/voice-search-modal";
import { useCategories } from "@/lib/query/categories";
import { useCustomers } from "@/lib/query/customers";
import { useFeatureFlags } from "@/lib/query/features";
import { useProducts } from "@/lib/query/products";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import {
  deleteSaleDraft,
  listSaleDrafts,
  saveSaleDraft,
  type SaleDraft,
  type SaleDraftItem,
} from "@/lib/sale-drafts";
import { createSaleAction } from "./actions";

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "card", label: "Card" },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

// A backordered line has no real ceiling — the sale is confirmed with nothing
// on the shelf, so there's nothing left to cap against (mirrors mobile POS).
const BACKORDER_CAP = 9999;

function stockCapFor(stock: number, allowDecimal: boolean): number {
  if (stock <= 0) return BACKORDER_CAP;
  return allowDecimal ? Number(stock.toFixed(QUANTITY_DECIMALS)) : Math.floor(stock);
}

const GRID_PAGE_SIZE = 24;

export function CreateSaleForm() {
  const router = useRouter();
  const customersQuery = useCustomers();
  const categoriesQuery = useCategories();
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
  // Every product this session has ever added to the cart — CartLine itself
  // doesn't carry bulk-price/cost fields, so repricing and drafts need the
  // full Product back even after it's paged or filtered out of the grid.
  const [heldProducts, setHeldProducts] = useState<Map<string, Product>>(new Map());

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);

  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [aiResultIds, setAiResultIds] = useState<string[] | null>(null);
  const [aiResultLabel, setAiResultLabel] = useState("");
  const [aiProducts, setAiProducts] = useState<Product[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const [voiceSearchOpen, setVoiceSearchOpen] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const [outOfStockConfirm, setOutOfStockConfirm] = useState<Product | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerId, setCustomerId] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [drafts, setDrafts] = useState<SaleDraft[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);

  const [discountOpen, setDiscountOpen] = useState(false);
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
  }, [query, categoryId]);

  // Clear the typed amount each time the dialog opens — no per-line id to key
  // it on, so a re-open must never show the last discount typed.
  useEffect(() => {
    if (discountOpen) setDiscountDraft("");
  }, [discountOpen]);

  const customers = customersQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const productsQuery = useProducts({
    q: query || undefined,
    categoryId: categoryId || undefined,
    page,
    pageSize: GRID_PAGE_SIZE,
  });

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
  const gridLoading = aiResultIds ? aiLoading : productsQuery.isLoading;
  const pageCount = aiResultIds ? 1 : (productsQuery.data?.pageCount ?? 1);

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

  function isOverridden(productId: string): boolean {
    return Boolean(priceDrafts[productId]?.trim());
  }

  function effectiveUnitPrice(line: CartLine): number {
    const draft = priceDrafts[line.productId]?.trim();
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

  const total = cartTotal(pricedLines);
  const shelfTotal = roundMoney(
    lines.reduce((sum, line) => sum + line.listPrice * line.quantity, 0),
  );
  const discount = cartDiscount(pricedLines);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  function clearAiSearch() {
    setAiResultIds(null);
    setAiResultLabel("");
  }

  function applyManualSearch(text: string) {
    if (aiResultIds) clearAiSearch();
    setSearch(text);
  }

  function repricedFor(line: CartLine, quantity: number, product?: Product): CartLine {
    const p = product ?? byId.get(line.productId);
    if (!p || isOverridden(line.productId)) return { ...line, quantity };
    return { ...line, quantity, unitPrice: priceForQuantity(p, quantity) };
  }

  function commitAddToCart(product: Product) {
    rememberProducts([product]);
    const cap = stockCapFor(product.stockQuantity, product.allowDecimal);

    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        if (existing.quantity >= cap) return current;
        return current.map((line) =>
          line.productId === product.id
            ? repricedFor(line, Math.min(line.quantity + 1, cap), product)
            : line,
        );
      }

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
        },
      ];
    });
  }

  /** No confirmation for a normal add — the one exception is the first tap on a zero-stock product, a backorder decision. */
  function addToCart(product: Product) {
    const alreadyInCart = lines.some((line) => line.productId === product.id);
    if (product.stockQuantity <= 0 && !alreadyInCart) {
      setOutOfStockConfirm(product);
      return;
    }
    commitAddToCart(product);
  }

  function changeQuantity(productId: string, delta: number) {
    setLines((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          const cap = stockCapFor(line.availableStock, line.allowDecimal);
          const next = line.quantity + delta;
          if (delta > 0 && next > cap) return line;
          return repricedFor(line, next);
        })
        .filter((line) => line.quantity > 0),
    );
  }

  /** Typed quantity — never auto-removes the line; use the remove button for that. */
  function updateQuantity(productId: string, raw: string) {
    setLines((current) =>
      current.map((line) => {
        if (line.productId !== productId) return line;
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

  function removeLine(productId: string) {
    setLines((current) => current.filter((line) => line.productId !== productId));
    setPriceDrafts(({ [productId]: _drop, ...rest }) => rest);
  }

  function updatePriceDraft(productId: string, raw: string) {
    setPriceDrafts((current) => ({ ...current, [productId]: raw }));
    if (raw.trim() === "") {
      setLines((current) =>
        current.map((line) => {
          if (line.productId !== productId) return line;
          const product = byId.get(productId);
          return product ? { ...line, unitPrice: priceForQuantity(product, line.quantity) } : line;
        }),
      );
    }
  }

  function resetLinePrice(productId: string) {
    setPriceDrafts(({ [productId]: _drop, ...rest }) => rest);
    setLines((current) =>
      current.map((line) => {
        const product = byId.get(productId);
        if (line.productId !== productId || !product) return line;
        return { ...line, unitPrice: priceForQuantity(product, line.quantity) };
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
        next[line.productId] = String(nextPrice);
      }
      return next;
    });
    setDiscountOpen(false);
    setDiscountDraft("");
  }

  function clearAllDiscounts() {
    setPriceDrafts({});
    setLines((current) =>
      current.map((line) => {
        const product = byId.get(line.productId);
        return product ? { ...line, unitPrice: priceForQuantity(product, line.quantity) } : line;
      }),
    );
    setDiscountOpen(false);
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
      addToCart(top);
      applyManualSearch("");
    }
  }

  function submit() {
    const cleanItems = lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: isOverridden(line.productId) ? effectiveUnitPrice(line) : undefined,
      }));

    if (cleanItems.length === 0) {
      setError("Add at least one product with a quantity.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createSaleAction({
          items: cleanItems,
          paymentMethod,
          customerId: customerId || undefined,
          fulfillment,
        });
        router.push(`/sales/${id}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not create this sale.");
      }
    });
  }

  function resetForm() {
    setLines([]);
    setPriceDrafts({});
    setPaymentMethod("cash");
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
      key: line.productId,
      product: byId.get(line.productId) ?? null,
      quantity: String(line.quantity),
      unitPrice: priceDrafts[line.productId] ?? "",
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
      if (item.unitPrice.trim()) nextDrafts[product.id] = item.unitPrice;
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

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-8rem)] lg:flex-row">
      {/* Grid + search — left column on desktop, on top on narrow widths. Scrolls on its own; the cart column never moves with it. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Card className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 shrink-0">
              <h1 className="text-heading-md font-semibold text-ink">New sale</h1>
              <p className="mt-1 text-caption text-ink-muted">
                Rung up in the office — not from a POS terminal.
              </p>
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
              {isEnabled("voice_search") && voiceSupported ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon={Mic}
                  aria-label="Search by voice"
                  onClick={() => setVoiceSearchOpen(true)}
                />
              ) : null}
              {isEnabled("product_vector_search") ? (
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

          {aiResultIds ? (
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
            {gridLoading && displayedProducts.length === 0 ? (
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
                  {displayedProducts.map((product) => (
                    <ProductGridTile
                      key={product.id}
                      product={product}
                      quantityInCart={lines.find((line) => line.productId === product.id)?.quantity ?? 0}
                      onAdd={() => addToCart(product)}
                      onRemove={() => changeQuantity(product.id, -1)}
                    />
                  ))}
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
              drafts.length > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={FolderOpen}
                  onClick={() => setDraftsOpen(true)}
                >
                  Drafts <Badge tone="neutral">{drafts.length}</Badge>
                </Button>
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
                const overridden = isOverridden(line.productId);

                return (
                  <div
                    key={line.productId}
                    className="rounded-sm border border-border bg-paper p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-body font-semibold text-ink">
                        {line.productName}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        aria-label={`Remove ${line.productName} from cart`}
                        onClick={() => removeLine(line.productId)}
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
                            onClick={() => changeQuantity(line.productId, -1)}
                          >
                            −
                          </Button>
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={line.allowDecimal ? "0.001" : "1"}
                            value={quantity}
                            onChange={(event) => updateQuantity(line.productId, event.target.value)}
                            className="num text-center"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            aria-label={`One more ${line.productName}`}
                            onClick={() => changeQuantity(line.productId, 1)}
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
                          value={priceDrafts[line.productId] ?? ""}
                          onChange={(event) => updatePriceDraft(line.productId, event.target.value)}
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
                            onClick={() => resetLinePrice(line.productId)}
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
                  onChange={(next) => setPaymentMethod(next as PaymentMethod)}
                  options={PAYMENT_METHODS.map((method) => ({ value: method.value, label: method.label }))}
                />
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

            <Field label="Customer" hint="Optional — a walk-in needs nothing here." required={false}>
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
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscountOpen(true)}
                    className="flex items-center gap-1.5 text-body text-primary-dark underline decoration-dotted"
                  >
                    <Tag size={14} strokeWidth={2.5} />
                    {discount > 0 ? "Discount given" : "Add a discount for the whole cart"}
                    <Pencil size={11} />
                  </button>
                  {discount > 0 ? (
                    <span className="num text-body-lg font-semibold text-warning-ink">
                      -{formatMoney(discount)}
                    </span>
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

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                icon={Save}
                className="w-full sm:w-auto"
                onClick={saveDraft}
              >
                Save as draft
              </Button>
              <Button
                icon={CheckCircle2}
                loading={pending}
                onClick={submit}
                className="w-full sm:w-auto"
              >
                {pending ? "Creating..." : "Create sale"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Dialog
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        title="Discount the whole cart"
        description="Split across every line by its share of the total, so it still shows per item on the receipt."
      >
        <div className="space-y-4">
          <Field label="Discount amount" required={false}>
            <MoneyInput
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              autoFocus
              placeholder="0.00"
              value={discountDraft}
              onChange={(event) => setDiscountDraft(event.target.value)}
            />
          </Field>

          {Number(discountDraft) > total ? (
            <p className="text-caption text-ink-muted">
              Capped at {formatMoney(total)} — the cart&rsquo;s current total.
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              icon={CheckCircle2}
              disabled={!(Number(discountDraft) > 0)}
              onClick={() => applyGlobalDiscount(Number(discountDraft))}
            >
              Apply discount
            </Button>
            {discount > 0 ? (
              <Button type="button" variant="secondary" onClick={clearAllDiscounts}>
                Clear all discounts
              </Button>
            ) : null}
          </div>
        </div>
      </Dialog>

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
          if (outOfStockConfirm) commitAddToCart(outOfStockConfirm);
          setOutOfStockConfirm(null);
        }}
        title="Out of stock"
        description={
          outOfStockConfirm
            ? `${outOfStockConfirm.name} shows none on hand. Sell it anyway? New stock added later settles this automatically.`
            : ""
        }
        confirmLabel="Sell anyway"
        confirmIcon={CheckCircle2}
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
    </div>
  );
}
