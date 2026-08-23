"use client";

import Link from "next/link";
import { ArrowLeft, Download, FileUp, TableProperties } from "lucide-react";
import { ButtonLink, Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui";
import { OPTIONAL_COLUMNS, REQUIRED_COLUMNS } from "@/lib/product-import";
import { ImportForm } from "./import-form";

/** Plain-English notes for each column the importer reads. */
const COLUMN_NOTES: Record<string, string> = {
  name: "What the product is called.",
  sku: "Your code for it. This is what matches a row to a product already in the list.",
  price: "The shelf price customers pay.",
  cost_price: "What the supplier charges you. Drives every margin figure.",
  unit: "How it is sold: pc, box, set, pack, roll, sheet, m, ft, kg, l, gal or bag.",
  barcode: "Optional. Must be unique across products.",
  reorder_point: "Flag it for restocking at or below this count.",
  bulk_price: "Optional contractor price. Needs a bulk minimum quantity too.",
  bulk_min_quantity: "Quantity that unlocks the bulk price. Two or more.",
  category: "Full path, e.g. Plumbing / Pipes / PVC. Created if it does not exist.",
  is_active: "true to show it on terminals, false to hide it.",
};

export default function ImportProductsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileUp}
        title="Import products"
        description="Take a supplier price list into the catalogue. You see exactly what will change before anything is written."
        action={
          <ButtonLink href="/api/export/products-template" icon={Download} download>
            Download template
          </ButtonLink>
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
          title="Upload a file"
          description="Rows are matched to products by SKU: a known SKU is updated, a new one is added."
        />
        <div className="px-4 py-5 sm:px-6">
          <ImportForm />
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={TableProperties}
          title="Columns"
          description="Header names are read in any order. Anything else in the file is ignored."
        />
        <Table>
          <thead>
            <tr>
              <Th>Column</Th>
              <Th>Needed</Th>
              <Th>What it does</Th>
            </tr>
          </thead>
          <tbody>
            {[...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map((column) => (
              <tr key={column}>
                <Td className="num font-medium">{column}</Td>
                <Td className="text-ink-muted">
                  {(REQUIRED_COLUMNS as readonly string[]).includes(column)
                    ? "Required"
                    : "Optional"}
                </Td>
                <Td className="text-ink-muted">{COLUMN_NOTES[column]}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
