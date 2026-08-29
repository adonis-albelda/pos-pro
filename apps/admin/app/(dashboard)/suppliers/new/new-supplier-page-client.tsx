"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Truck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { useSupplierProductOptions } from "@/lib/query/suppliers";
import { SupplierForm } from "../supplier-form";

/**
 * A full page, not a Sheet — attaching a supplier's whole product catalogue
 * needs real room, not a drawer squeezed beside the list.
 */
export function NewSupplierPageClient() {
  const router = useRouter();
  const productsQuery = useSupplierProductOptions();
  const products = productsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <Link
        href={"/suppliers" as Route}
        className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft size={14} />
        Back to suppliers
      </Link>

      <Card>
        <CardHeader
          icon={Truck}
          title="New supplier"
          description="Who to order stock from, their contacts, and what they carry."
        />
        <div className="px-4 py-5 sm:px-6">
          {productsQuery.isPending ? (
            <p className="text-body text-ink-muted">Loading…</p>
          ) : (
            <SupplierForm products={products} onDone={() => router.push("/suppliers" as Route)} />
          )}
        </div>
      </Card>
    </div>
  );
}
