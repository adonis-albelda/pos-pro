"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ClipboardCheck, ClipboardList, Loader2, Search, TriangleAlert, X } from "lucide-react";
import type { Product } from "@double-a/shared-types";
import { formatQuantity, stockLevel } from "@double-a/shared-types";
import { getProduct, listProductsPage } from "@double-a/api-client/queries";
import {
  Badge,
  Button,
  ErrorNote,
  Field,
  Input,
  Money,
  Select,
  SuccessNote,
} from "@/components/ui";
import { EMPTY_FORM_STATE } from "@/lib/form-state";
import { useInvalidateInventory } from "@/lib/query/inventory";
import { useLocationFilter } from "@/components/location-filter-provider";
import { getBrowserApiClient } from "@/lib/api/browser-client";
import { moveStock } from "./actions";

const PICKER_PAGE_SIZE = 8;
/** Fetch the next page once the scrolled-past distance from the bottom is under this. */
const LOAD_MORE_THRESHOLD_PX = 80;

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Mode = "in" | "out" | "count";

const MODES: { key: Mode; label: string; hint: string; reason: string }[] = [
  {
    key: "in",
    label: "Add stock",
    hint: "A delivery arrived, or stock came back.",
    reason: "restock",
  },
  {
    key: "out",
    label: "Remove stock",
    hint: "Damaged, expired, or taken out of the shop.",
    reason: "adjustment",
  },
  {
    key: "count",
    label: "Set counted total",
    hint: "After a stock take. The difference is recorded as the movement.",
    reason: "adjustment",
  },
];

const QUICK_STEPS = [1, 5, 10, 50];

export function StockForm({
  defaultProductId,
  onDone,
}: {
  defaultProductId?: string;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(moveStock, EMPTY_FORM_STATE);
  const invalidate = useInvalidateInventory();
  const { locationId } = useLocationFilter();
  const [productId, setProductId] = useState(defaultProductId ?? "");
  const [product, setProduct] = useState<Product | null>(null);
  const [mode, setMode] = useState<Mode>("in");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("restock");

  // The reason follows the mode unless the owner says otherwise, so the common
  // case is one fewer decision.
  useEffect(() => {
    const preset = MODES.find((option) => option.key === mode);
    if (preset) setReason(preset.reason);
  }, [mode]);

  useEffect(() => {
    if (state.ok) {
      invalidate();
      onDone?.();
    }
    // invalidate is stable enough for this effect; only state.ok/onDone gate re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok, onDone]);

  useEffect(() => {
    if (!defaultProductId) return;
    void getProduct(getBrowserApiClient(), defaultProductId).then((row) => {
      if (!row) return;
      setProduct(row);
      setProductId(row.id);
    });
  }, [defaultProductId]);

  const allowDecimal = product?.allowDecimal ?? false;
  const typed = Number(quantity);
  const magnitude =
    quantity.trim() !== "" && Number.isFinite(typed) ? typed : null;

  const current = product?.stockQuantity ?? 0;
  const delta =
    magnitude === null
      ? null
      : mode === "count"
        ? magnitude - current
        : mode === "out"
          ? -magnitude
          : magnitude;
  const projected = delta === null ? null : current + delta;
  const activeMode = MODES.find((option) => option.key === mode);

  function step(by: number) {
    const base = magnitude ?? 0;
    setQuantity(String(Math.max(0, base + by)));
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="mode" value={mode} />
      {locationId ? <input type="hidden" name="location_id" value={locationId} /> : null}
      {product ? (
        <input type="hidden" name="baseline_quantity" value={String(product.stockQuantity)} />
      ) : null}

      <ProductPicker
        selected={product}
        locationId={locationId}
        onSelect={(next) => {
          setProduct(next);
          setProductId(next?.id ?? "");
        }}
      />

      <fieldset>
        <legend className="mb-1 block text-caption font-medium text-ink-muted">
          What happened
        </legend>
        <div className="grid gap-1 rounded-sm border border-border bg-paper p-1 sm:grid-cols-3">
          {MODES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key)}
              aria-pressed={mode === option.key}
              className={cx(
                "cursor-pointer rounded-sm px-3 py-2 text-body font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                mode === option.key
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {activeMode ? (
          <p className="mt-1 text-caption text-ink-muted">{activeMode.hint}</p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Field
            label={mode === "count" ? "Counted quantity" : "Quantity"}
            hint={
              product
                ? `Counted in ${product.unit}.`
                : "Pick a product to see how it is sold."
            }
            required
          >
            <Input
              name="quantity"
              type="number"
              inputMode={allowDecimal ? "decimal" : "numeric"}
              min={mode === "count" ? 0 : allowDecimal ? 0.001 : 1}
              step={allowDecimal ? "0.001" : "1"}
              required
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="num"
            />
          </Field>
          {mode === "count" ? null : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_STEPS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => step(amount)}
                  className="num cursor-pointer rounded-sm bg-paper px-2 py-1 text-caption font-medium text-ink-muted transition-colors hover:bg-border/60 hover:text-ink"
                >
                  +{amount}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQuantity("")}
                className="cursor-pointer rounded-sm px-2 py-1 text-caption font-medium text-ink-muted transition-colors hover:text-ink"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <Field label="Reason" hint="Shows in the movement history and on reports." required>
          <Select
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          >
            <option value="restock">Restock</option>
            <option value="adjustment">Adjustment</option>
            <option value="oversell_correction">Oversell correction</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Note"
        hint="Optional. Delivery receipt number, who counted, why."
        required={false}
      >
        <Input
          name="note"
          placeholder="Delivery from supplier, recount after audit..."
        />
      </Field>

      {product ? (
        <MovementPreview
          product={product}
          mode={mode}
          delta={delta}
          projected={projected}
        />
      ) : null}

      {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
      {state.ok ? <SuccessNote>Movement recorded. Stock updated.</SuccessNote> : null}

      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button
          type="submit"
          loading={pending}
          icon={ClipboardCheck}
          disabled={!productId}
        >
          {pending ? "Recording..." : "Record movement"}
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Product picker — a shop with hundreds of lines cannot be scrolled in a      */
/* <select>, and the person restocking knows the name or the SKU.             */
/* -------------------------------------------------------------------------- */

function ProductPicker({
  selected,
  locationId,
  onSelect,
}: {
  selected: Product | null;
  locationId: string | null;
  onSelect: (product: Product | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTerm(term), 150);
    return () => clearTimeout(handle);
  }, [term]);

  // One request per page — only the first page fires while typing/opening;
  // scrolling near the bottom of the dropdown fetches the next one instead
  // of the old hardcoded 8-result cap.
  const pickerQuery = useInfiniteQuery({
    queryKey: ["stock-form", "product-picker", debouncedTerm, locationId],
    queryFn: ({ pageParam }) =>
      listProductsPage(getBrowserApiClient(), {
        q: debouncedTerm,
        page: pageParam,
        pageSize: PICKER_PAGE_SIZE,
        includeInactive: true,
        locationId: locationId || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length < lastPage.lastPage ? allPages.length + 1 : undefined,
    enabled: open,
  });
  const matches = pickerQuery.data?.pages.flatMap((page) => page.products) ?? [];

  function onMatchesScroll(event: React.UIEvent<HTMLUListElement>) {
    const el = event.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (
      distanceFromBottom < LOAD_MORE_THRESHOLD_PX &&
      pickerQuery.hasNextPage &&
      !pickerQuery.isFetchingNextPage
    ) {
      void pickerQuery.fetchNextPage();
    }
  }

  if (selected) {
    const level = stockLevel(selected.stockQuantity, selected.reorderPoint);

    return (
      <div className="rounded-sm border border-primary/30 bg-primary-tint px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-body-lg font-semibold">{selected.name}</p>
            <p className="mt-0.5 truncate text-caption text-ink-muted">
              {selected.sku ? <span className="num">{selected.sku}</span> : "No SKU"}
              {selected.category ? ` · ${selected.category}` : ""}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-caption text-ink-muted">
              <span>
                On hand{" "}
                <span className="num font-semibold text-ink">
                  {formatQuantity(selected.stockQuantity)}
                </span>{" "}
                {selected.unit}
              </span>
              <span>·</span>
              <span>
                reorder at <span className="num">{selected.reorderPoint}</span>
              </span>
              <span>·</span>
              <span>
                cost <Money value={selected.costPrice} className="text-ink" />
              </span>
              {selected.stockQuantity < 0 ? (
                <Badge tone="danger">Oversold</Badge>
              ) : level === "out" ? (
                <Badge tone="danger">Out of stock</Badge>
              ) : level === "low" ? (
                <Badge tone="warning">Low stock</Badge>
              ) : null}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={X}
            onClick={() => {
              onSelect(null);
              setTerm("");
              setOpen(true);
            }}
          >
            Change
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <Field label="Product" hint="Search by name, SKU or barcode." required>
        <Input
          icon={Search}
          value={term}
          placeholder="Start typing a product…"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
        />
      </Field>

      {open ? (
        <ul
          onScroll={onMatchesScroll}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-sm border border-border bg-surface py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-body text-ink-muted">
              Nothing matches that. Products are added on the Products page.
            </li>
          ) : (
            matches.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(product);
                    setOpen(false);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-paper"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body font-medium">
                      {product.name}
                    </span>
                    <span className="block truncate text-caption text-ink-muted">
                      {product.sku ? <span className="num">{product.sku}</span> : "No SKU"}
                      {product.category ? ` · ${product.category}` : ""}
                    </span>
                  </span>
                  <span className="num shrink-0 text-caption text-ink-muted">
                    {formatQuantity(product.stockQuantity)} {product.unit}
                  </span>
                </button>
              </li>
            ))
          )}
          {pickerQuery.isFetchingNextPage ? (
            <li className="flex items-center justify-center gap-1.5 py-2 text-caption text-ink-muted">
              <Loader2 size={13} className="animate-spin" />
              Loading more…
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview — what the movement will do, before it is recorded                 */
/* -------------------------------------------------------------------------- */

function MovementPreview({
  product,
  mode,
  delta,
  projected,
}: {
  product: Product;
  mode: Mode;
  delta: number | null;
  projected: number | null;
}) {
  if (delta === null || projected === null) {
    return (
      <PreviewShell>
        <p className="flex items-start gap-2 text-caption text-ink-muted">
          <ClipboardList size={14} className="mt-0.5 shrink-0" />
          <span>
            Stock is never edited directly — type a quantity and the movement is
            worked out here first.
          </span>
        </p>
      </PreviewShell>
    );
  }

  const worth = Math.abs(delta) * product.costPrice;

  return (
    <PreviewShell>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-caption text-ink-muted">On hand</span>
        <span className="num text-heading-sm font-semibold">
          {formatQuantity(product.stockQuantity)}
        </span>
        <span
          className={cx(
            "num rounded-sm px-2 py-0.5 text-caption font-semibold",
            delta < 0 ? "bg-danger/12 text-danger" : "bg-success/12 text-success",
          )}
        >
          {delta > 0 ? "+" : ""}
          {formatQuantity(delta)}
        </span>
        <span className="text-caption text-ink-muted">becomes</span>
        <span
          className={cx(
            "num text-heading-sm font-semibold",
            projected < 0 && "text-danger",
          )}
        >
          {formatQuantity(projected)}
        </span>
        <span className="text-caption text-ink-muted">{product.unit}</span>
      </div>

      <p className="mt-2 text-caption text-ink-muted">
        {mode === "count" ? (
          "Recorded as the difference, so the history still explains the change."
        ) : (
          <>
            Worth <Money value={worth} className="text-ink" /> at supplier cost.
          </>
        )}
      </p>

      {projected < 0 ? (
        <p className="mt-2 flex items-start gap-2 text-caption font-medium text-danger">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            This leaves stock negative. Record it only if the shelf really is
            short — an oversell correction is the way back to zero.
          </span>
        </p>
      ) : null}
    </PreviewShell>
  );
}

function PreviewShell({ children }: { children: ReactNode }) {
  return <div className="rounded-sm border border-border bg-paper px-3 py-3">{children}</div>;
}
