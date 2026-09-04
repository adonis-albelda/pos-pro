"use client";

import type { Route } from "next";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Eye,
  EyeOff,
  Package,
  TriangleAlert,
} from "lucide-react";
import {
  formatMoney,
  formatPercent,
  marginPercent,
  stockLevel,
} from "@double-a/shared-types";
import { Badge, Card, CardBody, CardHeader, Money, StatCard } from "@/components/ui";
import { ActivityFeed } from "@/components/activity-feed";
import { toCategoryOptions } from "@/lib/category-options";
import { useCategories } from "@/lib/query/categories";
import { useProduct } from "@/lib/query/products";
import { useProductActivity } from "@/lib/query/activity";
import { ProductForm } from "../product-form";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const productQuery = useProduct(id);
  const categoriesQuery = useCategories({ includeInactive: true });
  const activityQuery = useProductActivity(id);

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
  const margin = marginPercent(product.price, product.costPrice);

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
          label="Stock on hand"
          value={String(product.stockQuantity)}
          hint={`Reorder at ${product.reorderPoint}`}
          tone={level === "out" ? "danger" : level === "low" ? "warning" : "neutral"}
        />
        <StatCard
          icon={Package}
          label="Shelf price"
          value={formatMoney(product.price)}
          hint={product.bulkPrice !== null ? `Bulk from ${product.bulkMinQuantity}` : undefined}
        />
        <StatCard
          icon={Package}
          label="Supplier cost"
          value={formatMoney(product.costPrice)}
        />
        <StatCard
          icon={Package}
          label="Margin"
          value={formatPercent(margin)}
          hint={`${formatMoney(product.price - product.costPrice)} per unit`}
          tone={margin < 0 ? "danger" : "primary"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <ProductForm
          key={product.id}
          product={product}
          categories={toCategoryOptions(categoriesQuery.data ?? [])}
          saveRedirectHref="/products"
        />

        <div className="space-y-4">
          <Card>
            <CardHeader title="At a glance" />
            <CardBody className="space-y-3 text-body text-ink-muted">
              {product.description ? (
                <p>
                  <span className="font-medium text-ink">Description</span>
                  <br />
                  {product.description}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-ink">Replenish qty</span>
                <br />
                {product.replenishQuantity} when restocking
              </p>
              <p>
                <span className="font-medium text-ink">Sold by</span>
                <br />
                {product.unit}
                {product.allowDecimal ? " (decimals allowed)" : " (whole numbers)"}
              </p>
              {product.barcode ? (
                <p>
                  <span className="font-medium text-ink">Barcode</span>
                  <br />
                  <span className="num">{product.barcode}</span>
                </p>
              ) : null}
              {product.bulkPrice !== null && product.bulkMinQuantity !== null ? (
                <p>
                  <span className="font-medium text-ink">Bulk price</span>
                  <br />
                  <Money value={product.bulkPrice} /> from {product.bulkMinQuantity} units
                </p>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Stock"
              description="Balances change only through Inventory movements."
            />
            <CardBody>
              <Link
                href="/inventory"
                className="text-body font-medium text-primary hover:underline"
              >
                Open Inventory
              </Link>
            </CardBody>
          </Card>

          <ActivityFeed activities={activityQuery.data} isPending={activityQuery.isPending} />
        </div>
      </div>
    </div>
  );
}
