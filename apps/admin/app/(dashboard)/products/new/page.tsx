"use client";

import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, Package } from "lucide-react";
import { Card } from "@/components/ui";
import { toCategoryOptions } from "@/lib/category-options";
import { useCategories } from "@/lib/query/categories";
import { ProductForm } from "../product-form";

export default function NewProductPage() {
  const categoriesQuery = useCategories({ includeInactive: true });

  if (categoriesQuery.isPending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  if (categoriesQuery.isError) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {categoriesQuery.error instanceof Error
          ? categoriesQuery.error.message
          : "Could not load categories."}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={"/products" as Route}
          className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Back to products
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-heading-md font-semibold sm:text-heading-lg">
          <Package size={22} className="text-ink-muted" />
          Add product
        </h1>
        <p className="mt-1 text-body text-ink-muted">
          Set up the catalogue entry. Optionally record opening stock in one step.
        </p>
      </header>

      <ProductForm
        categories={toCategoryOptions(categoriesQuery.data ?? [])}
        saveRedirectHref="/products"
      />
    </div>
  );
}
