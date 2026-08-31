"use client";

import Link from "next/link";
import { ArrowLeft, Download, FileUp, History, TableProperties } from "lucide-react";
import { ButtonLink, Card, CardHeader, PageHeader } from "@/components/ui";
import { OPTIONAL_COLUMNS, REQUIRED_COLUMNS } from "@/lib/product-import";
import { ImportForm } from "./import-form";

const COLUMN_NOTES: Record<string, string> = {
  name: "What the product is called.",
  sku: "Your code for it. Matches a row to a product by internal SKU or supplier SKU.",
  price: "The shelf price customers pay. Falls back to Price Level 1, 2, then 3 when empty or zero.",
  cost_price: "What the supplier charges you. Drives every margin figure.",
  unit: "How it is sold: pc, box, set, pack, roll, sheet, m, ft, kg, l, gal or bag.",
  barcode: "Optional. Must be unique across products.",
  reorder_point: "Flag it for restocking at or below this count.",
  replenish_quantity: "Suggested quantity to order when restocking.",
  bulk_price: "Optional contractor price. Needs a bulk minimum quantity too.",
  bulk_min_quantity: "Quantity that unlocks the bulk price. Two or more.",
  category: "Full path, e.g. Plumbing / Pipes / PVC. Created if it does not exist.",
  supplier: "Supplier name. Created and linked to the product if it does not exist yet.",
  supplier_sku: "Optional vendor item code. Import and photo scan also match on this when internal SKU differs.",
  description: "Optional longer notes. A lone dash in the file is treated as empty.",
  stock_quantity: "Optional on-hand count. Only used when you pick a stock import mode.",
  is_active: "true to show it on terminals, false to hide it.",
};

export default function ImportProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileUp}
        title="Import products"
        description="Bring a supplier CSV or photo into the catalogue. Connect columns, review every row, then import in the background."
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/products/import/history" icon={History} variant="secondary">
              Import history
            </ButtonLink>
            <ButtonLink href="/api/export/products-template" icon={Download} download>
              Download template
            </ButtonLink>
          </div>
        }
      />

      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-body font-medium text-primary hover:underline"
      >
        <ArrowLeft size={14} />
        Back to products
      </Link>

      <Card>
        <CardHeader
          icon={FileUp}
          title="Import wizard"
          description="Rows match by internal SKU or supplier SKU. Known code updates that product; new code adds one."
        />
        <div className="px-4 py-5 sm:px-6">
          <ImportForm />
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={TableProperties}
          title="Catalogue fields reference"
          description="These are the fields you can connect your file columns to."
        />
        <details className="px-4 py-4 sm:px-6">
          <summary className="cursor-pointer text-body font-medium text-ink">
            Show field reference
          </summary>
          <ul className="mt-4 space-y-2 text-body text-ink-muted">
            {[...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map((column) => (
              <li key={column}>
                <span className="num font-medium text-ink">{column}</span>
                {" — "}
                {(REQUIRED_COLUMNS as readonly string[]).includes(column) ? "Required. " : "Optional. "}
                {COLUMN_NOTES[column]}
              </li>
            ))}
          </ul>
        </details>
      </Card>
    </div>
  );
}
