"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  CheckCircle2,
  FolderOpen,
  Pencil,
  Plus,
  Save,
  Tag,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Customer, Product } from "@double-a/shared-types";
import {
  cartDiscount,
  formatMoney,
  formatPercent,
  lineProfit,
  marginPercent,
  roundMoney,
} from "@double-a/shared-types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Combobox,
  ErrorNote,
  Field,
  Input,
  Money,
  MoneyInput,
  Select,
} from "@/components/ui";
import { toast } from "sonner";
import { Dialog } from "@/components/overlay";
import { ProductPicker } from "@/components/product-picker";
import { useCustomers } from "@/lib/query/customers";
import {
  deleteSaleDraft,
  listSaleDrafts,
  saveSaleDraft,
  type SaleDraft,
} from "@/lib/sale-drafts";
import { createSaleAction, searchProductsForSale } from "./actions";

interface ItemRow {
  key: string;
  product: Product | null;
  quantity: string;
  /** Blank means "use the shelf price" — filled in only for a counter discount. */
  unitPrice: string;
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "card", label: "Card" },
] as const;

export function CreateSaleForm() {
  const router = useRouter();
  const customersQuery = useCustomers();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [items, setItems] = useState<ItemRow[]>([
    { key: newKey(), product: null, quantity: "1", unitPrice: "" },
  ]);
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["value"]>("cash");
  const [customerId, setCustomerId] = useState("");
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [drafts, setDrafts] = useState<SaleDraft[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);

  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState("");

  useEffect(() => {
    setDrafts(listSaleDrafts());
  }, []);

  // Clear the typed amount each time the dialog opens — there's no per-line id
  // to key it on, so a re-open must never show the last discount typed.
  useEffect(() => {
    if (discountOpen) setDiscountDraft("");
  }, [discountOpen]);

  const customers = customersQuery.data ?? [];

  function addItem() {
    setItems((current) => [
      ...current,
      { key: newKey(), product: null, quantity: "1", unitPrice: "" },
    ]);
  }

  function removeItem(key: string) {
    setItems((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : current));
  }

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function resetUnitPrice(key: string) {
    updateItem(key, { unitPrice: "" });
  }

  const lineTotals = useMemo(
    () =>
      items.map((row) => {
        const quantity = Number(row.quantity) || 0;
        const price = row.unitPrice.trim() ? Number(row.unitPrice) : (row.product?.price ?? 0);
        return quantity * price;
      }),
    [items],
  );
  const total = lineTotals.reduce((sum, value) => sum + value, 0);
  const shelfTotal = items.reduce(
    (sum, row) => sum + (row.product?.price ?? 0) * (Number(row.quantity) || 0),
    0,
  );
  const discount = cartDiscount(
    items
      .filter((row) => row.product)
      .map((row) => ({
        unitPrice: row.unitPrice.trim() ? Number(row.unitPrice) : row.product!.price,
        listPrice: row.product!.price,
        quantity: Number(row.quantity) || 0,
      })),
  );

  /**
   * A flat peso amount off the whole cart, split across every line's
   * unit_price by its share of the total — same mechanism as a per-line
   * counter discount, not a separate field, mirroring the mobile POS.
   */
  function applyGlobalDiscount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0 || total <= 0) return;
    const capped = Math.min(amount, total);

    setItems((current) =>
      current.map((row) => {
        if (!row.product || Number(row.quantity) <= 0) return row;
        const quantity = Number(row.quantity);
        const price = row.unitPrice.trim() ? Number(row.unitPrice) : row.product.price;
        const lineTotal = price * quantity;
        const share = roundMoney((lineTotal / total) * capped);
        const nextPrice = Math.max(0, roundMoney(price - share / quantity));
        return { ...row, unitPrice: String(nextPrice) };
      }),
    );
    setDiscountOpen(false);
    setDiscountDraft("");
  }

  /** Drops every price override at once, discount included — back to shelf price across the board. */
  function clearAllDiscounts() {
    setItems((current) => current.map((row) => ({ ...row, unitPrice: "" })));
    setDiscountOpen(false);
    setDiscountDraft("");
  }

  function submit() {
    const cleanItems = items
      .filter((row) => row.product && Number(row.quantity) > 0)
      .map((row) => ({
        productId: row.product!.id,
        quantity: Number(row.quantity),
        unitPrice: row.unitPrice.trim() ? Number(row.unitPrice) : undefined,
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
    setItems([{ key: newKey(), product: null, quantity: "1", unitPrice: "" }]);
    setPaymentMethod("cash");
    setCustomerId("");
    setFulfillment("pickup");
    setError(null);
  }

  function saveDraft() {
    const hasAnyProduct = items.some((row) => row.product);
    if (!hasAnyProduct) {
      setError("Add at least one product before saving as draft.");
      return;
    }
    saveSaleDraft({ items, paymentMethod, customerId, fulfillment });
    setDrafts(listSaleDrafts());
    resetForm();
    toast.success("Sale held as draft. Load it later from Drafts.");
  }

  function loadDraft(draft: SaleDraft) {
    setItems(draft.items.length > 0 ? draft.items : [{ key: newKey(), product: null, quantity: "1", unitPrice: "" }]);
    setPaymentMethod(draft.paymentMethod as (typeof PAYMENT_METHODS)[number]["value"]);
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
    <div className="space-y-6">
    <Card>
      <CardHeader
        title="Line items"
        description="Priced at the shelf price unless you type a different amount — same as a counter discount on the POS."
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
      <div className="space-y-4 px-4 py-4 sm:px-6">
        {items.map((row, index) => {
          const quantity = Number(row.quantity) || 0;
          const listPrice = row.product?.price ?? 0;
          const effectivePrice = row.unitPrice.trim() ? Number(row.unitPrice) : listPrice;
          const lineDiscount = row.product
            ? roundMoney(Math.max(listPrice - effectivePrice, 0) * quantity)
            : 0;
          const belowCost = row.product ? effectivePrice < row.product.costPrice : false;

          return (
            <div key={row.key} className="rounded-sm border border-border bg-paper p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <ProductPicker
                    selected={row.product}
                    onSelect={(product) => updateItem(row.key, { product })}
                    search={searchProductsForSale}
                  />
                </div>
                {items.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => removeItem(row.key)}
                    aria-label={`Remove line ${index + 1}`}
                  />
                ) : null}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Quantity" required>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0.001}
                    step="0.001"
                    value={row.quantity}
                    onChange={(event) => updateItem(row.key, { quantity: event.target.value })}
                    className="num"
                  />
                </Field>
                <Field
                  label="Unit price"
                  hint={row.product ? `Shelf price ${formatMoney(row.product.price)}` : "Pick a product first"}
                  required={false}
                >
                  <MoneyInput
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder={row.product ? String(row.product.price) : ""}
                    value={row.unitPrice}
                    onChange={(event) => updateItem(row.key, { unitPrice: event.target.value })}
                  />
                </Field>
              </div>

              {row.product ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-caption text-ink-muted">
                  <span className="flex items-center gap-2">
                    Margin{" "}
                    <span
                      className={`num font-semibold ${belowCost ? "text-danger" : "text-ink"}`}
                    >
                      {formatPercent(marginPercent(effectivePrice, row.product.costPrice))}
                    </span>
                    · {formatMoney(lineProfit(effectivePrice, row.product.costPrice, quantity))}{" "}
                    profit
                    {row.unitPrice.trim() ? (
                      <button
                        type="button"
                        className="text-primary underline decoration-dotted"
                        onClick={() => resetUnitPrice(row.key)}
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
              ) : null}

              {belowCost ? (
                <p className="mt-2 flex items-start gap-2 rounded-sm border border-danger/40 bg-danger/10 px-3 py-2 text-caption text-danger">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  Below the {formatMoney(row.product!.costPrice)} this cost us. Still
                  sellable at this price — it goes on the discount report.
                </p>
              ) : null}
            </div>
          );
        })}

        <Button type="button" variant="ghost" icon={Plus} onClick={addItem}>
          Add another line
        </Button>

        <div className="ledger-line" />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Payment method" required>
            <Select
              value={paymentMethod}
              onChange={(event) =>
                setPaymentMethod(event.target.value as (typeof PAYMENT_METHODS)[number]["value"])
              }
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Fulfillment" required>
            <Select
              value={fulfillment}
              onChange={(event) => setFulfillment(event.target.value as "pickup" | "delivery")}
            >
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </Select>
          </Field>

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
        </div>

        <div className="space-y-2 rounded-sm bg-primary-tint px-3 py-3">
          {discount > 0 ? (
            <div className="flex items-baseline justify-between text-body text-ink-muted">
              <span>Subtotal</span>
              <Money value={shelfTotal} />
            </div>
          ) : null}

          {items.some((row) => row.product) ? (
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
      </div>
    </Card>

    <div className="sticky bottom-0 z-10 rounded-md border border-border bg-surface px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-6">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={() => router.push("/sales" as Route)}
        >
          Cancel
        </Button>
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
            const count = draft.items.filter((row) => row.product).length;
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
    </div>
  );
}
