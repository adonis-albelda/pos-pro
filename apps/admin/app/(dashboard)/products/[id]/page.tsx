"use client";

import type { Route } from "next";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Eye,
  EyeOff,
  Layers,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { stockLevel } from "@double-a/shared-types";
import { Badge, Card, StatCard } from "@/components/ui";
import { toCategoryOptions } from "@/lib/category-options";
import { useCategories } from "@/lib/query/categories";
import { useProduct } from "@/lib/query/products";
import { useProductVariants } from "@/lib/query/attributes";
import { ProductForm } from "../product-form";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const productQuery = useProduct(id);
  const categoriesQuery = useCategories({ includeInactive: true });
  const variantsQuery = useProductVariants(id);

  const pending = productQuery.isPending || categoriesQuery.isPending;
  if (pending) {
    return <Card className="px-4 py-8 text-center text-body text-ink-muted">Loading…</Card>;
  }

  const error = productQuery.error ?? categoriesQuery.error;
  if (error) {
    return (
      <Card className="px-4 py-8 text-center text-body text-danger">
        {error instanceof Error ? error.message : "Could not load this product."}
      </Card>
    );
  }

  const product = productQuery.data;
  if (!product) notFound();

  const level = stockLevel(product.stockQuantity, product.reorderPoint);

  // Once a product has combinations, its own mirrored stock/price only ever
  // reflect the default variant — these read across every variant instead,
  // so the stats stay true for a multi-variant product, not just its base row.
  const variants = variantsQuery.data ?? [];
  const totalStock = variants.reduce((sum, variant) => sum + (variant.stockQuantity ?? 0), 0);
  const lowStockVariants = variants.filter(
    (variant) => "healthy" !== stockLevel(variant.stockQuantity ?? 0, variant.reorderPoint),
  ).length;
  const supplierCount = new Set(
    variants.flatMap((variant) => variant.suppliers.map((link) => link.supplierId)),
  ).size;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Link
            href={"/products" as Route}
            className="inline-flex items-center gap-1.5 text-caption text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} />
            Back to products
          </Link>
          <h1 className="mt-2 text-heading-md font-semibold sm:text-heading-lg">{product.name}</h1>
          <p className="mt-1 text-body text-ink-muted">
            {[product.sku, product.category].filter(Boolean).join(" · ") || "No SKU or category"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!product.isActive ? (
            <Badge tone="neutral" icon={EyeOff}>
              Hidden from terminals
            </Badge>
          ) : level === "out" ? (
            <Badge tone="danger" icon={TriangleAlert}>
              Out of stock
            </Badge>
          ) : level === "low" ? (
            <Badge tone="warning" icon={TriangleAlert}>
              Low stock
            </Badge>
          ) : (
            <Badge tone="success" icon={Eye}>
              On terminals
            </Badge>
          )}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Boxes}
          label="Total stock"
          value={String(totalStock)}
          hint="Across every variant and branch"
          loading={variantsQuery.isPending}
          tone={lowStockVariants > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={TriangleAlert}
          label="Low stock variants"
          value={String(lowStockVariants)}
          hint={`of ${variants.length} total`}
          loading={variantsQuery.isPending}
          tone={lowStockVariants > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={Layers}
          label="Variants"
          value={String(variants.length)}
          loading={variantsQuery.isPending}
        />
        <StatCard
          icon={Truck}
          label="Suppliers"
          value={String(supplierCount)}
          hint="Linked across all variants"
          loading={variantsQuery.isPending}
        />
      </div>

      <ProductForm
        key={product.id}
        product={product}
        categories={toCategoryOptions(categoriesQuery.data ?? [])}
        saveRedirectHref="/products"
      />
    </div>
  );
}
