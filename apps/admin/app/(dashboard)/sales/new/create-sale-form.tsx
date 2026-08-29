"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import type { Customer, Product } from "@double-a/shared-types";
import { formatMoney } from "@double-a/shared-types";
import {
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
import { ProductPicker } from "@/components/product-picker";
import { useCustomers } from "@/lib/query/customers";
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

  return (
    <Card>
      <CardHeader
        title="Line items"
        description="Priced at the shelf price unless you type a different amount — same as a counter discount on the POS."
      />
      <div className="space-y-4 px-4 py-4 sm:px-6">
        {items.map((row, index) => (
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
          </div>
        ))}

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

        <div className="flex items-baseline justify-between rounded-sm bg-primary-tint px-3 py-3">
          <span className="text-body font-medium tracking-wide text-primary-dark uppercase">
            Total
          </span>
          <Money value={total} className="text-heading-md font-semibold text-primary-dark" />
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button icon={CheckCircle2} loading={pending} onClick={submit}>
            {pending ? "Creating..." : "Create sale"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
