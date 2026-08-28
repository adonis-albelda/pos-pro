"use client";

import { useSearchParams } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  History,
  PackageSearch,
  Scale,
  TriangleAlert,
  Warehouse,
} from "lucide-react";
import { formatMoney } from "@double-a/shared-types";
import { DEFAULT_PAGE_SIZE, isInitialQueryLoad } from "@/lib/list-query";
import { toCategoryOptions } from "@/lib/category-options";
import { resolveDayWindow } from "@/lib/date-range";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { TabNav } from "@/components/tab-nav";
import { isReason } from "@/lib/inventory-reasons";
import { useCategories } from "@/lib/query/categories";
import { useProducts, useProductStats } from "@/lib/query/products";
import {
  useInventoryMovements,
  useMovementTotals,
  useProductIdsMatching,
} from "@/lib/query/inventory";
import { MovementsPanel } from "./movements-panel";
import { StockPanel } from "./stock-panel";
import {
  isStockSort,
  isStockState,
  MOVEMENTS_PAGE_SIZE,
  type StockSort,
  type StockState,
} from "./view-options";
import { useLocationFilter } from "@/components/location-filter-provider";

interface InventorySearchParams {
  tab?: string;
  q?: string;
  page?: string;
  product?: string;
  state?: string;
  category?: string;
  sort?: string;
  reason?: string;
  from?: string;
  to?: string;
}

/** Filters live in the URL, so every href a panel renders keeps the rest of them. */
function buildHref(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/inventory?${query}` : "/inventory";
}

export default function InventoryPage() {
  const searchParams = useSearchParams();
  const { locationId } = useLocationFilter();
  const params: InventorySearchParams = {
    tab: searchParams.get("tab") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    product: searchParams.get("product") ?? undefined,
    state: searchParams.get("state") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
    reason: searchParams.get("reason") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  const tab = params.tab === "movements" ? "movements" : "stock";
  const q = (params.q ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const focusedProduct = params.product;
  const state: StockState = isStockState(params.state) ? params.state : "all";
  const sort: StockSort = isStockSort(params.sort) ? params.sort : "name";
  const reason = isReason(params.reason) ? params.reason : undefined;
  const dayWindow = resolveDayWindow(params);
  const isMovementsTab = tab === "movements";

  // Whole-shop figures (header stat cards, tab counts) — one aggregate query,
  // not a walk of the entire catalogue. Independent of whatever the Stock on
  // hand table's own filters/page happen to be.
  const statsQuery = useProductStats();
  const categoriesQuery = useCategories({ includeInactive: true });

  // Stock on hand tab only, but hooks stay unconditional — gated with
  // `enabled` instead of a conditional call. Filtering/sorting/pagination
  // all happen server-side now (IndexProductsController) — this fetches
  // exactly one page of already-matching rows, not the whole catalogue.
  const stockQuery = useProducts({
    q: q || undefined,
    categoryId: params.category,
    state: state === "all" ? undefined : state,
    sort: sort === "name" ? undefined : sort,
    includeInactive: true,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    locationId: locationId ?? undefined,
  });

  // Movements tab only, but hooks stay unconditional — gated with `enabled`
  // instead of a conditional call. A name search reaches inventory_movements
  // through product ids: the table itself holds no product name.
  const searchQ = isMovementsTab ? q : "";
  const searchIdsQuery = useProductIdsMatching(searchQ, { includeInactive: true });
  const searchIdsPending = isMovementsTab && Boolean(searchQ) && searchIdsQuery.isPending;
  const searchIds = isMovementsTab ? searchIdsQuery.data : undefined;

  // GAP: GET /inventory/movements only accepts `product_id` + `per_page`
  // (packages/api-client/src/queries/inventory.ts MovementFilter) — the old
  // PostgREST query's `productIds` (batch, for a name search matching more
  // than one product), `reasons`, and `from`/`to` date-range filters have no
  // equivalent on the Tally API and are dropped here rather than faked. A
  // search that matches exactly one product still narrows the list (via
  // `productId`); a search matching zero or several no longer filters
  // server-side. The reason select and date range picker on this tab still
  // render and update the URL (dayWindow/reason are kept below only for
  // their display label and to keep MovementsPanel's existing props), but no
  // longer narrow the results.
  const singleMatch = searchIds?.length === 1 ? searchIds[0] : undefined;
  const nothingMatches = isMovementsTab && searchIds?.length === 0;
  const movementFilter = { productId: focusedProduct ?? singleMatch };
  const movementsEnabled = isMovementsTab && !searchIdsPending && !nothingMatches;

  const movementsQuery = useInventoryMovements(
    { ...movementFilter, page, pageSize: MOVEMENTS_PAGE_SIZE },
    { enabled: movementsEnabled },
  );
  const totalsQuery = useMovementTotals(movementFilter, { enabled: movementsEnabled });

  const movementPage = nothingMatches
    ? { movements: [], total: 0, lastPage: 1 }
    : (movementsQuery.data ?? { movements: [], total: 0, lastPage: 1 });
  const totals = nothingMatches
    ? { stockIn: 0, stockOut: 0, net: 0, count: 0 }
    : (totalsQuery.data ?? { stockIn: 0, stockOut: 0, net: 0, count: 0 });

  // InventoryMovementResource embeds product_name/created_by_name directly —
  // no separate product/user lookup needed to label a row anymore.
  const productNames: Record<string, string> = {};
  const userNames: Record<string, string> = {};
  for (const movement of movementPage.movements) {
    if (movement.productName) productNames[movement.productId] = movement.productName;
    if (movement.createdBy && movement.createdByName) {
      userNames[movement.createdBy] = movement.createdByName;
    }
  }

  const movementsTabPending =
    isMovementsTab &&
    (searchIdsPending ||
      (movementsEnabled &&
        isInitialQueryLoad(movementsQuery.isPending, Boolean(movementsQuery.data))));
  const movementsTabError =
    isMovementsTab &&
    (searchIdsQuery.isError || (movementsEnabled && (movementsQuery.isError || totalsQuery.isError)));

  const stockTabPending =
    !isMovementsTab && isInitialQueryLoad(stockQuery.isPending, Boolean(stockQuery.data));
  const stockTabError = !isMovementsTab && stockQuery.isError;

  const pending = statsQuery.isPending || categoriesQuery.isPending || stockTabPending || movementsTabPending;
  const isError = statsQuery.isError || categoriesQuery.isError || stockTabError || movementsTabError;
  const firstError = [statsQuery, categoriesQuery, stockQuery, movementsQuery, totalsQuery, searchIdsQuery]
    .map((q2) => q2.error)
    .find((error) => error instanceof Error);

  const header = (
    <PageHeader
      icon={Boxes}
      title="Inventory"
      description="Stock changes are recorded as movements, never edited directly. Sales from terminals appear here once they sync."
    />
  );

  if (pending) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="px-4 py-8 text-center text-body text-danger">
          {firstError instanceof Error ? firstError.message : "Could not load inventory."}
        </Card>
      </div>
    );
  }

  const stats = statsQuery.data ?? {
    total: 0,
    tracked: 0,
    stockCost: 0,
    needsReordering: 0,
    lowStock: 0,
    outOfStock: 0,
    oversold: 0,
    hidden: 0,
  };
  const categories = categoriesQuery.data ?? [];
  const categoryOptions = toCategoryOptions(categories);

  const tabs = [
    {
      key: "stock",
      label: "Stock on hand",
      icon: Warehouse,
      count: stats.tracked,
      href: buildHref({
        tab: "stock",
        q,
        state: state === "all" ? undefined : state,
        category: params.category,
        sort: sort === "name" ? undefined : sort,
      }),
    },
    {
      key: "movements",
      label: "Movement history",
      icon: History,
      href: buildHref({
        tab: "movements",
        q,
        product: focusedProduct,
        reason,
        from: dayWindow.fromDay ?? undefined,
        to: dayWindow.toDay ?? undefined,
      }),
    },
  ];

  if (tab === "movements") {
    return (
      <div className="space-y-6">
        {header}
        <TabNav items={tabs} active={tab} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={ArrowUpRight}
            label="Stock in"
            value={String(totals.stockIn)}
            hint="Restocks, corrections up, voided sales"
            tone="success"
          />
          <StatCard
            icon={ArrowDownRight}
            label="Stock out"
            value={String(totals.stockOut)}
            hint="Sales and downward adjustments"
            tone={totals.stockOut > 0 ? "warning" : "neutral"}
          />
          <StatCard
            icon={Scale}
            label="Net change"
            value={`${totals.net > 0 ? "+" : ""}${totals.net}`}
            hint="Units the shelves gained or lost"
            tone={totals.net < 0 ? "danger" : "primary"}
          />
          <StatCard
            icon={History}
            label="Movements"
            value={String(movementPage.total)}
            hint={dayWindow.label}
          />
        </div>

        <MovementsPanel
          movements={movementPage.movements}
          total={movementPage.total}
          page={page}
          pageSize={MOVEMENTS_PAGE_SIZE}
          productNames={productNames}
          userNames={userNames}
          query={q}
          reason={reason}
          focusedProduct={focusedProduct}
          fromDay={dayWindow.fromDay}
          toDay={dayWindow.toDay}
          rangeLabel={dayWindow.label}
          fetching={
            (searchIdsQuery.isFetching && Boolean(searchIdsQuery.data)) ||
            (movementsQuery.isFetching && Boolean(movementsQuery.data))
          }
        />
      </div>
    );
  }

  const stockPage = stockQuery.data ?? { products: [], total: 0, pageCount: 1, page: 1 };

  return (
    <div className="space-y-6">
      {header}
      <TabNav items={tabs} active={tab} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Warehouse}
          label="Products tracked"
          value={String(stats.tracked)}
          hint={stats.hidden > 0 ? `${stats.hidden} hidden from terminals` : "All visible to terminals"}
        />
        <StatCard
          icon={Boxes}
          label="Stock at cost"
          value={formatMoney(stats.stockCost)}
          hint="Money sitting on the shelves"
          tone="primary"
        />
        <StatCard
          icon={PackageSearch}
          label="Needs reordering"
          value={String(stats.needsReordering)}
          hint="At or below its reorder point"
          tone={stats.needsReordering > 0 ? "warning" : "success"}
        />
        <StatCard
          icon={TriangleAlert}
          label="Oversold"
          value={String(stats.oversold)}
          hint="Negative stock to correct"
          tone={stats.oversold > 0 ? "danger" : "success"}
        />
      </div>

      <StockPanel
        products={stockPage.products}
        categories={categoryOptions}
        query={q}
        state={state}
        sort={sort}
        category={params.category}
        page={stockPage.page}
        pageCount={stockPage.pageCount}
        total={stockPage.total}
        pageSize={DEFAULT_PAGE_SIZE}
        focusedProduct={focusedProduct}
        fetching={stockQuery.isFetching && Boolean(stockQuery.data)}
      />
    </div>
  );
}
