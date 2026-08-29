"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Plus, Save, Trash2 } from "lucide-react";
import { formatMoney, roundMoney } from "@double-a/shared-types";
import type { Product, Supplier } from "@double-a/shared-types";
import {
  Button,
  Combobox,
  ErrorNote,
  Field,
  IconButton,
  Input,
  MoneyInput,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { createPurchaseOrderAction } from "./actions";
import { useInvalidatePurchaseOrders } from "@/lib/query/purchase-orders";

interface ItemRow {
  key: string;
  productId: string;
  quantityOrdered: string;
  unitCost: string;
}

interface TermRow {
  key: string;
  dueDate: string;
  amount: string;
}

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

export function CreatePurchaseOrderForm({
  suppliers,
  products,
  supplierProductIds,
  defaultSupplierId,
  defaultOrderDate,
}: {
  suppliers: Supplier[];
  products: Product[];
  supplierProductIds: Record<string, string[]>;
  defaultSupplierId?: string;
  defaultOrderDate: string;
}) {
  const router = useRouter();
  const invalidatePurchaseOrders = useInvalidatePurchaseOrders();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? suppliers[0]?.id ?? "");
  const [orderDate, setOrderDate] = useState(defaultOrderDate);
  const [expectedDate, setExpectedDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [onlySupplierProducts, setOnlySupplierProducts] = useState(true);

  const [items, setItems] = useState<ItemRow[]>([
    { key: newKey(), productId: "", quantityOrdered: "1", unitCost: "" },
  ]);
  const [terms, setTerms] = useState<TermRow[]>([]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const availableProducts = useMemo(() => {
    if (!onlySupplierProducts) return products;
    const linked = new Set(supplierProductIds[supplierId] ?? []);
    // No links recorded yet — fall back to the full catalog rather than an
    // empty picker that looks broken.
    if (linked.size === 0) return products;
    return products.filter((product) => linked.has(product.id));
  }, [products, supplierProductIds, supplierId, onlySupplierProducts]);

  const total = roundMoney(
    items.reduce((sum, item) => {
      const qty = Number(item.quantityOrdered) || 0;
      const cost = Number(item.unitCost) || 0;
      return sum + qty * cost;
    }, 0),
  );
  const termsTotal = roundMoney(
    terms.reduce((sum, term) => sum + (Number(term.amount) || 0), 0),
  );
  const termsMismatch = terms.length > 0 && Math.abs(termsTotal - total) > 0.01;

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function pickProduct(key: string, productId: string) {
    const product = productsById.get(productId);
    updateItem(key, {
      productId,
      unitCost: product ? String(product.costPrice) : "",
    });
  }

  function addItem() {
    setItems((previous) => [
      ...previous,
      { key: newKey(), productId: "", quantityOrdered: "1", unitCost: "" },
    ]);
  }

  function removeItem(key: string) {
    setItems((previous) =>
      previous.length > 1 ? previous.filter((item) => item.key !== key) : previous,
    );
  }

  function addTerm() {
    setTerms((previous) => [...previous, { key: newKey(), dueDate: "", amount: "" }]);
  }

  function removeTerm(key: string) {
    setTerms((previous) => previous.filter((term) => term.key !== key));
  }

  function updateTerm(key: string, patch: Partial<TermRow>) {
    setTerms((previous) =>
      previous.map((term) => (term.key === key ? { ...term, ...patch } : term)),
    );
  }

  /** Convenience only — every row stays freely editable afterwards. */
  function splitEvenly(count: number) {
    if (count <= 0 || total <= 0) return;
    const base = Math.floor((total / count) * 100) / 100;
    let remaining = total;
    const rows: TermRow[] = [];
    for (let index = 0; index < count; index += 1) {
      const amount = index === count - 1 ? roundMoney(remaining) : base;
      remaining = roundMoney(remaining - amount);
      rows.push({ key: newKey(), dueDate: "", amount: String(amount) });
    }
    setTerms(rows);
  }

  function submit() {
    setError(null);

    if (!supplierId) {
      setError("Pick a supplier.");
      return;
    }

    const cleanItems = items
      .filter((item) => item.productId && Number(item.quantityOrdered) > 0)
      .map((item) => {
        const product = productsById.get(item.productId);
        const raw = Number(item.quantityOrdered) || 0;
        const quantityOrdered = product?.allowDecimal
          ? Math.max(0.001, Number(raw.toFixed(3)))
          : Math.max(1, Math.round(raw));
        return {
          productId: item.productId,
          productName: product?.name ?? "Unknown product",
          quantityOrdered,
          unitCost: Math.max(0, Number(item.unitCost) || 0),
        };
      });

    if (cleanItems.length === 0) {
      setError("Add at least one line item.");
      return;
    }

    const cleanTerms = terms
      .filter((term) => Number(term.amount) > 0)
      .map((term, index) => ({
        termNumber: index + 1,
        dueDate: term.dueDate || null,
        amount: roundMoney(Number(term.amount)),
      }));

    startTransition(async () => {
      const result = await createPurchaseOrderAction({
        supplierId,
        orderDate,
        expectedDate: expectedDate || null,
        referenceNo: referenceNo.trim() || null,
        notes: notes.trim() || null,
        items: cleanItems,
        terms: cleanTerms,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      invalidatePurchaseOrders();
      router.push(`/purchase-orders/${result.id}` as Route);
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-surface p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Supplier" required>
            <Combobox
              value={supplierId}
              onChange={setSupplierId}
              options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              placeholder="Search suppliers…"
            />
          </Field>
          <Field label="Order date" required>
            <Input
              type="date"
              value={orderDate}
              onChange={(event) => setOrderDate(event.target.value)}
            />
          </Field>
          <Field label="Expected date" hint="Optional." required={false}>
            <Input
              type="date"
              value={expectedDate}
              onChange={(event) => setExpectedDate(event.target.value)}
            />
          </Field>
          <Field
            label="Reference no."
            hint="Supplier's invoice/PO number, optional."
            required={false}
          >
            <Input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Notes" required={false}>
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <h2 className="text-heading-sm font-semibold">Line items</h2>
          <label className="flex items-center gap-2 text-caption text-ink-muted">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={onlySupplierProducts}
              onChange={(event) => setOnlySupplierProducts(event.target.checked)}
            />
            Only this supplier&rsquo;s linked products
          </label>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th numeric>Qty ordered</Th>
              <Th numeric>Unit cost</Th>
              <Th numeric>Line total</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const qty = Number(item.quantityOrdered) || 0;
              const cost = Number(item.unitCost) || 0;
              const rowAllowsDecimal =
                productsById.get(item.productId)?.allowDecimal ?? false;
              return (
                <tr key={item.key}>
                  <Td>
                    <Combobox
                      value={item.productId}
                      onChange={(productId) => pickProduct(item.key, productId)}
                      options={availableProducts.map((product) => ({
                        value: product.id,
                        label: product.name,
                        sublabel: product.sku ?? undefined,
                      }))}
                      placeholder="Choose a product…"
                    />
                  </Td>
                  <Td numeric>
                    <Input
                      type="number"
                      min={rowAllowsDecimal ? "0.001" : "1"}
                      step={rowAllowsDecimal ? "0.001" : "1"}
                      className="num text-right"
                      value={item.quantityOrdered}
                      onChange={(event) =>
                        updateItem(item.key, { quantityOrdered: event.target.value })
                      }
                    />
                  </Td>
                  <Td numeric>
                    <MoneyInput
                      type="number"
                      min="0"
                      step="0.01"
                      className="text-right"
                      value={item.unitCost}
                      onChange={(event) => updateItem(item.key, { unitCost: event.target.value })}
                    />
                  </Td>
                  <Td numeric className="font-medium">
                    {formatMoney(qty * cost)}
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton
                        icon={Trash2}
                        label="Remove line"
                        tone="danger"
                        onClick={() => removeItem(item.key)}
                      />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <div className="flex items-center justify-between border-t border-border px-4 py-4 sm:px-6">
          <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addItem}>
            Add line
          </Button>
          <p className="text-body-lg font-semibold">
            Total <span className="num">{formatMoney(total)}</span>
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-heading-sm font-semibold">Payment terms</h2>
            <p className="mt-1 text-caption text-ink-muted">
              Optional. Split this order into installments so the balance owed tracks per due
              date.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => splitEvenly(2)}>
              Split in 2
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => splitEvenly(3)}>
              Split in 3
            </Button>
          </div>
        </div>

        {terms.length === 0 ? (
          <p className="px-4 py-6 text-body text-ink-muted sm:px-6">
            No installments — the full amount is due whenever you mark it paid.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Term</Th>
                <Th>Due date</Th>
                <Th numeric>Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {terms.map((term, index) => (
                <tr key={term.key}>
                  <Td className="text-ink-muted">#{index + 1}</Td>
                  <Td>
                    <Input
                      type="date"
                      value={term.dueDate}
                      onChange={(event) => updateTerm(term.key, { dueDate: event.target.value })}
                    />
                  </Td>
                  <Td numeric>
                    <MoneyInput
                      type="number"
                      min="0"
                      step="0.01"
                      className="text-right"
                      value={term.amount}
                      onChange={(event) => updateTerm(term.key, { amount: event.target.value })}
                    />
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton
                        icon={Trash2}
                        label="Remove term"
                        tone="danger"
                        onClick={() => removeTerm(term.key)}
                      />
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <div className="flex flex-col gap-2 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addTerm}>
            Add term
          </Button>
          {terms.length > 0 ? (
            <p
              className={
                termsMismatch
                  ? "text-caption text-warning-ink"
                  : "text-caption text-ink-muted"
              }
            >
              Terms total {formatMoney(termsTotal)}
              {termsMismatch ? ` — order total is ${formatMoney(total)}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="sticky bottom-0 z-10 rounded-md border border-border bg-surface px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:px-6">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => router.push("/purchase-orders" as Route)}
          >
            Cancel
          </Button>
          <Button icon={Save} loading={pending} onClick={submit} className="w-full sm:w-auto">
            {pending ? "Creating..." : "Create purchase order"}
          </Button>
        </div>
      </div>
    </div>
  );
}
